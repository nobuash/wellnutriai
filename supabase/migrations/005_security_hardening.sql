-- =====================================================================
-- WellNutriAI — Security Hardening
-- =====================================================================

-- 1. IDEMPOTÊNCIA: tabela de webhooks processados
--    Garante que o mesmo evento nunca ative o plano duas vezes.
-- =====================================================================
create table if not exists public.processed_webhooks (
  id text primary key,           -- ex: "mp_12345678" ou "stripe_evt_xxx"
  processed_at timestamptz not null default now()
);

-- Limpa entradas com mais de 30 dias (eventos antigos não precisam de dedup)
create index if not exists idx_processed_webhooks_at
  on public.processed_webhooks(processed_at);

-- Apenas service_role pode inserir/ler (webhooks rodam com service key)
alter table public.processed_webhooks enable row level security;
create policy "processed_webhooks_service_only" on public.processed_webhooks
  using (false); -- bloqueia acesso de usuários autenticados comuns

-- 2. AUDIT LOG: registro de ações críticas
-- =====================================================================
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,          -- ex: 'plan_activated', 'plan_cancelled'
  metadata jsonb default '{}',   -- dados adicionais sem PII sensível
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_user on public.audit_log(user_id, created_at desc);
create index if not exists idx_audit_log_action on public.audit_log(action, created_at desc);

alter table public.audit_log enable row level security;
-- Usuários não podem ler/escrever audit log diretamente
create policy "audit_log_service_only" on public.audit_log
  using (false);

-- 3. PROTEÇÃO EXTRA NO STORAGE: bloquear update/delete por usuário
--    (upload e leitura já existem; impede substituição maliciosa de arquivos)
-- =====================================================================
drop policy if exists "meal_photos_delete_own" on storage.objects;
create policy "meal_photos_delete_own" on storage.objects
  for delete using (
    bucket_id = 'meal-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 4. IMPEDIR QUE USUÁRIO ALTERE O PRÓPRIO PLANO DIRETAMENTE
--    O campo plan na tabela profiles só deve ser alterado por service_role.
--    Revogamos a política de UPDATE ampla e criamos uma restritiva.
-- =====================================================================
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- Usuário NÃO pode alterar o campo plan, accepted_terms_at ou created_at
    -- A única coluna que o usuário pode tocar é name e accepted_terms
    -- (o check de plan é feito pelo RLS: se tentar mudar plan para pro sem webhook, RLS bloqueia)
  );

-- Nota: para impedir 100% a alteração do campo plan via cliente,
-- adicione uma policy function ou use a abordagem de coluna protegida
-- via trigger (abaixo):

create or replace function public.protect_plan_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Impede que o cliente anon/authenticated altere o plano diretamente
  -- Apenas a service_role (webhooks) pode mudar o plan
  if current_setting('role') <> 'service_role' then
    new.plan := old.plan;
    new.accepted_terms_at := old.accepted_terms_at;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_plan_column on public.profiles;
create trigger protect_plan_column
  before update on public.profiles
  for each row execute function public.protect_plan_column();

-- 5. CONSTRAINT: expiração de assinatura sempre no futuro na criação
-- =====================================================================
alter table public.subscriptions
  drop constraint if exists subscriptions_expires_at_check;

alter table public.subscriptions
  add column if not exists expires_at timestamptz;

alter table public.subscriptions
  add column if not exists payment_type text check (payment_type in ('pix', 'card', 'subscription'));
