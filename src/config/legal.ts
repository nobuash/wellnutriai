// Dados institucionais e trechos jurídicos que os documentos legais
// (Termos, Privacidade, Cancelamento, Retenção de Dados) ainda não
// têm. Nada aqui é inventado: cada campo fica `null` até o mantenedor
// preencher com informação real — e, onde marcado, revisada por
// profissional habilitado (direito/contábil) — na env var
// correspondente. Ver docs/PRODUCTION_CHECKLIST.md para o que falta e
// REQUIRED_LEGAL_ENV_VARS em next.config.js, que trava o build de
// produção real enquanto algum destes campos estiver ausente.

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
