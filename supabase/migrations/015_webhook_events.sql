-- =====================================================================
-- WellNutriAI — Reconstrói a idempotência de webhooks
--
-- PROBLEMAS CONFIRMADOS em processed_webhooks (005_security_hardening.sql):
-- 1) O INSERT que marca o evento como "processado" acontecia ANTES de
--    qualquer efeito real (buscar pagamento, atualizar assinatura). Se
--    o processo falhasse depois do insert, o evento nunca mais era
--    reprocessado — ficava marcado como concluído para sempre.
-- 2) A chave do Mercado Pago era `mp_${type}_${dataId}`, onde dataId é
--    o id do RECURSO (o pagamento), não do evento. O MP dispara uma
--    notificação nova a cada mudança de status do mesmo recurso
--    (pending -> approved); a segunda notificação gerava a MESMA
--    chave da primeira e era descartada como duplicata — mesmo sendo
--    uma transição de status real.
--
-- Esta tabela substitui processed_webhooks nos dois webhooks (MP e
-- Stripe) — ver src/lib/webhookIdempotency.ts. processed_webhooks
-- continua existindo (não foi removida) mas não é mais escrita por
-- eles; pode ser removida em uma migration futura depois de confirmar
-- que nada mais depende dela.
-- =====================================================================

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'mercadopago')),
  -- Stripe: sempre o event.id real (evt_xxx), estável entre reentregas.
  -- Mercado Pago: o id da notificação quando disponível, ou uma chave
  -- composta de recurso+status quando não (ver webhookIdempotency.ts) —
  -- isso garante que uma transição real de status (pending->approved)
  -- gera uma chave diferente da notificação anterior, em vez de colidir.
  provider_event_id text not null,
  event_type text not null,
  resource_id text,
  resource_status text,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processing', 'processed', 'failed')),
  attempts int not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_webhook_events_dedup
  on public.webhook_events (provider, provider_event_id);

create index if not exists idx_webhook_events_status on public.webhook_events (processing_status);
create index if not exists idx_webhook_events_resource on public.webhook_events (resource_id);

alter table public.webhook_events enable row level security;
drop policy if exists "webhook_events_service_only" on public.webhook_events;
create policy "webhook_events_service_only" on public.webhook_events using (false);

create or replace function public.set_webhook_events_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists webhook_events_set_updated_at on public.webhook_events;
create trigger webhook_events_set_updated_at
  before update on public.webhook_events
  for each row execute function public.set_webhook_events_updated_at();
