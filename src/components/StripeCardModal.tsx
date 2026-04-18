'use client';

import { PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface Props {
  planInterval: PlanInterval;
  onClose: () => void;
}

export function StripeCardModal({ planInterval, onClose }: Props) {
  const plan = PLANS[planInterval];
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/payment/stripe/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planInterval }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.clientSecret) setClientSecret(d.clientSecret);
        else setLoadError(d.error ?? 'Erro ao iniciar pagamento');
      })
      .catch(() => setLoadError('Erro de conexão'));
  }, [planInterval]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">Pagamento via Cartão</h2>
            <p className="text-sm text-slate-500">
              {plan.displayLabel} · R$ {plan.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loadError && (
          <p className="text-sm text-red-600 text-center py-6">{loadError}</p>
        )}

        {!clientSecret && !loadError && (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 rounded-full border-2 border-brand-600 border-t-transparent animate-spin" />
          </div>
        )}

        {clientSecret && (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret, locale: 'pt-BR', appearance: { theme: 'stripe' } }}
          >
            <CheckoutForm planInterval={planInterval} onClose={onClose} />
          </Elements>
        )}
      </div>
    </div>
  );
}

function CheckoutForm({ onClose }: { planInterval: PlanInterval; onClose: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/pricing` },
        redirect: 'if_required',
      });

      if (error) {
        toast.error(error.message ?? 'Pagamento não aprovado. Tente outro cartão.');
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        const res = await fetch('/api/payment/stripe/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_intent_id: paymentIntent.id }),
        });
        const data = await res.json();
        if (data.activated) {
          toast.success('Pagamento aprovado! Seu plano PRO está ativo.');
          onClose();
          router.refresh();
          // Força reload completo para garantir que o plano seja atualizado
          window.location.reload();
        } else {
          toast.error('Pagamento processado, mas falha ao ativar plano. Contate o suporte.');
        }
      } else {
        toast.info('Pagamento em processamento. Você receberá confirmação em breve.');
        onClose();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button type="submit" className="w-full" loading={loading} disabled={!stripe}>
        Confirmar Pagamento
      </Button>
    </form>
  );
}
