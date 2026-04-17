'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, HeadphonesIcon, Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

interface FormData {
  name: string;
  email: string;
  message: string;
}

export default function SupportPage() {
  const supabase = createClient();
  const [sent, setSent] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from('profiles').select('name, email').eq('id', user.id).single();
      return data;
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormData>({
    defaultValues: { name: profile?.name ?? '', email: profile?.email ?? '' },
  });

  async function onSubmit(data: FormData) {
    const res = await fetch('/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || 'Erro ao enviar mensagem');
      return;
    }
    setSent(true);
    reset();
  }

  if (sent) {
    return (
      <Card className="max-w-lg mx-auto text-center py-12">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Mensagem enviada!</h2>
        <p className="text-slate-500 mb-6">
          Recebemos sua mensagem e responderemos em breve no e-mail informado.
        </p>
        <Button onClick={() => setSent(false)}>Enviar outra mensagem</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold">Suporte</h1>
        <p className="text-sm text-slate-500">Estamos aqui para ajudar. Descreva sua dúvida ou problema.</p>
      </div>

      <Card>
        <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-brand-50">
          <HeadphonesIcon className="h-5 w-5 text-brand-600 shrink-0" />
          <p className="text-sm text-brand-700">
            Nossa equipe responde em até <strong>24 horas</strong> nos dias úteis.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Nome"
            placeholder="Seu nome"
            defaultValue={profile?.name ?? ''}
            {...register('name', { required: 'Informe seu nome', minLength: { value: 2, message: 'Nome muito curto' } })}
            error={errors.name?.message}
          />
          <Input
            label="E-mail"
            type="email"
            placeholder="seu@email.com"
            defaultValue={profile?.email ?? ''}
            {...register('email', { required: 'Informe seu e-mail' })}
            error={errors.email?.message}
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Como podemos ajudar?
            </label>
            <textarea
              {...register('message', {
                required: 'Descreva no que precisa de ajuda',
                minLength: { value: 10, message: 'Mensagem muito curta' },
              })}
              rows={5}
              placeholder="Descreva sua dúvida ou problema em detalhes..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none resize-none"
            />
            {errors.message && (
              <p className="text-xs text-red-600 mt-1">{errors.message.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            <Mail className="h-4 w-4 mr-2" /> Enviar mensagem
          </Button>
        </form>
      </Card>
    </div>
  );
}
