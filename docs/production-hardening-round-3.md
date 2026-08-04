# Terceira rodada de hardening de produção — WellNutriAI

Branch: `fix/production-hardening-round-3`
Commit inicial: `d928cef` (main, ponta antes deste round)
Rounds anteriores: `docs/production-hardening-audit.md` (round 1), `docs/production-hardening-round-2.md` (round 2)

## Metodologia

Cada problema listado na missão foi **confirmado lendo o código real da
`main`** antes de qualquer correção — nenhum foi corrigido só porque a
missão afirmava que existia. A seção "O que foi confirmado" abaixo lista
exatamente onde e como cada um foi verificado. Em um caso (`ui_mode`), a
verificação mostrou que a alegação da missão estava **errada** — ver
nota específica.

## Baseline (antes de qualquer mudança)

- `npm ci`: ok.
- `npm audit`: 36 vulnerabilidades (0 crítica, 27 alta, 7 moderada, 2
  baixa). `npm audit fix` (sem breaking changes) resolveu 7 delas
  (nodemailer, ws) → 29 restantes. As demais (postcss, serialize-javascript,
  uuid) exigem major bump de `next`, `@ducanh2912/next-pwa` ou
  `mercadopago` — não aplicado neste round (ver seção "Não implementado").
- `npm run type-check`: ok.
- `npm run lint`: ok.
- `npm run test`: 46/46 passando.
- `npm run build`: ok.

## O que foi confirmado (com evidência) e corrigido

### P0 — `payment_type` gravado errado para assinaturas Stripe

**Confirmado** em `src/lib/stripe/activateSubscription.ts`: toda
assinatura Stripe (sempre criada com `mode: 'subscription'`) era
gravada com `payment_type: 'card'`. `src/app/api/payment/cancel/route.ts`
e `src/app/api/account/delete/route.ts` buscam especificamente
`payment_type = 'subscription'` para achar o que cancelar.

