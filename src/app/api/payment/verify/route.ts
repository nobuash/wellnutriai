import { getPayment, PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Endpoint para o usuário verificar manualmente se o pagamento foi aprovado
// e ativar o plano caso o webhook não tenha disparado
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

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

    await supabase.from('subscriptions').upsert(
      {
        user_id: user.id,
        plan: 'pro',
        mp_subscription_id: String(payment.id),
        mp_status: 'authorized',
        payment_type: payment.payment_method_id === 'pix' ? 'pix' : 'card',
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'mp_subscription_id' }
    );

    await supabase.from('profiles').update({ plan: 'pro' }).eq('id', user.id);

    console.log(`[verify] user=${user.id} plano ativado via verificação manual, expira ${expiresAt.toISOString()}`);

    return NextResponse.json({ status: 'approved', activated: true });
  } catch (err) {
    console.error('[verify] error:', err);
    return NextResponse.json({ error: 'Erro ao verificar pagamento' }, { status: 500 });
  }
}
