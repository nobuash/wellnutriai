'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';
import {
  Camera, ClipboardList, HeadphonesIcon, LayoutDashboard, LogOut,
  MessageCircle, Smartphone, Sparkles, User, Utensils, X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Plan } from '@/types/database';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/questionnaire', label: 'Questionário', icon: ClipboardList },
  { href: '/meal-plan', label: 'Plano Alimentar', icon: Utensils },
  { href: '/chat', label: 'Chat IA', icon: MessageCircle, pro: true },
  { href: '/photo-analysis', label: 'Análise por Foto', icon: Camera, pro: true },
  { href: '/install-app', label: 'Instalar no celular', icon: Smartphone },
  { href: '/support', label: 'Suporte', icon: HeadphonesIcon },
  { href: '/account', label: 'Minha conta', icon: User },
];

interface SidebarProps {
  plan: Plan;
  name: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ plan, name, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={cn(
        'fixed md:static inset-y-0 left-0 z-30 w-64 bg-surface border-r border-border flex flex-col transition-transform duration-300 md:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-divider">
          <Link href="/" className="flex items-center gap-2 font-display font-semibold text-ink">
            <Image src="/logo.png" alt="WellNutriAI" width={32} height={32} className="object-contain" />
            WellNutriAI
          </Link>
          <button
            className="md:hidden p-1 rounded-sm text-ink-muted hover:bg-surface-secondary"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {nav.map(({ href, label, icon: Icon, pro }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-200',
                  active
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-ink-secondary hover:bg-surface-secondary hover:text-ink'
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                <span>{label}</span>
                {pro && plan === 'free' && (
                  <Badge variant="warning" className="ml-auto">PRO</Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {plan === 'free' && (
          <div className="mx-3 mb-3 rounded-md bg-primary-600 p-4 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4" strokeWidth={1.75} />
              <span className="font-semibold text-sm">Upgrade para PRO</span>
            </div>
            <p className="text-xs text-primary-50/90 mb-3 leading-relaxed">Mais planos por mês, chat com IA e análise de refeição.</p>
            <Link
              href="/pricing"
              onClick={onClose}
              className="block text-center text-xs font-semibold bg-white text-primary-700 rounded-sm py-1.5 hover:bg-primary-50 transition-colors duration-200"
            >
              Fazer upgrade
            </Link>
          </div>
        )}

        <div className="p-3 border-t border-divider">
          <div className="flex items-center justify-between px-2 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink truncate">{name || 'Usuário'}</p>
              <p className="text-xs text-ink-muted uppercase tracking-wide">{plan}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-sm text-ink-muted hover:bg-surface-secondary hover:text-ink-secondary transition-colors duration-200"
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
