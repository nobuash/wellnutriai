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
    <div className="min-h-screen bg-white">
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <Image src="/logo.png" alt="WellNutriAI" width={36} height={36} className="object-contain" />
            WellNutriAI
          </Link>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">Voltar ao início</Link>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{title}</h1>
        <p className="text-sm text-slate-500 mb-8">Última atualização: {updatedAt}</p>
        <div className="prose prose-slate prose-sm max-w-none space-y-4 text-slate-700 leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mt-8 [&_h2]:mb-2 [&_strong]:text-slate-900">
          {children}
        </div>
      </main>
    </div>
  );
}
