import { getStripe, STRIPE_INTERVALS } from '@/lib/stripe/client';
import { type PlanInterval } from '@/lib/mercadopago/client';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { planInterval = 'monthly' } = await req.json().catch(() => ({})) as { planInterval?: PlanInterval };
  const config = STRIPE_INTERVALS[planInterval];
  if (!config) return NextResponse.json({ error: 'Plano inválido' }, { status: 400 });

  try {
    const stripe = getStripe();

    // Reutiliza cliente existente ou cria um novo
    const existing = await stripe.customers.list({ email: user.email!, limit: 1 });
    const customer = existing.data[0]
      ?? await stripe.customers.create({ email: user.email!, metadata: { userId: user.id } });

    // Cria assinatura recorrente com pagamento pendente
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscription = await (stripe.subscriptions.create as any)({
      customer: customer.id,
      items: [{
        price_data: {
          currency: 'brl',
          product_data: { name: config.label },
          unit_amount: config.amountCents,
          recurring: { interval: config.interval, interval_count: config.interval_count },
        },
      }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { userId: user.id, planInterval },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientSecret = (subscription.latest_invoice as any)?.payment_intent?.client_secret as string;

    return NextResponse.json({
      clientSecret,
      subscriptionId: subscription.id as string,
    });
  } catch (err) {
    console.error('[stripe/intent] error:', err);
    return NextResponse.json({ error: 'Erro ao criar assinatura' }, { status: 500 });
  }
}
