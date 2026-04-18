import { getStripe, planAmountCents } from '@/lib/stripe/client';
import { PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { planInterval = 'monthly' } = await req.json().catch(() => ({})) as { planInterval?: PlanInterval };

  const plan = PLANS[planInterval];
  if (!plan) return NextResponse.json({ error: 'Plano inválido' }, { status: 400 });

  try {
    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: planAmountCents(planInterval),
      currency: 'brl',
      description: plan.label,
      metadata: { userId: user.id, planInterval },
      automatic_payment_methods: { enabled: true },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('[stripe/intent] error:', err);
    return NextResponse.json({ error: 'Erro ao criar pagamento' }, { status: 500 });
  }
}
