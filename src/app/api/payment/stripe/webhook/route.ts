import { getStripe } from '@/lib/stripe/client';
import { type PlanInterval } from '@/lib/mercadopago/client';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

export const runtime = 'nodejs';

const PLAN_DAYS: Record<PlanInterval, number> = {
  monthly: 30,
  quarterly: 90,
  annual: 365,
};

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET não configurado — rejeitando');
    return NextResponse.json({ error: 'Webhook não configurado' }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe/webhook] assinatura inválida:', (err as Error).message);
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 400 });
  }

  const db = getServiceSupabase();

  try {
    // Idempotência: ignora eventos Stripe já processados
    const { error: dupErr } = await db
      .from('processed_webhooks')
      .insert({ id: `stripe_${event.id}` });
    if (dupErr) {
      return NextResponse.json({ ok: true });
    }

    // Renovação paga com sucesso
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subscriptionId = (invoice as any).subscription as string;
      if (!subscriptionId) return NextResponse.json({ ok: true });

      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = sub.metadata as any;
      const userId = meta?.userId as string;
      if (!userId) return NextResponse.json({ ok: true });

      const planInterval = (meta?.planInterval ?? 'monthly') as PlanInterval;
      const days = PLAN_DAYS[planInterval];
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);

      await db.from('subscriptions').upsert(
        {
          user_id: userId,
          plan: 'pro',
          mp_subscription_id: subscriptionId,
          mp_status: 'authorized',
          payment_type: 'card',
          expires_at: expiresAt.toISOString(),
          provider: 'stripe',
          provider_subscription_id: subscriptionId,
          provider_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null,
          status: 'active',
          billing_interval: planInterval,
          current_period_end: expiresAt.toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end ?? false,
          canceled_at: null,
        },
        { onConflict: 'mp_subscription_id' }
      );
      await db.from('profiles').update({ plan: 'pro' }).eq('id', userId);
      console.log(`[stripe/webhook] renovação user=${userId} sub=${subscriptionId} expira=${expiresAt.toISOString()}`);
    }

    // Falha de cobrança (cartão recusado na renovação)
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subscriptionId = (invoice as any).subscription as string;
      if (!subscriptionId) return NextResponse.json({ ok: true });

      await db.from('subscriptions')
        .update({ status: 'payment_failed', mp_status: 'cancelled' })
        .eq('mp_subscription_id', subscriptionId);
      console.log(`[stripe/webhook] falha de pagamento sub=${subscriptionId}`);
    }

    // Assinatura cancelada ou expirada
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userId = (sub.metadata as any)?.userId as string;
      if (!userId) return NextResponse.json({ ok: true });

      await db.from('subscriptions')
        .update({ mp_status: 'cancelled', status: 'canceled', canceled_at: new Date().toISOString() })
        .eq('mp_subscription_id', sub.id);
      await db.from('profiles').update({ plan: 'free' }).eq('id', userId);
      console.log(`[stripe/webhook] cancelamento user=${userId} sub=${sub.id}`);
    }

    // Assinatura marcada para cancelar ao fim do período (usuário clicou cancelar)
    // ou teve o cancel_at_period_end revertido — mantém o banco em sincronia com a Stripe.
    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription;
      await db.from('subscriptions')
        .update({ cancel_at_period_end: sub.cancel_at_period_end ?? false })
        .eq('mp_subscription_id', sub.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[stripe/webhook] error:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
