import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import {
  CANCELLATION_PAGE_COMPLETE,
  DATA_RETENTION_PAGE_COMPLETE,
  FAIR_USE_PAGE_COMPLETE,
  PRIVACY_PAGE_COMPLETE,
  TERMS_PAGE_COMPLETE,
} from '@/config/legal';

// Somente páginas públicas, canônicas e indexáveis. Rotas privadas,
// de autenticação e internas do SaaS não entram aqui (ver src/app/robots.ts
// e a metadata `robots: { index: false }` de cada uma delas). Páginas
// jurídicas com dado institucional ainda ausente (ver
// src/config/legal.ts) também ficam de fora até estarem completas —
// mesmo critério que já zera o robots delas, só que aqui também tira
// da lista que o Google é convidado a rastrear.
const PUBLIC_ROUTES: Array<{ path: string; ready: boolean }> = [
  { path: '', ready: true },
  { path: '/privacy', ready: PRIVACY_PAGE_COMPLETE },
  { path: '/terms', ready: TERMS_PAGE_COMPLETE },
  { path: '/cancellation', ready: CANCELLATION_PAGE_COMPLETE },
  { path: '/data-retention', ready: DATA_RETENTION_PAGE_COMPLETE },
  { path: '/fair-use', ready: FAIR_USE_PAGE_COMPLETE },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_ROUTES.filter((route) => route.ready).map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified,
    changeFrequency: route.path === '' ? 'weekly' : 'yearly',
    priority: route.path === '' ? 1 : 0.3,
  }));
}
