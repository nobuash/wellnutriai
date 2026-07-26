# Resposta a incidentes

Guia mínimo — este projeto não tem plantão formal nem Sentry configurado
ainda (ver `docs/security.md`). Até isso existir, a fonte de erro é o log
da Vercel (Project → Logs / Runtime Logs) e as tabelas abaixo.

## "Usuário pagou e não recebeu PRO"

1. Confirme o pagamento no provedor:
   - Stripe: Dashboard → Payments, busque pelo e-mail/valor.
   - Mercado Pago: Dashboard → Atividade, busque pelo `payment_id`.
2. Se aprovado no provedor, verifique se o webhook chegou:
   ```sql
   select * from processed_webhooks order by processed_at desc limit 20;
   ```
   Se o evento não está lá, o webhook não chegou ou falhou a validação de
   assinatura (ver Runtime Logs da rota `/api/payment/webhook` ou
   `/api/payment/stripe/webhook`).
3. Verifique o estado da assinatura:
   ```sql
   select * from subscriptions where user_id = '<uuid>' order by created_at desc;
   ```
4. Ativação manual de emergência (via SQL Editor, com `service_role`,
   **não** pelo client do usuário — a RLS bloqueia isso de propósito):
   ```sql
   update subscriptions set status = 'active', current_period_end = now() + interval '30 days'
   where id = '<subscription-id>';
   update profiles set plan = 'pro' where id = '<user-id>';
   ```
   Registre o motivo em `audit_log` manualmente também.

## "Usuário cancelou e continua sendo cobrado"

Isso era um bug real corrigido nesta rodada (ver
`docs/production-hardening-audit.md`) — cancelamento não chamava o
provedor. Se acontecer de novo:

1. Confirme no Stripe/MP se a assinatura/preapproval real ainda está
   ativa (o cancelamento no nosso banco pode ter funcionado, mas a
   chamada à API do provedor pode ter falhado — `/api/payment/cancel`
   loga o erro mas retorna 500 nesse caso, então normalmente o usuário já
   teria visto um erro).
2. Cancele manualmente no Dashboard do provedor.
3. Investigue o log da rota `/api/payment/cancel` para o `user_id` em
   questão.

## "Orçamento de IA estourou" (`AI_DAILY_BUDGET_BRL` configurado)

Aparece como `console.error` com `[aiUsage] ALERTA: orçamento diário de
IA estourado` nos logs. Todas as chamadas de IA (chat, planos, análise de
foto) retornam 503 até a virada do dia (horário do servidor).

1. Decida se é uso legítimo (crescimento de usuários) ou abuso
   (ex: um usuário gerando volume anormal — confira
   `select user_id, count(*), sum(estimated_cost_brl) from ai_usage_logs
   where created_at >= current_date group by 1 order by 2 desc limit 10;`).
2. Se for abuso de um usuário específico, considere reduzir a cota dele
   via `usage_counters` ou suspender a conta.
3. Se for crescimento legítimo, suba `AI_DAILY_BUDGET_BRL`.

## "Erro de assinatura inválida em webhook"

Webhook rejeitado com 401 (`Assinatura inválida`) — não deve ser
reprocessado às cegas. Confirme:
- `STRIPE_WEBHOOK_SECRET` / a validação de assinatura do MP
  (`src/lib/mercadopago/webhook.ts`) batem com o endpoint configurado no
  provedor.
- Não é um replay attack (timestamp muito antigo, se aplicável).

## "accepted_terms_at continua NULL para usuários que já aceitaram"

Bug legado, corrigido nesta rodada (ver
`docs/production-hardening-audit.md`) — usuários que aceitaram os termos
**antes** desta correção têm `accepted_terms = true` mas
`accepted_terms_at = NULL` e `terms_version = NULL` para sempre. Isso é
esperado: como o gate agora também checa `terms_version`, esses usuários
serão levados de volta para `/accept-terms` uma vez, e o próximo aceite
já vai gravar corretamente via `/api/accept-terms`. Não é um bug novo, é
a consequência esperada do fix.
