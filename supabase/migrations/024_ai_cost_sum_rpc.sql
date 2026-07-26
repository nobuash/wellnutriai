-- =====================================================================
-- WellNutriAI — Soma custo de IA no Postgres, não no Node
--
-- PROBLEMA CONFIRMADO em checkDailyAiBudget()/checkUserMonthlyBudget()
-- (src/lib/aiUsage.ts): buscavam TODAS as linhas de ai_usage_logs do
-- período com .select('estimated_cost_brl') e somavam no Node. Sem
-- paginação, isso trunca silenciosamente no limite padrão de linhas do
-- PostgREST (1000) em dias de uso alto — o circuit breaker de
-- orçamento passa a ver um gasto MENOR do que o real, exatamente
-- quando mais precisaria estar certo.
--
-- Esta função soma no próprio banco (sem trazer linha nenhuma pro
-- Node), então nunca trunca.
-- =====================================================================

create or replace function public.sum_ai_cost_brl(
  p_since timestamptz,
  p_user_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(estimated_cost_brl), 0)
  from public.ai_usage_logs
  where created_at >= p_since
    and (p_user_id is null or user_id = p_user_id);
$$;

revoke all on function public.sum_ai_cost_brl(timestamptz, uuid) from authenticated;
revoke all on function public.sum_ai_cost_brl(timestamptz, uuid) from anon;
revoke all on function public.sum_ai_cost_brl(timestamptz, uuid) from public;
grant execute on function public.sum_ai_cost_brl(timestamptz, uuid) to service_role;
