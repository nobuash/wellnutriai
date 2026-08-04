import { createServiceClient } from '@/lib/supabase/service';

export type WebhookOutcome = 'processed' | 'skipped_duplicate' | 'skipped_in_progress' | 'failed';

interface WebhookEventParams {
  provider: 'stripe' | 'mercadopago';
  /** Chave de deduplicação real — para Stripe, sempre event.id. Para MP,
   * o id da notificação quando existir, senão uma chave composta de
   * recurso+status (ver comentário em 015_webhook_events.sql). */
  eventKey: string;
  eventType: string;
  resourceId?: string | null;
  resourceStatus?: string | null;
}

interface ClaimWebhookEventRow {
  event_id: string;
  claimed: boolean;
  already_processed: boolean;
}

/**
 * Processa um evento de webhook com idempotência e concorrência
 * realmente atômicas:
 * - Reentregas do MESMO evento (mesma eventKey) são deduplicadas.
 * - Uma falha no meio do processamento marca o evento como `failed` em
 *   vez de `processed` — uma reentrega subsequente do provedor (ou um
 *   reprocessamento manual) tenta de novo em vez de ficar preso para
 *   sempre.
 * - O claim (decidir quem tem permissão de processar agora) é feito
 *   por uma única chamada à RPC claim_webhook_event — um UPDATE
 *   atômico no banco, não um SELECT seguido de UPDATE do lado do
 *   Node. Duas instâncias chamando simultaneamente para o mesmo evento
 *   NUNCA processam as duas: o Postgres serializa pela trava de linha,
 *   e só uma vê o WHERE do UPDATE ainda satisfeito depois de pegar o
 *   lock (ver migration 022_atomic_webhook_claim.sql).
 * - Se a atualização final para 'processed' falhar, NÃO respondemos
 *   sucesso ao provedor — melhor deixar reentregar (e o handler
 *   rodar de novo) do que mentir que terminou quando não temos certeza
 *   de que o estado ficou consistente.
 */
export async function withWebhookIdempotency(
  params: WebhookEventParams,
  handler: () => Promise<void>,
): Promise<WebhookOutcome> {
  const service = createServiceClient();

  const { data: claimRows, error: claimError } = await service.rpc('claim_webhook_event', {
    p_provider: params.provider,
    p_provider_event_id: params.eventKey,
    p_event_type: params.eventType,
    p_resource_id: params.resourceId ?? null,
    p_resource_status: params.resourceStatus ?? null,
  });

  if (claimError) {
    console.error('[webhookIdempotency] falha ao reivindicar evento:', claimError);
    return 'failed';
  }

  const claim = (claimRows as ClaimWebhookEventRow[] | null)?.[0];
  if (!claim) {
    console.error('[webhookIdempotency] claim_webhook_event não retornou linha');
    return 'failed';
  }

  if (!claim.claimed) {
    return claim.already_processed ? 'skipped_duplicate' : 'skipped_in_progress';
  }

  const rowId = claim.event_id;

  try {
    await handler();
  } catch (err) {
    console.error(`[webhookIdempotency] falha ao processar ${params.provider}/${params.eventType}:`, err);
    const { error: markFailedError } = await service
      .from('webhook_events')
      .update({
        processing_status: 'failed',
        last_error: String((err as Error)?.message ?? err).slice(0, 500),
      })
      .eq('id', rowId);
    if (markFailedError) {
      console.error('[webhookIdempotency] falha ao marcar evento como failed:', markFailedError);
    }
    return 'failed';
  }

  const { error: markProcessedError } = await service
    .from('webhook_events')
    .update({ processing_status: 'processed', processed_at: new Date().toISOString() })
    .eq('id', rowId);

  if (markProcessedError) {
    // O handler TEVE sucesso, mas não conseguimos gravar que o evento
    // foi processado — não podemos responder 200 ao provedor aqui: ele
    // não reentregaria, e o evento ficaria com processing_status
    // divergente (processing) para sempre. Mais seguro deixar
    // reentregar; se o handler for idempotente (como os nossos são),
    // reprocessar não causa dano.
    console.error('[webhookIdempotency] falha ao marcar evento como processed:', markProcessedError);
    return 'failed';
  }

  return 'processed';
}
