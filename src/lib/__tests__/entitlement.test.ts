import { describe, expect, it } from 'vitest';
import { selectEntitlement, type SubscriptionRow } from '@/lib/entitlement';

const NOW = new Date('2026-07-26T12:00:00Z');
const FUTURE = '2026-08-26T12:00:00Z';
const FUTURE_LATER = '2026-09-26T12:00:00Z';
const PAST = '2026-06-26T12:00:00Z';

function row(overrides: Partial<SubscriptionRow>): SubscriptionRow {
  return {
    id: 'sub_1',
    status: 'active',
    provider: 'stripe',
    payment_type: 'subscription',
    current_period_start: null,
    current_period_end: FUTURE,
    cancel_at_period_end: false,
    canceled_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('selectEntitlement', () => {
  it('retorna no_subscription quando não há nenhuma assinatura', () => {
    const result = selectEntitlement([], NOW);
    expect(result.isPro).toBe(false);
    expect(result.plan).toBe('free');
    expect(result.reason).toBe('no_subscription');
  });

  it('concede PRO com uma única assinatura Stripe ativa e válida', () => {
    const result = selectEntitlement([row({ id: 'a', provider: 'stripe', status: 'active', current_period_end: FUTURE })], NOW);
    expect(result.isPro).toBe(true);
    expect(result.plan).toBe('pro');
    expect(result.reason).toBe('active');
    expect(result.activeSubscriptionId).toBe('a');
  });

  it('Stripe ativa + PIX pendente = usuário continua PRO (pendente não esconde a ativa)', () => {
    const rows = [
      row({ id: 'stripe-active', provider: 'stripe', payment_type: 'subscription', status: 'active', current_period_end: FUTURE, created_at: '2026-01-01T00:00:00Z' }),
      row({ id: 'pix-pending', provider: 'mercadopago', payment_type: 'pix', status: 'pending', current_period_end: null, created_at: '2026-07-26T11:00:00Z' }),
    ];
    const result = selectEntitlement(rows, NOW);
    expect(result.isPro).toBe(true);
    expect(result.activeSubscriptionId).toBe('stripe-active');
    expect(result.provider).toBe('stripe');
  });

  it('PIX ativo + Stripe cancelada = usuário continua PRO', () => {
    const rows = [
      row({ id: 'pix-active', provider: 'mercadopago', payment_type: 'pix', status: 'active', current_period_end: FUTURE, created_at: '2026-07-01T00:00:00Z' }),
      row({ id: 'stripe-canceled', provider: 'stripe', payment_type: 'subscription', status: 'canceled', current_period_end: PAST, created_at: '2026-01-01T00:00:00Z' }),
    ];
    const result = selectEntitlement(rows, NOW);
    expect(result.isPro).toBe(true);
    expect(result.activeSubscriptionId).toBe('pix-active');
  });

  it('duas assinaturas ativas: seleciona a de maior current_period_end', () => {
    const rows = [
      row({ id: 'shorter', status: 'active', current_period_end: FUTURE }),
      row({ id: 'longer', status: 'active', current_period_end: FUTURE_LATER }),
    ];
    const result = selectEntitlement(rows, NOW);
    expect(result.isPro).toBe(true);
    expect(result.activeSubscriptionId).toBe('longer');
    expect(result.currentPeriodEnd).toBe(FUTURE_LATER);
  });

  it('assinatura marcada para cancelar continua válida até o fim do período (active_canceling)', () => {
    const rows = [row({ id: 'canceling', status: 'active', current_period_end: FUTURE, cancel_at_period_end: true })];
    const result = selectEntitlement(rows, NOW);
    expect(result.isPro).toBe(true);
    expect(result.reason).toBe('active_canceling');
    expect(result.cancelAtPeriodEnd).toBe(true);
  });

  it('todas expiradas = Free', () => {
    const rows = [row({ id: 'old1', status: 'active', current_period_end: PAST })];
    const result = selectEntitlement(rows, NOW);
    expect(result.isPro).toBe(false);
    expect(result.plan).toBe('free');
    expect(result.reason).toBe('expired');
  });

  it('entre uma "active" vencida e uma "canceled", prioriza canceled (mais específico/intencional)', () => {
    const rows = [
      row({ id: 'stale-active', status: 'active', current_period_end: PAST }),
      row({ id: 'explicitly-canceled', status: 'canceled', current_period_end: PAST }),
    ];
    const result = selectEntitlement(rows, NOW);
    expect(result.isPro).toBe(false);
    expect(result.reason).toBe('canceled');
    expect(result.activeSubscriptionId).toBe('explicitly-canceled');
  });

  it('sem assinatura ativa, prioriza past_due sobre pending/canceled/expired', () => {
    const rows = [
      row({ id: 'pending', status: 'pending', current_period_end: null }),
      row({ id: 'past_due', status: 'past_due', current_period_end: PAST }),
      row({ id: 'canceled', status: 'canceled', current_period_end: PAST }),
    ];
    const result = selectEntitlement(rows, NOW);
    expect(result.isPro).toBe(false);
    expect(result.reason).toBe('past_due');
    expect(result.activeSubscriptionId).toBe('past_due');
  });

  it('sem assinatura ativa, prioriza payment_failed sobre pending', () => {
    const rows = [
      row({ id: 'pending', status: 'pending', current_period_end: null }),
      row({ id: 'failed', status: 'payment_failed', current_period_end: PAST }),
    ];
    const result = selectEntitlement(rows, NOW);
    expect(result.reason).toBe('payment_failed');
  });

  it('assinatura "active" sem current_period_end é tratada como válida indefinidamente', () => {
    const rows = [row({ id: 'no-end-date', status: 'active', current_period_end: null })];
    const result = selectEntitlement(rows, NOW);
    expect(result.isPro).toBe(true);
  });

  it('plan payment_type pix (avulso) ativo mas vencido não concede PRO', () => {
    const rows = [row({ id: 'pix-expired', provider: 'mercadopago', payment_type: 'pix', status: 'active', current_period_end: PAST })];
    const result = selectEntitlement(rows, NOW);
    expect(result.isPro).toBe(false);
    expect(result.reason).toBe('expired');
  });
});
