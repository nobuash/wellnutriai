import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('isRegulatoryReviewApproved', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fora de produção, libera mesmo sem a env var (não bloqueia dev/test)', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('REGULATORY_REVIEW_APPROVED', '');
    const { isRegulatoryReviewApproved } = await import('@/lib/regulatory');
    expect(isRegulatoryReviewApproved()).toBe(true);
  });

  it('em produção, sem a env var, bloqueia — ausência nunca é aprovação', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REGULATORY_REVIEW_APPROVED', '');
    const { isRegulatoryReviewApproved } = await import('@/lib/regulatory');
    expect(isRegulatoryReviewApproved()).toBe(false);
  });

  it('em produção, com valor diferente de "true", bloqueia', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REGULATORY_REVIEW_APPROVED', 'yes');
    const { isRegulatoryReviewApproved } = await import('@/lib/regulatory');
    expect(isRegulatoryReviewApproved()).toBe(false);
  });

  it('em produção, com "true" explícito, libera', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REGULATORY_REVIEW_APPROVED', 'true');
    const { isRegulatoryReviewApproved } = await import('@/lib/regulatory');
    expect(isRegulatoryReviewApproved()).toBe(true);
  });
});
