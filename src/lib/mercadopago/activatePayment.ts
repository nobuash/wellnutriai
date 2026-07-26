import { getPayment, PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { createServiceClient } from '@/lib/supabase/service';
import { recalculateVisualPlanCache } from '@/lib/subscriptionCache';

export type MpActivationResult =
  | { outcome: 'activated'; expiresAt: string }
  | { outcome: 'revoked' } // reembolsado/estornado/rejeitado/cancelado — acesso removido
  | { outcome: 'not_approved'; status: string } // ainda pending/in_process/etc.
  | { outcome: 'ownership_mismatch' }
  | { outcome: 'amount_mismatch' };

const REVOKING_STATUSES = new Set(['refunded', 'cancelled', 'charged_back', 'rejected']);

/**
 * Processa um pagamento do Mercado Pago de forma determinística e
 * idempotente: sempre busca o pagamento real na API do MP (nunca
 * confia em dados enviados pelo cliente/webhook), valida dono e valor,
 * e calcula a expiração a partir de `date_approved` — a data real de
 * aprovação do provedor — em vez de `new Date()`. Isso é o que torna
 * chamar esta função 100 vezes com o mesmo payment_id determinístico:
 * o resultado (expiresAt) é sempre o mesmo, então reprocessar não
 * estende a validade.
 *
 * Usado tanto por /api/payment/verify (checagem manual do usuário)
 * quanto pelo webhook — mesma lógica, uma fonte única.
 */
export async function activateMpPayment(
  paymentId: number,
  expectedUserId?: string,
): Promise<MpActivationResult> {
  const payment = await getPayment().get({ id: paymentId });
  if (!payment?.id) {
    return { outcome: 'not_approved', status: 'not_found' };
  }

  const externalRef = (payment.external_reference as string) ?? '';
  const [userId, rawInterval = 'monthly'] = externalRef.split(':');

  if (!userId || (expectedUserId && userId !== expectedUserId)) {
    return { outcome: 'ownership_mismatch' };
  }

  const planInterval: PlanInterval =
    rawInterval === 'quarterly' || rawInterval === 'annual' ? rawInterval : 'monthly';
  const plan = PLANS[planInterval];

  const status = payment.status as string;
  const service = createServiceClient();

  if (REVOKING_STATUSES.has(status)) {
    await service
      .from('subscriptions')
      .update({
        status: status === 'refunded' || status === 'charged_back' ? 'canceled' : 'expired',
        mp_status: 'cancelled',
        canceled_at: new Date().toISOString(),
      })
      .eq('provider_subscription_id', String(payment.id));

    // Só rebaixa o cache visual se não houver OUTRA assinatura ativa —
    // ver getUserEntitlement, que é quem decide de verdade.
    await recalculateVisualPlanCache(service, userId);

    return { outcome: 'revoked' };
  }

  if (status !== 'approved') {
    return { outcome: 'not_approved', status };
  }

  // Valida valor e moeda — nunca ativa PRO só porque status=approved
  // sem confirmar que o valor pago bate com o plano esperado.
  const paidAmount = Number(payment.transaction_amount ?? 0);
  const paidCurrency = payment.currency_id as string | undefined;
  const amountOk = Math.abs(paidAmount - plan.amount) < 0.01;
  const currencyOk = !paidCurrency || paidCurrency === plan.currency;
  if (!amountOk || !currencyOk) {
    console.error(
      `[mp] valor/moeda não confere: pago=${paidAmount}${paidCurrency} esperado=${plan.amount}${plan.currency} payment=${payment.id}`,
    );
    return { outcome: 'amount_mismatch' };
  }

  // Data real de aprovação do provedor — nunca Date.now(). O mesmo
  // payment_id sempre tem o mesmo date_approved, então esta conta dá
  // sempre o mesmo resultado, não importa quantas vezes rodar.
  const approvedAt = payment.date_approved ? new Date(payment.date_approved) : new Date();
  const expiresAt = new Date(approvedAt);
  expiresAt.setDate(expiresAt.getDate() + plan.durationDays);

  const paymentType = payment.payment_method_id === 'pix' ? 'pix' : 'card';

  await service.from('subscriptions').upsert(
    {
      user_id: userId,
      plan: 'pro',
      mp_subscription_id: String(payment.id),
      mp_status: 'authorized',
      payment_type: paymentType,
      expires_at: expiresAt.toISOString(),
      provider: 'mercadopago',
      provider_subscription_id: String(payment.id),
      provider_payment_id: String(payment.id),
      status: 'active',
      billing_interval: planInterval,
      current_period_start: approvedAt.toISOString(),
      current_period_end: expiresAt.toISOString(),
      cancel_at_period_end: false,
      canceled_at: null,
    },
    { onConflict: 'mp_subscription_id' },
  );

  await recalculateVisualPlanCache(service, userId);

  return { outcome: 'activated', expiresAt: expiresAt.toISOString() };
}
