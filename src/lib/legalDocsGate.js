// CommonJS de propósito (não .ts): next.config.js roda puro Node, sem
// o pipeline de TS do Next, e precisa dar `require()` neste arquivo
// diretamente — ver o aviso de "Documentos legais incompletos" em
// next.config.js. Mesma lógica também coberta por
// src/lib/__tests__/legalDocsGate.test.ts.
//
// Isto só identifica o que está faltando (usado para o aviso de build
// e para src/config/legal.ts calcular PRIVACY_PAGE_COMPLETE e
// equivalentes) — nunca bloqueia build/deploy. Ver o histórico deste
// arquivo se precisar da versão anterior que bloqueava.

const REQUIRED_LEGAL_ENV_VARS = [
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

function getMissingLegalEnvVars(env) {
  return REQUIRED_LEGAL_ENV_VARS.filter((key) => !env[key]);
}

module.exports = { REQUIRED_LEGAL_ENV_VARS, getMissingLegalEnvVars };
