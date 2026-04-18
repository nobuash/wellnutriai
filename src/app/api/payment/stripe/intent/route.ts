import { getStripe, STRIPE_INTERVALS } from '@/lib/stripe/client';
import { type PlanInterval } from '@/lib/mercadopago/client';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

async function getOrCreatePrice(planInterval: PlanInterval) {
  const stripe = getStripe();
  const config = STRIPE_INTERVALS[planInterval];

  const products = await stripe.products.search({
    query: 'name:"WellNutriAI PRO" AND active:"true"',
    limit: 1,
  });
  const product = products.data[0]
    ?? await stripe.products.create({ name: 'WellNutriAI PRO' });

  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 20 });
  const existing = prices.data.find(
    (p) =>
      p.unit_amount === config.amountCents &&
      p.currency === 'brl' &&
      p.recurring?.interval === config.interval &&
      p.recurring?.interval_count === config.interval_count
  );

  return existing ?? await stripe.prices.create({
    product: product.id,
    currency: 'brl',
    unit_amount: config.amountCents,
    recurring: { interval: config.interval, interval_count: config.interval_count },
    nickname: config.label,
  });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { planInterval = 'monthly' } = await req.json().catch(() => ({})) as { planInterval?: PlanInterval };
  if (!STRIPE_INTERVALS[planInterval]) return NextResponse.json({ error: 'Plano inválido' }, { status: 400 });

  const email = user.email ?? `${user.id}@wellnutriai.app`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wellnutriai.com';

  try {
    const stripe = getStripe();

    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer = existing.data[0]
      ?? await stripe.customers.create({ email, metadata: { userId: user.id } });

    const price = await getOrCreatePrice(planInterval);

    const session = await stripe.checkout.sessions.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ui_mode: 'embedded' as any,
      mode: 'subscription',
      customer: customer.id,
      line_items: [{ price: price.id, quantity: 1 }],
      return_url: `${appUrl}/pricing?stripe_session={CHECKOUT_SESSION_ID}`,
      metadata: { userId: user.id, planInterval },
      subscription_data: { metadata: { userId: user.id, planInterval } },
    });

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (err: unknown) {
    const stripeErr = err as { message?: string; code?: string };
    console.error('[stripe/intent] error:', stripeErr?.message, stripeErr?.code);
    return NextResponse.json({ error: stripeErr?.message ?? 'Erro ao criar sessão de pagamento' }, { status: 500 });
  }
}
