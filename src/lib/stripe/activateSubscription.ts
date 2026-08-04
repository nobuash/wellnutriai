import { getStripe, isAllowedStripePriceId } from '@/lib/stripe/client';
import type { PlanInterval } from '@/lib/mercadopago/client';
import { createServiceClient } from '@/lib/supabase/service';
import { recalculateVisualPlanCache } from '@/lib/subscriptionCache';
import { requireSupabaseSuccess } from '@/lib/supabaseErrors';
import type { PaymentType } from '@/lib/subscriptionTypes';
import type Stripe from 'stripe';

export type StripeActivationResult =
  | { outcome: 'activated'; periodEnd: string | null }
  | { outcome: 'inactive'; status: string }
  | { outcome: 'ownership_mismatch' }
  | { outcome: 'price_not_allowed' };

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

  // CONFIRMADO (round 4): a ativação nunca checava o price da
  // assinatura retornada pela Stripe — bastava sub.metadata.userId
  // bater com o usuário certo para conceder PRO, não importa qual
  // price/valor a assinatura realmente cobra. Recusa ativar (e não
  // toca no banco) se o price não é um dos 3 configurados pra venda.
  const priceId = typeof item?.price === 'string' ? item.price : item?.price?.id;
  if (!isAllowedStripePriceId(priceId)) {
    console.error(`[activateStripeSubscription] price não permitido: sub=${subscriptionId} price=${priceId ?? 'ausente'}`);
    return { outcome: 'price_not_allowed' };
  }

  const isActive = ACTIVE_STRIPE_STATUSES.has(sub.status);
  const normalizedStatus: string =
    isActive ? 'active' :
    sub.status === 'past_due' ? 'past_due' :
    sub.status === 'canceled' || sub.status === 'unpaid' ? 'canceled' :
    'incomplete';

  const service = createServiceClient();
  const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer as Stripe.Customer | null)?.id ?? null;

  // payment_type='subscription': toda assinatura Stripe criada por
  // activateStripeSubscription vem de um Checkout com mode='subscription'
  // (ver src/app/api/payment/stripe/intent/route.ts) — é sempre
  // recorrente. Gravar 'card' aqui (bug confirmado no round 3) fazia
  // cancelamento e exclusão de conta nunca encontrarem a assinatura,
  // porque as duas rotas buscam especificamente payment_type='subscription'.
  await requireSupabaseSuccess(service.from('subscriptions').upsert(
    {
      user_id: userId,
      plan: isActive ? 'pro' : 'free',
      mp_subscription_id: subscriptionId,
      mp_status: isActive ? 'authorized' : 'cancelled',
      payment_type: 'subscription' satisfies PaymentType,
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
  ));

  await recalculateVisualPlanCache(service, userId);

  if (isActive) {
    // Fecha o ciclo de vida da reserva de checkout (round 4, item 4):
    // qualquer reserva 'session_created' deste usuário para Stripe vira
    // 'completed'. Não precisa casar pelo checkout_session_id exato —
    // o índice único parcial de 023_checkout_reservations.sql já
    // garante que só existe UMA reserva 'session_created' por
    // (user_id, provider) por vez, então não há ambiguidade. Não
    // bloqueante: a assinatura já foi ativada de verdade acima: uma
    // falha aqui só deixa uma reserva "presa" em session_created, que
    // nunca mais volta a bloquear nada (o índice único só cobre
    // reserved/session_created — o próximo checkout deste usuário só
    // aconteceria depois de cancelar esta assinatura, quando não
    // haveria mais reserva alguma disputando o slot).
    const { error: completeReservationError } = await service
      .from('checkout_reservations')
      .update({ status: 'completed' })
      .eq('user_id', userId)
      .eq('provider', 'stripe')
      .eq('status', 'session_created');
    if (completeReservationError) {
      console.error('[activateStripeSubscription] falha ao marcar reserva como completed:', completeReservationError);
    }
  }

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

/**
 * Busca um provider_customer_id da Stripe já conhecido pra este
 * usuário, de QUALQUER assinatura histórica (não só ativa).
 *
 * CONFIRMADO: /api/payment/stripe/intent localizava o Customer da
 * Stripe fazendo `stripe.customers.list({ email, limit: 1 })` e
 * pegando o primeiro resultado — não confiável (múltiplos Customers
 * podem existir com o mesmo e-mail, especialmente em ambiente de
 * teste; o e-mail do usuário pode ter mudado desde a última compra;
 * e duas requisições concorrentes de checkout podiam cada uma ver
 * "nenhum resultado" e criar dois Customers duplicados). Preferimos
 * sempre o ID que JÁ gravamos no nosso banco na ativação anterior —
 * só cai para busca por e-mail/criação quando não há nenhum registro.
 */
export async function findStripeCustomerId(userId: string): Promise<string | null> {
  const service = createServiceClient();
  const { data } = await service
    .from('subscriptions')
    .select('provider_customer_id')
    .eq('user_id', userId)
    .eq('provider', 'stripe')
    .not('provider_customer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.provider_customer_id ?? null;
}
