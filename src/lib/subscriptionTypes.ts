// Taxonomia de payment_type — três valores possíveis, nunca mais 'card'
// sozinho (era ambíguo: usado tanto para assinatura Stripe recorrente
// quanto para cartão avulso do Mercado Pago, ver
// docs/production-hardening-round-3.md).
export type PaymentType = 'subscription' | 'one_time_card' | 'pix';

export interface RecurringCheckRow {
  provider: string | null;
  payment_type: string | null;
  provider_subscription_id: string | null;
}

/**
 * Defesa em profundidade para decidir se uma linha de subscriptions
 * representa uma assinatura recorrente de verdade — nunca confia
 * exclusivamente em payment_type (já foi gravado errado uma vez: Stripe
 * gravava 'card' para toda assinatura recorrente). Para Stripe, um
 * provider_subscription_id começando com "sub_" é por definição uma
 * assinatura recorrente na API da Stripe (payment_intent teria "pi_",
 * charge teria "ch_"), independente do que payment_type diz — então
 * mesmo que payment_type volte a ficar errado no futuro, cancelamento
 * e exclusão de conta ainda encontram a assinatura real.
 */
export function isRecurringSubscriptionRow(row: RecurringCheckRow): boolean {
  if (row.provider === 'stripe') {
    return (
      row.payment_type === 'subscription' ||
      (row.provider_subscription_id?.startsWith('sub_') ?? false)
    );
  }
  if (row.provider === 'mercadopago') {
    return row.payment_type === 'subscription';
  }
  return false;
}
