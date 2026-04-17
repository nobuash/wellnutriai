'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { signupSchema, type SignupInput } from '@/lib/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(undefined);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  async function onSubmit({ name, email, password }: SignupInput) {
    if (!captchaToken) {
      toast.error('Confirme que você não é um robô');
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        captchaToken,
      },
    });

    if (error) {
      toast.error(error.message);
      turnstileRef.current?.reset();
      setCaptchaToken(null);
      return;
    }

    toast.success('Conta criada!');
    router.push('/accept-terms');
    router.refresh();
  }

  return (
    <Card className="animate-slide-up">
      <h1 className="text-2xl font-bold mb-1">Criar conta</h1>
      <p className="text-sm text-slate-500 mb-6">Comece sua jornada com o WellNutriAI</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Nome" {...register('name')} error={errors.name?.message} />

        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          {...register('email')}
          error={errors.email?.message}
        />
        <Input
          label="Confirmar e-mail"
          type="email"
          autoComplete="off"
          {...register('confirmEmail')}
          error={errors.confirmEmail?.message}
        />

        <Input
          label="Senha"
          type="password"
          autoComplete="new-password"
          {...register('password')}
          error={errors.password?.message}
        />
        <Input
          label="Confirmar senha"
          type="password"
          autoComplete="new-password"
          {...register('confirmPassword')}
          error={errors.confirmPassword?.message}
        />

        <div className="flex justify-center pt-1">
          <Turnstile
            ref={turnstileRef}
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
            onSuccess={(token) => setCaptchaToken(token)}
            onExpire={() => setCaptchaToken(null)}
            options={{ language: 'pt-BR' }}
          />
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Criar conta
        </Button>
      </form>

      <p className="text-sm text-center text-slate-600 mt-6">
        Já tem conta?{' '}
        <Link href="/login" className="text-brand-600 font-medium hover:underline">
          Entrar
        </Link>
      </p>
    </Card>
  );
}
