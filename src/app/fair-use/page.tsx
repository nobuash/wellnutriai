import { LegalPageLayout } from '@/components/LegalPageLayout';
import { PLAN_LIMITS } from '@/lib/plans';

export const metadata = { title: 'Política de Uso Justo — WellNutriAI' };

export default function FairUsePage() {
  return (
    <LegalPageLayout title="Política de Uso Justo" updatedAt="[PLACEHOLDER: data de publicação]">
      <p>
        As funcionalidades de inteligência artificial do WellNutriAI (geração
        de plano alimentar, chat e análise de foto) têm custo real por uso.
        Para manter o serviço sustentável para todos os usuários, aplicamos
        limites de uso por plano.
      </p>

      <h2>1. Limites por plano</h2>
      <p>Os limites mensais atuais são:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>
          <strong>Gratuito:</strong> {PLAN_LIMITS.free.mealPlansPerMonth} plano(s)
          alimentar(es), {PLAN_LIMITS.free.chatMessagesPerMonth} mensagens de
          chat, {PLAN_LIMITS.free.photoAnalysisPerMonth} análise(s) de foto por mês.
        </li>
        <li>
          <strong>PRO:</strong> {PLAN_LIMITS.pro.mealPlansPerMonth} plano(s)
          alimentar(es), {PLAN_LIMITS.pro.chatMessagesPerMonth} mensagens de
          chat, {PLAN_LIMITS.pro.photoAnalysisPerMonth} análises de foto por mês.
        </li>
      </ul>
      <p>
        Esses valores podem ser ajustados a qualquer momento; a versão
        vigente é sempre a exibida nesta página e refletida nos limites
        reais aplicados pelo sistema.
      </p>

      <h2>2. Uso vedado</h2>
      <p>Não é permitido usar a Plataforma para:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Automatizar requisições em volume acima dos limites do seu plano (contornar rate limiting).</li>
        <li>Enviar conteúdo abusivo, malicioso ou tentativas de manipular o comportamento do assistente de IA (prompt injection).</li>
        <li>Fazer engenharia reversa ou extrair em massa o conteúdo gerado para revenda ou redistribuição.</li>
        <li>Enviar fotos ou informações de terceiros sem consentimento deles.</li>
      </ul>

      <h2>3. Consequências</h2>
      <p>
        Uso que viole esta política pode resultar em limitação adicional,
        suspensão temporária ou encerramento da conta, a critério do
        WellNutriAI.
      </p>

      <h2>4. Natureza das sugestões de IA</h2>
      <p>
        Todo conteúdo gerado por IA na Plataforma é uma sugestão
        automatizada, não uma prescrição ou orientação profissional — ver
        os <a href="/terms" className="text-brand-600 underline">Termos de Uso</a>.
      </p>
    </LegalPageLayout>
  );
}
