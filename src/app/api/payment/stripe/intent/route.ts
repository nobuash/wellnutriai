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

  const email = user.email ?? `${user.id}@wellnutriai.app`;

  try {
    const stripe = getStripe();

    // Reutiliza cliente existente ou cria um novo
    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer = existing.data[0]
      ?? await stripe.customers.create({ email, metadata: { userId: user.id } });

    // Cria produto inline e preço inline via assinatura
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [
        {
          price_data: {
            currency: 'brl',
            // @ts-expect-error product_data é válido na API mas o tipo do SDK é incorreto nesta versão
            product_data: { name: config.label },
            unit_amount: config.amountCents,
            recurring: {
              interval: config.interval,
              interval_count: config.interval_count,
            },
          },
        },
      ],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { userId: user.id, planInterval },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientSecret = (subscription.latest_invoice as any)?.payment_intent?.client_secret as string | null;

    if (!clientSecret) {
      console.error('[stripe/intent] clientSecret ausente', JSON.stringify(subscription.latest_invoice));
      return NextResponse.json({ error: 'Erro ao obter chave de pagamento' }, { status: 500 });
    }

    return NextResponse.json({ clientSecret, subscriptionId: subscription.id });
  } catch (err: unknown) {
    const stripeErr = err as { type?: string; message?: string; code?: string };
    console.error('[stripe/intent] error:', stripeErr?.message, stripeErr?.code, stripeErr?.type);
    return NextResponse.json(
      { error: stripeErr?.message ?? 'Erro ao criar assinatura' },
      { status: 500 }
    );
  }
}
