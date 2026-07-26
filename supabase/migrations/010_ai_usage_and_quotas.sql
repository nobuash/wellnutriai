-- =====================================================================
-- WellNutriAI — Log de custo de IA e cotas atômicas de uso
-- =====================================================================

-- 1. LOG DE USO/CUSTO DE IA -------------------------------------------
-- Nunca grava prompts completos, imagens em base64, ou dados de saúde —
-- só metadados de custo (ver src/lib/aiCost.ts).
create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  feature text not null check (feature in ('meal_plan', 'chat', 'photo_analysis', 'photo_analysis_manual')),
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  total_tokens int not null default 0,
  estimated_cost_brl numeric(10,4) not null default 0,
  request_id text,
  status text not null default 'ok' check (status in ('ok', 'error')),
  latency_ms int,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_logs_created on public.ai_usage_logs (created_at);
create index if not exists idx_ai_usage_logs_user on public.ai_usage_logs (user_id, created_at desc);
create index if not exists idx_ai_usage_logs_feature on public.ai_usage_logs (feature, created_at desc);

alter table public.ai_usage_logs enable row level security;
drop policy if exists "ai_usage_logs_service_only" on public.ai_usage_logs;
create policy "ai_usage_logs_service_only" on public.ai_usage_logs using (false);

-- 2. COTAS DE USO COM INCREMENTO ATÔMICO -------------------------------
create table if not exists public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  period_key text not null, -- ex: '2026-07' (mensal) ou '2026-07-25' (diário)
  usage_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, feature, period_key)
);

alter table public.usage_counters enable row level security;
-- Sem policies de select/insert/update para o usuário: toda leitura e
-- escrita passa pela função consume_usage_quota (SECURITY DEFINER).
drop policy if exists "usage_counters_service_only" on public.usage_counters;
create policy "usage_counters_service_only" on public.usage_counters using (false);

-- Incrementa o contador de uso de forma atômica e retorna se a
-- requisição está dentro da cota. p_limit < 0 significa ilimitado.
-- search_path fixo e vazio + nomes totalmente qualificados: evita
-- sequestro de search_path em função SECURITY DEFINER.
create or replace function public.consume_usage_quota(
  p_user_id uuid,
  p_feature text,
  p_period_key text,
  p_limit int
) returns table(allowed boolean, current_count int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if p_limit < 0 then
    insert into public.usage_counters (user_id, feature, period_key, usage_count)
    values (p_user_id, p_feature, p_period_key, 1)
    on conflict (user_id, feature, period_key)
    do update set usage_count = public.usage_counters.usage_count + 1, updated_at = now()
    returning usage_count into v_count;

    return query select true, v_count;
    return;
  end if;

  insert into public.usage_counters (user_id, feature, period_key, usage_count)
  values (p_user_id, p_feature, p_period_key, 0)
  on conflict (user_id, feature, period_key) do nothing;

  update public.usage_counters
  set usage_count = usage_count + 1, updated_at = now()
  where user_id = p_user_id and feature = p_feature and period_key = p_period_key
    and usage_count < p_limit
  returning usage_count into v_count;

  if v_count is null then
    select usage_count into v_count from public.usage_counters
    where user_id = p_user_id and feature = p_feature and period_key = p_period_key;

    return query select false, coalesce(v_count, 0);
  else
    return query select true, v_count;
  end if;
end;
$$;

revoke all on function public.consume_usage_quota(uuid, text, text, int) from public;
grant execute on function public.consume_usage_quota(uuid, text, text, int) to authenticated;
