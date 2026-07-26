# Fluxos de pagamento

Duas famílias de pagamento coexistem, com semânticas diferentes. Não trate
como equivalentes.

## Mercado Pago — PIX e cartão avulso (não recorrente)

`POST /api/payment/pix` e `POST /api/payment/card` criam um **pagamento
único** via Mercado Pago (`Payment.create`). Não há assinatura recorrente
real por trás disso hoje — `getPreApproval().create(...)` nunca é chamado em
lugar nenhum do código.

Fluxo:
1. Cliente escolhe um intervalo (mensal/trimestral/anual) — isso só define
   `amount` e `durationDays` (`src/lib/mercadopago/client.ts`), não cria
   cobrança recorrente de verdade.
2. Pagamento aprovado → `subscriptions` recebe `status: 'active'`,
   `current_period_end = now() + durationDays`.
3. Quando `current_period_end` passa, `getUserEntitlement()`
   (`src/lib/entitlement.ts`) detecta e rebaixa automaticamente na próxima
   leitura — não existe cobrança futura para cancelar.
4. Por isso `/api/payment/cancel` **não mostra botão de cancelar** para esse
   tipo de pagamento — mostra a data de expiração e explica que não há
   renovação automática.

O webhook (`/api/payment/webhook`) também tem um branch para `type ===
'preapproval'`, pronto para o dia em que uma assinatura recorrente real do
MP for implementada — mas hoje é código morto (nunca disparado).

## Stripe — assinatura recorrente real

`POST /api/payment/stripe/intent` cria uma `checkout.session` com
`mode: 'subscription'`. Isso é uma assinatura de verdade: a Stripe cobra o
cartão automaticamente a cada período até ser cancelada.

Fluxo:
1. `stripe/activate` (chamado pelo frontend após o checkout embutido
   fechar) e o webhook `invoice.payment_succeeded` ativam/renovam o PRO.
2. Cancelamento (`POST /api/payment/cancel`) chama
   `stripe.subscriptions.update(id, { cancel_at_period_end: true })` — a
   Stripe não cobra de novo, mas o acesso PRO continua até o fim do período
   já pago. O rebaixamento definitivo (`profiles.plan = 'free'`) só acontece
   quando a Stripe manda `customer.subscription.deleted`.
3. `invoice.payment_failed` marca `status: 'payment_failed'` no banco.

**Antes desta rodada de correções, o cancelamento nunca chamava a Stripe —
só atualizava o Supabase.** Um usuário Stripe que "cancelava" no app
continuava sendo cobrado pela Stripe indefinidamente, sem acesso PRO. Ver
`docs/production-hardening-audit.md`.

## Fonte da verdade do acesso PRO

Nenhuma rota decide PRO checando `profiles.plan` diretamente.
`getUserEntitlement(supabase, userId)` (`src/lib/entitlement.ts`) é a única
fonte: lê a assinatura mais recente, confirma `status === 'active'` **e**
`current_period_end` no futuro, e se encontrar uma assinatura "active" já
vencida, rebaixa sozinha (self-healing) via service role. `profiles.plan`
continua existindo só como cache visual — pode ficar desatualizado por
alguns segundos/minutos até a próxima chamada de uma rota protegida, mas
nunca é a autoridade de acesso.

## Idempotência de webhooks

`processed_webhooks` (chave primária = `mp_{type}_{dataId}` ou
`stripe_{event.id}`) — o insert falha em conflito de PK, o handler trata
isso como "já processado" e retorna `200 ok` sem reprocessar. Isso já
existia antes desta auditoria e estava correto.

## RLS de `subscriptions`

Desde `007_normalize_subscriptions.sql`, usuários autenticados só podem
**ler** a própria assinatura — toda escrita precisa vir de uma rota de
servidor usando `createServiceClient()`
(`src/lib/supabase/service.ts`). Antes disso, a policy genérica de
`001_initial_schema.sql` permitia update livre de qualquer coluna,
incluindo `status` e `current_period_end` — ou seja, dava para um usuário
conceder PRO para si mesmo chamando o client SDK diretamente do navegador.

## O que NÃO está implementado

- Cancelamento de assinatura recorrente real do Mercado Pago
  (`preapproval`) está codificado em `/api/payment/cancel` mas nunca foi
  exercitado de verdade, porque nenhum fluxo do produto cria uma
  preapproval hoje.
- Retentativa automática de cobrança Stripe além do que a própria Stripe
  já faz (dunning) não foi configurada — configure em Stripe Dashboard →
  Billing → Retries se ainda não estiver.
- `NEXT_PUBLIC_MP_PUBLIC_KEY` é usado no client MP; confirme que os valores
  em produção (não os de TEST) estão nas envs do Vercel.
