import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// Somente páginas públicas, canônicas e indexáveis. Rotas privadas,
// de autenticação e internas do SaaS não entram aqui (ver src/app/robots.ts
// e a metadata `robots: { index: false }` de cada uma delas).
const PUBLIC_ROUTES = ['', '/privacy', '/terms', '/cancellation', '/data-retention', '/fair-use'];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified,
    changeFrequency: route === '' ? 'weekly' : 'yearly',
    priority: route === '' ? 1 : 0.3,
  }));
}
