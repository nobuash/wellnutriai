'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="text-center max-w-md">
        <h2 className="text-xl font-semibold text-slate-800 mb-2">Algo deu errado</h2>
        <p className="text-slate-500 text-sm mb-6">
          Não conseguimos carregar a página. Verifique sua conexão e tente novamente.
        </p>
        <Button onClick={reset}>Tentar novamente</Button>
      </div>
    </div>
  );
}