**Consequência real confirmada**: nenhum assinante Stripe conseguia
cancelar pela UI (a rota respondia "este pagamento não tem renovação
automática", mensagem enganosa); excluir a conta apagava o usuário
**sem cancelar a assinatura Stripe ativa**, deixando a cobrança
correndo para uma conta que não existe mais. Também descoberto de
brinde: `src/app/(app)/dashboard/page.tsx` usa a mesma checagem para
mostrar o badge "renovação automática" — nunca aparecia para
assinantes Stripe.

**Corrigido**: nova taxonomia em `src/lib/subscriptionTypes.ts`
(`subscription`/`one_time_card`/`pix`), `isRecurringSubscriptionRow()`
como defesa em profundidade (reconhece Stripe pelo prefixo `sub_` do
`provider_subscription_id`, independente de `payment_type`). Migration
`021_fix_subscription_payment_types.sql` corrige dados já gravados.
Cancelamento e exclusão de conta reescritos para usar a defesa em
profundidade em vez de confiar cegamente em `payment_type`.

### P0 — `ui_mode` inválido no Checkout embutido — MISSÃO ESTAVA ERRADA AQUI

A missão afirmava que `ui_mode: 'embedded_page' as any` era inválido e
devia virar `'embedded'`. **Testei contra o SDK realmente instalado**
(`stripe@22.0.2`, API version atual): `SessionCreateParams.UiMode` é
literalmente `'elements' | 'embedded_page' | 'form' | 'hosted_page'`
neste SDK — `'embedded'` **não compila**, `'embedded_page'` compila
limpo. A nomenclatura pública mais antiga (`hosted`/`embedded`/`custom`)
não é o que este SDK/API version usa.

**Correção real aplicada**: mantido `'embedded_page'` (já estava
certo), removido só o `as any` (que não escondia nada de verdade, mas
tirava a proteção do type-check à toa).

### P0 — Nenhuma escrita crítica checava erro do Supabase

**Confirmado** em `activateStripeSubscription`, `activateMpPayment`,
ambos webhooks, `recalculateVisualPlanCache`, `cancel/route.ts`,
`account/delete/route.ts`, `pix/route.ts`, `card/route.ts`: todas
faziam `.upsert()`/`.update()` sem desestruturar `error`. Uma falha
silenciosa de gravação faria o webhook ser marcado como `processed`
mesmo sem o pagamento ter sido refletido no banco.

**Corrigido**: `src/lib/supabaseErrors.ts` (`requireSupabaseSuccess`),
aplicado em todas as escritas listadas acima.

### P0 — Claim de webhook não era atômico no caminho de retry

**Confirmado** em `src/lib/webhookIdempotency.ts`: a primeira entrega
de um evento era atômica (INSERT com constraint única), mas o retry
(evento já existe, `failed` ou `processing` travado) fazia SELECT
seguido de UPDATE — duas operações distintas, não atômicas.

**Corrigido**: RPC `claim_webhook_event` (migration
`022_atomic_webhook_claim.sql`) resolve tudo em um único
UPDATE...WHERE...RETURNING, atômico pela trava de linha do Postgres.
`withWebhookIdempotency` reescrito para usar a RPC e checar erro na
transição final para `processed`.

### P0 — Fallback não-determinístico no Mercado Pago

**Confirmado** em `evaluateMpPayment` (`src/lib/mercadopago/activatePayment.ts`):
`payment.date_approved ? new Date(...) : new Date()` — sem
`date_approved`, caía em `new Date()`, reabrindo o replay que este
código existe para fechar.

**Corrigido**: novo resultado `missing_approval_date` — nunca ativa
sem timestamp confiável, registra em `audit_log` para revisão manual.
11 testes cobrindo determinismo, incluindo os 2 novos casos.

### P0 — Checkouts Stripe duplicados em concorrência

**Confirmado** em `src/app/api/payment/stripe/intent/route.ts`: check
de assinatura ativa e criação da Checkout Session eram duas operações
sem trava entre elas — duplo clique/duas abas podiam criar duas
sessões.

**Corrigido**: `checkout_reservations` (migration
`023_checkout_reservations.sql`) com índice único parcial em
`(user_id, provider)` para reservas em andamento. Segunda requisição
concorrente esbarra no índice e recebe a MESMA sessão já criada pela
primeira. Criação da sessão também usa idempotency key da própria
Stripe.

### P0 — Cancelamento não tinha defesa em profundidade + exclusão de conta com dois bugs

**Confirmado**: mesma causa raiz do `payment_type` acima, mais um bug
**novo e distinto** na paginação do Storage em `account/delete/route.ts`:
o `offset` avançava a cada página **removida**. Como `list()` reflete
o estado atual do bucket, remover os primeiros 1000 arquivos faz os
itens 1000-1999 descerem para as posições 0-999 — pedir `offset=1000`
na volta seguinte pula exatamente esse lote, nunca apagado.

**Corrigido**: sempre lista a partir de `offset: 0` (itens já removidos
somem da listagem). Falha de Storage agora **bloqueia** a exclusão
(antes só logava) — mesmo tratamento que falha de cancelamento Stripe,
para não deixar fotos órfãs enquanto a conta "some".

### P0 — Consentimento não exigido para novas compras

**Confirmado**: nenhuma das 4 rotas que iniciam cobrança (`subscribe`,
`pix`, `card`, `stripe/intent`) chamava `requireCurrentConsent()`.
**Corrigido**: adicionado nas 4, sem tocar em cancelamento (que
precisa continuar acessível independente disso).

### P0 — Gate de layout só validava `terms_version`

**Confirmado** em `src/app/(app)/layout.tsx`: só checava
`terms_version`, nunca `privacy_version` — quando só a Política de
Privacidade mudava, o usuário nunca era levado a reaceitar pela UI
(mesmo as APIs já bloqueando via `requireCurrentConsent`).
**Corrigido**: usa `evaluateConsent()`, a mesma função pura das APIs.

Também confirmado: a tela de aceite nunca mostrou nem linkou uma
Política de Privacidade de verdade, mas já gravava
`privacy_version=atual`. Publicadas `/terms`, `/privacy`, `/fair-use`,
`/cancellation`, `/data-retention` como **rascunhos estruturais com
placeholders explícitos** (CNPJ, razão social, endereço, contato do
encarregado) — não é texto jurídico pronto, precisa de revisão
profissional antes de produção.

### P0 — Entitlement concedia PRO indefinidamente sem `current_period_end`

**Confirmado** em `isValidActive()`: uma linha `active` sem
`current_period_end` retornava `true` (válida para sempre).
**Corrigido**: agora inválida — o self-heal já existente
(`healExpiredSubscriptions`) rebaixa e audita automaticamente.

### P1 — Controle de custo de IA (versão mínima viável)

**Confirmado**: `checkDailyAiBudget`/`checkUserMonthlyBudget` buscavam
todas as linhas do período sem paginação e somavam no Node (trunca no
limite de 1000 linhas do PostgREST); falhavam **abertas** em caso de
erro; `logAiUsage` era chamado com `void` (risco de perda em ambiente
serverless); chamadas de embedding (toda geração de plano/chat faz
pelo menos uma) não eram registradas em lugar nenhum; modelo sem preço
cadastrado virava custo zero silencioso.

**Corrigido** (versão mínima, não a arquitetura completa de
reserva/commit sugerida como alternativa mais robusta): RPC
`sum_ai_cost_brl` (migration `024_ai_cost_sum_rpc.sql`), falha fechada
nas duas checagens, `await` em vez de `void` nos 4 route handlers,
custo de embedding registrado via `generateEmbedding`, alerta de
modelo sem preço.

## ⚠️ Aviso crítico de ordem de deploy

**Rode as migrations 021-024 ANTES de deployar este código.** Isso já
causou um incidente real nesta mesma sessão (round 2): quando
`consume_usage_quota`/`check_rate_limit` foram travadas por migration
antes do código novo estar no ar, toda geração de IA e criação de
pagamento ficou bloqueada para usuários reais até o deploy alcançar a
migration. A migration 024 tem o mesmo risco: se `sum_ai_cost_brl` não
existir quando o código novo (que já chama a RPC) for deployado, as
duas checagens de orçamento falham e agora falham **fechadas** — ou
seja, **toda feature de IA fica bloqueada** até a migration rodar.
Ver `docs/deployment-checklist.md` para a ordem completa.

## Status por item

| Item | Status |
|---|---|
| Taxonomia `payment_type` (código + migration 021) | 🟢 IMPLEMENTADO — código testado (type-check/lint/build), migration não testada contra Stripe/MP sandbox reais |
| `ui_mode` do Checkout embutido | 🟢 IMPLEMENTADO E VERIFICADO contra o SDK real (alegação da missão estava errada, documentado acima) |
| `requireSupabaseSuccess` nas escritas críticas | 🟡 IMPLEMENTADO — não testado contra falha real de banco (exigiria fault injection) |
| Claim atômico de webhook (RPC) | 🟡 IMPLEMENTADO — atomicidade comprovada pela semântica do Postgres (documentada na migration), sem teste automatizado de concorrência real |
| Fallback não-determinístico do MP removido | 🟢 IMPLEMENTADO E TESTADO — 13 testes unitários |
| Checkout Stripe duplicado (reserva + índice único) | 🟡 IMPLEMENTADO — não testado contra concorrência real nem sandbox Stripe |
| Cancelamento com defesa em profundidade | 🟢 IMPLEMENTADO E TESTADO (7 testes de `isRecurringSubscriptionRow`) — rota em si não testada contra Stripe sandbox real |
| Exclusão de conta (Storage + payment_type) | 🟡 IMPLEMENTADO — lógica de paginação corrigida e documentada, sem teste automatizado (exigiria mock do Storage) |
| Consentimento exigido para compras | 🟢 IMPLEMENTADO — reusa `evaluateConsent`/`requireCurrentConsent` já testados |
| Gate de layout (terms + privacy) | 🟢 IMPLEMENTADO — reusa `evaluateConsent` já testado |
| Páginas legais públicas | 🟡 IMPLEMENTADO COM PLACEHOLDERS — **não é texto jurídico pronto**, exige revisão profissional e preenchimento de dados da empresa antes de produção |
| Entitlement sem `current_period_end` | 🟢 IMPLEMENTADO E TESTADO |
| Controle de custo de IA (versão mínima) | 🟡 PARCIALMENTE IMPLEMENTADO — mínimo viável feito; arquitetura completa de reserva/commit NÃO implementada |
| Pipeline de fotos (reconstrução completa) | 🔴 NÃO IMPLEMENTADO — escopo grande demais para este round, ver justificativa abaixo |
| Turnstile no cadastro | 🔴 NÃO IMPLEMENTADO — exige conta/site key do Cloudflare Turnstile |
| Sentry/observabilidade | 🔴 NÃO IMPLEMENTADO — exige conta/DSN do Sentry |
| Cálculo de calorias fora da IA | 🔴 NÃO IMPLEMENTADO — mesma razão do round 2: exige coletar sexo biológico (mudança de schema/questionário) ou escolher fórmula alternativa; decisão de produto, não só técnica |
| Upgrade Next.js 14→15 | 🔴 NÃO IMPLEMENTADO — deliberado, ver justificativa abaixo |
| Preços Stripe pré-configurados | 🟡 IMPLEMENTADO — EXIGE CONFIGURAÇÃO EXTERNA (criar os 3 Price no Stripe Dashboard) |
| Testes de integração/E2E | 🔴 NÃO IMPLEMENTADO — exige infraestrutura de banco de teste separado; só foram adicionados mais testes unitários de função pura |
| CI para testes de integração | 🔴 NÃO IMPLEMENTADO — depende do item acima |

## Não implementado — justificativa

- **Pipeline de fotos, Turnstile, Sentry**: cada um é uma feature nova
  de escopo considerável (upload direto ao Storage + job assíncrono +
  compensação; integração com serviço externo de captcha; conta e
  configuração de observabilidade externa). Implementar qualquer um
  deles direito, sem pressa, é trabalho suficiente pra um round
  próprio — enfiar no fim de um round já enorme arrisca entregar algo
  raso e não testado, exatamente o que a missão pede pra evitar.
- **Cálculo de calorias fora da IA**: continua exigindo uma decisão de
  produto (coletar sexo biológico ou aceitar menos precisão com outra
  fórmula) que não é minha de tomar sozinho.
- **Upgrade Next.js**: a própria missão pede pra não migrar por migrar
  se aumentar risco sem necessidade. Não há CVE crítica pendente hoje
  (round 1 já corrigiu a que existia); os itens do `npm audit` que
  forçariam o upgrade são todos de severidade alta, não crítica, e
  documentados na baseline.
- **Testes de integração/E2E**: exigem uma segunda infraestrutura de
  teste (banco Postgres real, Stripe/MP sandbox automatizado, mocks de
  OpenAI) que não existe neste projeto ainda. Marcar RPCs/webhooks como
  "testados" sem isso seria exatamente o que a missão pede pra não
  fazer.

## Riscos residuais que exigem decisão do mantenedor

1. Migrations 021-024 precisam rodar **antes** do deploy do código
   (ver aviso crítico acima) — mesmo risco que já se materializou no
   round 2.
2. `STRIPE_PRICE_MONTHLY/QUARTERLY/ANNUAL` precisam existir no Stripe
   Dashboard antes do deploy, ou toda tentativa de assinatura falha.
3. Nenhuma mudança deste round foi testada contra Stripe Test Mode ou
   sandbox do Mercado Pago de verdade (checkout, webhook, cancelamento
   ponta a ponta) — só verificado por leitura de código, type-check,
   testes unitários de lógica pura e build. Recomendo fortemente um
   teste manual completo em sandbox antes de produção.
4. Páginas legais são rascunhos — não publique em produção sem
   preencher os placeholders e revisão jurídica.
