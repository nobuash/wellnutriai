import { getStripe, STRIPE_INTERVALS } from '@/lib/stripe/client';
import { type PlanInterval } from '@/lib/mercadopago/client';
import { checkDistributedRateLimit } from '@/lib/distributedRateLimit';
import { consentReasonMessage, requireCurrentConsent } from '@/lib/consentCheck';
import { findActiveStripeSubscription } from '@/lib/stripe/activateSubscription';
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

  // Rate limit distribuído: 10 tentativas por hora por usuário
  if (!(await checkDistributedRateLimit(`payment-stripe-intent:${user.id}`, 10, 3600))) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente em breve.' }, { status: 429 });
  }

  const consent = await requireCurrentConsent(supabase, user.id);
  if (!consent.ok) {
    return NextResponse.json({ error: consentReasonMessage(consent.reason!) }, { status: 403 });
  }

  const { planInterval = 'monthly' } = await req.json().catch(() => ({})) as { planInterval?: PlanInterval };
  if (!STRIPE_INTERVALS[planInterval]) return NextResponse.json({ error: 'Plano inválido' }, { status: 400 });

  // Impede duas assinaturas recorrentes simultâneas — antes, nada
  // aqui checava se o usuário já tinha uma ativa antes de criar outra.
  const existingSub = await findActiveStripeSubscription(user.id);
  if (existingSub) {
    return NextResponse.json(
      {
        error: 'Você já possui uma assinatura recorrente ativa.',
        code: 'ACTIVE_SUBSCRIPTION_EXISTS',
        manageSubscription: true,
      },
      { status: 409 },
    );
  }

  const email = user.email ?? `${user.id}@wellnutriai.app`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wellnutriai.com';

  try {
    const stripe = getStripe();

    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer = existing.data[0]
      ?? await stripe.customers.create({ email, metadata: { userId: user.id } });

    const price = await getOrCreatePrice(planInterval);

    const session = await stripe.checkout.sessions.create({
      // Verificado contra o SDK instalado (stripe@22.0.2): o tipo real
      // de ui_mode é 'elements' | 'embedded_page' | 'form' | 'hosted_page'
      // (nomenclatura desta API version), não 'hosted'|'embedded'|'custom'
      // como em versões/documentações mais antigas. 'embedded_page' já
      // era o valor certo — só removido o `as any` que escondia isso do
      // type-check sem necessidade.
      ui_mode: 'embedded_page',
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
