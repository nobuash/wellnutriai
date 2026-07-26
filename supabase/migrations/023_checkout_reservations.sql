-- =====================================================================
-- WellNutriAI — Impede checkouts Stripe duplicados em concorrência
--
-- PROBLEMA CONFIRMADO: /api/payment/stripe/intent checava
-- findActiveStripeSubscription() e só DEPOIS criava a Checkout Session
-- — entre o check e a criação não havia nenhuma trava. Duas
-- requisições simultâneas (duplo clique, duas abas) podiam passar pelo
-- check ao mesmo tempo (nenhuma assinatura ainda existe no banco) e
-- criar duas Checkout Sessions; se o usuário completasse as duas,
-- resultava em duas assinaturas Stripe reais cobrando ao mesmo tempo.
--
-- Esta tabela dá uma reserva atômica por (user_id, provider) via
-- índice único parcial — só uma linha 'reserved'/'session_created' pode
-- existir por vez. A segunda requisição concorrente esbarra no
-- índice, não cria uma segunda sessão, e reaproveita a sessão já
-- criada pela primeira (ver src/app/api/payment/stripe/intent/route.ts).
-- =====================================================================

create table if not exists public.checkout_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe')),
  plan_interval text not null,
  status text not null default 'reserved'
    check (status in ('reserved', 'session_created', 'completed', 'expired', 'failed')),
  idempotency_key text not null,
  checkout_session_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_checkout_reservations_idempotency_key
  on public.checkout_reservations (idempotency_key);

-- O índice que impede concorrência de verdade: só uma reserva "em
-- andamento" (ainda não completada, expirada ou falha) por usuário e
-- provedor ao mesmo tempo.
create unique index if not exists idx_checkout_reservations_active_per_user
  on public.checkout_reservations (user_id, provider)
  where status in ('reserved', 'session_created');

create index if not exists idx_checkout_reservations_session on public.checkout_reservations (checkout_session_id);

alter table public.checkout_reservations enable row level security;
drop policy if exists "checkout_reservations_service_only" on public.checkout_reservations;
create policy "checkout_reservations_service_only" on public.checkout_reservations using (false);

create or replace function public.set_checkout_reservations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists checkout_reservations_set_updated_at on public.checkout_reservations;
create trigger checkout_reservations_set_updated_at
  before update on public.checkout_reservations
  for each row execute function public.set_checkout_reservations_updated_at();
