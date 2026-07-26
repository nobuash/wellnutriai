# WellNutriAI — Auditoria de Hardening para Produção

Data: 2026-07-25
Branch: `fix/production-hardening`
Autor: revisão assistida (Claude) a pedido do mantenedor.

Este documento registra apenas problemas **confirmados lendo o código atual** da branch `main`
(commit `9a5c7ab` no momento da auditoria) — não é uma lista genérica de boas práticas. Cada item
teve o arquivo relevante lido antes de ser listado aqui.

Legenda de severidade: 🔴 crítico (dinheiro/legal) · 🟠 alto · 🟡 médio · ⚪ baixo/observação.

---

## 1. Pagamentos e assinaturas

### 🔴 Cancelamento não chama o provedor real (Stripe continua cobrando)
`src/app/api/payment/cancel/route.ts` apenas faz `UPDATE` no Supabase
(`subscriptions.mp_status = 'cancelled'`, `profiles.plan = 'free'`). Nunca chama
`stripe.subscriptions.cancel()` nem `stripe.subscriptions.update(..., { cancel_at_period_end: true })`.
Como as assinaturas Stripe (recorrentes de verdade, `mode: 'subscription'`) gravam o
`subscription.id` do Stripe na mesma coluna `mp_subscription_id`, um usuário Stripe que "cancela"
no app perde acesso PRO no banco, mas a Stripe **continua cobrando o cartão a cada ciclo**
indefinidamente. Isso gera cobrança sem contrapartida de serviço — risco financeiro e de
chargeback/reclamação direto.

Adicionalmente: **não existe nenhuma tela no frontend que chame esse endpoint** — busquei
`payment/cancel` em todo `src/app` e não há nenhum componente que o invoque. Ou seja, hoje não há
sequer uma forma de o usuário cancelar pela interface.

### 🔴 `profiles.plan` nunca expira
Nenhuma rotina lê `subscriptions.expires_at` para rebaixar o plano. `canUseFeature(profile.plan, ...)`
em `meal-plan/route.ts`, `photo-analysis/route.ts` e `chat/route.ts` confia cegamente em
`profiles.plan`. Um usuário que pagou um PIX de 30 dias continua PRO para sempre depois de vencido,
até que algum evento de webhook o rebaixe manualmente (o que só acontece para eventos Stripe de
cancelamento — pagamentos PIX/cartão MP nunca disparam rebaixamento automático).

### 🟠 Tabela `subscriptions` mistura identificadores Stripe e Mercado Pago
Colunas `mp_subscription_id` / `mp_status` são reaproveitadas para gravar IDs e status de
assinaturas Stripe (`src/app/api/payment/stripe/webhook/route.ts`,
`src/app/api/payment/stripe/activate/route.ts`). Funciona (upsert por `onConflict:
'mp_subscription_id'`), mas mistura dois provedores no mesmo campo, dificulta auditoria e já foi a
causa raiz do bug de cancelamento acima (o cancel route filtra por `mp_status='authorized'` sem
saber se é Stripe ou MP).

### 🟡 MP "preapproval" (assinatura recorrente) é código morto
`getPreApproval()` é importado e usado para *ler* eventos de webhook `type==='preapproval'`, mas
`getPreApproval().create(...)` nunca é chamado em lugar nenhum do código. `/api/payment/subscribe`
cria apenas uma `Preference` (checkout avulso), não uma assinatura recorrente real do MP. Ou seja,
hoje **todo pagamento MP (pix, cartão avulso ou "subscribe") é um pagamento único** que concede PRO
por `durationDays`. O bloco `preapproval` do webhook nunca dispara na prática. Isso reduz o risco
de cobrança MP "fantasma" (não existe recorrência real hoje), mas também significa que o texto do
enunciado sobre "cancelar preapproval real" não se aplica ao estado atual — deixei o código pronto
para o caso de isso ser implementado no futuro, mas não fabriquei uma feature de assinatura MP que
não existe.

### 🟡 URL assinada temporária salva permanentemente
`src/app/api/photo-analysis/route.ts:126` salva `signed?.signedUrl ?? path` em
`meal_photo_analysis.image_url`. A signed URL expira em 1h; depois disso o campo salvo no banco
aponta para uma URL morta. A tela de histórico atual não exibe a imagem (só metadados), então não
há impacto visível hoje, mas o dado gravado está errado e vai quebrar qualquer feature futura que
tente exibir a foto.

---

## 2. Consentimento / termos

