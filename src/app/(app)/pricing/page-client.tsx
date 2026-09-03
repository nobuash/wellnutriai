'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { createClient } from '@/lib/supabase/client';
import type { Entitlement } from '@/lib/entitlement';
import { getNutritionSafetyMode } from '@/lib/mealPlanSafety';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Copy, CreditCard, QrCode, Sparkles, X } from 'lucide-react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

// Carregado só quando o modal de cartão é aberto — evita colocar o SDK
// do Stripe (@stripe/stripe-js + @stripe/react-stripe-js) no bundle
// inicial de /pricing, que a maioria dos visitantes nunca chega a usar.
const StripeCardModal = dynamic(
  () => import('@/components/StripeCardModal').then((mod) => mod.StripeCardModal),
  { ssr: false }
);

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

// Calculado no build (next.config.js) a partir da presença real de
// MP_ACCESS_TOKEN/MP_WEBHOOK_SECRET/NEXT_PUBLIC_MP_PUBLIC_KEY — a
// conta do Mercado Pago pode não estar habilitada pra receber
// pagamentos ainda (verificação/dados bancários pendentes junto ao
// próprio Mercado Pago), então o botão de PIX não pode aparecer
// oferecendo um método que vai falhar.
const MERCADOPAGO_ENABLED = process.env.NEXT_PUBLIC_MERCADOPAGO_ENABLED === 'true';

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PricingPage() {
  const supabase = createClient();
  const router = useRouter();
  const qc = useQueryClient();
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<PlanInterval>('annual');
  const [showCardModal, setShowCardModal] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // Ativa plano após retorno do Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('stripe_session');
    if (!sessionId) return;

    // Remove o parâmetro da URL imediatamente
    router.replace('/pricing', { scroll: false });

    fetch('/api/payment/stripe/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.activated) {
          toast.success('Pagamento aprovado! Seu plano PRO está ativo.');
          window.location.reload();
        } else {
          toast.error('Pagamento processado, mas falha ao ativar. Contate o suporte.');
        }
      })
      .catch(() => toast.error('Erro ao ativar plano. Contate o suporte.'));
  }, [router]);

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

  const { data: entitlement } = useQuery({
    queryKey: ['entitlement'],
    queryFn: async () => {
      const res = await fetch('/api/entitlement');
      if (!res.ok) return null;
      return (await res.json()) as Entitlement;
    },
  });

  // Mesma decisão de src/lib/mealPlanSafety.ts usada na geração de
  // plano/chat — aqui evita vender o PRO como se a geração automática
  // de plano alimentar (o principal benefício anunciado) estivesse
  // disponível para um perfil que o sistema já sabe que vai bloquear.
  const { data: questionnaireSafety } = useQuery({
    queryKey: ['questionnaire-safety'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from('nutrition_questionnaires')
        .select('diabetes_type, is_pregnant, is_breastfeeding, has_kidney_disease, has_liver_disease, has_eating_disorder_history, has_severe_allergy, uses_insulin, other_medical_condition')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });
  const safetyMode = getNutritionSafetyMode(questionnaireSafety ?? null);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payment/cancel', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao cancelar');
      return data as { ok: true; cancelAtPeriodEnd: boolean; accessUntil: string | null; alreadyCanceled?: boolean };
    },
    onSuccess: (data) => {
      setConfirmingCancel(false);
      qc.invalidateQueries({ queryKey: ['entitlement'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
      if (data.cancelAtPeriodEnd && data.accessUntil) {
        toast.success(`Renovação automática cancelada. Seu acesso PRO continua até ${new Date(data.accessUntil).toLocaleDateString('pt-BR')}.`);
      } else {
        toast.success('Assinatura cancelada.');
      }
    },
    onError: (err: Error) => {
      setConfirmingCancel(false);
      toast.error(err.message);
    },
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

  const currentPlan = entitlement?.isPro ? 'pro' : (profile?.plan ?? 'free');
  const expiresAt = entitlement?.currentPeriodEnd ? new Date(entitlement.currentPeriodEnd) : null;
  const isRecurring = entitlement?.provider === 'stripe' || entitlement?.paymentType === 'subscription';

  function copyPix() {
    if (!pixData?.qr_code) return;
    navigator.clipboard.writeText(pixData.qr_code);
    toast.success('Código PIX copiado!');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Planos</h1>
        <p className="text-sm text-ink-muted mt-1">Escolha o plano ideal para você.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Free */}
        <Card>
          <h3 className="font-display text-lg text-ink mb-1">Free</h3>
          <p className="text-3xl font-semibold text-ink mb-6">R$ 0</p>
          <ul className="space-y-2 mb-6">
            {['1 plano alimentar por mês', 'Sem assistente especializado', 'Sem análise de refeição'].map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-ink-secondary">
                <Check className="h-4 w-4 text-primary-600 shrink-0" />{f}
              </li>
            ))}
          </ul>
          <Button className="w-full" variant="outline" disabled={currentPlan === 'free'}>
            {currentPlan === 'free' ? 'Plano atual' : 'Plano Free'}
          </Button>
        </Card>

        {/* Pro */}
        <Card className="border-primary-300 ring-1 ring-primary-300">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-display text-lg text-ink">Pro</h3>
            <Sparkles className="h-4 w-4 text-primary-600" />
          </div>

          {/* Seletor de intervalo */}
          {(
            <div className="flex rounded-md border border-border p-1 mb-4 bg-surface-secondary">
              {(Object.keys(PLANS) as PlanInterval[]).map((interval) => (
                <button
                  key={interval}
                  onClick={() => setSelectedInterval(interval)}
                  className={`flex-1 relative rounded-sm py-1.5 text-xs font-medium transition-all duration-200 ${
                    selectedInterval === interval
                      ? 'bg-surface text-primary-700 shadow-soft'
                      : 'text-ink-muted hover:text-ink-secondary'
                  }`}
                >
                  {INTERVAL_LABELS[interval]}
                  {interval === 'annual' && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-1.5 py-0 rounded-full text-[9px] font-bold bg-primary-600 text-white leading-4 whitespace-nowrap">
                      Recomendado
                    </span>
                  )}
                  {interval !== 'annual' && PLANS[interval].discountPercent > 0 && (
                    <span className="absolute -top-2 -right-1 px-1 py-0 rounded-full text-[9px] font-bold bg-primary-500 text-white leading-4">
                      -{PLANS[interval].discountPercent}%
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Preço */}
          <div className="mb-1">
            <p className="text-3xl font-semibold text-ink">
              R$ {formatBRL(plan.monthlyAmount)}
              <span className="text-base font-normal text-ink-muted">/mês</span>
            </p>
            {plan.discountPercent > 0 && (
              <p className="text-sm text-ink-muted">
                Cobrado R$ {formatBRL(plan.amount)}{' '}
                {selectedInterval === 'quarterly' ? 'a cada 3 meses' : 'por ano'}
                {' '}· <span className="text-primary-600 font-medium">economia de {plan.discountPercent}%</span>
              </p>
            )}
          </div>

          {currentPlan === 'pro' && expiresAt && (
            <p className="text-xs text-ink-muted mb-4">
              Acesso PRO válido até {expiresAt.toLocaleDateString('pt-BR')}
            </p>
          )}

          <ul className="space-y-2 mb-6 mt-4">
            {['Até 6 planos alimentares por mês, editáveis pelo assistente', 'Assistente especializado em alimentação — uso amplo, sujeito à política de uso justo', 'Até 30 análises de refeição por mês (foto ou manual)', 'Suporte prioritário'].map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-ink-secondary">
                <Check className="h-4 w-4 text-primary-600 shrink-0" />{f}
              </li>
            ))}
          </ul>

          {currentPlan === 'pro' ? (
            <div className="space-y-3">
              <Button className="w-full" disabled>Plano atual</Button>
              {safetyMode === 'restricted' ? (
                <RestrictedPaymentNotice />
              ) : (
                <>
                  <Button className="w-full" variant="outline" onClick={() => setShowCardModal(true)}>
                    <CreditCard className="h-4 w-4 mr-2" /> Renovar via Cartão
                  </Button>
                  {MERCADOPAGO_ENABLED && (
                    <Button
                      className="w-full" variant="outline"
                      loading={pixMutation.isPending}
                      onClick={() => pixMutation.mutate(selectedInterval)}
                    >
                      <QrCode className="h-4 w-4 mr-2" /> Renovar via PIX
                    </Button>
                  )}
                </>
              )}
            </div>
          ) : safetyMode === 'restricted' ? (
            <RestrictedPaymentNotice />
          ) : (
            <div className="space-y-3">
              <Button className="w-full" onClick={() => setShowCardModal(true)}>
                <CreditCard className="h-4 w-4 mr-2" /> Pagar via Cartão
              </Button>
              {MERCADOPAGO_ENABLED && (
                <Button
                  className="w-full" variant="outline"
                  loading={pixMutation.isPending}
                  onClick={() => pixMutation.mutate(selectedInterval)}
                >
                  <QrCode className="h-4 w-4 mr-2" /> Pagar via PIX
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>

      {entitlement?.isPro && (
        <Card>
          <h3 className="font-display text-lg text-ink mb-3">Sua assinatura</h3>
          <div className="space-y-1 text-sm text-ink-secondary mb-4">
            <p>
              Pagamento via{' '}
              <strong className="text-ink">
                {entitlement.provider === 'stripe' ? 'cartão (Stripe)' : entitlement.paymentType === 'pix' ? 'PIX' : 'cartão (Mercado Pago)'}
              </strong>
            </p>
            {entitlement.cancelAtPeriodEnd ? (
              <p className="text-warning">
                Renovação automática cancelada — seu acesso PRO continua até{' '}
                <strong>{expiresAt?.toLocaleDateString('pt-BR')}</strong>.
              </p>
            ) : isRecurring ? (
              <p>
                Renovação automática ativa. Próxima cobrança em{' '}
                <strong className="text-ink">{expiresAt?.toLocaleDateString('pt-BR')}</strong>.
              </p>
            ) : (
              <p>
                Sem renovação automática. Acesso válido até{' '}
                <strong className="text-ink">{expiresAt?.toLocaleDateString('pt-BR')}</strong> — para continuar, faça um novo pagamento.
              </p>
            )}
          </div>

          {isRecurring && !entitlement.cancelAtPeriodEnd && (
            confirmingCancel ? (
              <div className="rounded-md border border-error/30 bg-error/5 p-4 space-y-3">
                <p className="text-sm text-error">
                  Tem certeza? A renovação automática será cancelada, mas você mantém acesso PRO até{' '}
                  {expiresAt?.toLocaleDateString('pt-BR')}.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    loading={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate()}
                  >
                    Confirmar cancelamento
                  </Button>
                  <Button variant="ghost" className="flex-1" onClick={() => setConfirmingCancel(false)}>
                    Voltar
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setConfirmingCancel(true)}>
                Cancelar renovação automática
              </Button>
            )
          )}
        </Card>
      )}

      <Card className="bg-surface-secondary border-border">
        <div className="flex gap-3 items-start text-sm text-ink-secondary">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-ink-muted" />
          <p>
            {MERCADOPAGO_ENABLED ? (
              <>
                O pagamento é processado com segurança pelo <strong className="text-ink">Mercado Pago</strong> ou pela{' '}
                <strong className="text-ink">Stripe</strong> (cartão internacional). Não armazenamos dados do seu cartão. O PIX ativa
                o PRO pelo período escolhido e pode ser renovado a qualquer momento.
              </>
            ) : (
              <>
                O pagamento é processado com segurança pela <strong className="text-ink">Stripe</strong>.
                Não armazenamos dados do seu cartão.
              </>
            )}
          </p>
        </div>
      </Card>

      {/* Modal PIX */}
      {pixData && (
        <PixModal
          pixData={pixData}
          onClose={() => setPixData(null)}
          onCopy={copyPix}
        />
      )}

      {/* Modal Cartão */}
      {showCardModal && (
        <StripeCardModal
          planInterval={selectedInterval}
          onClose={() => setShowCardModal(false)}
        />
      )}
    </div>
  );
}

function RestrictedPaymentNotice() {
  return (
    <div className="rounded-md border border-warning/30 bg-warning/5 p-4 space-y-2">
      <p className="text-sm text-ink-secondary">
        Seu questionário indica uma condição de saúde que exige acompanhamento profissional
        individualizado — por isso a geração automática de plano alimentar personalizado (o
        principal recurso do PRO) não fica disponível para o seu perfil. Chat e análise de
        refeição continuam disponíveis normalmente.
      </p>
      <p className="text-xs text-ink-muted">
        Recomendamos consultar um(a) nutricionista para um plano alimentar seguro e
        individualizado para a sua condição.
      </p>
    </div>
  );
}

function PixModal({ pixData, onClose, onCopy }: {
  pixData: PixData;
  onClose: () => void;
  onCopy: () => void;
}) {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Verifica a cada 5 segundos automaticamente
    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/payment/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_id: pixData.payment_id }),
        });
        const data = await res.json();
        if (data.activated) {
          clearInterval(intervalRef.current!);
          toast.success('Pagamento confirmado! Plano PRO ativado.');
          onClose();
          router.refresh();
        }
      } catch { /* silencioso */ }
    }, 5000);

    // Para após 30 minutos (expiração do QR)
    const timeout = setTimeout(() => clearInterval(intervalRef.current!), 30 * 60 * 1000);

    return () => {
      clearInterval(intervalRef.current!);
      clearTimeout(timeout);
    };
  }, [pixData.payment_id, onClose, router]);

  async function verifyNow() {
    setChecking(true);
    try {
      const res = await fetch('/api/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: pixData.payment_id }),
      });
      const data = await res.json();
      if (data.activated) {
        clearInterval(intervalRef.current!);
        toast.success('Pagamento confirmado! Plano PRO ativado.');
        onClose();
        router.refresh();
      } else {
        toast.info('Pagamento ainda não confirmado. Aguardando...');
      }
    } catch {
      toast.error('Erro ao verificar. Tente novamente.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-lg p-6 max-w-sm w-full space-y-4 shadow-soft-lg">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-ink">Pague via PIX</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-secondary transition-colors duration-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-ink-muted text-center">
          Escaneie o QR code ou copie o código. O plano será ativado automaticamente após o pagamento.
        </p>

        {pixData.qr_code_base64 && (
          <div className="flex justify-center">
            <Image
              src={`data:image/png;base64,${pixData.qr_code_base64}`}
              alt="QR Code PIX"
              width={200}
              height={200}
              className="rounded-sm border border-border"
            />
          </div>
        )}

        <Button className="w-full" onClick={onCopy}>
          <Copy className="h-4 w-4 mr-2" /> Copiar código PIX
        </Button>

        <Button variant="outline" className="w-full" loading={checking} onClick={verifyNow}>
          Já paguei — verificar agora
        </Button>

        <div className="flex items-center gap-2 justify-center">
          <span className="h-2 w-2 rounded-full bg-primary-500 animate-pulse" />
          <p className="text-xs text-ink-muted">Verificando pagamento automaticamente...</p>
        </div>
      </div>
    </div>
  );
}
