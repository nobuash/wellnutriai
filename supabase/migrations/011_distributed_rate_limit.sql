-- =====================================================================
-- WellNutriAI — Rate limit distribuído (funciona entre instâncias Vercel)
--
-- src/lib/ratelimit.ts (Map em memória por instância) não é suficiente
-- em produção com múltiplas instâncias serverless — cada uma tem seu
-- próprio contador. Esta função dá um limitador atômico compartilhado
-- via Postgres, sem depender de um serviço novo (Redis/Upstash).
-- Janela fixa por simplicidade — suficiente para o estágio atual do
-- produto (não é preciso sliding window para bloquear abuso).
-- =====================================================================

create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

create index if not exists idx_rate_limits_window on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
drop policy if exists "rate_limits_service_only" on public.rate_limits;
create policy "rate_limits_service_only" on public.rate_limits using (false);

create or replace function public.check_rate_limit(
  p_key text,
  p_max int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public;
grant execute on function public.check_rate_limit(text, int, int) to authenticated;

-- Não há limpeza automática das janelas antigas nesta migration — a
-- tabela é pequena para o volume atual de tráfego, mas se crescer,
-- agende (pg_cron ou job externo):
--   delete from public.rate_limits where window_start < now() - interval '7 days';
