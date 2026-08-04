# Checklist de deploy — hardening de produção (rounds 1, 2 e 3)

Este checklist é para o merge de `fix/production-hardening` (round 1),
`fix/production-hardening-round-2` e `fix/production-hardening-round-3`
em produção. Siga na ordem — as migrations do Supabase precisam rodar
**antes** do deploy do código que depende delas.

**⚠️ Round 3 introduz o MESMO padrão de risco que já causou um
incidente real no round 2**: `sum_ai_cost_brl` (migration 024) é
chamada pelo código novo com falha FECHADA — se a migration não tiver
rodado quando o código for deployado, **toda feature de IA (chat,
plano alimentar, análise de foto) fica bloqueada** para todo usuário
até a migration alcançar produção. Migrations sempre antes do código,
sem exceção.

## 1. Banco de dados (Supabase SQL Editor, em ordem)

**⚠️ NÃO assuma que uma migration já foi aplicada só porque o número é
baixo.** Durante o deploy do round 2 (2026-07-26) descobrimos que
`004_diabetes_type.sql` e, na primeira tentativa, `019_expand_medical_screening.sql`
nunca tinham sido aplicadas de verdade em produção — a suposição de que
"001–006 já estavam aplicadas" estava errada, e só foi pega porque o
INSERT do questionário passou a falhar com "column does not exist".
Também descobrimos colunas em produção (`subscriptions.expires_at`,
`subscriptions.payment_type`) que não existem em NENHUM arquivo de
migration do repositório — ou seja, o schema real já recebeu alterações
manuais fora do controle de versão em algum momento antes deste projeto
ser hardenizado. **Antes de assumir que o schema está em dia, rode:**

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

select conrelid::regclass as table_name, conname, contype, convalidated
from pg_constraint
where connamespace = 'public'::regnamespace
order by table_name, conname;
```

e compare manualmente contra o que cada migration em `supabase/migrations/`
diz que deveria existir, em vez de confiar no número do arquivo ou em
"deu sucesso" de uma tentativa anterior.

Rode cada arquivo de `supabase/migrations/007_*.sql` até `020_*.sql` (as
`001`–`006` deveriam já estar aplicadas em produção, mas confirme antes —
ver aviso acima). Todas são idempotentes
(`IF NOT EXISTS` / `DROP POLICY IF EXISTS` antes de recriar, ou
`NOT VALID` + validação best-effort quando pode haver dado antigo
divergente) e seguras para rodar contra o banco existente:

**Round 1:**
- `007_normalize_subscriptions.sql` — **inclui uma mudança de RLS que
  bloqueia escrita de usuário comum em `subscriptions`**.
- `008_terms_consent.sql`
- `009_minimum_age.sql` — pode logar `NOTICE` se já existirem
  questionários com idade < 18; não falha a migration.
- `010_ai_usage_and_quotas.sql`
- `011_distributed_rate_limit.sql`
- `012_document_water_logs.sql`

**Round 2:**
- `013_lock_down_security_definer_rpcs.sql` — revoga `consume_usage_quota`
  e `check_rate_limit` de `authenticated`, só `service_role` pode chamar
  a partir daqui. Confirme que o código deployado já usa o service
  client pra essas RPCs (já corrigido nesta branch) antes de rodar em
  produção, ou as cotas/rate limits do código antigo param de funcionar.
- `014_secure_consent_columns.sql`
- `015_webhook_events.sql` — nova tabela; `processed_webhooks` (antiga)
  não é mais escrita pelo código, mas não foi removida.
- `016_subscription_integrity.sql` — cria um índice único condicional;
  se já existirem duplicidades (dois registros `active`+`subscription`
  pro mesmo usuário/provedor), a migration **pula a criação do índice**
  e avisa via `NOTICE` em vez de falhar — rode a query do comentário do
  arquivo pra revisar manualmente nesse caso.
- `017_restrict_server_generated_tables.sql` — **RLS trava escrita de
  usuário comum em `meal_plans`, `chat_messages`, `meal_photo_analysis`
  e `nutrition_questionnaires`**. Mesmo alerta do `007`: confirme que o
  código deployado já escreve nessas tabelas via service role antes de
  rodar isso em produção.
- `018_questionnaire_and_content_constraints.sql`
- `019_expand_medical_screening.sql` — novas colunas em
  `nutrition_questionnaires`, todas com default `false`/`null`, não
  quebra questionários existentes.
- `020_account_deletion_requests.sql`

**Round 3:**
- `021_fix_subscription_payment_types.sql` — corrige `payment_type` de
  assinaturas Stripe já gravadas como `'card'` para `'subscription'`
  (identifica pelo prefixo `sub_` do `provider_subscription_id`, nunca
  às cegas) e renomeia `'card'` do Mercado Pago para `'one_time_card'`.
  Roda um `NOTICE` de relatório antes de tocar em qualquer dado — revise
  o log da migration no Supabase antes de confirmar se aparecer aviso
  de linha ambígua.
- `022_atomic_webhook_claim.sql` — nova RPC `claim_webhook_event`, só
  `service_role` pode chamar. Não quebra nada em produção sozinha, mas
  o código novo depende dela para reprocessar webhooks travados.
- `023_checkout_reservations.sql` — nova tabela, sem risco.
- `024_ai_cost_sum_rpc.sql` — nova RPC `sum_ai_cost_brl`. **Ver aviso
  crítico no topo deste documento**: o código novo já chama esta RPC
  com falha fechada — rode esta migration antes do deploy do código,
  sempre.

## 2. Variáveis de ambiente (Vercel)

Confirme que todas as variáveis em `.env.example` estão configuradas no
projeto Vercel (Production **e** Preview, se usar preview deployments com
dados reais). Novas no round 2: `TERMS_VERSION`, `PRIVACY_VERSION`,
`AI_DAILY_BUDGET_BRL`, `AI_USER_MONTHLY_BUDGET_BRL`, `USD_BRL_RATE`.
Novas no round 3: `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_QUARTERLY`,
`STRIPE_PRICE_ANNUAL` — precisam ser criadas como Price reais no Stripe
Dashboard (Products → WellNutriAI PRO) antes do deploy, ou **toda
tentativa de assinatura via Stripe falha** (o checkout não cria mais
Product/Price dinamicamente).

O build falha imediatamente se `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou
`OPENAI_API_KEY` estiverem ausentes (ver `next.config.js`) — se o deploy
quebrar aqui, é exatamente isso.

