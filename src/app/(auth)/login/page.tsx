'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { loginSchema, type LoginInput } from '@/lib/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginInput) {
    const { error } = await supabase.auth.signInWithPassword(data);
    if (error) {
      toast.error('Credenciais inválidas');
      return;
    }
    toast.success('Bem-vindo de volta!');
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <Card className="animate-slide-up">
      <h1 className="text-2xl font-bold mb-1">Entrar</h1>
      <p className="text-sm text-slate-500 mb-6">Acesse sua conta WellNutriAI</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          {...register('email')}
          error={errors.email?.message}
        />
        <Input
          label="Senha"
          type="password"
          autoComplete="current-password"
          {...register('password')}
          error={errors.password?.message}
        />
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Entrar
        </Button>
      </form>

      <p className="text-sm text-center text-slate-600 mt-6">
        Não tem conta?{' '}
        <Link href="/signup" className="text-brand-600 font-medium hover:underline">
          Criar conta
        </Link>
      </p>
    </Card>
  );
}
