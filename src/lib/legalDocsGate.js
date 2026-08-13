// CommonJS de propósito (não .ts): next.config.js roda puro Node, sem
// o pipeline de TS do Next, e precisa dar `require()` neste arquivo
// diretamente — ver o bloco "Bloqueador de lançamento" em
// next.config.js. Mesma lógica também coberta por
// src/lib/__tests__/legalDocsGate.test.ts.

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

// Só bloqueia de verdade o deploy de produção real da Vercel — dev,
// CI e previews de PR nunca são bloqueados por documento jurídico
// incompleto (ver next.config.js para o motivo).
function shouldBlockProductionDeploy(env) {
  return getMissingLegalEnvVars(env).length > 0 && env.VERCEL_ENV === 'production';
}

module.exports = { REQUIRED_LEGAL_ENV_VARS, getMissingLegalEnvVars, shouldBlockProductionDeploy };
