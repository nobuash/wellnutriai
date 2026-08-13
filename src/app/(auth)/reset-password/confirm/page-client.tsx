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
      <Card className="animate-slide-up p-8">
        <h1 className="font-display text-2xl text-ink mb-1.5">Link inválido ou expirado</h1>
        <p className="text-sm text-ink-muted">
          Esse link de redefinição de senha não é mais válido. Solicite um novo.
        </p>
        <p className="text-sm text-center text-ink-secondary mt-6">
          <Link href="/forgot-password" className="text-primary-600 font-medium hover:underline">
            Solicitar novo link
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card className="animate-slide-up p-8">
      <h1 className="font-display text-2xl text-ink mb-1.5">Redefinir senha</h1>
      <p className="text-sm text-ink-muted mb-6">
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
