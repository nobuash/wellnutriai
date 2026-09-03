// Dados institucionais e trechos jurídicos que os documentos legais
// (Termos, Privacidade, Cancelamento, Retenção de Dados) ainda não
// têm. Nada aqui é inventado: cada campo fica `null` até o mantenedor
// preencher com informação real — e, onde marcado, revisada por
// profissional habilitado (direito/contábil) — na env var
// correspondente. Ver docs/PRODUCTION_CHECKLIST.md para o que falta.

export const LEGAL_ENTITY_NAME = process.env.LEGAL_ENTITY_NAME || null;
export const LEGAL_ENTITY_CNPJ = process.env.LEGAL_ENTITY_CNPJ || null;
export const LEGAL_ENTITY_ADDRESS = process.env.LEGAL_ENTITY_ADDRESS || null;
export const DPO_CONTACT_EMAIL = process.env.DPO_CONTACT_EMAIL || null;
export const SUPPORT_CONTACT_EMAIL = process.env.SUPPORT_CONTACT_EMAIL || null;
export const LEGAL_DOCS_UPDATED_AT = process.env.LEGAL_DOCS_UPDATED_AT || null;

// Parágrafo completo sobre direito de arrependimento/reembolso (ver
// /cancellation) — precisa de confirmação jurídica antes de publicar.
export const REFUND_POLICY_TEXT = process.env.REFUND_POLICY_TEXT || null;

// Janela real de retenção de backup do banco junto ao provedor de
// infraestrutura (Supabase) — confirmar no plano contratado.
export const BACKUP_RETENTION_POLICY_TEXT = process.env.BACKUP_RETENTION_POLICY_TEXT || null;

// Prazos de retenção legal mínima (fiscal/contábil) aplicáveis no
// Brasil — precisa de confirmação contábil/jurídica.
export const LEGAL_MINIMUM_RETENTION_TEXT = process.env.LEGAL_MINIMUM_RETENTION_TEXT || null;

// Cada página jurídica só fica indexável/no sitemap quando os campos
// que ELA especificamente usa estão preenchidos — ver cada page.tsx e
// src/app/sitemap.ts. Isso troca "bloquear o deploy inteiro enquanto
// o jurídico não está pronto" por "essa página específica não é
// promovida como definitiva enquanto não está pronta" — o resto do
// produto (streak, TACO, travas de segurança do P0) não fica refém de
// dado institucional que só essas 5 páginas precisam. A página
// continua acessível e continua mostrando "[PLACEHOLDER: ...]"
// honestamente enquanto isso.
export const PRIVACY_PAGE_COMPLETE = Boolean(
  LEGAL_ENTITY_NAME && LEGAL_ENTITY_CNPJ && LEGAL_ENTITY_ADDRESS && DPO_CONTACT_EMAIL && LEGAL_DOCS_UPDATED_AT,
);
export const TERMS_PAGE_COMPLETE = Boolean(
  LEGAL_ENTITY_NAME && LEGAL_ENTITY_CNPJ && LEGAL_ENTITY_ADDRESS && SUPPORT_CONTACT_EMAIL && LEGAL_DOCS_UPDATED_AT,
);
export const CANCELLATION_PAGE_COMPLETE = Boolean(REFUND_POLICY_TEXT && LEGAL_DOCS_UPDATED_AT);
export const DATA_RETENTION_PAGE_COMPLETE = Boolean(
  BACKUP_RETENTION_POLICY_TEXT && LEGAL_MINIMUM_RETENTION_TEXT && LEGAL_DOCS_UPDATED_AT,
);
export const FAIR_USE_PAGE_COMPLETE = Boolean(LEGAL_DOCS_UPDATED_AT);
