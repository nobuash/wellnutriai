'use client';

import { PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { initMercadoPago, CardPayment } from '@mercadopago/sdk-react';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

interface Props {
  planInterval: PlanInterval;
  onClose: () => void;
}

export function CardPaymentModal({ planInterval, onClose }: Props) {
  const plan = PLANS[planInterval];
  const router = useRouter();

  useEffect(() => {
    initMercadoPago(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY!, { locale: 'pt-BR' });
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleSubmit(formData: any) {
    try {
      const res = await fetch('/api/payment/card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, planInterval }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Erro ao processar pagamento');
        return;
      }

      if (data.status === 'approved') {
        toast.success('Pagamento aprovado! Seu plano PRO está ativo.');
        onClose();
        router.refresh();
      } else if (data.status === 'in_process' || data.status === 'pending') {
        toast.info('Pagamento em processamento. Você receberá confirmação em breve.');
        onClose();
      } else {
        toast.error(data.userMessage ?? 'Pagamento não aprovado. Tente outro cartão ou use o PIX.');
      }
    } catch {
      toast.error('Erro de conexão. Tente novamente.');
    }
  }

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

        <CardPayment
          initialization={{ amount: plan.amount }}
          customization={{
            paymentMethods: { maxInstallments: 12 },
            visual: { style: { theme: 'default' } },
          }}
          onSubmit={handleSubmit}
          onError={(err) => {
            console.error('[CardPayment brick]', err);
            toast.error('Erro no formulário de pagamento');
          }}
        />
      </div>
    </div>
  );
}
