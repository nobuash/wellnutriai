'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { signupSchema, type SignupInput } from '@/lib/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  async function onSubmit({ name, email, password }: SignupInput) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Conta criada!');
    // redireciona para aceite de termos (blocking flow via middleware)
    router.push('/accept-terms');
    router.refresh();
  }

  return (
    <Card className="animate-slide-up">
      <h1 className="text-2xl font-bold mb-1">Criar conta</h1>
      <p className="text-sm text-slate-500 mb-6">Comece sua jornada com o WellNutriAI</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Nome" {...register('name')} error={errors.name?.message} />
        <Input label="E-mail" type="email" autoComplete="email" {...register('email')} error={errors.email?.message} />
        <Input
          label="Senha"
          type="password"
          autoComplete="new-password"
          {...register('password')}
          error={errors.password?.message}
        />
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