### 🔴 `accepted_terms_at` nunca é persistido de verdade
`supabase/migrations/005_security_hardening.sql` cria o trigger `protect_plan_column`, que força
`new.accepted_terms_at := old.accepted_terms_at` para qualquer conexão cujo `current_setting('role')`
não seja `service_role`. `src/app/(auth)/accept-terms/actions.ts` faz o update usando
`createClient()` do `@/lib/supabase/server` — isto é, com a sessão do próprio usuário
(role `authenticated`), não com a service role. Resultado: `accepted_terms` vira `true`
normalmente, mas `accepted_terms_at` **fica `NULL` para sempre**, mesmo que o código grave um
`new Date().toISOString()`. É um buraco real no registro de consentimento (LGPD): não há prova de
quando o usuário aceitou.

---

## 3. Idade mínima e conteúdo médico

### 🟠 Idade mínima permitida é 12, não 18
`src/lib/validation.ts`: `age: z.coerce.number().int().min(12).max(100)`. Mesmo limite em
`supabase/migrations/001_initial_schema.sql` (`check (age > 0 and age < 120)`). Não há verificação
de maioridade em nenhuma camada.

### 🟠 Geração personalizada continua ativa para diabetes tipo 1/2/pré-diabetes
`src/lib/openai/prompts.ts` (`buildMealPlanPrompt`) monta instruções detalhadas de macros/IG por
tipo de diabetes e injeta no prompt de geração — o plano é gerado e salvo normalmente, sem nenhuma
interrupção ou aviso adicional além do disclaimer padrão.

### 🟡 Sem validação de segurança pós-geração
`src/app/api/meal-plan/route.ts` faz `JSON.parse(raw) as MealPlanContent` sem validar com Zod nem
checar se algum alimento proibido (alergia) aparece no resultado. A única proteção é o prompt pedir
para a IA não incluir — não há verificação determinística.

---

## 4. Controle de custo / abuso

### 🟡 Rate limit é só em memória (o próprio código já documenta a limitação)
`src/lib/ratelimit.ts` usa um `Map` por instância, com comentário próprio no arquivo avisando que
não é distribuído. Sem Redis/Upstash configurado no projeto (não há variável de ambiente nem pacote
instalado).

### 🟡 Sem tabela de custo de IA
Nenhuma tabela ou log registra tokens/custo por chamada OpenAI. `chat`, `meal-plan` e
`photo-analysis` chamam a API sem qualquer teto de gasto diário/mensal além dos limites de contagem
de uso (`canUseFeature`), que são checados com `SELECT count` seguido de `INSERT` — sujeito a
condição de corrida sob requisições simultâneas.

---

## 5. Outros pontos confirmados

- **Sem fluxo de exclusão de conta**: não existe rota nem página para o usuário apagar a própria
  conta (busquei por "delete account" em todo `src/app`, nada encontrado).
- **PWA com cache agressivo de navegação**: `next.config.js` usa `@ducanh2912/next-pwa` com
  `cacheOnFrontEndNav: true` e `aggressiveFrontEndNavCaching: true`, sem `runtimeCaching` explícito
  excluindo rotas autenticadas (`/dashboard`, `/chat`, `/meal-plan`, `/api/*`).
- **CSP com `unsafe-eval` e `unsafe-inline`** em `next.config.js` — não investiguei a fundo se dá
  para remover sem quebrar o Stripe embedded checkout; documentado como risco restante.
- **Turnstile e Resend instalados mas não usados**: `@marsidev/react-turnstile` e `resend` estão no
  `package.json`, mas não há nenhuma referência a eles em `src/`. Cadastro hoje não tem captcha; o
  suporte usa `nodemailer` + Gmail, não Resend.
- **RLS de `profiles.plan`**: já existe proteção real (`protect_plan_column` trigger) impedindo o
  usuário de alterar `plan` via update direto. Isso já estava correto antes desta auditoria.

---

## Status de execução

Legenda: 🟢 implementado e verificado por build/typecheck (não há suite de testes automatizados —
"verificado" aqui significa compilação limpa e revisão de código, não execução real contra
Stripe/Mercado Pago/Supabase de produção) · 🟡 implementado mas exige configuração externa (conta,
chave, painel) que esta sessão não tem acesso para fazer · 🔴 não implementado · ⚪ risco restante
documentado, decisão do time.

