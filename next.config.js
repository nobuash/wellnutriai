/** @type {import('next').NextConfig} */
// PWA/service worker cache. A maior parte do app é autenticada e lida com
// dados de saúde (planos alimentares, chat, análises de refeição) — o
// service worker NUNCA pode servir isso do cache para outra sessão no
// mesmo aparelho (ex: dois usuários no mesmo computador/celular). Por
// isso runtimeCaching abaixo é NetworkOnly para tudo que não seja
// asset estático do próprio build. cacheOnFrontEndNav/aggressiveFrontEndNavCaching
// (que cacheiam navegações client-side do App Router) foram removidos de
// propósito — eram exatamente o tipo de cache que este app não pode ter.
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-webfonts',
          expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /\/_next\/static.+\.js$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'next-static-js-assets',
          expiration: { maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /\.(?:js|css)$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-js-css',
          expiration: { maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      {
        // Só ícones/imagens estáticas do próprio app (logo, ícones do
        // manifest) — nunca fotos de refeição do usuário nem qualquer
        // URL do Supabase Storage.
        urlPattern: ({ url, sameOrigin }) =>
          sameOrigin && /\.(?:png|svg|ico|webp)$/i.test(url.pathname) && !url.pathname.startsWith('/storage'),
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-images',
          expiration: { maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      {
        // Nunca cachear respostas de API — podem conter dados pessoais/de saúde.
        urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
        handler: 'NetworkOnly',
      },
      {
        // Nunca cachear navegação de página (nem full load, nem transição
        // client-side do App Router, identificada pelo header RSC).
        urlPattern: ({ request, sameOrigin }) =>
          sameOrigin && (request.mode === 'navigate' || request.headers.get('RSC') === '1'),
        handler: 'NetworkOnly',
      },
      {
        // Fallback: qualquer outra coisa same-origin não coberta acima.
        urlPattern: ({ sameOrigin }) => sameOrigin,
        handler: 'NetworkOnly',
      },
    ],
  },
});

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://sdk.mercadopago.com https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.mercadopago.com https://www.mercadopago.com.br",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://www.mercadopago.com.br",
      "upgrade-insecure-requests",
    ].join('; '),
  },
];

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = withPWA(nextConfig);
