// Trava de lançamento para geração personalizada de plano alimentar.
// A decisão de que o produto pode operar dessa forma é do mantenedor
// (revisão jurídica/regulatória), não do código — este módulo só
// aplica a decisão, nunca a toma. Ausência da env var nunca é lida
// como aprovação, e REGULATORY_REVIEW_APPROVED não pode ser
// NEXT_PUBLIC: se vazasse ao client, um usuário poderia inspecionar o
// bundle e descobrir o status da revisão regulatória do produto.
export function isRegulatoryReviewApproved(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.REGULATORY_REVIEW_APPROVED === 'true';
}

// Mensagem neutra de propósito: nunca afirma que a funcionalidade é
// ilegal ou proibida, só que está indisponível — a decisão sobre o
// motivo é do mantenedor, não algo para expor na UI.
export const REGULATORY_HOLD_MESSAGE =
  'A geração de plano alimentar personalizado está temporariamente indisponível. Tente novamente mais tarde.';
