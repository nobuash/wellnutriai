import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/LegalPageLayout';
import {
  DPO_CONTACT_EMAIL,
  LEGAL_DOCS_UPDATED_AT,
  LEGAL_ENTITY_ADDRESS,
  LEGAL_ENTITY_CNPJ,
  LEGAL_ENTITY_NAME,
} from '@/config/legal';
import { DATA_PROCESSORS } from '@/config/dataProcessors';

export const metadata: Metadata = {
  title: 'Política de Privacidade — WellNutriAI',
  description:
    'Como o WellNutriAI coleta, usa e protege os dados pessoais dos usuários da plataforma, em conformidade com a LGPD.',
  alternates: { canonical: '/privacy' },
};

// [PLACEHOLDER PARA O MANTENEDOR]: rascunho estrutural com base no que
// o código efetivamente coleta e processa hoje — não é um documento
// jurídico pronto. Preencha os campos marcados e peça revisão de um
// profissional de direito especializado em LGPD antes de publicar.
export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Política de Privacidade" updatedAt={LEGAL_DOCS_UPDATED_AT ?? '[PLACEHOLDER: data de publicação]'}>
      <p>
        Esta Política descreve como <strong>{LEGAL_ENTITY_NAME ?? '[PLACEHOLDER: razão social]'}</strong>{' '}
        (&quot;WellNutriAI&quot;, &quot;nós&quot;) trata dados pessoais de
        usuários da Plataforma, em conformidade com a Lei Geral de Proteção
        de Dados (Lei nº 13.709/2018 — LGPD).
      </p>

      <h2>1. Controlador de dados</h2>
      <p>
        <strong>
          {LEGAL_ENTITY_NAME && LEGAL_ENTITY_CNPJ && LEGAL_ENTITY_ADDRESS
            ? `${LEGAL_ENTITY_NAME}, CNPJ ${LEGAL_ENTITY_CNPJ}, com sede em ${LEGAL_ENTITY_ADDRESS}`
            : '[PLACEHOLDER: razão social, CNPJ, endereço]'}
        </strong>
        . Encarregado de dados (DPO): <strong>{DPO_CONTACT_EMAIL ?? '[PLACEHOLDER: nome/e-mail de contato do encarregado]'}</strong>.
      </p>

      <h2>2. Dados que coletamos</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Dados de cadastro: nome, e-mail, senha (armazenada com hash).</li>
        <li>
          Dados do questionário nutricional: idade, peso, altura, objetivo,
          nível de atividade, alergias, preferências alimentares, condições
          médicas informadas (diabetes, gestação, doenças renal/hepática,
          entre outras) — usados exclusivamente para gerar sugestões de
          plano alimentar e aplicar as restrições de segurança
          correspondentes.
        </li>
        <li>Mensagens trocadas com o chat de IA e planos alimentares gerados.</li>
        <li>Fotos de refeições enviadas para análise por IA, e o resultado dessa análise.</li>
        <li>
          Dados de pagamento: processados diretamente pelos provedores
          Stripe e Mercado Pago — não armazenamos número completo de
          cartão de crédito.
        </li>
        <li>Registros técnicos: endereço IP (com hash, para rate limiting), user agent, logs de uso e erro.</li>
      </ul>

      <h2>3. Como usamos seus dados</h2>
      <p>
        Usamos os dados acima para: operar a Plataforma e suas
        funcionalidades de IA (geração de plano alimentar, chat, análise de
        foto), processar pagamentos, cumprir obrigações legais e de
        prevenção a fraude, e melhorar a segurança do serviço (rate
        limiting, controle de cota).
      </p>
      <p>
        Dados do questionário e das conversas de chat são enviados a
        provedores de IA (OpenAI) para gerar as respostas — não enviamos
        prompts completos, imagens ou questionários para ferramentas de
        observabilidade/monitoramento de erros.
      </p>

      <h2>4. Compartilhamento com terceiros</h2>
      <p>
        Compartilhamos dados estritamente necessários com: Supabase
        (hospedagem de banco de dados e armazenamento de arquivos), OpenAI
        (processamento de IA), Stripe e Mercado Pago (processamento de
        pagamento), Vercel (hospedagem da aplicação). Não vendemos dados
        pessoais a terceiros.
      </p>

      <h2>5. Transferência internacional de dados</h2>
      {DATA_PROCESSORS.length > 0 ? (
        <ul className="list-disc pl-6 space-y-2">
          {DATA_PROCESSORS.map((p) => (
            <li key={p.operator}>
              <strong>{p.operator}</strong> — {p.purpose}. Categorias de dados:{' '}
              {p.dataCategories.join(', ')}. País(es) de destino: {p.destinationCountries.join(', ')}.
              Duração: {p.duration}. Mecanismo de transferência: {p.transferMechanism}. Contato: {p.contact}.
            </li>
          ))}
        </ul>
      ) : (
        <p>
          <strong>
            [PLACEHOLDER: alguns dos fornecedores listados na seção 4 processam dados fora do Brasil.
            O detalhamento por operador (país de destino, mecanismo de transferência utilizado e
            duração) está em preparação e será publicado aqui assim que confirmado com cada
            fornecedor.]
          </strong>
        </p>
      )}

      <h2>6. Retenção de dados</h2>
      <p>
        Ver a <a href="/data-retention" className="text-primary-600 underline">Política de Retenção de Dados</a>{' '}
        para prazos específicos por tipo de dado.
      </p>

      <h2>7. Seus direitos (LGPD)</h2>
      <p>
        Você pode solicitar a qualquer momento: confirmação de tratamento,
        acesso, correção, anonimização, portabilidade ou exclusão dos seus
        dados. A exclusão de conta está disponível diretamente em{' '}
        <strong>Configurações da conta</strong> dentro da Plataforma.
        Para as demais solicitações: <strong>{DPO_CONTACT_EMAIL ?? '[PLACEHOLDER: e-mail/canal de contato do DPO]'}</strong>.
      </p>

      <h2>8. Segurança</h2>
      <p>
        Adotamos controles técnicos como controle de acesso por linha
        (RLS) no banco de dados, criptografia em trânsito, e segregação de
        credenciais administrativas do restante da aplicação.
      </p>

      <h2>9. Alterações desta política</h2>
      <p>
        Mudanças relevantes exigem novo aceite explícito antes de você
        continuar usando funcionalidades pagas ou que envolvam IA.
      </p>
    </LegalPageLayout>
  );
}
