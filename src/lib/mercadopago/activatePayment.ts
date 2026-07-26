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

export interface MpPaymentLike {
  id: string | number;
  status: string;
  external_reference?: string | null;
  transaction_amount?: number | null;
  currency_id?: string | null;
  date_approved?: string | null;
  payment_method_id?: string | null;
}

export type MpEvaluation =
  | { kind: 'ownership_mismatch' }
  | { kind: 'not_approved'; status: string }
  | { kind: 'amount_mismatch' }
  | { kind: 'revoke'; userId: string; newStatus: 'canceled' | 'expired' }
  | {
      kind: 'activate';
      userId: string;
      planInterval: PlanInterval;
      paymentType: 'pix' | 'card';
      approvedAt: string;
      expiresAt: string;
    };

/**
 * Função pura, sem I/O — decide o que fazer com um pagamento do MP.
 * Extraída de activateMpPayment() especificamente pra ser testável sem
 * mockar a API do Mercado Pago nem o Supabase (ver
 * src/lib/mercadopago/__tests__/activatePayment.test.ts).
 *
 * A parte que garante idempotência/determinismo está aqui: expiresAt
 * vem sempre de `date_approved` (imutável, fornecido pelo provedor),
 * nunca de `Date.now()` — chamar isso com o mesmo `payment` dá sempre
 * o mesmo resultado, então reprocessar o mesmo payment_id nunca
 * estende a validade.
 */
export function evaluateMpPayment(payment: MpPaymentLike, expectedUserId?: string): MpEvaluation {
  const externalRef = payment.external_reference ?? '';
  const [userId, rawInterval = 'monthly'] = externalRef.split(':');

  if (!userId || (expectedUserId && userId !== expectedUserId)) {
    return { kind: 'ownership_mismatch' };
  }

  const planInterval: PlanInterval =
    rawInterval === 'quarterly' || rawInterval === 'annual' ? rawInterval : 'monthly';
  const plan = PLANS[planInterval];
  const status = payment.status;

  if (REVOKING_STATUSES.has(status)) {
    return {
      kind: 'revoke',
      userId,
      newStatus: status === 'refunded' || status === 'charged_back' ? 'canceled' : 'expired',
    };
  }

  if (status !== 'approved') {
    return { kind: 'not_approved', status };
  }

  // Valida valor e moeda — nunca ativa PRO só porque status=approved
  // sem confirmar que o valor pago bate com o plano esperado.
  const paidAmount = Number(payment.transaction_amount ?? 0);
  const paidCurrency = payment.currency_id ?? undefined;
  const amountOk = Math.abs(paidAmount - plan.amount) < 0.01;
  const currencyOk = !paidCurrency || paidCurrency === plan.currency;
  if (!amountOk || !currencyOk) {
    return { kind: 'amount_mismatch' };
  }

  // Data real de aprovação do provedor — nunca Date.now().
  const approvedAt = payment.date_approved ? new Date(payment.date_approved) : new Date();
  const expiresAt = new Date(approvedAt);
  expiresAt.setDate(expiresAt.getDate() + plan.durationDays);

  return {
    kind: 'activate',
    userId,
    planInterval,
    paymentType: payment.payment_method_id === 'pix' ? 'pix' : 'card',
    approvedAt: approvedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Sempre busca o pagamento real na API do MP (nunca confia em dados
 * enviados pelo cliente/webhook), decide o que fazer via
 * evaluateMpPayment() (puro, testável) e só então grava.
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

  const evaluation = evaluateMpPayment(
    {
      id: payment.id,
      status: payment.status as string,
      external_reference: payment.external_reference as string | undefined,
      transaction_amount: payment.transaction_amount,
      currency_id: payment.currency_id,
      date_approved: payment.date_approved,
      payment_method_id: payment.payment_method_id,
    },
    expectedUserId,
  );

  const service = createServiceClient();

  switch (evaluation.kind) {
    case 'ownership_mismatch':
      return { outcome: 'ownership_mismatch' };

    case 'not_approved':
      return { outcome: 'not_approved', status: evaluation.status };

    case 'amount_mismatch':
      console.error(
        `[mp] valor/moeda não confere: pago=${payment.transaction_amount}${payment.currency_id} payment=${payment.id}`,
      );
      return { outcome: 'amount_mismatch' };

    case 'revoke': {
      await service
        .from('subscriptions')
        .update({
          status: evaluation.newStatus,
          mp_status: 'cancelled',
          canceled_at: new Date().toISOString(),
        })
        .eq('provider_subscription_id', String(payment.id));

      // Só rebaixa o cache visual se não houver OUTRA assinatura ativa —
      // ver getUserEntitlement, que é quem decide de verdade.
      await recalculateVisualPlanCache(service, evaluation.userId);
      return { outcome: 'revoked' };
    }

    case 'activate': {
      await service.from('subscriptions').upsert(
        {
          user_id: evaluation.userId,
          plan: 'pro',
          mp_subscription_id: String(payment.id),
          mp_status: 'authorized',
          payment_type: evaluation.paymentType,
          expires_at: evaluation.expiresAt,
          provider: 'mercadopago',
          provider_subscription_id: String(payment.id),
          provider_payment_id: String(payment.id),
          status: 'active',
          billing_interval: evaluation.planInterval,
          current_period_start: evaluation.approvedAt,
          current_period_end: evaluation.expiresAt,
          cancel_at_period_end: false,
          canceled_at: null,
        },
        { onConflict: 'mp_subscription_id' },
      );

      await recalculateVisualPlanCache(service, evaluation.userId);
      return { outcome: 'activated', expiresAt: evaluation.expiresAt };
    }
  }
}
