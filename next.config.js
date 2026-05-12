/** @type {import('next').NextConfig} */

const securityHeaders = [
  // Força HTTPS por 2 anos, incluindo subdomínios
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // Impede que a página seja embarcada em iframes (clickjacking)
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  // Impede que o browser "adivinhe" o tipo do arquivo (MIME sniffing)
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  // Limita informações enviadas no Referer
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  // Desabilita features do browser que o app não usa
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  // Bloqueia XSS refletido em browsers antigos
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  // Content Security Policy
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Scripts: self + Stripe + MercadoPago + Cloudflare Turnstile
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://sdk.mercadopago.com https://challenges.cloudflare.com",
      // Estilos: self + inline (necessário para Tailwind/Next.js)
      "style-src 'self' 'unsafe-inline'",
      // Imagens: self, data URIs, blobs, Supabase storage
      "img-src 'self' data: blob: https://*.supabase.co",
      // Fontes
      "font-src 'self'",
      // Conexões de rede: self, Supabase, Stripe, MercadoPago
      "connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.mercadopago.com https://www.mercadopago.com.br",
      // Iframes permitidos: Stripe checkout
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      // Bloqueia <object>, <embed>, <applet>
      "object-src 'none'",
      // Restringe base href
      "base-uri 'self'",
      // Restringe para onde forms podem submeter
      "form-action 'self' https://www.mercadopago.com.br",
      // Bloqueia upgrade automático de requests inseguros
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

module.exports = nextConfig;
