import { describe, expect, it } from 'vitest';
import {
  getMissingLegalEnvVars,
  REQUIRED_LEGAL_ENV_VARS,
  shouldBlockProductionDeploy,
} from '@/lib/legalDocsGate';

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

describe('shouldBlockProductionDeploy', () => {
  it('não bloqueia fora do deploy de produção real da Vercel, mesmo com tudo faltando', () => {
    expect(shouldBlockProductionDeploy({})).toBe(false);
    expect(shouldBlockProductionDeploy({ VERCEL_ENV: 'preview' })).toBe(false);
    expect(shouldBlockProductionDeploy({ VERCEL_ENV: 'development' })).toBe(false);
  });

  it('bloqueia no deploy de produção real quando falta algo', () => {
    const env = fullEnv({ VERCEL_ENV: 'production', REFUND_POLICY_TEXT: undefined });
    expect(shouldBlockProductionDeploy(env)).toBe(true);
  });

  it('não bloqueia no deploy de produção real quando está tudo completo', () => {
    const env = fullEnv({ VERCEL_ENV: 'production' });
    expect(shouldBlockProductionDeploy(env)).toBe(false);
  });
});
