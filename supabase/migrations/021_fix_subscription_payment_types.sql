-- =====================================================================
-- WellNutriAI — Corrige a taxonomia de payment_type
--
-- PROBLEMA CONFIRMADO: activateStripeSubscription() gravava
-- payment_type='card' para TODA assinatura Stripe, mesmo sendo sempre
-- criada com mode='subscription' (recorrente). Mas cancelamento
-- (src/app/api/payment/cancel/route.ts) e exclusão de conta
-- (src/app/api/account/delete/route.ts) buscam especificamente
-- payment_type='subscription' para encontrar o que cancelar. O índice
-- único de 016_subscription_integrity.sql (que impede duas assinaturas
-- recorrentes ativas) também filtra por payment_type='subscription' —
-- nunca pegava duplicidade Stripe por causa deste bug.
--
-- Consequência real: nenhum assinante Stripe conseguia cancelar pela
-- UI (a rota respondia "este pagamento não tem renovação automática",
-- mensagem errada), e excluir a conta apagava o usuário SEM cancelar a
-- assinatura Stripe ativa — cobrança continuava rodando para uma conta
-- que não existe mais.
--
-- Nova taxonomia (ver src/lib/subscriptionTypes.ts):
--   'subscription'  -> Stripe mode=subscription OU preapproval do MP
--   'one_time_card' -> cartão avulso do MP (nunca foi Stripe)
--   'pix'           -> PIX do MP
--
-- Esta migration corrige DADOS já gravados, identificando assinaturas
-- Stripe recorrentes pelo próprio formato do ID do provedor (todo
-- Subscription real da Stripe tem id começando com "sub_" — um
-- PaymentIntent teria "pi_", um Charge teria "ch_" — então esse prefixo
-- é um sinal confiável e independente de payment_type). Não mexe em
-- nenhuma linha do Mercado Pago além de renomear 'card' -> 'one_time_card'
-- para deixar o valor autoexplicativo.
-- =====================================================================

-- Relatório de quantas linhas serão afetadas antes de tocar em dado
-- nenhum — fica no log da migration para auditoria.
do $$
declare
  stripe_mislabeled int;
  mp_card_count int;
begin
  select count(*) into stripe_mislabeled
  from public.subscriptions
  where provider = 'stripe'
    and provider_subscription_id like 'sub\_%' escape '\'
    and payment_type is distinct from 'subscription';

  select count(*) into mp_card_count
  from public.subscriptions
  where provider = 'mercadopago' and payment_type = 'card';

  raise notice 'payment_type fix: % linha(s) Stripe com provider_subscription_id sub_* serão corrigidas para subscription; % linha(s) do Mercado Pago com payment_type=card serão renomeadas para one_time_card.',
    stripe_mislabeled, mp_card_count;
end $$;

-- Stripe: só corrige quando o próprio ID do provedor confirma que é
-- uma Subscription real (sub_*) — nunca assume por outro critério.
update public.subscriptions
set payment_type = 'subscription'
where provider = 'stripe'
  and provider_subscription_id like 'sub\_%' escape '\'
  and payment_type is distinct from 'subscription';

-- Mercado Pago: cartão avulso ganha um nome que não colide
-- semanticamente com assinatura recorrente. Não toca em payment_type
-- que já é 'subscription' (preapproval) nem em 'pix'.
update public.subscriptions
set payment_type = 'one_time_card'
where provider = 'mercadopago'
  and payment_type = 'card';

-- Qualquer linha Stripe que NÃO bata com sub_* mas tampouco tenha um
-- payment_type reconhecível fica para revisão manual — não tentamos
-- adivinhar. Reporta via NOTICE, não falha a migration.
do $$
declare
  ambiguous_count int;
begin
  select count(*) into ambiguous_count
  from public.subscriptions
  where provider = 'stripe'
    and provider_subscription_id is not null
    and provider_subscription_id not like 'sub\_%' escape '\'
    and payment_type = 'subscription';

  if ambiguous_count > 0 then
    raise notice 'ATENÇÃO: % linha(s) Stripe com payment_type=subscription mas provider_subscription_id que não começa com sub_ — revise manualmente: select id, user_id, provider_subscription_id, status from public.subscriptions where provider=''stripe'' and payment_type=''subscription'' and provider_subscription_id not like ''sub\_%%'' escape ''\'';',
      ambiguous_count;
  end if;
end $$;
