import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 bg-white p-6 shadow-sm',
        className
      )}
      {...rest}
    />
  );
}
