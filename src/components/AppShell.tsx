'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import type { Plan } from '@/types/database';

interface AppShellProps {
  plan: Plan;
  name: string | null;
  children: React.ReactNode;
}

export function AppShell({ plan, name, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      <Sidebar
        plan={plan}
        name={name}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header mobile */}
        <header className="md:hidden h-14 flex items-center gap-3 px-4 border-b border-slate-200 bg-white sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-slate-800">WellNutriAI</span>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-5xl p-4 md:p-8 space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
