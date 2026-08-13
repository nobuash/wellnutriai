// Registro de operadores/suboperadores que processam dados pessoais
// fora do controlador (LGPD art. 33). Vazio de propósito: cada linha
// só deve entrar aqui depois de confirmada pelo mantenedor/jurídico —
// operador real, categorias de dados reais, país(es) de destino reais
// e o mecanismo de transferência realmente em vigor (ex: cláusulas
// contratuais padrão, decisão de adequação, consentimento específico
// do titular). Nada aqui deve ser preenchido por suposição, mesmo que
// pareça óbvio a partir de onde a empresa fornecedora normalmente
// opera — o mantenedor precisa confirmar o que está de fato contratado
// com cada fornecedor (OpenAI, Supabase, Stripe, Mercado Pago, Vercel
// hoje processam dados nesta plataforma, ver /privacy seção 4).
export interface DataProcessorEntry {
  operator: string;
  purpose: string;
  dataCategories: string[];
  destinationCountries: string[];
  duration: string;
  transferMechanism: string;
  contact: string;
  retentionPolicyNote: string;
}

export const DATA_PROCESSORS: DataProcessorEntry[] = [];
