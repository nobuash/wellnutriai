import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('isAllowedStripePriceId', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // client.ts lê as env vars na inicialização do módulo (não sob
    // demanda) — força reavaliação a cada teste pra não pegar um
    // módulo já cacheado com valores de env de um teste anterior.
    vi.resetModules();
    process.env.STRIPE_PRICE_MONTHLY = 'price_monthly_123';
    process.env.STRIPE_PRICE_QUARTERLY = 'price_quarterly_123';
    process.env.STRIPE_PRICE_ANNUAL = 'price_annual_123';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('aceita um price configurado', async () => {
    const { isAllowedStripePriceId } = await import('@/lib/stripe/client');
    expect(isAllowedStripePriceId('price_monthly_123')).toBe(true);
    expect(isAllowedStripePriceId('price_annual_123')).toBe(true);
  });

  it('rejeita um price desconhecido (não configurado como venda)', async () => {
    const { isAllowedStripePriceId } = await import('@/lib/stripe/client');
    expect(isAllowedStripePriceId('price_totally_different_product')).toBe(false);
  });

  it('rejeita price ausente/nulo', async () => {
    const { isAllowedStripePriceId } = await import('@/lib/stripe/client');
    expect(isAllowedStripePriceId(null)).toBe(false);
    expect(isAllowedStripePriceId(undefined)).toBe(false);
    expect(isAllowedStripePriceId('')).toBe(false);
  });
});
