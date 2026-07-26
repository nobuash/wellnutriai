import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';

export type EntitlementReason =
  | 'active'
  | 'expired'
  | 'canceled'
  | 'past_due'
  | 'payment_failed'
  | 'no_subscription';

export interface Entitlement {
  isPro: boolean;
  plan: 'free' | 'pro';
  status: string;
  provider: 'stripe' | 'mercadopago' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  reason: EntitlementReason;
}

interface SubscriptionRow {
  id: string;
  status: string | null;
  provider: 'stripe' | 'mercadopago' | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  canceled_at: string | null;
}

const NO_SUBSCRIPTION: Entitlement = {
  isPro: false,
  plan: 'free',
  status: 'no_subscription',
  provider: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  reason: 'no_subscription',
};

/**
 * Única fonte da verdade para saber se um usuário tem acesso PRO.
 * Nunca confie em `profiles.plan` isoladamente — ele é apenas um cache
 * visual. Esta função lê a assinatura real e recalcula o acesso com
 * base no status e na data de expiração, rebaixando automaticamente
 * (self-healing) quando uma assinatura ativa já venceu.
 */
export async function getUserEntitlement(
  supabase: SupabaseClient,
  userId: string,
): Promise<Entitlement> {
  const { data: row } = await supabase
    .from('subscriptions')
    .select('id, status, provider, current_period_end, cancel_at_period_end, canceled_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<SubscriptionRow>();

  if (!row) return NO_SUBSCRIPTION;

  const periodEndMs = row.current_period_end ? new Date(row.current_period_end).getTime() : null;
  const expired = periodEndMs !== null && periodEndMs < Date.now();
  const isActiveStatus = row.status === 'active';
  const isPro = isActiveStatus && !expired;

  if (isActiveStatus && expired) {
    // Correção automática: a assinatura estava "active" no banco mas o
    // período já venceu (PIX/cartão avulso do MP não tem webhook de
    // expiração — só descobrimos ao ler). Rebaixa de forma best-effort;
    // não bloqueia a resposta se a escrita falhar.
    void downgradeExpiredSubscription(row.id, userId).catch((err) =>
      console.error('[entitlement] falha ao rebaixar assinatura expirada:', err),
    );
  }

  let reason: EntitlementReason = 'no_subscription';
  if (isPro) reason = 'active';
  else if (expired) reason = 'expired';
  else if (row.status === 'canceled') reason = 'canceled';
  else if (row.status === 'past_due') reason = 'past_due';
  else if (row.status === 'payment_failed') reason = 'payment_failed';

  return {
    isPro,
    plan: isPro ? 'pro' : 'free',
    status: row.status ?? 'unknown',
    provider: row.provider,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
    reason,
  };
}

async function downgradeExpiredSubscription(subscriptionId: string, userId: string) {
  const service = createServiceClient();
  await Promise.all([
    service.from('subscriptions').update({ status: 'expired' }).eq('id', subscriptionId),
    service.from('profiles').update({ plan: 'free' }).eq('id', userId),
  ]);
  await service.from('audit_log').insert({
    user_id: userId,
    action: 'subscription_expired',
    metadata: { subscription_id: subscriptionId },
  });
}
