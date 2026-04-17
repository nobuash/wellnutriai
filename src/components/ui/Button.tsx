'use client';

import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...rest }, ref) => {
    const base =
      'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed';
    const variants = {
      primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
      secondary: 'bg-slate-900 text-white hover:bg-slate-800',
      ghost: 'text-slate-700 hover:bg-slate-100',
      outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
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
        className={cn(base, variants[variant], sizes[size], className)}
        {...rest}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
