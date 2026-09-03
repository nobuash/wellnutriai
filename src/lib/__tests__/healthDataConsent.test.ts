import { describe, expect, it } from 'vitest';
import { evaluateHealthDataConsent } from '@/lib/healthDataConsent';

describe('evaluateHealthDataConsent', () => {
  it('rejeita quando o perfil não existe', () => {
    expect(evaluateHealthDataConsent(null, '2')).toEqual({ ok: false, reason: 'not_granted' });
  });

  it('rejeita quando nunca foi concedido (health_data_consent_at nulo)', () => {
    const result = evaluateHealthDataConsent(
      { health_data_consent_version: null, health_data_consent_at: null, health_data_consent_revoked_at: null },
      '2',
    );
    expect(result).toEqual({ ok: false, reason: 'not_granted' });
  });

  it('rejeita por revogação mesmo se a versão estiver em dia', () => {
    const result = evaluateHealthDataConsent(
      {
        health_data_consent_version: '2',
        health_data_consent_at: '2026-01-01T00:00:00Z',
        health_data_consent_revoked_at: '2026-02-01T00:00:00Z',
      },
      '2',
    );
    expect(result).toEqual({ ok: false, reason: 'revoked' });
  });

  it('rejeita quando a versão concedida está desatualizada', () => {
    const result = evaluateHealthDataConsent(
      {
        health_data_consent_version: '1',
        health_data_consent_at: '2026-01-01T00:00:00Z',
        health_data_consent_revoked_at: null,
      },
      '2',
    );
    expect(result).toEqual({ ok: false, reason: 'outdated' });
  });

  it('aceita quando concedido, não revogado e na versão atual', () => {
    const result = evaluateHealthDataConsent(
      {
        health_data_consent_version: '2',
        health_data_consent_at: '2026-01-01T00:00:00Z',
        health_data_consent_revoked_at: null,
      },
      '2',
    );
    expect(result).toEqual({ ok: true });
  });
});
