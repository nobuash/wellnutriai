'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
export default function AcceptTermsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleAccept() {
    if (!checked) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Sessão expirada');
      router.push('/login');
      return;
    }

    // O aceite é gravado pelo servidor (service role), que é a única
    // forma de o campo accepted_terms_at ser persistido de verdade —
    // ver /api/accept-terms e docs/production-hardening-audit.md.
    const res = await fetch('/api/accept-terms', { method: 'POST' });

    if (!res.ok) {
      toast.error('Erro ao registrar aceite');
      setLoading(false);
      return;
    }

    toast.success('Termos aceitos!');
    window.location.replace('/dashboard');
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
            O usuário é responsável por avaliar criticamente e, sempre que necessário, validar as sugestões com
            um profissional de saúde antes de segui-las.
          </li>
          <li>
            Na máxima medida permitida pela legislação aplicável, o WellNutriAI não se responsabiliza por danos
            decorrentes do uso inadequado das recomendações ou do não acompanhamento profissional recomendado
            neste termo — isso não afasta direitos que a lei não permita renunciar.
          </li>
          <li>
            Em caso de condições médicas, alergias severas ou necessidades específicas, o usuário deve procurar
            um profissional qualificado.
          </li>
          <li>
            O WellNutriAI é destinado a <strong>maiores de 18 anos</strong>. Não geramos planos alimentares
            personalizados para menores de idade.
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
