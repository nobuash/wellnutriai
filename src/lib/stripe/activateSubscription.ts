import { getStripe } from '@/lib/stripe/client';
import type { PlanInterval } from '@/lib/mercadopago/client';
import { createServiceClient } from '@/lib/supabase/service';
import { recalculateVisualPlanCache } from '@/lib/subscriptionCache';
import type Stripe from 'stripe';

export type StripeActivationResult =
  | { outcome: 'activated'; periodEnd: string | null }
  | { outcome: 'inactive'; status: string }
  | { outcome: 'ownership_mismatch' };

const ACTIVE_STRIPE_STATUSES = new Set(['active', 'trialing']);

/**
 * Sincroniza o estado real de uma assinatura Stripe para o nosso
 * banco. Sempre busca a assinatura na API da Stripe (nunca confia em
 * dados do cliente) e usa as datas reais de período que a própria
 * Stripe calcula — nunca `new Date()`. Isso é o que torna chamar isto
 * de novo com o mesmo subscriptionId idempotente: current_period_end
 * só muda quando a Stripe genuinamente renova a assinatura, então
 * reprocessar a mesma assinatura sem renovação real dá sempre o mesmo
 * resultado.
 *
 * Usado tanto por /api/payment/stripe/activate (checagem manual após
 * o checkout embutido fechar) quanto pelo webhook.
 */
export async function activateStripeSubscription(
  subscriptionId: string,
  expectedUserId?: string,
): Promise<StripeActivationResult> {
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = sub.metadata as any;
  const userId = meta?.userId as string | undefined;

  if (!userId || (expectedUserId && userId !== expectedUserId)) {
    return { outcome: 'ownership_mismatch' };
  }

  const planInterval = (meta?.planInterval ?? 'monthly') as PlanInterval;

  // Nesta versão da API Stripe, current_period_start/end vivem no item
  // da assinatura, não na raiz do objeto subscription.
  const item = sub.items.data[0];
  const periodStart = item?.current_period_start ? new Date(item.current_period_start * 1000) : null;
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;

  const isActive = ACTIVE_STRIPE_STATUSES.has(sub.status);
  const normalizedStatus: string =
    isActive ? 'active' :
    sub.status === 'past_due' ? 'past_due' :
    sub.status === 'canceled' || sub.status === 'unpaid' ? 'canceled' :
    'incomplete';

  const service = createServiceClient();
  const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer as Stripe.Customer | null)?.id ?? null;

  await service.from('subscriptions').upsert(
    {
      user_id: userId,
      plan: isActive ? 'pro' : 'free',
      mp_subscription_id: subscriptionId,
      mp_status: isActive ? 'authorized' : 'cancelled',
      payment_type: 'card',
      expires_at: periodEnd?.toISOString() ?? null,
      provider: 'stripe',
      provider_subscription_id: subscriptionId,
      provider_customer_id: customerId,
      status: normalizedStatus,
      billing_interval: planInterval,
      current_period_start: periodStart?.toISOString() ?? null,
      current_period_end: periodEnd?.toISOString() ?? null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    },
    { onConflict: 'mp_subscription_id' },
  );

  await recalculateVisualPlanCache(service, userId);

  if (!isActive) {
    return { outcome: 'inactive', status: normalizedStatus };
  }
  return { outcome: 'activated', periodEnd: periodEnd?.toISOString() ?? null };
}

/**
 * Alguém já tem uma assinatura Stripe recorrente ativa (status active
 * ou trialing, não marcada para cancelar)? Usado antes de criar um
 * novo checkout — impede duas assinaturas simultâneas.
 */
export async function findActiveStripeSubscription(userId: string): Promise<{ id: string; providerSubscriptionId: string } | null> {
  const service = createServiceClient();
  const { data } = await service
    .from('subscriptions')
    .select('id, provider_subscription_id')
    .eq('user_id', userId)
    .eq('provider', 'stripe')
    .eq('status', 'active')
    .eq('cancel_at_period_end', false)
    .limit(1)
    .maybeSingle();

  if (!data?.provider_subscription_id) return null;
  return { id: data.id, providerSubscriptionId: data.provider_subscription_id };
}