## 3. Stripe

- Confirme que o webhook em Stripe Dashboard → Developers → Webhooks
  está escutando (além dos eventos já configurados)
  `invoice.payment_failed` e `customer.subscription.updated` — novos
  handlers adicionados nesta branch (`src/app/api/payment/stripe/webhook/route.ts`).
- Sem isso, o cancelamento (`cancel_at_period_end: true`) ainda funciona
  no lado da Stripe, mas o campo `cancel_at_period_end` no nosso banco
  pode ficar desatualizado até o próximo evento que já era escutado.

## 4. Mercado Pago

Nenhuma mudança de configuração externa necessária — o webhook e as
credenciais continuam os mesmos.

## 5. Deploy do código

- Merge `fix/production-hardening`, `fix/production-hardening-round-2` e
  `fix/production-hardening-round-3` → `main`, nessa ordem.
- Deploy automático (Vercel) ou manual, como já configurado no projeto.

## 6. Verificação pós-deploy (smoke test manual)

**Round 1:**
- [ ] Cadastro + aceite de termos → `profiles.accepted_terms_at` fica preenchido.
- [ ] Gerar plano com diabetes marcado no questionário → recebe a mensagem de restrição, não um plano.
- [ ] Pagar via PIX (valor de teste) → `subscriptions.status = 'active'`, acesso PRO liberado.
- [ ] Pagar via Stripe (cartão de teste) → assinatura ativa, `/pricing` mostra "renovação automática
      ativa" com a próxima data de cobrança.
- [ ] Cancelar assinatura Stripe pela UI → confirma no Stripe Dashboard que `cancel_at_period_end`
      ficou `true` na assinatura real.

**Round 2:**
- [ ] Chamar `/api/payment/verify` duas vezes seguidas com o mesmo `payment_id` de um PIX aprovado
      → `subscriptions.current_period_end` é **idêntico** nas duas chamadas (não avança).
- [ ] No SQL Editor, tentar `select * from public.subscriptions where user_id = auth.uid()` autenticado
      como um usuário comum funciona (leitura); tentar um `update`/`insert` na mesma tabela pelo
      client SDK do navegador falha (RLS).
- [ ] Mesmo teste de escrita bloqueada em `meal_plans`/`chat_messages`/`meal_photo_analysis`/
      `nutrition_questionnaires` — só leitura deve funcionar.
- [ ] Chamar `supabase.rpc('consume_usage_quota', {...})` autenticado como usuário comum retorna
      erro de permissão (antes funcionava e aceitava `p_user_id` de outra pessoa).
