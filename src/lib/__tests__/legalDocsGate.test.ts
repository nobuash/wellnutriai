import { describe, expect, it } from 'vitest';
import { getMissingLegalEnvVars, REQUIRED_LEGAL_ENV_VARS } from '@/lib/legalDocsGate';

function fullEnv(overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = {};
  for (const key of REQUIRED_LEGAL_ENV_VARS) env[key] = 'preenchido';
  return { ...env, ...overrides };
}

describe('getMissingLegalEnvVars', () => {
  it('não acusa nada faltando quando todas as variáveis estão preenchidas', () => {
    expect(getMissingLegalEnvVars(fullEnv())).toEqual([]);
  });

  it('lista exatamente as variáveis ausentes', () => {
    const env = fullEnv({ LEGAL_ENTITY_CNPJ: undefined, DPO_CONTACT_EMAIL: '' });
    expect(getMissingLegalEnvVars(env)).toEqual(['LEGAL_ENTITY_CNPJ', 'DPO_CONTACT_EMAIL']);
  });

  it('considera tudo ausente em um ambiente vazio', () => {
    expect(getMissingLegalEnvVars({})).toEqual(REQUIRED_LEGAL_ENV_VARS);
  });
});
