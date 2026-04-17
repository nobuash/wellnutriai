import { getPreApproval, PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { planInterval?: string };
  const planInterval: PlanInterval =
    body.planInterval === 'quarterly' || body.planInterval === 'annual'
      ? body.planInterval
      : 'monthly';

  const plan = PLANS[planInterval];

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, email, name')
    .eq('id', user.id)
    .single();

  // Verifica se já existe assinatura pendente para este intervalo
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('mp_subscription_id, mp_status')
    .eq('user_id', user.id)
    .in('mp_status', ['pending', 'authorized'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSub?.mp_subscription_id) {
    try {
      const existing = await getPreApproval().get({ id: existingSub.mp_subscription_id });
      if (existing?.init_point) {
        return NextResponse.json({ init_point: existing.init_point });
      }
    } catch {
      // Se não encontrar, cria uma nova abaixo
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  try {
    const result = await getPreApproval().create({
      body: {
        reason: plan.label,
        payer_email: profile?.email ?? user.email!,
        back_url: `${appUrl}/payment/success`,
        auto_recurring: {
          frequency: plan.frequencyMonths,
          frequency_type: 'months',
          transaction_amount: plan.amount,
          currency_id: plan.currency,
        },
        external_reference: user.id,
        status: 'pending',
      },
    });

    if (!result?.id || !result?.init_point) {
      throw new Error('Resposta inválida do Mercado Pago');
    }

    await supabase.from('subscriptions').upsert(
      {
        user_id: user.id,
        plan: 'pro',
        mp_subscription_id: result.id,
        mp_status: 'pending',
        payment_type: 'subscription',
      },
      { onConflict: 'mp_subscription_id' },
    );

    return NextResponse.json({ init_point: result.init_point });
  } catch (err) {
    console.error('[payment/subscribe] error:', err);
    return NextResponse.json(
      { error: 'Não foi possível iniciar o pagamento. Tente novamente.' },
      { status: 500 },
    );
  }
}