| # | Item | Status |
|---|---|---|
| 1 | Cancelamento não chamava o provedor real | 🟢 corrigido — `src/app/api/payment/cancel/route.ts` |
| 2 | `profiles.plan` nunca expira | 🟢 corrigido — `src/lib/entitlement.ts`, self-healing |
| 3 | `subscriptions` mistura IDs Stripe/MP | 🟢 normalizado (aditivo) — `007_normalize_subscriptions.sql` |
| 4 | RLS de `subscriptions` permitia update livre pelo usuário | 🟢 corrigido — mesma migration 007 |
| 5 | Sem UI de cancelamento | 🟢 construída — `/pricing`, `GET /api/entitlement` |
| 6 | `accepted_terms_at` nunca persistia | 🟢 corrigido — `/api/accept-terms` (service role) |
| 7 | Gate de termos usava `user_metadata` (bypassável) | 🟢 corrigido — lê `profiles.accepted_terms` |
| 8 | Idade mínima 12 em vez de 18 | 🟢 corrigido (Zod + constraint `NOT VALID`) |
| 9 | Geração automatizada para diabetes | 🟢 bloqueada — `mealPlanSafety.ts` |
| 10 | Sem validação de alergia pós-geração | 🟢 implementada — `findForbiddenFoods` + retry único |
| 11 | Resposta da IA sem validação de schema | 🟢 Zod em meal-plan, chat, photo-analysis (foto e manual) |
| 12 | Sem log de custo de IA | 🟢 `ai_usage_logs` + `logAiUsage` |
| 13 | Sem circuit breaker de orçamento | 🟢 diário (global) + mensal (por usuário), ambos opt-in |
| 14 | Cotas com race condition (count→insert) | 🟢 RPC atômica `consume_usage_quota` |
| 15 | PRO "ilimitado" na prática e na comunicação | 🟢 limites reais definidos + copy corrigida em todo o app |
| 16 | Rate limit só em memória | 🟡 parcial — RPC distribuída aplicada às rotas de pagamento; login/signup/reset dependem do rate limit nativo do Supabase Auth (não há rota própria para interceptar) |
| 17 | Signed URL temporária salva permanentemente | 🟢 corrigido — grava `path`, gera signed URL sob demanda (não implementado: geração sob demanda em si, pois nenhuma tela exibe a foto hoje) |
| 18 | Sem exclusão de conta | 🟢 `/account` + `/api/account/delete` |
| 19 | PWA cacheava rotas autenticadas/API | 🟢 corrigido — `runtimeCaching` restrito a assets estáticos |
| 20 | CSP com `unsafe-eval`/`unsafe-inline` | ⚪ não alterado — risco de quebrar Stripe/MP sem ambiente de teste para validar; documentado em `docs/security.md` |
| 21 | Cloudflare Turnstile no cadastro | 🔴 não implementado — pacote instalado, zero uso no código; precisa de conta Cloudflare |
| 22 | Observabilidade (Sentry) | 🔴 não implementado — precisa de conta Sentry + `npm install @sentry/nextjs` |
| 23 | `water_logs` sem migration correspondente | 🟢 documentada retroativamente — `012_document_water_logs.sql` |
| 24 | Testes automatizados (unitários, integração, RLS, Playwright, k6) | 🔴 não implementados — nenhum framework de teste no projeto |
| 25 | CI (type-check/lint/build) | 🟢 `.github/workflows/ci.yml` |
| 26 | Validação de env obrigatório no boot | 🟢 `next.config.js`, falha o build |
| 27 | `.env.example` desatualizado | 🟢 reescrito refletindo todo `process.env.*` usado no código |
| 28 | Documentação (README, docs/*) | 🟢 reescritos/criados |
| 29 | Menores de idade nos Termos de Uso | 🟢 linha adicionada |
| 30 | Cláusula de responsabilidade possivelmente abusiva (CDC) | ⚪ suavizada, mas **isto não é uma revisão jurídica** — recomenda-se revisão por advogado antes de contar com a proteção legal do termo |
| 31 | Exportação de dados do usuário | 🔴 não implementada |
| 32 | Retenção/expiração automática de fotos antigas | 🔴 não implementada |

### Riscos restantes que exigem decisão ou ação do mantenedor

- Rodar as migrations `007`–`012` em produção (nenhuma foi aplicada pela sessão — sem acesso
  direto ao banco). Ver `docs/deployment-checklist.md`.
- Configurar `invoice.payment_failed` e `customer.subscription.updated` no webhook da Stripe.
- Decidir e configurar `AI_DAILY_BUDGET_BRL` / `AI_USER_MONTHLY_BUDGET_BRL` — hoje desligados.
- Revisar juridicamente o termo de responsabilidade (item 30).
- Integrar Turnstile e Sentry quando houver as contas correspondentes.
- Testar manualmente o checklist de smoke test em `docs/deployment-checklist.md` — nada disso foi
  executado contra Stripe/Mercado Pago/Supabase reais nesta sessão, só compilado e revisado.
