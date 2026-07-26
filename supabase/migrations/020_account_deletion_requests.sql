-- =====================================================================
-- WellNutriAI — Rastreamento de solicitações de exclusão de conta
--
-- PROBLEMA CONFIRMADO: /api/account/delete cancelava a assinatura
-- Stripe dentro de um try/catch que só logava o erro e seguia em
-- frente — a conta era apagada mesmo se o cancelamento falhasse,
-- deixando a Stripe cobrando um cliente que não existe mais. Também só
-- olhava a assinatura mais recente (.limit(1)), então uma segunda
-- assinatura ativa mais antiga nunca era cancelada.
--
-- Esta tabela dá um estado rastreável e retomável ao processo — se o
-- cancelamento no provedor falhar, a exclusão para e fica registrada
-- como pending/failed em vez de silenciosamente apagar tudo mesmo
-- assim.
-- =====================================================================

-- user_id usa ON DELETE SET NULL (não CASCADE) de propósito: o próprio
-- sucesso da exclusão apaga o usuário de auth.users, e um CASCADE
-- apagaria esta linha antes de conseguirmos marcá-la como "completed"
-- — o registro sobrevive anonimizado, mesmo padrão de audit_log.
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'canceling_subscriptions', 'deleting_storage', 'deleting_data', 'completed', 'failed')),
  attempts int not null default 0,
  last_error text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_account_deletion_requests_user on public.account_deletion_requests (user_id, requested_at desc);
create index if not exists idx_account_deletion_requests_status on public.account_deletion_requests (status);

alter table public.account_deletion_requests enable row level security;
drop policy if exists "account_deletion_requests_service_only" on public.account_deletion_requests;
create policy "account_deletion_requests_service_only" on public.account_deletion_requests using (false);
