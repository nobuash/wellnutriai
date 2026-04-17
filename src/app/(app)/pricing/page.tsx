'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export default function PricingPage() {
  const supabase = createClient();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from('profiles')
        .select('plan, email')
        .eq('id', user.id)
        .single();
      return data;
    },
  });

  // Busca assinatura ativa para mostrar opção de cancelar
  const { data: activeSub } = useQuery({
    queryKey: ['active-subscription'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from('subscriptions')
        .select('mp_subscription_id, mp_status, next_payment_date')
        .eq('user_id', user.id)
        .eq('mp_status', 'authorized')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: profile?.plan === 'pro',
  });

  // Redireciona para o checkout do Mercado Pago
  const subscribe = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payment/subscribe', { method: 'POST' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Erro ao iniciar pagamento');
      }
      const { init_point } = await res.json() as { init_point: string };
      return init_point;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Cancela assinatura ativa
  const cancel = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payment/cancel', { method: 'POST' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Erro ao cancelar');
      }
    },
    onSuccess: () => {
      toast.success('Assinatura cancelada. Você voltou ao plano Free.');
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['active-subscription'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const currentPlan = profile?.plan ?? 'free';

  function handleCancelClick() {
    if (!window.confirm('Tem certeza que deseja cancelar sua assinatura PRO? Você perderá o acesso aos recursos premium.')) return;
    cancel.mutate();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Planos</h1>
        <p className="text-sm text-slate-500">Escolha o plano ideal para você.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Plano Free */}
        <Card>
          <h3 className="font-bold text-lg mb-1">Free</h3>
          <p className="text-3xl font-bold mb-6">R$ 0</p>
          <ul className="space-y-2 mb-6">
            {['1 plano alimentar por mês', 'Chat limitado (10 mensagens/dia)', 'Sem análise por foto'].map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                <Check className="h-4 w-4 text-brand-600 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <Button
            className="w-full"
            variant="outline"
            disabled={currentPlan === 'free'}
          >
            {currentPlan === 'free' ? 'Plano atual' : 'Plano Free'}
          </Button>
        </Card>

        {/* Plano Pro */}
        <Card className="border-brand-500 ring-1 ring-brand-500">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-lg">Pro</h3>
            <Sparkles className="h-4 w-4 text-brand-600" />
          </div>
          <p className="text-3xl font-bold mb-6">R$ 29,90<span className="text-base font-normal text-slate-500">/mês</span></p>
          <ul className="space-y-2 mb-6">
            {['Planos alimentares ilimitados', 'Chat IA sem limites', 'Análise por foto', 'Suporte prioritário'].map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                <Check className="h-4 w-4 text-brand-600 shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          {currentPlan === 'pro' ? (
            <div className="space-y-3">
              <Button className="w-full" disabled>
                Plano atual
              </Button>
              {activeSub && (
                <Button
                  className="w-full"
                  variant="outline"
                  loading={cancel.isPending}
                  onClick={handleCancelClick}
                >
                  Cancelar assinatura
                </Button>
              )}
            </div>
          ) : (
            <Button
              className="w-full"
              loading={subscribe.isPending}
              onClick={() => subscribe.mutate()}
            >
              Assinar agora via Mercado Pago
            </Button>
          )}
        </Card>
      </div>

      {/* Info de segurança */}
      <Card className="bg-slate-50 border-slate-200">
        <div className="flex gap-3 items-start text-sm text-slate-600">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
          <p>
            O pagamento é processado com segurança pelo <strong>Mercado Pago</strong>.
            Não armazenamos dados do seu cartão. A assinatura é renovada automaticamente
            todo mês e pode ser cancelada a qualquer momento.
          </p>
        </div>
      </Card>
    </div>
  );
}
