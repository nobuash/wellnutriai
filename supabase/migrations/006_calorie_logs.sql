-- =====================================================================
-- WellNutriAI — Calorie Logs (contador diário de calorias)
-- =====================================================================

create table if not exists public.calorie_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calories int not null check (calories > 0 and calories < 10000),
  description text,
  logged_at timestamptz not null default now()
);

create index if not exists idx_calorie_logs_user
  on public.calorie_logs(user_id, logged_at desc);

alter table public.calorie_logs enable row level security;

create policy "calorie_logs_select_own" on public.calorie_logs
  for select using (auth.uid() = user_id);

create policy "calorie_logs_insert_own" on public.calorie_logs
  for insert with check (auth.uid() = user_id);

create policy "calorie_logs_delete_own" on public.calorie_logs
  for delete using (auth.uid() = user_id);
