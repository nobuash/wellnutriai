import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

interface Props extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'neutral' | 'warning';
}

/**
 * Badge de status curto ("PRO", "Mais popular", plano atual). Pill é
 * um dos dois usos deliberados de rounded-full no produto (ver
 * DESIGN.md) — não usar este componente pra texto longo.
 */
export function Badge({ className, variant = 'neutral', ...rest }: Props) {
  const variants = {
    primary: 'bg-primary-100 text-primary-700',
    neutral: 'bg-surface-secondary text-ink-secondary',
    warning: 'bg-warning/15 text-warning',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        variants[variant],
        className
      )}
      {...rest}
    />
  );
}
