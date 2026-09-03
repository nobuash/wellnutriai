import type { Metadata, Viewport } from 'next';
import { Lora, Manrope } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { ConsentBanner } from '@/components/analytics/ConsentBanner';
import { SITE_NAME, SITE_URL } from '@/lib/seo';

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#3F6B4C',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const TITLE = 'WellNutriAI — IA especializada em nutrição';
const DESCRIPTION =
  'WellNutriAI: IA especializada em alimentação, com plano alimentar sugerido, análise de refeições por foto e assistente personalizado para o seu objetivo e rotina.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'WellNutriAI',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png' },
      { url: '/icons/icon-152x152.png', sizes: '152x152' },
      { url: '/icons/icon-167x167.png', sizes: '167x167' },
      { url: '/icons/icon-180x180.png', sizes: '180x180' },
    ],
  },
  // Preenchido via variável de ambiente quando a propriedade for
  // verificada no Google Search Console — ver .env.example e o
  // relatório de auditoria para o passo a passo manual.
  ...(process.env.NEXT_PUBLIC_GSC_VERIFICATION
    ? { verification: { google: process.env.NEXT_PUBLIC_GSC_VERIFICATION } }
    : {}),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${lora.variable} ${manrope.variable}`}>
      <body>
        <Providers>{children}</Providers>
        <ConsentBanner />
      </body>
    </html>
  );
}
