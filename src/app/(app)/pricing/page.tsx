'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { createClient } from '@/lib/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Copy, QrCode, Sparkles, X } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { toast } from 'sonner';

interface PixData {
  payment_id: number;
  qr_code: string;
  qr_code_base64: string;
}

const INTERVAL_LABELS: Record<PlanInterval, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  annual: 'Anual',
};

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PricingPage() {
  const supabase = createClient();
  const qc = useQueryClient();
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<PlanInterval>('annual');

  const plan = PLANS[selectedInterval];

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from('profiles').select('plan, email').eq('id', user.id).single();
      return data;
    },
  });

  const { data: activeSub } = useQuery({
    queryKey: ['active-subscription'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from('subscriptions')
        .select('mp_subscription_id, mp_status, next_payment_date, payment_type, expires_at')
        .eq('user_id', user.id)
        .eq('mp_status', 'authorized')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: profile?.plan === 'pro',
  });

  const subscribe = useMutation({
    mutationFn: async (planInterval: PlanInterval) => {
      const res = await fetch('/api/payment/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planInterval }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Erro'); }
      const { init_point } = await res.json() as { init_point: string };
      return init_point;
    },
    onSuccess: (url) => { window.location.href = url; },
    onError: (err: Error) => toast.error(err.message),
  });

  const pixMutation = useMutation({
    mutationFn: async (planInterval: PlanInterval) => {
      const res = await fetch('/api/payment/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planInterval }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Erro'); }
      return res.json() as Promise<PixData>;
    },
    onSuccess: (data) => setPixData(data),
    onError: (err: Error) => toast.error(err.message),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payment/cancel', { method: 'POST' });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Erro'); }
    },
    onSuccess: () => {
      toast.success('Assinatura cancelada.');
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['active-subscription'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const currentPlan = profile?.plan ?? 'free';
  const isPix = activeSub?.payment_type === 'pix';
  const expiresAt = activeSub?.expires_at ? new Date(activeSub.expires_at) : null;

  function copyPix() {
    if (!pixData?.qr_code) return;
    navigator.clipboard.writeText(pixData.qr_code);
    toast.success('Código PIX copiado!');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Planos</h1>
        <p className="text-sm text-slate-500">Escolha o plano ideal para você.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Free */}
        <Card>
          <h3 className="font-bold text-lg mb-1">Free</h3>
          <p className="text-3xl font-bold mb-6">R$ 0</p>
          <ul className="space-y-2 mb-6">
            {['1 plano alimentar por mês', 'Chat limitado (10 mensagens/dia)', 'Sem análise por foto'].map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                <Check className="h-4 w-4 text-brand-600 shrink-0" />{f}
              </li>
            ))}
          </ul>
          <Button className="w-full" variant="outline" disabled={currentPlan === 'free'}>
            {currentPlan === 'free' ? 'Plano atual' : 'Plano Free'}
          </Button>
        </Card>

        {/* Pro */}
        <Card className="border-brand-500 ring-1 ring-brand-500">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-bold text-lg">Pro</h3>
            <Sparkles className="h-4 w-4 text-brand-600" />
          </div>

          {/* Seletor de intervalo */}
          {currentPlan !== 'pro' && (
            <div className="flex rounded-lg border border-slate-200 p-1 mb-4 bg-slate-50">
              {(Object.keys(PLANS) as PlanInterval[]).map((interval) => (
                <button
                  key={interval}
                  onClick={() => setSelectedInterval(interval)}
                  className={`flex-1 relative rounded-md py-1.5 text-xs font-medium transition-all ${
                    selectedInterval === interval
                      ? 'bg-white text-brand-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {INTERVAL_LABELS[interval]}
                  {interval === 'annual' && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-1.5 py-0 rounded text-[9px] font-bold bg-brand-600 text-white leading-4 whitespace-nowrap">
                      Recomendado
                    </span>
                  )}
                  {interval !== 'annual' && PLANS[interval].discountPercent > 0 && (
                    <span className="absolute -top-2 -right-1 px-1 py-0 rounded text-[9px] font-bold bg-green-500 text-white leading-4">
                      -{PLANS[interval].discountPercent}%
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Preço */}
          <div className="mb-1">
            <p className="text-3xl font-bold">
              R$ {formatBRL(plan.monthlyAmount)}
              <span className="text-base font-normal text-slate-500">/mês</span>
            </p>
            {plan.discountPercent > 0 && (
              <p className="text-sm text-slate-500">
                Cobrado R$ {formatBRL(plan.amount)}{' '}
                {selectedInterval === 'quarterly' ? 'a cada 3 meses' : 'por ano'}
                {' '}· <span className="text-green-600 font-medium">economia de {plan.discountPercent}%</span>
              </p>
            )}
          </div>

          {currentPlan === 'pro' && expiresAt && (
            <p className="text-xs text-slate-500 mb-4">
              Acesso PRO válido até {expiresAt.toLocaleDateString('pt-BR')}
            </p>
          )}

          <ul className="space-y-2 mb-6 mt-4">
            {['Planos ilimitados e editáveis', 'Chat IA sem limites', 'Análise por foto', 'Suporte prioritário'].map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                <Check className="h-4 w-4 text-brand-600 shrink-0" />{f}
              </li>
            ))}
          </ul>

          {currentPlan === 'pro' ? (
            <div className="space-y-3">
              <Button className="w-full" disabled>Plano atual</Button>
              {isPix && expiresAt && (
                <Button className="w-full" loading={pixMutation.isPending} onClick={() => pixMutation.mutate('monthly')}>
                  Renovar via PIX
                </Button>
              )}
              {!isPix && activeSub && (
                <Button
                  className="w-full" variant="outline"
                  loading={cancel.isPending}
                  onClick={() => window.confirm('Cancelar assinatura PRO?') && cancel.mutate()}
                >
                  Cancelar assinatura
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <Button className="w-full" loading={subscribe.isPending} onClick={() => subscribe.mutate(selectedInterval)}>
                Assinar via Cartão
              </Button>
              <Button
                className="w-full" variant="outline"
                loading={pixMutation.isPending}
                onClick={() => pixMutation.mutate(selectedInterval)}
              >
                <QrCode className="h-4 w-4 mr-2" /> Pagar via PIX
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Card className="bg-slate-50 border-slate-200">
        <div className="flex gap-3 items-start text-sm text-slate-600">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
          <p>
            O pagamento é processado com segurança pelo <strong>Mercado Pago</strong>.
            Não armazenamos dados do seu cartão. O PIX ativa o PRO pelo período escolhido e pode ser renovado a qualquer momento.
          </p>
        </div>
      </Card>

      {/* Modal PIX */}
      {pixData && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Pague via PIX</h2>
              <button onClick={() => setPixData(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-slate-500 text-center">
              Escaneie o QR code ou copie o código PIX. Após o pagamento, seu plano PRO será ativado automaticamente.
            </p>

            {pixData.qr_code_base64 && (
              <div className="flex justify-center">
                <Image
                  src={`data:image/png;base64,${pixData.qr_code_base64}`}
                  alt="QR Code PIX"
                  width={200}
                  height={200}
                  className="rounded-lg border border-slate-200"
                />
              </div>
            )}

            <Button className="w-full" onClick={copyPix}>
              <Copy className="h-4 w-4 mr-2" /> Copiar código PIX
            </Button>

            <p className="text-xs text-slate-400 text-center">
              O QR code expira em 30 minutos. Após pagar, atualize a página.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
