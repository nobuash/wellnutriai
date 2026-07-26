import { getPreApproval } from '@/lib/mercadopago/client';
import { getStripe } from '@/lib/stripe/client';
import { checkDistributedRateLimit } from '@/lib/distributedRateLimit';
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

  if (!(await checkDistributedRateLimit(supabase, `payment-cancel:${user.id}`, 10, 3600))) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente em breve.' }, { status: 429 });
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, provider, provider_subscription_id, payment_type, status, current_period_end, cancel_at_period_end')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<SubscriptionRow>();

  if (!sub) {
    return NextResponse.json({ error: 'Nenhuma assinatura encontrada para este usuário.' }, { status: 400 });
  }

  // Idempotente: já cancelada (ou marcada para cancelar) — não repete a chamada ao provedor.
  if (sub.status === 'canceled' || sub.cancel_at_period_end) {
    return NextResponse.json({
      ok: true,
      alreadyCanceled: true,
      accessUntil: sub.current_period_end,
    });
  }

  // PIX ou cartão avulso do Mercado Pago não são cobrança recorrente — não existe nada
  // para cancelar no provedor. Nunca afirme que "cancelamos" uma cobrança que não existe.
  if (sub.provider === 'mercadopago' && sub.payment_type !== 'subscription') {
    return NextResponse.json(
      {
        error:
          'Este pagamento não tem renovação automática, então não há assinatura para cancelar. ' +
          'Seu acesso PRO continua válido até a data de expiração — para renovar, é preciso pagar novamente.',
      },
      { status: 400 },
    );
  }

  if (sub.status !== 'active' || !sub.provider_subscription_id) {
    return NextResponse.json({ error: 'Nenhuma assinatura ativa encontrada.' }, { status: 400 });
  }

  // Escritas em subscriptions/profiles exigem service_role: usuários autenticados
  // só têm permissão de leitura nessas tabelas (RLS), de propósito — só o
  // servidor, após confirmar a ação junto ao provedor real, pode mudar o
  // status de uma assinatura.
  const service = createServiceClient();

  try {
    if (sub.provider === 'stripe') {
      const stripe = getStripe();
      const updated = await stripe.subscriptions.update(sub.provider_subscription_id, {
        cancel_at_period_end: true,
      });

      // O acesso PRO continua até o fim do período já pago — não rebaixamos
      // profiles.plan aqui. O rebaixamento definitivo acontece via webhook
      // (customer.subscription.deleted) quando o período efetivamente termina.
      await service
        .from('subscriptions')
        .update({ cancel_at_period_end: true })
        .eq('id', sub.id);

      await logCancelAudit(service, user.id, { provider: 'stripe', subscription_id: 'masked' });

      // Nesta versão da API Stripe, current_period_end vive no item da assinatura, não na raiz.
      const stripePeriodEndSec = updated.items.data[0]?.current_period_end;
      const periodEnd = stripePeriodEndSec
        ? new Date(stripePeriodEndSec * 1000).toISOString()
        : sub.current_period_end;

      return NextResponse.json({ ok: true, cancelAtPeriodEnd: true, accessUntil: periodEnd });
    }

    if (sub.provider === 'mercadopago') {
      // Cancelamento de assinatura recorrente real do Mercado Pago (preapproval).
      // Nenhum fluxo atual do produto cria uma preapproval de verdade (hoje PIX e
      // cartão MP são pagamentos avulsos), mas o caminho fica pronto e correto
      // para quando essa opção existir.
      await getPreApproval().update({
        id: sub.provider_subscription_id,
        body: { status: 'cancelled' },
      });

      await service
        .from('subscriptions')
        .update({ status: 'canceled', mp_status: 'cancelled', canceled_at: new Date().toISOString() })
        .eq('id', sub.id);

      await service.from('profiles').update({ plan: 'free' }).eq('id', user.id);
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
