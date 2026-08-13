import Link from 'next/link';
import Image from 'next/image';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { privateMetadata } from '@/lib/seo';

export const metadata = privateMetadata('Página não encontrada — WellNutriAI');

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-secondary p-6">
      <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold text-ink mb-8">
        <Image src="/logo.png" alt="WellNutriAI" width={32} height={32} className="object-contain" />
        WellNutriAI
      </Link>
      <Card className="max-w-md w-full text-center space-y-4">
        <div className="flex justify-center">
          <SearchX className="h-16 w-16 text-ink-muted" strokeWidth={1.5} />
        </div>
        <h1 className="font-display text-2xl text-ink">Página não encontrada</h1>
        <p className="text-ink-secondary">
          A página que você procura não existe ou foi movida.
        </p>
        <Link href="/">
          <Button className="w-full">Voltar para o início</Button>
        </Link>
      </Card>
    </div>
  );
}
