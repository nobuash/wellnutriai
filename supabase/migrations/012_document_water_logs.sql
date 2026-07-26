-- =====================================================================
-- WellNutriAI — Documenta a tabela water_logs
--
-- src/app/(app)/hydration/page.tsx já usa esta tabela em produção
-- (id, user_id, amount_ml, logged_at), mas ela não tinha nenhuma
-- migration correspondente no repositório — foi criada manualmente em
-- algum momento fora do fluxo de migrations, o que quebra
-- reprodutibilidade (um ambiente novo criado a partir do zero destas
-- migrations ficaria sem essa tabela). IF NOT EXISTS torna esta
-- migration segura de rodar contra o banco de produção existente.
-- =====================================================================

create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_ml int not null check (amount_ml > 0 and amount_ml < 5000),
  logged_at timestamptz not null default now()
);

create index if not exists idx_water_logs_user
  on public.water_logs (user_id, logged_at desc);

alter table public.water_logs enable row level security;

drop policy if exists "water_logs_select_own" on public.water_logs;
create policy "water_logs_select_own" on public.water_logs
  for select using (auth.uid() = user_id);

drop policy if exists "water_logs_insert_own" on public.water_logs;
create policy "water_logs_insert_own" on public.water_logs
  for insert with check (auth.uid() = user_id);

drop policy if exists "water_logs_delete_own" on public.water_logs;
create policy "water_logs_delete_own" on public.water_logs
  for delete using (auth.uid() = user_id);
