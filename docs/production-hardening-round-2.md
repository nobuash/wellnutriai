# WellNutriAI — Segundo round de hardening de produção

Commit inicial desta branch: `3a53d06` (merge do PR #1, round 1).
Branch: `fix/production-hardening-round-2`.

Este documento só lista problemas **confirmados lendo o código atual**, não a lista genérica do
prompt de auditoria. Cada item abaixo foi verificado no arquivo indicado antes de ser corrigido.

Legenda: 🔴 crítico · 🟠 alto · 🟡 médio · ⚪ observação/residual.

---

## P0 — confirmados

### 🔴 RPCs `SECURITY DEFINER` aceitam parâmetros de segurança controlados pelo cliente
`consume_usage_quota(p_user_id uuid, p_feature text, p_period_key text, p_limit int)` e
`check_rate_limit(p_key text, p_max int, p_window_seconds int)` (`010_ai_usage_and_quotas.sql`,
`011_distributed_rate_limit.sql`) têm `grant execute ... to authenticated`. Qualquer usuário
autenticado pode chamar `supabase.rpc('consume_usage_quota', {p_user_id: '<outro-uuid>', ...})`
direto do client SDK — nada valida que `p_user_id = auth.uid()`. Isso permite:
- Esgotar a cota mensal de chat/plano/foto de **outro usuário** (negação de serviço direcionada).
- `check_rate_limit` com `p_max` arbitrariamente alto sempre retorna `true` — bypass total do rate
  limit; ou `p_key` adivinhado de outro usuário para "sujar" o contador dele.

Essa é uma falha que o round 1 introduziu ao criar as RPCs sem perceber que "SECURITY DEFINER +
grant to authenticated + parâmetros de identidade vindos do cliente" anula a proteção de RLS que
o restante do sistema depende.

### 🔴 Bypass de consentimento — trigger de proteção não cobre os campos novos
`protect_plan_column` (`005_security_hardening.sql`) só restaura `plan`, `accepted_terms_at` e
`created_at` para conexões não-service_role. Os campos adicionados no round 1 —
`accepted_terms`, `terms_version`, `privacy_version` — **não são protegidos**. Um usuário pode
chamar `supabase.from('profiles').update({accepted_terms: true, terms_version: '1',
privacy_version: '1'})` direto do navegador e passar pelo gate de `/accept-terms` sem nunca ter
aceitado nada de verdade pela rota oficial (`/api/accept-terms`). O round 1 corrigiu o *caminho
legítimo* mas não fechou o *caminho ilegítimo* — mesma classe de bug que o `protect_plan_column`
já existia para resolver, só que para os campos novos.

### 🔴 Ativação de pagamento não é determinística — replay estende validade
`src/app/api/payment/verify/route.ts:50` e `src/app/api/payment/stripe/activate/route.ts:46`
calculam `expiresAt = new Date(); expiresAt.setDate(... + durationDays)` **toda vez que a rota é
chamada**, sem checar se aquele `payment_id`/`session_id` específico já foi processado antes.
Ambas são rotas autenticadas chamáveis pelo próprio usuário livremente:
- `verify` é re-chamada pelo polling automático do modal PIX a cada 5s, e nada impede o usuário de
  continuar chamando manualmente depois — cada chamada empurra `current_period_end` para
  `agora + duração`, de novo.
- `stripe/activate` usa um `session_id` que a Stripe mantém válido/recuperável indefinidamente
  depois de completo — repetir a chamada com o mesmo `session_id` estende a assinatura mais 30/90/365
  dias a cada vez, de graça.

`src/app/api/payment/webhook/route.ts` (tipo `payment`) tem a mesma computação por `now()`, mas ao
menos está atrás do dedup de `processed_webhooks` — não é replay-explorável do jeito que as duas
rotas acima são, ainda que a keying do dedup tenha seu próprio problema (ver abaixo).

### 🔴 Idempotência de webhook marca "processado" antes de concluir, e a chave bloqueia transições de status
`src/app/api/payment/webhook/route.ts`: `INSERT INTO processed_webhooks (id) VALUES (eventKey)`
acontece **antes** de qualquer efeito real (buscar pagamento, atualizar assinatura). Se o processo
falhar depois do insert e antes de terminar, o evento fica marcado como processado para sempre e
nunca mais é reprocessado.

Pior: a chave é `mp_${type}_${dataId}`, onde `dataId` é o id do **recurso** (o pagamento), não do
evento. O Mercado Pago dispara uma notificação nova a cada mudança de status do mesmo recurso
(`pending` → `approved`). A segunda notificação gera a **mesma chave** da primeira, colide no
`INSERT`, e é descartada como "duplicada" — mesmo sendo uma transição de status real que precisa
ser processada.

### 🟠 `getUserEntitlement` só olha a assinatura mais recente por `created_at`
`src/lib/entitlement.ts:53-59`: `.order('created_at', {ascending:false}).limit(1)`. Se um
assinante Stripe ativo (assinatura criada há 2 meses) gerar um PIX pendente hoje (linha nova, mais
recente), o entitlement passa a olhar só a linha do PIX pendente e reporta o usuário como não-PRO
— mesmo com a assinatura Stripe legitimamente ativa por trás. `downgradeExpiredSubscription`
também zera `profiles.plan` incondicionalmente, sem checar se existe outra assinatura ativa.

### 🟠 Nada impede duas assinaturas Stripe recorrentes para o mesmo usuário
`src/app/api/payment/stripe/intent/route.ts` cria uma `checkout.session` nova sem checar se o
usuário já tem uma assinatura Stripe ativa. Duplo clique, ou o usuário simplesmente assinando de
novo por engano, gera uma segunda cobrança recorrente independente.

### 🟠 RLS permite ao usuário escrever diretamente em tabelas geradas pelo servidor
As policies genéricas de `001_initial_schema.sql` (`insert/update/delete own`) continuam ativas em
`meal_plans`, `chat_messages` e `meal_photo_analysis` — só `subscriptions` foi travada no round 1.
Um usuário pode inserir uma linha em `chat_messages` com `role: 'ai'` (mensagem forjada da IA, que
depois entra como contexto de conversas futuras — vetor de prompt injection armazenada), ou
inserir um `meal_plans` fabricado. `nutrition_questionnaires` também é inserido direto pelo client
(`src/app/(app)/questionnaire/page.tsx:89`), sem nenhuma rota de servidor — a única barreira real
são os `CHECK` constraints do banco.

### 🟠 Exclusão de conta apaga o usuário mesmo se o cancelamento Stripe falhar
`src/app/api/account/delete/route.ts`: o cancelamento da assinatura Stripe está num `try/catch` que
só loga o erro e **continua** — a conta é apagada de qualquer forma. Também só olha a assinatura
mais recente (`.limit(1)`), então se o usuário tiver uma assinatura Stripe ativa mais antiga que
outra linha mais recente no banco, ela nunca é cancelada e a Stripe continua cobrando um cliente
que não existe mais. A listagem do Storage (`.list(user.id, {limit:1000})`) não pagina além de
1000 arquivos nem checa o `error` retornado — uma falha de listagem é tratada como "não há nada
para apagar".

---

## Status de execução

Ver seção final deste documento (atualizada ao final do trabalho) e commits desta branch.
