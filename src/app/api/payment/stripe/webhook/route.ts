import { getStripe } from '@/lib/stripe/client';
import { activateStripeSubscription } from '@/lib/stripe/activateSubscription';
import { createServiceClient } from '@/lib/supabase/service';
import { recalculateVisualPlanCache } from '@/lib/subscriptionCache';
import { withWebhookIdempotency } from '@/lib/webhookIdempotency';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

export const runtime = 'nodejs';

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

  // event.id é estável entre reentregas do MESMO evento pela Stripe —
  // dedup key perfeita, sem os problemas de keying do lado do MP.
  const outcome = await withWebhookIdempotency(
    { provider: 'stripe', eventKey: event.id, eventType: event.type },
    () => processStripeEvent(event),
  );

  if (outcome === 'failed') {
    return NextResponse.json({ error: 'Falha ao processar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function processStripeEvent(event: Stripe.Event): Promise<void> {
  const db = createServiceClient();

  // Renovação paga com sucesso — sincroniza com o estado real da
  // assinatura na Stripe (datas de período vêm de lá, nunca de now()).
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscriptionId = (invoice as any).subscription as string | undefined;
    if (!subscriptionId) return;

    const result = await activateStripeSubscription(subscriptionId);
    console.log(`[stripe/webhook] invoice.payment_succeeded sub=${subscriptionId} outcome=${result.outcome}`);
    return;
  }

  // Falha de cobrança (cartão recusado na renovação)
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscriptionId = (invoice as any).subscription as string | undefined;
    if (!subscriptionId) return;

    await db.from('subscriptions')
      .update({ status: 'payment_failed', mp_status: 'cancelled' })
      .eq('provider_subscription_id', subscriptionId);
    console.log(`[stripe/webhook] falha de pagamento sub=${subscriptionId}`);
    return;
  }

  // Assinatura cancelada ou expirada
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (sub.metadata as any)?.userId as string | undefined;

    await db.from('subscriptions')
      .update({ mp_status: 'cancelled', status: 'canceled', canceled_at: new Date().toISOString() })
      .eq('provider_subscription_id', sub.id);

    if (userId) await recalculateVisualPlanCache(db, userId);
    console.log(`[stripe/webhook] cancelamento user=${userId ?? '?'} sub=${sub.id}`);
    return;
  }

  // customer.subscription.created/updated: sincroniza o estado completo
  // (inclui cancel_at_period_end e mudanças de status como past_due).
  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription;
    const result = await activateStripeSubscription(sub.id);
    console.log(`[stripe/webhook] ${event.type} sub=${sub.id} outcome=${result.outcome}`);
    return;
  }

  // Estorno — remove o acesso correspondente. charge.refunded não traz
  // o id da assinatura diretamente; buscamos via payment_intent ->
  // invoice quando disponível. Se não for uma cobrança de assinatura
  // (ex: não deveria acontecer no fluxo atual, só cartão/PIX MP tem
  // pagamento avulso), não há o que fazer aqui.
  if (event.type === 'charge.refunded') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const charge = event.data.object as any as Stripe.Charge & { invoice: string | { id: string } | null };
    const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id;
    if (!invoiceId) return;

    const stripe = getStripe();
    const invoice = await stripe.invoices.retrieve(invoiceId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscriptionId = (invoice as any).subscription as string | undefined;
    if (!subscriptionId) return;

    const { data: row } = await db
      .from('subscriptions')
      .select('user_id')
      .eq('provider_subscription_id', subscriptionId)
      .maybeSingle();

    await db.from('subscriptions')
      .update({ status: 'canceled', mp_status: 'cancelled', canceled_at: new Date().toISOString() })
      .eq('provider_subscription_id', subscriptionId);

    if (row?.user_id) await recalculateVisualPlanCache(db, row.user_id);
    console.log(`[stripe/webhook] estorno sub=${subscriptionId}`);
    return;
  }

  // Contestação de cobrança (chargeback) — registra para revisão manual.
  // Não revoga automaticamente: a disputa pode ser vencida pelo
  // lojista; revogar de imediato é uma decisão comercial, não técnica.
  if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object as Stripe.Dispute;
    console.warn(`[stripe/webhook] disputa aberta charge=${dispute.charge} motivo=${dispute.reason} — revisar manualmente`);
    await db.from('audit_log').insert({
      user_id: null,
      action: 'stripe_dispute_created',
      metadata: { charge: String(dispute.charge), reason: dispute.reason },
    });
    return;
  }
}
