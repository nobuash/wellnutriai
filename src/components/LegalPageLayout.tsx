import Link from 'next/link';
import Image from 'next/image';

export function LegalPageLayout({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-divider bg-background/90 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-display font-semibold text-ink text-lg">
            <Image src="/logo.png" alt="WellNutriAI" width={32} height={32} className="object-contain" />
            WellNutriAI
          </Link>
          <Link href="/" className="text-sm text-ink-muted hover:text-ink-secondary transition-colors duration-200">Voltar ao início</Link>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-2xl text-ink mb-1">{title}</h1>
        <p className="text-sm text-ink-muted mb-8">Última atualização: {updatedAt}</p>
        <div className="prose prose-sm max-w-none space-y-4 text-ink-secondary leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:mt-8 [&_h2]:mb-2 [&_strong]:text-ink">
          {children}
        </div>
      </main>
    </div>
  );
}
