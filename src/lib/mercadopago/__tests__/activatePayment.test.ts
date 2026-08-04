import { describe, expect, it } from 'vitest';
import { evaluateMpPayment, type MpPaymentLike } from '@/lib/mercadopago/activatePayment';

function approvedPayment(overrides: Partial<MpPaymentLike> = {}): MpPaymentLike {
  return {
    id: 12345,
    status: 'approved',
    external_reference: 'user-1:monthly',
    transaction_amount: 29.90,
    currency_id: 'BRL',
    date_approved: '2026-07-01T10:00:00.000Z',
    payment_method_id: 'pix',
    ...overrides,
  };
}

describe('evaluateMpPayment — determinismo de replay', () => {
  it('mesmo pagamento avaliado 100 vezes produz sempre o mesmo expiresAt', () => {
    const payment = approvedPayment();
    const results = Array.from({ length: 100 }, () => evaluateMpPayment(payment));

    expect(results.every((r) => r.kind === 'activate')).toBe(true);
    const expirations = new Set(results.map((r) => (r.kind === 'activate' ? r.expiresAt : null)));
    expect(expirations.size).toBe(1);
  });

  it('expiresAt é calculado a partir de date_approved, não do momento da chamada', () => {
    const payment = approvedPayment({ date_approved: '2026-07-01T10:00:00.000Z' }); // plano mensal = +30 dias
    const result = evaluateMpPayment(payment);
    expect(result.kind).toBe('activate');
    if (result.kind === 'activate') {
      expect(result.expiresAt).toBe(new Date('2026-07-31T10:00:00.000Z').toISOString());
    }
  });

  it('plano mensal pago não ativa um período anual (valor não corresponde)', () => {
    const payment = approvedPayment({ transaction_amount: 29.90, external_reference: 'user-1:annual' });
    const result = evaluateMpPayment(payment);
    expect(result.kind).toBe('amount_mismatch');
  });

  it('valor incorreto não ativa PRO mesmo com status=approved', () => {
    const payment = approvedPayment({ transaction_amount: 1.00 });
    const result = evaluateMpPayment(payment);
    expect(result.kind).toBe('amount_mismatch');
  });

  it('moeda incorreta não ativa PRO', () => {
    const payment = approvedPayment({ currency_id: 'USD' });
    const result = evaluateMpPayment(payment);
    expect(result.kind).toBe('amount_mismatch');
  });

  it('pagamento de outro usuário é recusado quando expectedUserId não bate', () => {
    const payment = approvedPayment({ external_reference: 'user-1:monthly' });
    const result = evaluateMpPayment(payment, 'user-2');
    expect(result.kind).toBe('ownership_mismatch');
  });

  it('pagamento pending não ativa (ainda não aprovado)', () => {
    const payment = approvedPayment({ status: 'pending' });
    const result = evaluateMpPayment(payment);
    expect(result.kind).toBe('not_approved');
  });

  it('pagamento reembolsado revoga o acesso em vez de ativar', () => {
    const payment = approvedPayment({ status: 'refunded' });
    const result = evaluateMpPayment(payment);
    expect(result.kind).toBe('revoke');
    if (result.kind === 'revoke') expect(result.newStatus).toBe('canceled');
  });

  it('chargeback revoga o acesso', () => {
    const payment = approvedPayment({ status: 'charged_back' });
    const result = evaluateMpPayment(payment);
    expect(result.kind).toBe('revoke');
  });

  it('pagamento rejeitado revoga/expira em vez de ativar', () => {
    const payment = approvedPayment({ status: 'rejected' });
    const result = evaluateMpPayment(payment);
    expect(result.kind).toBe('revoke');
    if (result.kind === 'revoke') expect(result.newStatus).toBe('expired');
  });

  it('identifica corretamente pagamento via PIX vs cartão avulso', () => {
    const pix = evaluateMpPayment(approvedPayment({ payment_method_id: 'pix' }));
    const card = evaluateMpPayment(approvedPayment({ payment_method_id: 'master' }));
    expect(pix.kind === 'activate' && pix.paymentType).toBe('pix');
    // 'one_time_card', não 'card' — não pode ser confundido com
    // payment_type='subscription' (assinatura recorrente real, seja
    // Stripe ou preapproval do MP). Ver src/lib/subscriptionTypes.ts.
    expect(card.kind === 'activate' && card.paymentType).toBe('one_time_card');
  });

  it('approved sem date_approved NÃO usa a hora atual — vai para revisão manual', () => {
    const payment = approvedPayment({ date_approved: null });
    const result = evaluateMpPayment(payment);
    expect(result.kind).toBe('missing_approval_date');
  });

  it('approved sem date_approved nunca ativa, mesmo chamado repetidamente em momentos diferentes', () => {
    const payment = approvedPayment({ date_approved: undefined });
    const results = Array.from({ length: 5 }, () => evaluateMpPayment(payment));
    expect(results.every((r) => r.kind === 'missing_approval_date')).toBe(true);
  });
});
