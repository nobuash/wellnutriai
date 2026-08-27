import { Flame } from 'lucide-react';

// Puramente apresentacional — o cálculo de "aceso ou não" já vem
// pronto de src/lib/streak.ts, calculado no server component que usa
// isto (ver src/app/(app)/dashboard/page.tsx). Sem fetch próprio.
export function StreakBadge({ days, loggedToday }: { days: number; loggedToday: boolean }) {
  const label = days > 0 ? `${days} ${days === 1 ? 'dia' : 'dias'}` : 'Sem streak';

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors duration-200 ${
        loggedToday ? 'bg-red-50 text-red-600' : 'bg-surface-secondary text-ink-muted'
      }`}
      title={
        loggedToday
          ? 'Você já registrou uma refeição hoje!'
          : 'Registre uma refeição hoje para manter o streak aceso'
      }
    >
      <Flame className="h-4 w-4" strokeWidth={2} fill={loggedToday ? 'currentColor' : 'none'} />
      {label}
    </div>
  );
}
