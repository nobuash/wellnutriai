import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// src/config/legal.ts lê process.env em nível de módulo — precisa do
// mesmo padrão de vi.stubEnv + vi.resetModules + import dinâmico já
// usado em src/lib/__tests__/appUrl.test.ts e regulatory.test.ts.
const ALL_LEGAL_VARS = [
  'LEGAL_ENTITY_NAME',
  'LEGAL_ENTITY_CNPJ',
  'LEGAL_ENTITY_ADDRESS',
  'DPO_CONTACT_EMAIL',
  'SUPPORT_CONTACT_EMAIL',
  'LEGAL_DOCS_UPDATED_AT',
  'REFUND_POLICY_TEXT',
  'BACKUP_RETENTION_POLICY_TEXT',
  'LEGAL_MINIMUM_RETENTION_TEXT',
];

function stubAllEmpty() {
  for (const key of ALL_LEGAL_VARS) vi.stubEnv(key, '');
}

describe('src/config/legal — completude por página', () => {
  beforeEach(() => {
    vi.resetModules();
    stubAllEmpty();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('nenhuma página fica completa quando nada está preenchido', async () => {
    const legal = await import('@/config/legal');
    expect(legal.PRIVACY_PAGE_COMPLETE).toBe(false);
    expect(legal.TERMS_PAGE_COMPLETE).toBe(false);
    expect(legal.CANCELLATION_PAGE_COMPLETE).toBe(false);
    expect(legal.DATA_RETENTION_PAGE_COMPLETE).toBe(false);
    expect(legal.FAIR_USE_PAGE_COMPLETE).toBe(false);
  });

  it('/privacy só fica completa com os 5 campos que ela usa — falta 1 já basta pra não completar', async () => {
    vi.stubEnv('LEGAL_ENTITY_NAME', 'Empresa');
    vi.stubEnv('LEGAL_ENTITY_CNPJ', '00.000.000/0001-00');
    vi.stubEnv('LEGAL_ENTITY_ADDRESS', 'Rua X, 123');
    vi.stubEnv('LEGAL_DOCS_UPDATED_AT', '2026-01-01');
    // DPO_CONTACT_EMAIL de propósito ausente
    const legal = await import('@/config/legal');
    expect(legal.PRIVACY_PAGE_COMPLETE).toBe(false);

    vi.stubEnv('DPO_CONTACT_EMAIL', 'dpo@empresa.com');
    vi.resetModules();
    const legalComplete = await import('@/config/legal');
    expect(legalComplete.PRIVACY_PAGE_COMPLETE).toBe(true);
  });

  it('/fair-use só depende da data de atualização — nenhum outro campo institucional', async () => {
    vi.stubEnv('LEGAL_DOCS_UPDATED_AT', '2026-01-01');
    const legal = await import('@/config/legal');
    expect(legal.FAIR_USE_PAGE_COMPLETE).toBe(true);
    // e nenhuma das outras páginas fica completa só com isso
    expect(legal.PRIVACY_PAGE_COMPLETE).toBe(false);
    expect(legal.TERMS_PAGE_COMPLETE).toBe(false);
    expect(legal.CANCELLATION_PAGE_COMPLETE).toBe(false);
    expect(legal.DATA_RETENTION_PAGE_COMPLETE).toBe(false);
  });

  it('/cancellation completa só com o texto de reembolso + data', async () => {
    vi.stubEnv('REFUND_POLICY_TEXT', 'Reembolso em até 7 dias...');
    vi.stubEnv('LEGAL_DOCS_UPDATED_AT', '2026-01-01');
    const legal = await import('@/config/legal');
    expect(legal.CANCELLATION_PAGE_COMPLETE).toBe(true);
  });

  it('todas completas quando todas as variáveis estão preenchidas', async () => {
    for (const key of ALL_LEGAL_VARS) vi.stubEnv(key, 'preenchido');
    const legal = await import('@/config/legal');
    expect(legal.PRIVACY_PAGE_COMPLETE).toBe(true);
    expect(legal.TERMS_PAGE_COMPLETE).toBe(true);
    expect(legal.CANCELLATION_PAGE_COMPLETE).toBe(true);
    expect(legal.DATA_RETENTION_PAGE_COMPLETE).toBe(true);
    expect(legal.FAIR_USE_PAGE_COMPLETE).toBe(true);
  });
});
