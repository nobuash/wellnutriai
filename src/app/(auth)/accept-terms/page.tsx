'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { acceptTermsAction } from './actions';

export default function AcceptTermsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleAccept() {
    if (!checked) return;
    setLoading(true);
    try {
      await acceptTermsAction();
    } catch {
      toast.error('Erro ao registrar aceite. Tente novamente.');
      setLoading(false);
    }
  }

  return (
    <Card className="animate-slide-up max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Termo de Responsabilidade</h1>
      <p className="text-sm text-slate-500 mb-6">
        Para usar o WellNutriAI, é necessário ler e aceitar os termos abaixo.
      </p>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 max-h-96 overflow-y-auto space-y-3 text-sm text-slate-700 leading-relaxed">
        <p className="font-semibold text-slate-900">TERMO DE RESPONSABILIDADE – WELLNUTRIAI</p>

        <p>
          O WellNutriAI é uma plataforma baseada em inteligência artificial que fornece{' '}
          <strong>planos alimentares sugeridos</strong>, com base nas informações fornecidas pelo usuário.
        </p>

        <p>Ao utilizar este sistema, você declara estar ciente de que:</p>

        <ol className="list-decimal pl-6 space-y-2">
          <li>
            O WellNutriAI <strong>não é um serviço médico ou nutricional profissional</strong>.
          </li>
          <li>
            As recomendações fornecidas são{' '}
            <strong>geradas automaticamente por inteligência artificial</strong>.
          </li>
          <li>
            O sistema <strong>não substitui acompanhamento com nutricionista, médico ou profissional de saúde</strong>.
          </li>
          <li>
            As sugestões alimentares <strong>não devem ser interpretadas como prescrição dietética</strong>.
          </li>
          <li>
            O uso das informações é de <strong>total responsabilidade do usuário</strong>.
          </li>
          <li>
            O WellNutriAI <strong>não se responsabiliza por quaisquer danos, problemas de saúde ou consequências
            decorrentes do uso das recomendações</strong>.
          </li>
          <li>
            Em caso de condições médicas, alergias severas ou necessidades específicas, o usuário deve procurar
            um profissional qualificado.
          </li>
        </ol>

        <p className="pt-2 font-medium text-slate-900">
          Ao continuar, você concorda integralmente com estes termos.
        </p>
      </div>

      <label className="flex items-start gap-3 mt-6 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-1 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="text-sm text-slate-700">
          Li e aceito os termos acima. Compreendo que o WellNutriAI fornece sugestões geradas por IA
          e não substitui profissional de saúde.
        </span>
      </label>

      <Button onClick={handleAccept} disabled={!checked} loading={loading} className="w-full mt-6">
        Continuar
      </Button>

      <button
        onClick={async () => {
          await supabase.auth.signOut();
          router.push('/login');
        }}
        className="w-full text-center text-sm text-slate-500 mt-3 hover:underline"
      >
        Sair
      </button>
    </Card>
  );
}
