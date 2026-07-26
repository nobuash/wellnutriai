import { describe, expect, it } from 'vitest';
import { evaluateConsent } from '@/lib/consentCheck';

describe('evaluateConsent', () => {
  it('rejeita quando o perfil não existe', () => {
    expect(evaluateConsent(null, '2', '2')).toEqual({ ok: false, reason: 'not_accepted' });
  });

  it('rejeita quando accepted_terms é false', () => {
    const result = evaluateConsent({ accepted_terms: false, terms_version: '2', privacy_version: '2' }, '2', '2');
    expect(result).toEqual({ ok: false, reason: 'not_accepted' });
  });

  it('rejeita quando terms_version está desatualizada, mesmo com accepted_terms=true', () => {
    // Usuário aceitou a v1 no passado; TERMS_VERSION subiu pra v2 — não
    // pode continuar passando na checagem sem novo aceite.
    const result = evaluateConsent({ accepted_terms: true, terms_version: '1', privacy_version: '2' }, '2', '2');
    expect(result).toEqual({ ok: false, reason: 'outdated_terms' });
  });

  it('rejeita quando privacy_version está desatualizada', () => {
    const result = evaluateConsent({ accepted_terms: true, terms_version: '2', privacy_version: '1' }, '2', '2');
    expect(result).toEqual({ ok: false, reason: 'outdated_privacy' });
  });

  it('aceita quando tudo está em dia', () => {
    const result = evaluateConsent({ accepted_terms: true, terms_version: '2', privacy_version: '2' }, '2', '2');
    expect(result).toEqual({ ok: true });
  });
});
