import { createServiceClient } from '@/lib/supabase/service';

const STALE_PROCESSING_MS = 5 * 60 * 1000; // processing travado há mais de 5min = considerado morto

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

/**
 * Processa um evento de webhook com idempotência real:
 * - Reentregas do MESMO evento (mesma eventKey) são deduplicadas.
 * - Uma falha no meio do processamento marca o evento como `failed` em
 *   vez de `processed` — uma reentrega subsequente do provedor (ou um
 *   reprocessamento manual) tenta de novo em vez de ficar preso para
 *   sempre.
 * - A corrida de duas requisições simultâneas com a mesma eventKey é
 *   resolvida pela constraint única (provider, provider_event_id): só
 *   uma delas ganha o INSERT inicial.
 */
export async function withWebhookIdempotency(
  params: WebhookEventParams,
  handler: () => Promise<void>,
): Promise<WebhookOutcome> {
  const service = createServiceClient();

  const { data: inserted, error: insertError } = await service
    .from('webhook_events')
    .insert({
      provider: params.provider,
      provider_event_id: params.eventKey,
      event_type: params.eventType,
      resource_id: params.resourceId ?? null,
      resource_status: params.resourceStatus ?? null,
      processing_status: 'processing',
      processing_started_at: new Date().toISOString(),
      attempts: 1,
    })
    .select('id')
    .single();

  let rowId: string;

  if (insertError || !inserted) {
    // Conflito na constraint única = evento já existe. Decide se pode
    // ser reprocessado ou se é uma duplicata legítima a ignorar.
    const { data: existing } = await service
      .from('webhook_events')
      .select('id, processing_status, processing_started_at, attempts')
      .eq('provider', params.provider)
      .eq('provider_event_id', params.eventKey)
      .maybeSingle();

    if (!existing) {
      // Erro de insert que não foi conflito de chave — algo mais grave.
      console.error('[webhookIdempotency] falha ao registrar evento:', insertError);
      return 'failed';
    }

    if (existing.processing_status === 'processed') {
      return 'skipped_duplicate';
    }

    const startedAt = existing.processing_started_at ? new Date(existing.processing_started_at).getTime() : 0;
    const isStale = Date.now() - startedAt > STALE_PROCESSING_MS;

    if (existing.processing_status === 'processing' && !isStale) {
      // Outra requisição está processando este exato evento agora.
      return 'skipped_in_progress';
    }

    // failed, ou processing travado (instância anterior morreu no meio) — retry.
    rowId = existing.id;
    await service
      .from('webhook_events')
      .update({
        processing_status: 'processing',
        processing_started_at: new Date().toISOString(),
        attempts: (existing.attempts ?? 0) + 1,
      })
      .eq('id', rowId);
  } else {
    rowId = inserted.id;
  }

  try {
    await handler();
    await service
      .from('webhook_events')
      .update({ processing_status: 'processed', processed_at: new Date().toISOString() })
      .eq('id', rowId);
    return 'processed';
  } catch (err) {
    console.error(`[webhookIdempotency] falha ao processar ${params.provider}/${params.eventType}:`, err);
    await service
      .from('webhook_events')
      .update({
        processing_status: 'failed',
        last_error: String((err as Error)?.message ?? err).slice(0, 500),
      })
      .eq('id', rowId);
    return 'failed';
  }
}
