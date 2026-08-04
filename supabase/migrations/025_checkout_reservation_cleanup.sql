-- =====================================================================
-- WellNutriAI — Rotina de limpeza de reservas de checkout expiradas
--
-- checkout_reservations (023_checkout_reservations.sql) já se
-- autolimpa de forma preguiçosa: quando alguém esbarra numa reserva
-- expirada (mesmo user_id+provider), a rota marca ela como 'expired'
-- na hora. Isso resolve o caso comum, mas uma reserva 'reserved' cujo
-- usuário nunca mais tentou de novo fica parada pra sempre — não
-- bloqueia ninguém (só aquele mesmo usuário, e só até ele tentar de
-- novo), mas cresce a tabela sem necessidade.
--
-- Esta função varre e expira em lote. NÃO agenda sozinha — precisa de
-- pg_cron (se disponível no plano do Supabase) ou um cron externo
-- (Vercel Cron Job chamando uma rota que invoca isto via service_role)
-- chamando periodicamente. Configuração externa pendente, documentada
-- em docs/production-hardening-round-4.md.
-- =====================================================================

create or replace function public.cleanup_expired_checkout_reservations()
returns int
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.checkout_reservations
    set status = 'expired'
    where status in ('reserved', 'session_created')
      and expires_at < now()
    returning id
  )
  select count(*)::int from expired;
$$;

revoke all on function public.cleanup_expired_checkout_reservations() from authenticated;
revoke all on function public.cleanup_expired_checkout_reservations() from anon;
revoke all on function public.cleanup_expired_checkout_reservations() from public;
grant execute on function public.cleanup_expired_checkout_reservations() to service_role;
