'use client';

import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  Apple, Camera, ClipboardList, LayoutDashboard, LogOut, MessageCircle, Sparkles, Utensils,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Plan } from '@/types/database';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/questionnaire', label: 'Questionário', icon: ClipboardList },
  { href: '/meal-plan', label: 'Plano Alimentar', icon: Utensils },
  { href: '/chat', label: 'Chat IA', icon: MessageCircle, pro: true },
  { href: '/photo-analysis', label: 'Análise por Foto', icon: Camera, pro: true },
];

export function Sidebar({ plan, name }: { plan: Plan; name: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
      <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-200 font-bold">
        <Apple className="h-6 w-6 text-brand-600" />
        WellNutriAI
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {nav.map(({ href, label, icon: Icon, pro }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
              {pro && plan === 'free' && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                  PRO
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {plan === 'free' && (
        <div className="mx-3 mb-3 rounded-lg bg-gradient-to-br from-brand-600 to-emerald-700 p-4 text-white">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4" />
            <span className="font-semibold text-sm">Upgrade para PRO</span>
          </div>
          <p className="text-xs text-brand-50 mb-3">Planos ilimitados e análise por foto.</p>
          <Link
            href="/pricing"
            className="block text-center text-xs font-semibold bg-white text-brand-700 rounded-md py-1.5 hover:bg-brand-50"
          >
            Fazer upgrade
          </Link>
        </div>
      )}

      <div className="p-3 border-t border-slate-200">
        <div className="flex items-center justify-between px-2 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{name || 'Usuário'}</p>
            <p className="text-xs text-slate-500 uppercase">{plan}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
