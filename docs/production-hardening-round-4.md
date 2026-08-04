# Quarta rodada de hardening de produção — WellNutriAI

Branch: `fix/production-hardening-round-4`, construída sobre
`fix/production-hardening-round-3` (que ainda não foi mergeada em
`main` no momento deste round — ver PR #3).

Commit inicial: `be621ec` (ponta de `fix/production-hardening-round-3`)

## Metodologia

Cada problema listado na missão foi **lido e confirmado no código
real** antes de qualquer correção — nenhum foi corrigido só porque a
missão afirmava que existia. Em pelo menos dois casos (apiVersion da
Stripe, e parcialmente a suposição de unidade de tempo do webhook do
MP) a investigação revelou que a premissa da missão precisava de
verificação adicional — documentado explicitamente em cada seção
abaixo, sem reescrever fatos pra caber na narrativa esperada.

## Baseline (antes de qualquer mudança neste round)

- `npm ci`: ok.
- `npm audit`: 16 vulnerabilidades (0 crítica, 9 alta, 6 moderada, 1
  baixa) — mesma baseline herdada do round 3, sem regressão.
- `npm run type-check`: ok.
- `npm run lint`: ok.
- `npm run test`: 55/55 passando (herdados do round 3).
- `npm run build`: ok.

## Verificação final (depois de todas as mudanças deste round)

- `npm run type-check`: ok.
- `npm run lint`: ok.
- `npm run test`: **97/97 passando** (55 herdados + 42 novos deste round).
- `npm run build`: ok.
- `npm audit`: 16 vulnerabilidades, 0 crítica — sem regressão.

## P0 — o que foi confirmado (com evidência) e corrigido

### 1. Assinatura de webhook do Mercado Pago estava completamente quebrada

**CONFIRMADO** lendo `src/lib/mercadopago/webhook.ts`: `verifyMPSignature`
fazia `xSignature.split(';')`, mas o header real do Mercado Pago
(`x-signature: ts=...,v1=...`) é separado por **vírgula**. Isso faz
`parts['v1']` ficar sempre `undefined`, e a função rejeitava — com
alta confiança — **100% dos webhooks reais do MP** como "assinatura
ausente" desde que essa checagem foi implementada.

Corrigido: parser que divide por vírgula, depois pelo primeiro `=` de
cada par (com `trim()`), manifesto que **omite** campos ausentes em
vez de gravar valor vazio (`request-id:;`), comparação final decodifica
`v1`/hash esperado como bytes hexadecimais antes do
`timingSafeEqual` (não mais bytes ASCII da string hex). A rota do
webhook também passou a priorizar o `data.id` dos **query params** da
URL (o que o MP realmente assina) sobre o corpo da notificação, e usa
o mesmo valor verificado tanto pra checar a assinatura quanto pra
buscar/ativar o pagamento — fecha uma janela de confused deputy.

**⚠️ RISCO NÃO RESOLVIDO COM CERTEZA**: a implementação assume que
`ts` vem em **milissegundos** (comparando direto contra `Date.now()`
sem dividir por 1000), conforme a missão pediu explicitamente e com
um teste específico exigindo essa interpretação. Não tenho acesso à
internet nesta sessão pra confirmar isso contra a documentação ao vivo
do Mercado Pago, e minha própria base de conhecimento sobre exemplos
de integração com o MP sugere valores de `ts` no formato de
**segundos** (10 dígitos), não milissegundos (13 dígitos) — uma
tensão real que não consegui resolver com certeza. Implementei
exatamente como a missão pediu (incluindo o teste que prova que um
`ts` de 10 dígitos tratado como segundos é rejeitado), mas **isso
precisa ser validado contra uma notificação real do MP antes de
confiar em produção** — se a suposição estiver errada, o webhook volta
a rejeitar 100% das notificações reais, só que agora por "timestamp
expirado" em vez de "assinatura ausente". O endpoint
`/api/payment/verify` (polling autenticado pelo usuário, não depende
de assinatura de webhook) continua funcionando como caminho
alternativo de ativação mesmo se esse risco se materializar — não é um
bloqueador total do produto, mas quebra a ativação automática.

**Teste recomendado antes de produção**: usar o simulador de
notificações do painel do Mercado Pago (Suas integrações → Webhooks →
simular notificação) e confirmar que a assinatura é aceita. Se
rejeitar, inverta a lógica de unidade de `ts` em
`src/lib/mercadopago/webhook.ts` (dividir `Date.now()` por 1000 em vez
de comparar direto) e ajuste os testes correspondentes.

18 testes unitários + 4 testes de rota cobrindo todos os casos pedidos
pela missão (assinatura válida/inválida, timestamp expirado/futuro,
campos ausentes com prova de omissão vs string vazia, ordem dos
campos, espaços, alteração de 1 caractere, ms vs segundos, secret
ausente/divergente, v1 não-hex, `data.id` do corpo não sobrepondo o da URL).

### 2. Correções financeiras do PR #3 — confirmadas presentes e reforçadas

Herdadas da branch base (payment_type = subscription/one_time_card/pix,
`isRecurringSubscriptionRow()`, migration 021 de correção de dados,
cancelamento e exclusão de conta reconhecendo assinaturas antigas mal
classificadas). Os 7 testes de `isRecurringSubscriptionRow` (registros
antigos com `payment_type` errado mas `sub_*` no ID vs registros novos
já corretos) já cobrem exatamente o que a missão pediu — confirmado
por leitura, nenhuma correção nova necessária aqui além do que já
existia.

**Gap adicional confirmado e corrigido neste round**: `card/route.ts`
(cartão avulso do Mercado Pago) calculava sua **própria** data de
expiração (`new Date() + duration`) e fazia seu próprio `upsert`,
duplicando a lógica de `activateMpPayment` usada pelo webhook e por
`/api/payment/verify` — exatamente o tipo de divergência que já causou
bugs reais nesta base de código (ver round 2/3). Agora chama
`activateMpPayment(paymentId, userId)` como fonte única. 3 testes de
rota confirmando isso.

### 3. Escritas críticas do Supabase sem checagem de erro — gaps reais em chat e fotos

**CONFIRMADO**: `chat_messages` (3 inserts em `src/app/api/chat/route.ts`)
e `meal_photo_analysis` (`photo-analysis/route.ts` e
`photo-analysis/manual/route.ts`) não checavam `error`. Também
confirmado: o `UPDATE` de `meal_plans` quando o chat aplica um
`meal_plan_update` retornava `mealPlanUpdated: true` pro cliente **mesmo
se a escrita tivesse falhado**.

Corrigido com diferenciação explícita (não um `requireSupabaseSuccess`
cego em tudo):
- **Obrigatória** (lança/bloqueia a resposta): mensagem do usuário no
  chat (antes de qualquer custo de IA), e o `UPDATE` de `meal_plans`
  via chat (não pode mentir sobre o que foi salvo).
- **Não bloqueante, mas alerta observável** (`logSupabaseWriteFailure`,
  novo helper em `src/lib/supabaseErrors.ts`): resposta da IA no chat e
  registro de análise de foto — a resposta ao usuário já está pronta e
  não depende do resultado dessa escrita específica; negar a resposta
  seria pior sem ganho, já que o custo de IA já foi incorrido. Confirmado
  lendo o frontend (`photo-analysis/page.tsx`) que só usa `result` da
  resposta, nunca `analysis`.
- `meal-plan/route.ts` já lançava corretamente antes deste round (não
  alterado) — a resposta ali depende estruturalmente do registro salvo.

### 4. Concorrência real — testes adicionados (com uma ressalva honesta)

Não há Postgres real disponível nesta suíte de testes (nunca faz I/O
real — ver `vitest.config.ts`). A garantia de atomicidade em si (que
duas chamadas concorrentes nunca reivindicam o mesmo evento de webhook,
ou nunca criam duas reservas de checkout ativas) vem da semântica de
`UPDATE...WHERE...RETURNING` de instrução única do Postgres e do
índice único parcial, ambos já implementados e documentados nas
migrations 022/023 (herdadas do round 3). **O que os novos testes
provam**: dado o resultado que essa semântica promete numa corrida
real (uma chamada ganha, a outra não), a camada de aplicação reage
corretamente — o efeito comercial (ativação de pagamento, criação de
Checkout Session) acontece exatamente uma vez, nunca duas.

- `webhookIdempotency.concurrency.test.ts`: RPC mockada simulando o
  resultado de duas chamadas concorrentes → handler roda uma única vez.
- `stripe/intent/__tests__/route.concurrency.test.ts`: tabela
  `checkout_reservations` falsa em memória simulando o índice único
  parcial real → duplo clique/duas abas nunca criam duas Checkout
  Sessions efetivas; retry recebe a mesma sessão.

Gaps adicionais confirmados e corrigidos na rota de reserva de
checkout: as escritas de `update` (expired/session_created/failed) não
checavam erro; `client_secret` ausente na sessão criada não era
tratado; a reserva nunca transicionava pra `completed` (agora
`activateStripeSubscription` fecha esse ciclo). Migration 025 adiciona
uma rotina de limpeza em lote pra reservas expiradas — **exige
configuração externa** (não se autoagenda, precisa de `pg_cron` ou um
cron externo).

### 5. Fonte única de ativação do Mercado Pago

Já coberto na seção 2 acima (card/route.ts).

### 6. Exclusão de conta e Storage — verificação final de pasta vazia

A paginação (sempre `offset:0` após cada remoção) já estava correta
desde o round 3. Adicionada uma chamada extra de `list()` **depois**
do loop de remoção, confirmando que a pasta ficou vazia de verdade em
vez de só confiar na suposição "página incompleta = última página".
Se sobrar algo, trata como falha de Storage (bloqueia a exclusão, mesmo
caminho já existente).

4 testes de rota com bucket simulado: 2500 arquivos (mais de duas
páginas) são todos removidos, não só os primeiros 1000; exatamente
1000 (fronteira exata) também; falha ao remover uma página bloqueia a
exclusão e o usuário não é apagado; bucket já vazio segue o fluxo
normal.

## P1 — implementado neste round

- **Stripe apiVersion fixada explicitamente**. Verificado no runtime
  do SDK instalado (`stripe@22.0.2`) que isso já era o comportamento
  padrão quando `apiVersion` não é informado (`version: props.apiVersion
  || DEFAULT_API_VERSION` em `node_modules/stripe/cjs/stripe.core.js`)
  — **não era uma falha de segurança ativa**, mas deixado explícito
  por auditabilidade.
- **`provider_customer_id` reutilizado** em vez de localizar por
  e-mail e pegar "o primeiro resultado" (`findStripeCustomerId`).
- **Allowlist de Price da Stripe**: `activateStripeSubscription` nunca
  checava se o price da assinatura retornada pela Stripe era um dos
  configurados pra venda — bastava `sub.metadata.userId` bater com o
  usuário certo. Corrigido (`isAllowedStripePriceId`, novo outcome
  `price_not_allowed`).
- **`NEXT_PUBLIC_APP_URL`/`APP_URL` exigida com HTTPS em produção**
  (`src/lib/appUrl.ts`). Confirmado que 3 rotas (card/subscribe/pix)
  caíam em `http://localhost:3000` e uma quarta (stripe/intent) caía
  num fallback diferente — inconsistentes entre si, e o fallback pra
  localhost quebraria silenciosamente o `notification_url` enviado ao
  Mercado Pago se a env var sumisse em produção.
- **Mensagem interna da Stripe não vaza mais pro frontend**
  (`stripe/intent`): agora loga com `requestId` e devolve mensagem
  genérica + o id.
- **`.gitignore` de secrets endurecido** (`.env*` com exceção só pra
  `.env.example`), **confirmado** (não assumido) que nenhum secret
  real foi commitado em nenhum momento do histórico do repositório —
  checado com `git log --all -p` contra padrões de chave conhecidos.
- **GitHub secret scanning/push protection**: já estavam habilitados
  (repositório público). **Dependabot** (alertas de vulnerabilidade +
  atualizações de segurança) estava desligado — habilitado via API
  nesta rodada, com `.github/dependabot.yml` novo pra PRs semanais de
  dependências.
- **README corrigido** (dizia "001 → 012" migrations e "não há suite
  de testes automatizados" — desatualizado desde o round 1).

## Status por item

| Item | Status |
|---|---|
| Assinatura de webhook MP (parsing, manifesto, comparação) | 🟢 IMPLEMENTADO E TESTADO (18+4 testes) — 🔴 RISCO RESIDUAL: unidade de `ts` (ms vs segundos) não confirmada contra doc/webhook real do MP |
| Correções financeiras do PR #3 (payment_type, isRecurringSubscriptionRow) | 🟢 CONFIRMADO — já implementado e testado na branch base |
| Fonte única de ativação MP (card route) | 🟢 IMPLEMENTADO E TESTADO |
| `requireSupabaseSuccess`/`logSupabaseWriteFailure` diferenciado (chat, fotos) | 🟢 IMPLEMENTADO — verificação de comportamento correto via leitura do frontend, sem teste de integração contra banco real |
| Testes de concorrência (webhook claim, checkout reservation) | 🟡 IMPLEMENTADO COM MOCKS — não é um teste contra Postgres real; a garantia de atomicidade em si depende da semântica SQL já documentada nas migrations |
| Exclusão de conta — pasta vazia confirmada + testes 1000+ | 🟢 IMPLEMENTADO E TESTADO |
| Stripe apiVersion fixa | 🟢 IMPLEMENTADO — correção de auditabilidade, não de um bug ativo (verificado) |
| `provider_customer_id` reutilizado | 🟢 IMPLEMENTADO |
| Allowlist de Price Stripe antes de conceder PRO | 🟢 IMPLEMENTADO — sem teste de integração contra Stripe sandbox real |
| `NEXT_PUBLIC_APP_URL` HTTPS obrigatória em produção | 🟢 IMPLEMENTADO E TESTADO |
| Erro genérico + requestId (Stripe) | 🟢 IMPLEMENTADO — só na rota confirmada com vazamento real (`stripe/intent`); não auditado sistematicamente em todas as rotas |
| `.gitignore` de secrets + verificação de histórico | 🟢 IMPLEMENTADO E VERIFICADO |
| Dependabot + secret scanning | 🟢 CONFIGURADO via API do GitHub (não é mudança de código) |
| README atualizado | 🟢 IMPLEMENTADO |
| Rotina de limpeza de reservas expiradas | 🟡 IMPLEMENTADO — EXIGE CONFIGURAÇÃO EXTERNA (pg_cron ou cron externo; não se autoagenda) |
| Upload direto sem validação (Storage policies, signed URL) | 🔴 NÃO IMPLEMENTADO — redesenho de arquitetura, ver justificativa |
| Reconstrução do pipeline de imagens (EXIF, jobs, compensação) | 🔴 NÃO IMPLEMENTADO — mesma razão |
| Semântica de cotas (reserve/commit/release) | 🔴 NÃO IMPLEMENTADO — mesma razão |
| Orçamento de IA com reserva/commit (arquitetura completa) | 🔴 NÃO IMPLEMENTADO — round 3 já fez a versão mínima viável (soma em SQL, falha fechada, custo de embeddings) |
| Turnstile, MFA, limites de abuso | 🔴 NÃO IMPLEMENTADO — exige conta/configuração externa (Turnstile); reautenticação para exclusão de conta já existe desde round 1/2 |
| Redesenho de schema de entitlement (tabelas separadas) | 🔴 NÃO IMPLEMENTADO — migração grande demais pra decidir sem o mantenedor |
| Processo de migrations via Supabase CLI + typegen + CI de schema drift | 🔴 NÃO IMPLEMENTADO — infraestrutura grande, ver justificativa |
| Testes de integração/E2E (Playwright) | 🔴 NÃO IMPLEMENTADO — mesma razão dos rounds anteriores |
| Observabilidade (Sentry/OTel) | 🔴 NÃO IMPLEMENTADO — exige conta/DSN externo |
| CSP sem `unsafe-eval`, nonce/hash | 🔴 NÃO IMPLEMENTADO — risco documentado desde round 1, precisa de staging pra testar Stripe/MP antes |
| Cálculo determinístico de calorias fora da IA | 🔴 NÃO IMPLEMENTADO — decisão de produto pendente (coletar sexo biológico ou aceitar menos precisão) |

## Por que os itens P1/P2 grandes não foram implementados

Cada um dos itens 🔴 acima é, sozinho, escopo suficiente pra um round
de trabalho — não uma tarefa que cabe com qualidade no fim de um round
que já entregou 15 commits de correções financeiras/segurança
verificadas. Implementar qualquer um deles apressadamente arriscaria
exatamente o que a missão pede pra evitar: "não declare algo como
corrigido sem implementar testes adequados." Especificamente:

- **Pipeline de fotos/Storage/cotas** (itens 7-9): é um redesenho de
  arquitetura (upload direto vs signed URL, jobs assíncronos,
  compensação, modelo de cota reserve/commit) que precisa de decisão
  de produto sobre trade-offs (latência vs simplicidade) antes de
  qualquer código.
- **Entitlement/schema/migrations tooling** (itens 14-15): mudanças
  estruturais grandes no banco que merecem revisão deliberada do
  mantenedor antes, não uma decisão unilateral.
- **Turnstile/Sentry** (itens 11, 17): dependem de contas/credenciais
  externas que não tenho.
- **Testes E2E/CSP** (itens 16, 18): exigem ambiente de staging real
  pra não arriscar quebrar pagamento em produção sem que apareça no
  build.
- **Cálculo de calorias** (item 19): decisão de produto (coletar novo
  dado do usuário ou não) que não é minha de tomar sozinho.

## Riscos residuais que exigem decisão do mantenedor

1. **CRÍTICO**: a suposição de que `ts` do webhook do Mercado Pago vem
   em milissegundos não foi confirmada contra uma notificação real —
   teste no simulador do painel do MP **antes** de depender do webhook
   em produção (ver seção 1 acima para o procedimento de correção se
   estiver errada).
2. Migrations 022-025 precisam rodar **antes** do deploy do código —
   mesmo risco de falha fechada que já causou um incidente real no
   round 2 (`sum_ai_cost_brl`, herdada do round 3, continua valendo).
3. `cleanup_expired_checkout_reservations` não está agendada — decidir
   se vale a pena configurar `pg_cron`/Vercel Cron ou se a limpeza
   preguiçosa já embutida é suficiente.
4. Nada neste round foi testado contra Stripe Test Mode ou sandbox do
   Mercado Pago reais — só verificado por leitura de código,
   type-check, 42 testes novos com I/O mockado, e build. O checklist
   de smoke test em `docs/deployment-checklist.md` lista o que precisa
   de verificação manual em sandbox antes de produção.
5. Round 4 foi construído sobre a branch do round 3 (ainda não
   mergeada) — o merge precisa acontecer nessa ordem: round 3 primeiro,
   depois round 4.
