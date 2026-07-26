import { getPreApproval } from '@/lib/mercadopago/client';
import { getStripe } from '@/lib/stripe/client';
import { checkDistributedRateLimit } from '@/lib/distributedRateLimit';
import { recalculateVisualPlanCache } from '@/lib/subscriptionCache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface SubscriptionRow {
  id: string;
  provider: 'stripe' | 'mercadopago' | null;
  provider_subscription_id: string | null;
  payment_type: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

async function logCancelAudit(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  metadata: Record<string, unknown>,
) {
  try {
    await service.from('audit_log').insert({ user_id: userId, action: 'subscription_canceled', metadata });
  } catch (err) {
    console.error('[payment/cancel] falha ao gravar audit log:', err);
  }
}

export async function POST() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  if (!(await checkDistributedRateLimit(`payment-cancel:${user.id}`, 10, 3600))) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente em breve.' }, { status: 429 });
  }

  // Busca especificamente uma assinatura RECORRENTE ativa — não "a
  // linha mais recente" (que poderia ser um PIX pendente mais novo
  // escondendo uma assinatura Stripe ativa mais antiga; ver
  // src/lib/entitlement.ts). Cancelamento só faz sentido para isso.
  const { data: activeSub } = await supabase
    .from('subscriptions')
    .select('id, provider, provider_subscription_id, payment_type, status, current_period_end, cancel_at_period_end')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .eq('payment_type', 'subscription')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<SubscriptionRow>();

  if (activeSub?.cancel_at_period_end) {
    return NextResponse.json({ ok: true, alreadyCanceled: true, accessUntil: activeSub.current_period_end });
  }

  if (!activeSub) {
    // Sem assinatura recorrente ativa — mensagem depende de existir
    // algum pagamento avulso (PIX/cartão) sem renovação automática.
    const { data: anySub } = await supabase
      .from('subscriptions')
      .select('id, status, payment_type, current_period_end')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (anySub && anySub.status === 'canceled') {
      return NextResponse.json({ ok: true, alreadyCanceled: true, accessUntil: anySub.current_period_end });
    }

    if (anySub && anySub.payment_type !== 'subscription') {
      return NextResponse.json(
        {
          error:
            'Este pagamento não tem renovação automática, então não há assinatura para cancelar. ' +
            'Seu acesso PRO continua válido até a data de expiração — para renovar, é preciso pagar novamente.',
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: 'Nenhuma assinatura ativa encontrada.' }, { status: 400 });
  }

  if (!activeSub.provider_subscription_id) {
    return NextResponse.json({ error: 'Nenhuma assinatura ativa encontrada.' }, { status: 400 });
  }

  // Escritas em subscriptions/profiles exigem service_role: usuários autenticados
  // só têm permissão de leitura nessas tabelas (RLS), de propósito — só o
  // servidor, após confirmar a ação junto ao provedor real, pode mudar o
  // status de uma assinatura.
  const service = createServiceClient();

  try {
    if (activeSub.provider === 'stripe') {
      const stripe = getStripe();
      const updated = await stripe.subscriptions.update(activeSub.provider_subscription_id, {
        cancel_at_period_end: true,
      });

      // O acesso PRO continua até o fim do período já pago — não rebaixamos
      // profiles.plan aqui. O rebaixamento definitivo acontece via webhook
      // (customer.subscription.deleted) quando o período efetivamente termina.
      await service
        .from('subscriptions')
        .update({ cancel_at_period_end: true })
        .eq('id', activeSub.id);

      await logCancelAudit(service, user.id, { provider: 'stripe', subscription_id: 'masked' });

      // Nesta versão da API Stripe, current_period_end vive no item da assinatura, não na raiz.
      const stripePeriodEndSec = updated.items.data[0]?.current_period_end;
      const periodEnd = stripePeriodEndSec
        ? new Date(stripePeriodEndSec * 1000).toISOString()
        : activeSub.current_period_end;

      return NextResponse.json({ ok: true, cancelAtPeriodEnd: true, accessUntil: periodEnd });
    }

    if (activeSub.provider === 'mercadopago') {
      // Cancelamento de assinatura recorrente real do Mercado Pago (preapproval).
      // Nenhum fluxo atual do produto cria uma preapproval de verdade (hoje PIX e
      // cartão MP são pagamentos avulsos), mas o caminho fica pronto e correto
      // para quando essa opção existir.
      await getPreApproval().update({
        id: activeSub.provider_subscription_id,
        body: { status: 'cancelled' },
      });

      await service
        .from('subscriptions')
        .update({ status: 'canceled', mp_status: 'cancelled', canceled_at: new Date().toISOString() })
        .eq('id', activeSub.id);

      await recalculateVisualPlanCache(service, user.id);
      await logCancelAudit(service, user.id, { provider: 'mercadopago', subscription_id: 'masked' });

      return NextResponse.json({ ok: true, cancelAtPeriodEnd: false, accessUntil: null });
    }

    return NextResponse.json({ error: 'Provedor de pagamento desconhecido.' }, { status: 400 });
  } catch (err) {
    console.error('[payment/cancel] error:', err);
    return NextResponse.json(
      { error: 'Não foi possível cancelar junto ao provedor de pagamento. Tente novamente ou contate o suporte.' },
      { status: 500 },
    );
  }
}
