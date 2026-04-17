import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  variant?: 'info' | 'warning';
  className?: string;
  children?: React.ReactNode;
}

export function Disclaimer({ variant = 'info', className, children }: Props) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg border p-4 text-sm',
        variant === 'warning'
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-blue-200 bg-blue-50 text-blue-900',
        className
      )}
    >
      <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
      <p className="leading-relaxed">
        {children || (
          <>
            <strong>Este é um plano alimentar sugerido por inteligência artificial.</strong>{' '}
            Não substitui o acompanhamento de nutricionista, médico ou profissional de saúde.
            O uso das informações é de responsabilidade do usuário.
          </>
        )}
      </p>
    </div>
  );
}
