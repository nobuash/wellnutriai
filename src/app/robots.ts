import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// Rotas do grupo (app) sempre redirecionam um visitante não-autenticado
// para /login antes de qualquer conteúdo ser servido (ver
// src/app/(app)/layout.tsx), então desalow aqui é só economia de
// crawl budget — a indexação delas já é impossível de qualquer forma.
// /login, /signup, /forgot-password, /reset-password e /accept-terms
// NÃO entram aqui de propósito: eles precisam continuar rastreáveis
// para que o Google veja a diretiva `noindex` de cada página (ver
// metadata dessas rotas) em vez de robots.txt e noindex entrarem em
// conflito (disallow impede o crawler de sequer ler o noindex).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard',
          '/questionnaire',
          '/meal-plan',
          '/chat',
          '/photo-analysis',
          '/hydration',
          '/account',
          '/pricing',
          '/support',
          '/install-app',
          '/payment',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
