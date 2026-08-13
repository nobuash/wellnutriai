import type { Metadata } from 'next';

// Domínio canônico de produção — dedicado a SEO (sitemap, robots,
// canonical, Open Graph). Independente de NEXT_PUBLIC_APP_URL, que é
// usado para callbacks de pagamento (Stripe/Mercado Pago) e não inclui
// "www". Ver relatório de auditoria para o que precisa ser alinhado
// no DNS/hosting.
export const SITE_URL = 'https://www.wellnutriai.com';
export const SITE_NAME = 'WellNutriAI';

// Título/robots para rotas privadas (autenticadas) que continuam
// acessíveis por URL direta mas não devem ser indexadas nem seguidas.
export function privateMetadata(title: string): Metadata {
  return {
    title,
    robots: { index: false, follow: false },
  };
}
