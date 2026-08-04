import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('getAppUrl', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('em desenvolvimento, sem env var configurada, usa localhost', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('APP_URL', '');
    const { getAppUrl } = await import('@/lib/appUrl');
    expect(getAppUrl()).toBe('http://localhost:3000');
  });

  it('em produção, sem env var configurada, lança em vez de usar localhost', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('APP_URL', '');
    const { getAppUrl } = await import('@/lib/appUrl');
    expect(() => getAppUrl()).toThrow(/não configurada em produção/);
  });

  it('em produção, com URL http (não https), lança', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://wellnutriai.com');
    const { getAppUrl } = await import('@/lib/appUrl');
    expect(() => getAppUrl()).toThrow(/HTTPS/);
  });

  it('em produção, com URL https válida, retorna sem a barra final', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://wellnutriai.com/');
    const { getAppUrl } = await import('@/lib/appUrl');
    expect(getAppUrl()).toBe('https://wellnutriai.com');
  });

  it('usa APP_URL como fallback quando NEXT_PUBLIC_APP_URL não está definida', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('APP_URL', 'https://staging.wellnutriai.com');
    const { getAppUrl } = await import('@/lib/appUrl');
    expect(getAppUrl()).toBe('https://staging.wellnutriai.com');
  });
});
