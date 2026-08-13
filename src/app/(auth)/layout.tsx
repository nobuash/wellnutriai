import Link from 'next/link';
import Image from 'next/image';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-secondary p-6">
      <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold text-ink mb-8">
        <Image src="/logo.png" alt="WellNutriAI" width={32} height={32} className="object-contain" />
        WellNutriAI
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
