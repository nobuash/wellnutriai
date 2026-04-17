import Link from 'next/link';
import { Apple } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
      <Link href="/" className="flex items-center gap-2 font-bold text-lg mb-8">
        <Apple className="h-6 w-6 text-brand-600" />
        WellNutriAI
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
