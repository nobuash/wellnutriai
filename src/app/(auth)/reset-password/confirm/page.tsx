'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function ConfirmResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const tokenHash = searchParams.get('token_hash');

  async function handleConfirm() {
    if (!tokenHash) {
      setError(true);
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });
    setLoading(false);

    if (error) {
      setError(true);
      return;
    }

    router.push('/reset-password');
    router.refresh();
  }

  if (!tokenHash || error) {
    return (
      <Card className="animate-slide-up">
        <h1 className="text-2xl font-bold mb-1">Link inválido ou expirado</h1>
        <p className="text-sm text-slate-500">
          Esse link de redefinição de senha não é mais válido. Solicite um novo.
        </p>
        <p className="text-sm text-center text-slate-600 mt-6">
          <Link href="/forgot-password" className="text-brand-600 font-medium hover:underline">
            Solicitar novo link
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card className="animate-slide-up">
      <h1 className="text-2xl font-bold mb-1">Redefinir senha</h1>
      <p className="text-sm text-slate-500 mb-6">
        Clique no botão abaixo para continuar e escolher sua nova senha.
      </p>
      <Button className="w-full" loading={loading} onClick={handleConfirm}>
        Continuar
      </Button>
    </Card>
  );
}

export default function ConfirmResetPasswordPage() {
  return (
    <Suspense>
      <ConfirmResetPasswordForm />
    </Suspense>
  );
}
