'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit({ email }: ForgotPasswordInput) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      toast.error('Não foi possível enviar o e-mail. Tente novamente.');
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <Card className="animate-slide-up p-8">
        <h1 className="font-display text-2xl text-ink mb-1.5">Verifique seu e-mail</h1>
        <p className="text-sm text-ink-muted">
          Se houver uma conta associada a esse e-mail, você receberá um link para redefinir sua senha.
        </p>
        <p className="text-sm text-center text-ink-secondary mt-6">
          <Link href="/login" className="text-primary-600 font-medium hover:underline">
            Voltar para o login
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card className="animate-slide-up p-8">
      <h1 className="font-display text-2xl text-ink mb-1.5">Esqueci minha senha</h1>
      <p className="text-sm text-ink-muted mb-6">
        Informe seu e-mail e enviaremos um link para redefinir sua senha.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          {...register('email')}
          error={errors.email?.message}
        />
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Enviar link de redefinição
        </Button>
      </form>

      <p className="text-sm text-center text-ink-secondary mt-6">
        <Link href="/login" className="text-primary-600 font-medium hover:underline">
          Voltar para o login
        </Link>
      </p>
    </Card>
  );
}
