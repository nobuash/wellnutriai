import { activateMpPayment } from '@/lib/mercadopago/activatePayment';
import { getPayment, getPreApproval } from '@/lib/mercadopago/client';
import { verifyMPSignature } from '@/lib/mercadopago/webhook';
import { createServiceClient } from '@/lib/supabase/service';
import { recalculateVisualPlanCache } from '@/lib/subscriptionCache';
import { requireSupabaseSuccess } from '@/lib/supabaseErrors';
import { withWebhookIdempotency } from '@/lib/webhookIdempotency';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const xSignature = req.headers.get('x-signature') ?? '';
  const xRequestId = req.headers.get('x-request-id') ?? '';
  const rawBody = await req.text();

  let body: Record<string, unknown> = {};
  try { body = JSON.parse(rawBody); } catch { body = {}; }

  // Prioriza os QUERY PARAMS da URL — é o valor que o Mercado Pago
  // efetivamente assina (ver src/lib/mercadopago/webhook.ts). Usar o
  // data.id do corpo como fonte principal permitiria, em tese, um
  // corpo forjado com um data.id diferente do que foi assinado
  // (confused deputy) — o corpo só é usado como último fallback, nunca
  // como fonte primária, e o MESMO valor resultante é usado tanto para
  // verificar a assinatura quanto para buscar/ativar o pagamento.
  const dataId =
    req.nextUrl.searchParams.get('data.id') ??
    req.nextUrl.searchParams.get('id') ??
    (body?.data as Record<string, string> | undefined)?.id ??
    '';

  const type =
    (body?.type as string | undefined) ??
    req.nextUrl.searchParams.get('type') ??
    req.nextUrl.searchParams.get('topic') ??
    '';

  // Id da notificação em si (distinto do id do recurso/dataId) — o MP
  // envia isso na maioria das notificações modernas. Usamos como chave
  // de dedup preferencial porque é único POR NOTIFICAÇÃO: uma transição
  // real de status (pending -> approved) do MESMO recurso gera uma
  // notificação NOVA com um notificationId diferente, então não colide
  // com a anterior — ao contrário de usar só `type+dataId`, que é fixo
  // para um recurso e bloqueava transições de status reais.
  const notificationId = (body?.id as string | number | undefined)?.toString();

  console.log(`[webhook] type=${type} dataId=${dataId} notificationId=${notificationId ?? 'n/a'} sig=${xSignature ? 'present' : 'absent'}`);

  // Rejeita se assinatura ausente ou inválida — nunca processar sem verificação
  if (!xSignature || !verifyMPSignature(xSignature, xRequestId, dataId)) {
    console.warn('[webhook] Assinatura MP inválida ou ausente — rejeitando');
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 });
  }

  if (!dataId) {
    console.warn('[webhook] dataId ausente');
    return NextResponse.json({ ok: true });
  }

  // Fallback quando não há notificationId: chave por recurso+status
  // atual. Ainda assim permite reprocessar uma transição real de
  // status, porque o status muda entre uma chamada e outra.
  let eventKey = notificationId ? `mp:evt:${notificationId}` : null;
  let resourceStatus: string | null = null;

  if (!eventKey) {
    try {
      if (type === 'payment') {
        const payment = await getPayment().get({ id: Number(dataId) });
        resourceStatus = (payment?.status as string) ?? null;
      }
    } catch {
      // segue sem resourceStatus — cai no fallback abaixo
    }
    eventKey = `mp:res:${type}:${dataId}:${resourceStatus ?? 'unknown'}`;
  }

  const outcome = await withWebhookIdempotency(
    {
      provider: 'mercadopago',
      eventKey,
      eventType: type,
      resourceId: dataId,
      resourceStatus,
    },
    async () => {
      if (type === 'payment') {
        const result = await activateMpPayment(Number(dataId));
        console.log(`[webhook/payment] dataId=${dataId} outcome=${result.outcome}`);
        if (
          result.outcome === 'amount_mismatch' ||
          result.outcome === 'ownership_mismatch' ||
          result.outcome === 'missing_approval_date'
        ) {
          // Não trata como falha de infraestrutura (não deve gerar
          // retry do provedor) — é uma rejeição de negócio válida ou um
          // caso que precisa de revisão manual, não um erro transitório.
          console.error(`[webhook/payment] rejeitado: ${result.outcome} dataId=${dataId}`);
        }
        return;
      }

      // Assinatura recorrente do MP (preapproval) — nenhum fluxo atual
      // do produto cria uma de verdade (ver docs/payment-flows.md), mas
      // o handler fica correto para quando isso existir.
      if (type === 'preapproval') {
        const sub = await getPreApproval().get({ id: String(dataId) });
        if (!sub?.id || !sub.external_reference) return;

        const userId = sub.external_reference as string;
        const mpStatus = sub.status as string;
        const nextPaymentDate = (sub.auto_recurring as Record<string, string> | undefined)?.end_date ?? null;
        const normalizedStatus =
          mpStatus === 'authorized' ? 'active' :
          mpStatus === 'cancelled' ? 'canceled' :
          mpStatus === 'paused' ? 'past_due' : 'pending';

        const service = createServiceClient();
        await requireSupabaseSuccess(service.from('subscriptions').upsert(
          {
            user_id: userId,
            plan: normalizedStatus === 'active' ? 'pro' : 'free',
            mp_subscription_id: sub.id,
            mp_status: mpStatus,
            next_payment_date: nextPaymentDate,
            payment_type: 'subscription',
            provider: 'mercadopago',
            provider_subscription_id: sub.id,
            status: normalizedStatus,
            current_period_end: nextPaymentDate,
            canceled_at: mpStatus === 'cancelled' ? new Date().toISOString() : null,
          },
          { onConflict: 'mp_subscription_id' },
        ));

        await recalculateVisualPlanCache(service, userId);
        console.log(`[webhook/subscription] user=${userId} status=${mpStatus}`);
      }
    },
  );

  if (outcome === 'failed') {
    // Sinaliza erro pro MP tentar reentregar depois.
    return NextResponse.json({ error: 'Falha ao processar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
