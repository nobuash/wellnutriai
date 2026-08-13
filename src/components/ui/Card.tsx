import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  /**
   * Sombra sutil e tingida, pra quando a elevação comunica hierarquia
   * de verdade (ex: item destacado, popover). Padrão é só borda — ver
   * DESIGN.md ("cards só quando elevação comunica hierarquia").
   */
  elevated?: boolean;
}

export function Card({ className, elevated, ...rest }: Props) {
  return (
    <div
      className={cn(
        'rounded-md border border-border bg-surface p-6',
        elevated && 'shadow-soft',
        className
      )}
      {...rest}
    />
  );
}
