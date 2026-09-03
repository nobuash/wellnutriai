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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://sdk.mercadopago.com https://challenges.cloudflare.com https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://www.googletagmanager.com",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.mercadopago.com https://www.mercadopago.com.br https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com",
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

// Falha o build cedo e com uma mensagem clara se uma variável de
// ambiente sem a qual o app não roda estiver ausente — em vez de um
// erro obscuro em runtime na primeira requisição que precisar dela.
// (next.config.js roda puro Node/CommonJS, sem o pipeline de TS do
// Next, por isso a checagem é em JS simples aqui mesmo.)
//
// CONFIRMADO em produção: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY estava
// ausente na Vercel e o build passou normal — só quebrou em runtime,
// no momento em que um usuário clicava em "Pagar via Cartão"
// ("Expected publishable key to be of type string, got type undefined
// instead."). As variáveis do Stripe abaixo nunca tinham sido
// validadas no build, só usadas com `!` (non-null assertion) direto
// no código — cada uma dessas é exatamente o tipo de ausência que
// essa checagem existe pra pegar cedo.
const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_MONTHLY',
  'STRIPE_PRICE_QUARTERLY',
  'STRIPE_PRICE_ANNUAL',
];

const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  throw new Error(
    `Variáveis de ambiente obrigatórias ausentes: ${missingEnvVars.join(', ')}. ` +
    'Configure-as (ver .env.example) antes de rodar build/deploy.'
  );
}

// Mercado Pago NÃO é obrigatório pro build — CONFIRMADO que a ativação
// de produção da conta (dados bancários/verificação junto ao próprio
// Mercado Pago) é um processo à parte, fora do controle de quem faz o
// deploy, e não pode travar o build inteiro (Stripe incluso) enquanto
// isso não termina. Em vez de falhar o build, calcula se o Mercado
// Pago está disponível e expõe isso pro cliente via
// NEXT_PUBLIC_MERCADOPAGO_ENABLED — src/app/(app)/pricing/page.tsx usa
// essa flag pra esconder os botões de PIX em vez de oferecer um método
// de pagamento que vai falhar.
const MP_ENV_VARS = ['MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET', 'NEXT_PUBLIC_MP_PUBLIC_KEY'];
const missingMpVars = MP_ENV_VARS.filter((key) => !process.env[key]);
const mercadoPagoEnabled = missingMpVars.length === 0;
if (!mercadoPagoEnabled) {
  console.warn(
    `[next.config.js] Mercado Pago desabilitado neste build — variáveis ausentes: ${missingMpVars.join(', ')}. ` +
    'PIX ficará indisponível na interface até configurá-las.'
  );
}

nextConfig.env = {
  NEXT_PUBLIC_MERCADOPAGO_ENABLED: String(mercadoPagoEnabled),
};

// Documentos legais (Termos, Privacidade, Cancelamento, Retenção de
// Dados) com dado institucional/jurídico ainda ausente (ver
// src/config/legal.ts, único lugar que essas informações são
// preenchidas — nunca inventadas aqui nem em nenhum outro lugar do
// código) NÃO bloqueiam mais o build/deploy inteiro — só a página
// jurídica específica que ainda está incompleta fica de fora do
// sitemap e com noindex (ver PRIVACY_PAGE_COMPLETE e equivalentes em
// src/config/legal.ts, consumidos por cada page.tsx e por
// src/app/sitemap.ts). Streak, TACO e as travas de segurança do P0
// não devem ficar reféns de dado institucional que só essas 5 páginas
// precisam. Isso só avisa no log do build — nunca falha.
const { getMissingLegalEnvVars } = require('./src/lib/legalDocsGate');
const missingLegalVars = getMissingLegalEnvVars(process.env);
if (missingLegalVars.length > 0) {
  console.warn(
    `[next.config.js] Documentos legais incompletos — variáveis ausentes: ${missingLegalVars.join(', ')}. ` +
    'As páginas afetadas ficam com noindex e fora do sitemap até serem preenchidas (nunca inventadas). ' +
    'Ver docs/PRODUCTION_CHECKLIST.md.'
  );
}

module.exports = withPWA(nextConfig);
