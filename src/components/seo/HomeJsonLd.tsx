import { SITE_NAME, SITE_URL } from '@/lib/seo';

// Dados estruturados da homepage. Só campos verificáveis a partir do
// próprio produto (sem avaliações, contagem de usuários, endereço
// físico ou qualquer dado inventado).
export function HomeJsonLd() {
  const logo = `${SITE_URL}/icons/icon-512x512.png`;
  const description =
    'Receba planos alimentares personalizados, sugeridos por inteligência artificial, com base no seu objetivo e rotina.';

  const graph = [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo,
      sameAs: ['https://instagram.com/wellnutriai', 'https://tiktok.com/@wellnutri.ai'],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      publisher: { '@id': `${SITE_URL}/#organization` },
      inLanguage: 'pt-BR',
    },
    {
      '@type': 'WebApplication',
      '@id': `${SITE_URL}/#webapplication`,
      name: SITE_NAME,
      url: SITE_URL,
      description,
      applicationCategory: 'HealthApplication',
      operatingSystem: 'Web',
      offers: [
        { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'BRL' },
        { '@type': 'Offer', name: 'Pro', price: '29.90', priceCurrency: 'BRL' },
      ],
    },
  ];

  const data = { '@context': 'https://schema.org', '@graph': graph };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