- [ ] Preencher o questionário marcando "gestação" ou "doença renal" → gera a mesma mensagem de
      restrição médica que diabetes já gerava.
- [ ] Assinar via Stripe e, com a assinatura ainda ativa, tentar assinar de novo → recebe erro
      "Você já possui uma assinatura recorrente ativa" em vez de criar uma segunda.
- [ ] Aceitar os termos, depois simular uma versão nova (`TERMS_VERSION` diferente temporariamente)
      → `/account` e `/pricing` continuam acessíveis; `/dashboard` redireciona para `/accept-terms`.
- [ ] `/account` → excluir conta de teste → confirma que o usuário some do Supabase Auth e as fotos
      somem do bucket `meal-photos`; repetir com uma assinatura Stripe ativa e confirmar que, se o
      cancelamento falhar (ex: chave de teste inválida), a conta **não** é apagada.

**Round 3 (nenhum destes foi exercitado por mim contra Stripe/MP reais — ver `docs/production-hardening-round-3.md`):**
- [ ] Assinar via Stripe (sandbox) → `select payment_type from subscriptions where provider='stripe'`
      mostra `'subscription'`, não `'card'`.
- [ ] Cancelar essa assinatura pela UI → funciona (antes deste round, não encontrava a assinatura).
- [ ] `/dashboard` mostra o badge de "renovação automática" para essa assinatura (antes, nunca aparecia
      para Stripe).
- [ ] Abrir o modal de assinatura Stripe em duas abas e clicar em assinar nas duas quase ao mesmo tempo
      → só uma Checkout Session é criada de verdade (a segunda aba recebe a mesma ou um erro de
      "tentativa em andamento", nunca uma segunda sessão nova).
- [ ] Excluir conta de teste com mais de 1000 fotos no bucket `meal-photos` → todas são removidas, não só
      as primeiras 1000.
- [ ] Gerar plano alimentar/chat com termos aceitos mas `PRIVACY_VERSION` diferente (simular temporariamente)
      → redireciona para `/accept-terms`.
- [ ] Usuário com termos desatualizados tenta comprar (Stripe/PIX/cartão) → bloqueado; tenta cancelar
      assinatura existente → continua funcionando.
- [ ] Derrubar `AI_DAILY_BUDGET_BRL` pra um valor bem baixo temporariamente e gerar uso de IA → é bloqueado
      corretamente (não silenciosamente permitido).

## Rollback

- **Código**: reverter o merge / redeploy do commit anterior no Vercel —
  sem dependência de dado, é seguro a qualquer momento.
- **Migrations**: nenhuma delas é destrutiva (não há `DROP COLUMN` nem
  `DELETE` de dados existentes), então não é necessário reverter o SQL
  junto com um rollback de código. Exceção: se `007` já rodou (RLS
  travada em `subscriptions`) e você precisar reverter para um código
  anterior que ainda escreve em `subscriptions` com o client do usuário,
  esse código antigo vai falhar silenciosamente nessa escrita — nesse
  cenário específico, também reverta a RLS:
  ```sql
  create policy "subscriptions_insert_own" on public.subscriptions for insert with check (auth.uid() = user_id);
  create policy "subscriptions_update_own" on public.subscriptions for update using (auth.uid() = user_id);
  ```
  (Não recomendado — isso reabre a falha de segurança documentada em
  `docs/production-hardening-audit.md`. Prefira sempre reverter só o
  código.)
- O mesmo raciocínio vale para `017_restrict_server_generated_tables.sql`
  (RLS de `meal_plans`/`chat_messages`/`meal_photo_analysis`/
  `nutrition_questionnaires`), `013_lock_down_security_definer_rpcs.sql`
  (RPCs de cota/rate limit) e `024_ai_cost_sum_rpc.sql` (soma de custo
  de IA, chamada com falha fechada) — reverter o código para uma versão
  anterior a estas migrations sem também reverter a migration
  correspondente quebra a escrita/leitura nessas tabelas/funções (e no
  caso da 024, bloqueia toda feature de IA). Prefira sempre reverter só
  o código e manter as migrations aplicadas.
- `021_fix_subscription_payment_types.sql` só faz UPDATE de dados
  existentes com base em um sinal confiável (prefixo `sub_` do ID da
  Stripe) — não precisa ser revertida junto com um rollback de código,
  os dados corrigidos continuam corretos independente da versão do
  código no ar.
