'use client';

import { PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { X } from 'lucide-react';
import { useState, useCallback } from 'react';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface Props {
  planInterval: PlanInterval;
  onClose: () => void;
}

export function StripeCardModal({ planInterval, onClose }: Props) {
  const plan = PLANS[planInterval];
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch('/api/payment/stripe/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planInterval }),
    });
    const data = await res.json();
    if (!res.ok || !data.clientSecret) {
      setLoadError(data.error ?? 'Erro ao iniciar pagamento');
      return '';
    }
    return data.clientSecret as string;
  }, [planInterval]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">Pagamento via Cartão</h2>
            <p className="text-sm text-slate-500">
              {plan.displayLabel} · R$ {plan.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              {' · Renovação automática'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loadError && (
          <p className="text-sm text-red-600 text-center py-6">{loadError}</p>
        )}

        {!loadError && (
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ fetchClientSecret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        )}
      </div>
    </div>
  );
}
