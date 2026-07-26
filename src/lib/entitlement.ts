import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { recalculateVisualPlanCache } from '@/lib/subscriptionCache';

export type EntitlementReason =
  | 'active'
  | 'active_canceling'
  | 'pending'
  | 'past_due'
  | 'payment_failed'
  | 'expired'
  | 'canceled'
  | 'no_subscription';

export interface Entitlement {
  isPro: boolean;
  plan: 'free' | 'pro';
  activeSubscriptionId: string | null;
  provider: 'stripe' | 'mercadopago' | null;
  paymentType: string | null;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  reason: EntitlementReason;
}

export interface SubscriptionRow {
  id: string;
  status: string | null;
  provider: 'stripe' | 'mercadopago' | null;
  payment_type: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  canceled_at: string | null;
  created_at?: string;
}

const NO_SUBSCRIPTION: Entitlement = {
  isPro: false,
  plan: 'free',
  activeSubscriptionId: null,
  provider: null,
  paymentType: null,
  status: 'no_subscription',
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  reason: 'no_subscription',
};

// Prioridade comercial entre assinaturas não-ativas, quando o usuário
// não tem nenhuma ativa e válida: vale mais mostrar "past_due" (ainda
// dá pra cobrar) do que "expired" (já acabou de vez), por exemplo.
const NON_ACTIVE_PRIORITY: Record<string, number> = {
  past_due: 1,
  payment_failed: 2,
  pending: 3,
  canceled: 4,
  expired: 5,
};

function isValidActive(row: SubscriptionRow, nowMs: number): boolean {
  if (row.status !== 'active') return false;
  if (!row.current_period_end) return true;
  return new Date(row.current_period_end).getTime() >= nowMs;
}

function buildResult(row: SubscriptionRow, isPro: boolean, reason: EntitlementReason): Entitlement {
  return {
    isPro,
    plan: isPro ? 'pro' : 'free',
    activeSubscriptionId: row.id,
    provider: row.provider,
    paymentType: row.payment_type,
    status: row.status ?? 'unknown',
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
    reason,
  };
}

/**
 * Função pura, sem I/O — dado o conjunto de assinaturas de um usuário,
 * decide o entitlement. Extraída separadamente de getUserEntitlement()
 * pra ser testável sem mockar o Supabase (ver
 * src/lib/__tests__/entitlement.test.ts).
 *
 * Regra: uma assinatura pendente (ex: PIX aguardando pagamento) NUNCA
 * esconde outra assinatura ativa do mesmo usuário — analisa todas,
 * não só a mais recente por created_at. Entre várias ativas válidas,
 * escolhe a de maior current_period_end. Uma assinatura marcada pra
 * cancelar (cancel_at_period_end) continua válida até o período acabar.
 */
export function selectEntitlement(rows: SubscriptionRow[], now: Date = new Date()): Entitlement {
  if (rows.length === 0) return NO_SUBSCRIPTION;

  const nowMs = now.getTime();
  const activeRows = rows.filter((r) => isValidActive(r, nowMs));

  if (activeRows.length > 0) {
    const best = activeRows.reduce((a, b) => {
      const aEnd = a.current_period_end ? new Date(a.current_period_end).getTime() : Infinity;
      const bEnd = b.current_period_end ? new Date(b.current_period_end).getTime() : Infinity;
      return bEnd > aEnd ? b : a;
    });
    return buildResult(best, true, best.cancel_at_period_end ? 'active_canceling' : 'active');
  }

  // Nenhuma ativa e válida — assinaturas "active" mas com período
  // vencido contam como "expired" pra fins de prioridade/exibição
  // (o self-heal em getUserEntitlement corrige o status delas no banco).
  const ranked = rows
    .map((row) => ({
      row,
      effectiveStatus: row.status === 'active' ? 'expired' : (row.status ?? 'expired'),
    }))
    .filter((x) => NON_ACTIVE_PRIORITY[x.effectiveStatus] !== undefined)
    .sort((a, b) => {
      const pa = NON_ACTIVE_PRIORITY[a.effectiveStatus];
      const pb = NON_ACTIVE_PRIORITY[b.effectiveStatus];
      if (pa !== pb) return pa - pb;
      const aTime = a.row.current_period_end ? new Date(a.row.current_period_end).getTime() : 0;
      const bTime = b.row.current_period_end ? new Date(b.row.current_period_end).getTime() : 0;
      return bTime - aTime;
    });

  if (ranked.length === 0) return NO_SUBSCRIPTION;

  const chosen = ranked[0];
  return buildResult(chosen.row, false, chosen.effectiveStatus as EntitlementReason);
}

/**
 * Única fonte da verdade para saber se um usuário tem acesso PRO.
 * Nunca confie em `profiles.plan` isoladamente — ele é apenas um cache
 * visual. Lê TODAS as assinaturas do usuário (não só a mais recente —
 * uma tentativa de PIX pendente não pode esconder uma assinatura
 * Stripe ativa) e recalcula o acesso via selectEntitlement().
 * Rebaixa automaticamente (self-healing) linhas "active" cujo período
 * já venceu, sem nunca rebaixar profiles.plan se outra assinatura
 * ainda estiver ativa.
 */
export async function getUserEntitlement(
  supabase: SupabaseClient,
  userId: string,
): Promise<Entitlement> {
  const { data: rows } = await supabase
    .from('subscriptions')
    .select('id, status, provider, payment_type, current_period_start, current_period_end, cancel_at_period_end, canceled_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .returns<SubscriptionRow[]>();

  const result = selectEntitlement(rows ?? [], new Date());

  const staleActiveIds = (rows ?? [])
    .filter((r) => r.status === 'active' && !isValidActive(r, Date.now()))
    .map((r) => r.id);

  if (staleActiveIds.length > 0) {
    void healExpiredSubscriptions(staleActiveIds, userId).catch((err) =>
      console.error('[entitlement] falha ao rebaixar assinatura(s) expirada(s):', err),
    );
  }

  return result;
}

async function healExpiredSubscriptions(subscriptionIds: string[], userId: string) {
  const service = createServiceClient();
  await service.from('subscriptions').update({ status: 'expired' }).in('id', subscriptionIds);

  await recalculateVisualPlanCache(service, userId);

  await service.from('audit_log').insert({
    user_id: userId,
    action: 'subscription_expired',
    metadata: { subscription_ids: subscriptionIds },
  });
}
