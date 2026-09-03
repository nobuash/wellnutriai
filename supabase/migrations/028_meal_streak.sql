-- =====================================================================
-- WellNutriAI — Streak diário de registro de refeição ("foguinho")
--
-- Acende quando o usuário registra pelo menos uma refeição
-- (calorie_logs) no dia. calorie_logs é inserida tanto direto do
-- client (RLS calorie_logs_insert_own) quanto via
-- addCalorieLog()/photo-analysis — um trigger AFTER INSERT cobre os
-- dois caminhos sem precisar duplicar a lógica em cada call site.
--
-- "Dia" é calculado no fuso America/Sao_Paulo (produto 100%
-- pt-BR/BRL) — evita o streak virar 3h antes/depois da meia-noite
-- local por causa de UTC. O cálculo do lado do cliente (ver
-- src/lib/streak.ts) usa o mesmo fuso, de propósito.
-- =====================================================================

alter table public.profiles
  add column if not exists current_streak_days int not null default 0,
  add column if not exists longest_streak_days int not null default 0,
  add column if not exists last_meal_logged_date date;

create or replace function public.update_meal_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  log_date date := (new.logged_at at time zone 'America/Sao_Paulo')::date;
  prev_date date;
  prev_streak int;
  new_streak int;
begin
  select last_meal_logged_date, current_streak_days
    into prev_date, prev_streak
    from public.profiles
    where id = new.user_id
    for update;

  if prev_date = log_date then
    -- segunda (ou mais) refeição do mesmo dia — streak já contabilizado
    return new;
  elsif prev_date = log_date - 1 then
    new_streak := coalesce(prev_streak, 0) + 1;
  else
    -- primeiro registro de todos, ou lacuna de 1+ dia sem registrar
    new_streak := 1;
  end if;

  update public.profiles
    set current_streak_days = new_streak,
        longest_streak_days = greatest(longest_streak_days, new_streak),
        last_meal_logged_date = log_date
    where id = new.user_id;

  return new;
end;
$$;

-- Função de trigger, não uma RPC pra chamar do client — não recebe
-- parâmetro nenhum (só age sobre NEW), então não há vetor de
-- "p_user_id de outra pessoa" como no incidente de
-- 013_lock_down_security_definer_rpcs.sql. Revoga mesmo assim por
-- higiene: nenhuma role deveria conseguir chamar isso fora de um
-- trigger (e triggers disparam independente de grant de EXECUTE —
-- isso não quebra o disparo automático no INSERT).
revoke all on function public.update_meal_streak() from authenticated;
revoke all on function public.update_meal_streak() from anon;
revoke all on function public.update_meal_streak() from public;

drop trigger if exists trg_update_meal_streak on public.calorie_logs;
create trigger trg_update_meal_streak
  after insert on public.calorie_logs
  for each row execute function public.update_meal_streak();
