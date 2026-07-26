-- =====================================================================
-- WellNutriAI — Impede duas assinaturas recorrentes ativas por usuário
--
-- A checagem em src/app/api/payment/stripe/intent/route.ts
-- (findActiveStripeSubscription) já impede a criação de uma segunda
-- assinatura Stripe no caminho feliz, mas não protege contra duas
-- requisições simultâneas (duplo clique, aba duplicada) — só um
-- índice único no banco garante isso de verdade.
--
-- Antes de criar o índice, verifica se já existem duplicidades nos
-- dados de produção; se existirem, a migration REGISTRA um aviso e
-- PULA a criação do índice em vez de falhar — permite revisar os
-- dados manualmente antes de aplicar a constraint. Rode de novo depois
-- de resolver as duplicidades (ex: cancelar a assinatura mais antiga).
-- =====================================================================

do $$
declare
  dup_count int;
begin
  select count(*) into dup_count
  from (
    select user_id, provider
    from public.subscriptions
    where status = 'active' and payment_type = 'subscription'
    group by user_id, provider
    having count(*) > 1
  ) dups;

  if dup_count > 0 then
    raise notice 'Existem % usuário(s) com mais de uma assinatura recorrente ativa no mesmo provedor — índice único NÃO criado. Revise manualmente: select user_id, provider, count(*) from public.subscriptions where status = ''active'' and payment_type = ''subscription'' group by user_id, provider having count(*) > 1;', dup_count;
  else
    if not exists (
      select 1 from pg_indexes
      where schemaname = 'public' and indexname = 'idx_subscriptions_one_active_recurring_per_provider'
    ) then
      create unique index idx_subscriptions_one_active_recurring_per_provider
        on public.subscriptions (user_id, provider)
        where status = 'active' and payment_type = 'subscription';
    end if;
  end if;
end $$;
