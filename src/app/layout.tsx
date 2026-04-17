import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'WellNutriAI — Planos alimentares sugeridos por IA',
  description:
    'Receba planos alimentares personalizados, sugeridos por inteligência artificial, com base no seu objetivo e rotina.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
