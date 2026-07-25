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
      <Card className="animate-slide-up">
        <h1 className="text-2xl font-bold mb-1">Verifique seu e-mail</h1>
        <p className="text-sm text-slate-500">
          Se houver uma conta associada a esse e-mail, você receberá um link para redefinir sua senha.
        </p>
        <p className="text-sm text-center text-slate-600 mt-6">
          <Link href="/login" className="text-brand-600 font-medium hover:underline">
            Voltar para o login
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card className="animate-slide-up">
      <h1 className="text-2xl font-bold mb-1">Esqueci minha senha</h1>
      <p className="text-sm text-slate-500 mb-6">
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

      <p className="text-sm text-center text-slate-600 mt-6">
        <Link href="/login" className="text-brand-600 font-medium hover:underline">
          Voltar para o login
        </Link>
      </p>
    </Card>
  );
}
