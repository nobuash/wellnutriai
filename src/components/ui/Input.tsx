'use client';

import { cn } from '@/lib/utils';
import { forwardRef, type InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, className, id, ...rest }, ref) => {
    const inputId = id || rest.name;
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full h-10 px-3 rounded-lg border bg-white text-sm text-slate-900 placeholder:text-slate-400',
            'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
            error ? 'border-red-400' : 'border-slate-300',
            className
          )}
          {...rest}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
