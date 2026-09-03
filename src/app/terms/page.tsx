import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/LegalPageLayout';
import {
  LEGAL_DOCS_UPDATED_AT,
  LEGAL_ENTITY_ADDRESS,
  LEGAL_ENTITY_CNPJ,
  LEGAL_ENTITY_NAME,
  SUPPORT_CONTACT_EMAIL,
  TERMS_PAGE_COMPLETE,
} from '@/config/legal';

export const metadata: Metadata = {
  title: 'Termos de Uso — WellNutriAI',
  description: 'Termos que regulam o acesso e uso da plataforma WellNutriAI.',
  alternates: { canonical: '/terms' },
  robots: TERMS_PAGE_COMPLETE ? { index: true, follow: true } : { index: false, follow: false },
};

// [PLACEHOLDER PARA O MANTENEDOR]: este texto é um rascunho estrutural,
// não um documento jurídico pronto. Preencha os campos marcados e peça
// revisão de um profissional de direito (idealmente especializado em
// LGPD e direito do consumidor) antes de publicar em produção.
export default function TermsPage() {
  return (
    <LegalPageLayout title="Termos de Uso" updatedAt={LEGAL_DOCS_UPDATED_AT ?? '[PLACEHOLDER: data de publicação]'}>
      <p>
        Estes Termos de Uso regulam o acesso e uso da plataforma WellNutriAI
        (&quot;Plataforma&quot;), operada por{' '}
        <strong>{LEGAL_ENTITY_NAME ?? '[PLACEHOLDER: razão social]'}</strong>, inscrita no CNPJ sob o
        nº <strong>{LEGAL_ENTITY_CNPJ ?? '[PLACEHOLDER: CNPJ]'}</strong>, com sede em{' '}
        <strong>{LEGAL_ENTITY_ADDRESS ?? '[PLACEHOLDER: endereço]'}</strong> (&quot;WellNutriAI&quot;,
        &quot;nós&quot;).
      </p>

      <h2>1. O que é a Plataforma</h2>
      <p>
        O WellNutriAI é um serviço que gera sugestões de plano alimentar,
        respostas de chat e análise de fotos de refeições por meio de
        inteligência artificial, com base em informações fornecidas pelo
        usuário em um questionário nutricional.
      </p>
      <p>
        <strong>
          O WellNutriAI não é um serviço médico, nutricional ou de saúde
          profissional.
        </strong>{' '}
        As sugestões são geradas automaticamente por IA e não substituem
        acompanhamento com nutricionista, médico ou outro profissional de
        saúde habilitado. Ver também a Política de Uso Justo.
      </p>

      <h2>2. Elegibilidade</h2>
      <p>
        O uso da Plataforma é restrito a maiores de 18 anos. Não coletamos
        nem processamos questionários nutricionais de menores de idade.
      </p>

      <h2>3. Cadastro e conta</h2>
      <p>
        Você é responsável por manter a confidencialidade das credenciais da
        sua conta e por todas as atividades realizadas por meio dela.
        Informações fornecidas no cadastro e no questionário devem ser
        verdadeiras.
      </p>

      <h2>4. Planos, pagamento e cobrança recorrente</h2>
      <p>
        A Plataforma oferece um plano gratuito com funcionalidades limitadas
        e um plano pago (&quot;PRO&quot;), cobrado de forma recorrente
        conforme o intervalo escolhido no momento da assinatura. O
        cancelamento interrompe a renovação automática, mas o acesso PRO
        permanece válido até o fim do período já pago — ver a Política de
        Cancelamento para detalhes.
      </p>
      <p>Processamos pagamentos através de provedores terceiros (Stripe e Mercado Pago); não armazenamos dados completos de cartão de crédito em nossos servidores.</p>

      <h2>5. Uso aceitável</h2>
      <p>
        Ver a Política de Uso Justo para as regras específicas de uso das
        funcionalidades de inteligência artificial (limites de uso,
        cotas por plano e vedações de uso abusivo).
      </p>

      <h2>6. Limitação de responsabilidade</h2>
      <p>
        Na máxima medida permitida pela legislação aplicável, o WellNutriAI
        não se responsabiliza por danos decorrentes do uso das sugestões
        geradas por IA sem a devida validação por um profissional de saúde
        qualificado. Isso não afasta direitos que a lei não permita
        renunciar, incluindo os previstos no Código de Defesa do
        Consumidor.
      </p>

      <h2>7. Privacidade</h2>
      <p>
        O tratamento de dados pessoais está descrito na nossa{' '}
        <a href="/privacy" className="text-primary-600 underline">
          Política de Privacidade
        </a>
        .
      </p>

      <h2>8. Alterações destes termos</h2>
      <p>
        Podemos atualizar estes Termos periodicamente. Mudanças relevantes
        exigem novo aceite explícito antes de você continuar usando
        funcionalidades pagas ou que envolvam IA.
      </p>

      <h2>9. Contato</h2>
      <p>
        Dúvidas sobre estes Termos: <strong>{SUPPORT_CONTACT_EMAIL ?? '[PLACEHOLDER: e-mail de contato/suporte]'}</strong>.
      </p>
    </LegalPageLayout>
  );
}
