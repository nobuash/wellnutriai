import { LegalPageLayout } from '@/components/LegalPageLayout';

export const metadata = { title: 'Política de Cancelamento — WellNutriAI' };

export default function CancellationPage() {
  return (
    <LegalPageLayout title="Política de Cancelamento" updatedAt="[PLACEHOLDER: data de publicação]">
      <h2>1. Como cancelar</h2>
      <p>
        Assinaturas recorrentes (cobrança automática via cartão) podem ser
        canceladas a qualquer momento em{' '}
        <strong>Configurações da conta → Assinatura</strong>, dentro da
        Plataforma. O cancelamento é processado imediatamente junto ao
        provedor de pagamento (Stripe ou Mercado Pago, conforme como você
        assinou).
      </p>

      <h2>2. O que acontece depois de cancelar</h2>
      <p>
        Cancelar interrompe apenas a <strong>renovação automática</strong> —
        seu acesso PRO continua válido normalmente até o fim do período já
        pago. Nenhuma nova cobrança é feita após o cancelamento.
      </p>

      <h2>3. Pagamentos avulsos (PIX e cartão sem recorrência)</h2>
      <p>
        Pagamentos via PIX ou cartão avulso não têm renovação automática —
        não existe assinatura para cancelar nesses casos. O acesso PRO
        expira naturalmente na data informada na tela de pagamento, e não
        é renovado a menos que você faça um novo pagamento.
      </p>

      <h2>4. Reembolso</h2>
      <p>
        <strong>[PLACEHOLDER: descrever a política de reembolso/direito de
        arrependimento aplicável — no Brasil, consumidores têm direito de
        arrependimento em até 7 dias para compras feitas fora de
        estabelecimento comercial físico, conforme art. 49 do CDC; confirme
        com um profissional de direito como isso se aplica ao seu caso e
        preencha os prazos/processo reais aqui]</strong>.
      </p>

      <h2>5. Exclusão de conta</h2>
      <p>
        Excluir a conta (também disponível em Configurações da conta)
        cancela automaticamente qualquer assinatura recorrente ativa antes
        de apagar seus dados — a exclusão só é concluída depois que o
        cancelamento junto ao provedor de pagamento é confirmado, para que
        você nunca continue sendo cobrado por uma conta que não existe
        mais.
      </p>
    </LegalPageLayout>
  );
}
