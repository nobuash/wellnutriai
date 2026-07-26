import { getPayment, PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { checkDistributedRateLimit } from '@/lib/distributedRateLimit';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Endpoint para o usuário verificar manualmente se o pagamento foi aprovado
// e ativar o plano caso o webhook não tenha disparado
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  // Rate limit distribuído. A UI já faz polling automático a cada 5s
  // por até 30min enquanto o modal do PIX está aberto (~360 chamadas),
  // então o limite precisa folgar bastante acima disso.
  if (!(await checkDistributedRateLimit(supabase, `payment-verify:${user.id}`, 500, 3600))) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente em breve.' }, { status: 429 });
  }

  const { payment_id } = await req.json().catch(() => ({})) as { payment_id?: number };
  if (!payment_id) return NextResponse.json({ error: 'payment_id obrigatório' }, { status: 400 });

  try {
    const payment = await getPayment().get({ id: Number(payment_id) });

    if (!payment?.id) {
      return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 });
    }

    // Garante que o pagamento pertence a este usuário
    const externalRef = payment.external_reference as string ?? '';
    const [userId] = externalRef.split(':');

    if (userId !== user.id) {
      return NextResponse.json({ error: 'Pagamento não pertence a este usuário' }, { status: 403 });
    }

    if (payment.status !== 'approved') {
      return NextResponse.json({ status: payment.status, message: 'Pagamento ainda não aprovado' });
    }

    const rawInterval = externalRef.split(':')[1] ?? 'monthly';
    const planInterval: PlanInterval =
      rawInterval === 'quarterly' || rawInterval === 'annual' ? rawInterval : 'monthly';

    const durationDays = PLANS[planInterval].durationDays;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    // subscriptions e profiles.plan só aceitam escrita via service_role
    // (RLS + trigger protect_plan_column).
    const service = createServiceClient();

    await service.from('subscriptions').upsert(
      {
        user_id: user.id,
        plan: 'pro',
        mp_subscription_id: String(payment.id),
        mp_status: 'authorized',
        payment_type: payment.payment_method_id === 'pix' ? 'pix' : 'card',
        expires_at: expiresAt.toISOString(),
        provider: 'mercadopago',
        provider_subscription_id: String(payment.id),
        provider_payment_id: String(payment.id),
        status: 'active',
        billing_interval: planInterval,
        current_period_end: expiresAt.toISOString(),
        cancel_at_period_end: false,
        canceled_at: null,
      },
      { onConflict: 'mp_subscription_id' }
    );

    await service.from('profiles').update({ plan: 'pro' }).eq('id', user.id);

    console.log(`[verify] user=${user.id} plano ativado via verificação manual, expira ${expiresAt.toISOString()}`);

    return NextResponse.json({ status: 'approved', activated: true });
  } catch (err) {
    console.error('[verify] error:', err);
    return NextResponse.json({ error: 'Erro ao verificar pagamento' }, { status: 500 });
  }
}
