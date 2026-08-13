import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Política de Retenção de Dados — WellNutriAI',
  description:
    'Por quanto tempo o WellNutriAI mantém os dados da sua conta e o que acontece quando você a exclui.',
  alternates: { canonical: '/data-retention' },
};

// Reflete o comportamento real implementado no código (ver
// src/app/api/account/delete/route.ts e docs/data-retention.md) — ajuste
// este texto se o comportamento do sistema mudar, para nunca prometer
// algo que o código não faz.
export default function DataRetentionPage() {
  return (
    <LegalPageLayout title="Política de Retenção de Dados" updatedAt="[PLACEHOLDER: data de publicação]">
      <h2>1. Enquanto sua conta está ativa</h2>
      <p>
        Mantemos os dados do seu questionário, planos alimentares, histórico
        de chat, fotos de refeições analisadas e histórico de pagamento
        pelo tempo em que sua conta existir, para que essas funcionalidades
        continuem funcionando.
      </p>

      <h2>2. Quando você exclui sua conta</h2>
      <p>
        A exclusão de conta (Configurações da conta → Excluir conta) apaga
        permanentemente: seu usuário de autenticação, perfil, questionários,
        planos alimentares, mensagens de chat, análises de foto e os
        arquivos de imagem correspondentes no armazenamento. Assinaturas
        recorrentes ativas são canceladas junto ao provedor de pagamento
        antes da exclusão ser concluída.
      </p>
      <p>
        Registros de auditoria e de uso de IA (sem conteúdo de prompts,
        apenas metadados como custo estimado e contagem de tokens) são
        mantidos de forma desvinculada do seu usuário (anonimizados), para
        fins de segurança, prevenção a fraude e obrigações legais/contábeis.
      </p>

      <h2>3. Backups</h2>
      <p>
        <strong>[PLACEHOLDER: descrever a janela de retenção de backups do
        banco de dados junto ao provedor de infraestrutura (Supabase) — em
        quanto tempo dados excluídos deixam de existir também nos
        backups]</strong>.
      </p>

      <h2>4. Retenção mínima exigida por lei</h2>
      <p>
        <strong>[PLACEHOLDER: confirmar com um profissional de direito/contábil
        se há prazos de retenção obrigatórios para dados fiscais/de
        pagamento no Brasil, e preencher aqui]</strong>.
      </p>
    </LegalPageLayout>
  );
}
