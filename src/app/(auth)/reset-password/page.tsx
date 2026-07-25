'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

function translateResetError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('different from the old') || m.includes('same as the old')) {
    return 'A nova senha deve ser diferente da senha anterior.';
  }
  if (m.includes('breach') || m.includes('pwned') || m.includes('weak')) {
    return 'Essa senha é considerada fraca ou já vazou em outros serviços. Escolha outra.';
  }
  if (m.includes('at least') || m.includes('should contain') || m.includes('character')) {
    return 'A senha não atende aos requisitos mínimos de segurança.';
  }
  if (m.includes('session')) {
    return 'Sua sessão expirou. Solicite um novo link de redefinição.';
  }
  return `Não foi possível redefinir sua senha: ${message}`;
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setCheckingSession(false);
    });
  }, [supabase]);

  async function onSubmit({ password }: ResetPasswordInput) {
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast.error(translateResetError(error.message));
      return;
    }

    toast.success('Senha redefinida com sucesso!');
    router.push('/dashboard');
    router.refresh();
  }

  if (checkingSession) {
    return null;
  }

  if (!hasSession) {
    return (
      <Card className="animate-slide-up">
        <h1 className="text-2xl font-bold mb-1">Sessão expirada</h1>
        <p className="text-sm text-slate-500">
          Não encontramos uma sessão de redefinição ativa. Solicite um novo link para continuar.
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
      <p className="text-sm text-slate-500 mb-6">Escolha uma nova senha para sua conta.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          {...register('password')}
          error={errors.password?.message}
        />
        <Input
          label="Confirmar nova senha"
          type="password"
          autoComplete="new-password"
          {...register('confirmPassword')}
          error={errors.confirmPassword?.message}
        />
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Redefinir senha
        </Button>
      </form>
    </Card>
  );
}
