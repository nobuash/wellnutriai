-- =====================================================================
-- WellNutriAI — Torna o claim de webhook_events atômico
--
-- PROBLEMA CONFIRMADO em src/lib/webhookIdempotency.ts: o caminho de
-- retry (evento já existe, precisa reprocessar porque está 'failed' ou
-- 'processing' travado) fazia SELECT pra checar o estado e depois
-- UPDATE separado pra reivindicar — duas operações distintas, não
-- atômicas. Duas instâncias podiam ler o mesmo estado 'failed' antes
-- de qualquer uma delas escrever 'processing', e as duas processavam o
-- mesmo evento simultaneamente (ex: duas ativações de pagamento
-- concorrentes para o mesmo evento).
--
-- Esta função resolve tudo em uma única chamada: tenta inserir (typo
-- de evento nunca visto) e, se já existir, tenta reivindicar via um
-- único UPDATE...WHERE...RETURNING. Um UPDATE é atômico por natureza —
-- mesmo com duas chamadas concorrentes, o Postgres serializa pela
-- trava de linha: a segunda só reavalia o WHERE depois que a primeira
-- comita, e a essa altura o processing_status já mudou, então o WHERE
-- não bate mais pra ela.
-- =====================================================================

create or replace function public.claim_webhook_event(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_resource_id text,
  p_resource_status text,
  p_stale_after_seconds int default 300
)
returns table (event_id uuid, claimed boolean, already_processed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_status text;
begin
  -- Primeira vez que vemos este evento — INSERT direto já reivindica.
  insert into public.webhook_events (
    provider, provider_event_id, event_type, resource_id, resource_status,
    processing_status, processing_started_at, attempts
  ) values (
    p_provider, p_provider_event_id, p_event_type, p_resource_id, p_resource_status,
    'processing', now(), 1
  )
  on conflict (provider, provider_event_id) do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, true, false;
    return;
  end if;

  -- Já existia — tenta reivindicar atomicamente. Só reivindica se
  -- 'failed', 'received' (nunca chegou a processar, caso raro), ou
  -- 'processing' travado há mais de p_stale_after_seconds.
  update public.webhook_events
  set
    processing_status = 'processing',
    processing_started_at = now(),
    attempts = webhook_events.attempts + 1,
    last_error = null
  where provider = p_provider
    and provider_event_id = p_provider_event_id
    and (
      processing_status in ('failed', 'received')
      or (processing_status = 'processing' and processing_started_at < now() - make_interval(secs => p_stale_after_seconds))
    )
  returning id into v_id;

  if v_id is not null then
    return query select v_id, true, false;
    return;
  end if;

  -- Não conseguiu reivindicar: já 'processed' (duplicata legítima) ou
  -- outra instância processando agora (não travado).
  select webhook_events.id, webhook_events.processing_status
  into v_id, v_status
  from public.webhook_events
  where provider = p_provider and provider_event_id = p_provider_event_id;

  return query select v_id, false, (v_status = 'processed');
end;
$$;

revoke all on function public.claim_webhook_event(text, text, text, text, text, int) from authenticated;
revoke all on function public.claim_webhook_event(text, text, text, text, text, int) from anon;
revoke all on function public.claim_webhook_event(text, text, text, text, text, int) from public;
grant execute on function public.claim_webhook_event(text, text, text, text, text, int) to service_role;
