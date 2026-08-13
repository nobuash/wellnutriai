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
        'flex gap-3 rounded-md border p-4 text-sm',
        variant === 'warning'
          ? 'border-warning/30 bg-warning/10 text-warning'
          : 'border-info/30 bg-info/10 text-info',
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
