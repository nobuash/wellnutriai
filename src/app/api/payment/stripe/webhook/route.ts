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

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = webhookSecret
      ? stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
      : (JSON.parse(rawBody) as Stripe.Event);
  } catch (err) {
    console.error('[stripe/webhook] signature error:', err);
    return NextResponse.json({ error: 'Webhook inválido' }, { status: 400 });
  }

  const db = getServiceSupabase();

  try {
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
        },
        { onConflict: 'mp_subscription_id' }
      );
      await db.from('profiles').update({ plan: 'pro' }).eq('id', userId);
      console.log(`[stripe/webhook] renovação user=${userId} sub=${subscriptionId} expira=${expiresAt.toISOString()}`);
    }

    // Assinatura cancelada ou expirada
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userId = (sub.metadata as any)?.userId as string;
      if (!userId) return NextResponse.json({ ok: true });

      await db.from('subscriptions')
        .update({ mp_status: 'cancelled' })
        .eq('mp_subscription_id', sub.id);
      await db.from('profiles').update({ plan: 'free' }).eq('id', userId);
      console.log(`[stripe/webhook] cancelamento user=${userId} sub=${sub.id}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[stripe/webhook] error:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
