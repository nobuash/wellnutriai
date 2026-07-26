import { describe, expect, it } from 'vitest';
import { isRecurringSubscriptionRow } from '@/lib/subscriptionTypes';

describe('isRecurringSubscriptionRow', () => {
  it('assinatura Stripe com payment_type=subscription é recorrente', () => {
    expect(
      isRecurringSubscriptionRow({ provider: 'stripe', payment_type: 'subscription', provider_subscription_id: 'sub_123' }),
    ).toBe(true);
  });

  it('linha Stripe com provider_subscription_id sub_* é recorrente mesmo com payment_type errado (defesa em profundidade)', () => {
    expect(
      isRecurringSubscriptionRow({ provider: 'stripe', payment_type: 'card', provider_subscription_id: 'sub_123' }),
    ).toBe(true);
  });

  it('linha Stripe sem prefixo sub_ e sem payment_type=subscription não é recorrente', () => {
    expect(
      isRecurringSubscriptionRow({ provider: 'stripe', payment_type: 'card', provider_subscription_id: 'pi_123' }),
    ).toBe(false);
  });

  it('cartão avulso do Mercado Pago (one_time_card) não é recorrente', () => {
    expect(
      isRecurringSubscriptionRow({ provider: 'mercadopago', payment_type: 'one_time_card', provider_subscription_id: '999' }),
    ).toBe(false);
  });

  it('PIX do Mercado Pago não é recorrente', () => {
    expect(
      isRecurringSubscriptionRow({ provider: 'mercadopago', payment_type: 'pix', provider_subscription_id: '999' }),
    ).toBe(false);
  });

  it('preapproval do Mercado Pago (payment_type=subscription) é recorrente', () => {
    expect(
      isRecurringSubscriptionRow({ provider: 'mercadopago', payment_type: 'subscription', provider_subscription_id: '999' }),
    ).toBe(true);
  });

  it('provider desconhecido nunca é recorrente', () => {
    expect(
      isRecurringSubscriptionRow({ provider: null, payment_type: 'subscription', provider_subscription_id: 'sub_123' }),
    ).toBe(false);
  });
});
