'use client';

import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  /**
   * Pill (radius total) é reservado pra CTA primário de marketing —
   * ver DESIGN.md. O padrão do produto (dashboard, formulários) é
   * rounded-md; não usar pill em tudo.
   */
  pill?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = 'primary', size = 'md', loading, pill, children, disabled, ...rest }, ref) => {
    const base =
      'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]';
    const variants = {
      primary: 'bg-primary-500 text-white hover:bg-primary-600 shadow-soft',
      secondary: 'bg-secondary text-white hover:bg-secondary-hover',
      ghost: 'text-ink-secondary hover:bg-surface-secondary hover:text-ink',
      outline: 'border border-border bg-surface text-ink-secondary hover:border-border-hover hover:bg-surface-secondary',
    };
    const sizes = {
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4 text-sm',
      lg: 'h-12 px-6 text-base',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(base, variants[variant], sizes[size], pill ? 'rounded-full' : 'rounded-md', className)}
        {...rest}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
