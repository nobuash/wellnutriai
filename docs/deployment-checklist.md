# Checklist de deploy — branch `fix/production-hardening`

Este checklist é para o merge desta branch em produção. Siga na ordem —
as migrations do Supabase precisam rodar **antes** do deploy do código
que depende delas.

## 1. Banco de dados (Supabase SQL Editor, em ordem)

Rode cada arquivo de `supabase/migrations/007_*.sql` até `012_*.sql` (as
`001`–`006` já devem estar aplicadas em produção). Todas são idempotentes
(`IF NOT EXISTS` / `DROP POLICY IF EXISTS` antes de recriar) e seguras
para rodar contra o banco existente:

- `007_normalize_subscriptions.sql` — **inclui uma mudança de RLS que
  bloqueia escrita de usuário comum em `subscriptions`**. Confirme que
  nenhuma outra rota (fora das já corrigidas nesta branch) escreve em
  `subscriptions` usando o client autenticado do usuário antes de aplicar
  em produção.
- `008_terms_consent.sql`
- `009_minimum_age.sql` — pode logar `NOTICE` se já existirem
  questionários com idade < 18; não falha a migration, mas revise
  manualmente depois (query no comentário do arquivo).
- `010_ai_usage_and_quotas.sql`
- `011_distributed_rate_limit.sql`
- `012_document_water_logs.sql`

## 2. Variáveis de ambiente (Vercel)

Confirme que todas as variáveis em `.env.example` estão configuradas no
projeto Vercel (Production **e** Preview, se usar preview deployments com
dados reais). Novas nesta rodada: `TERMS_VERSION`, `PRIVACY_VERSION`,
`AI_DAILY_BUDGET_BRL`, `AI_USER_MONTHLY_BUDGET_BRL`, `USD_BRL_RATE`.

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

- Merge `fix/production-hardening` → `main`.
- Deploy automático (Vercel) ou manual, como já configurado no projeto.

## 6. Verificação pós-deploy (smoke test manual)

- [ ] Cadastro + aceite de termos → `profiles.accepted_terms_at` fica
      preenchido (antes ficava `NULL` para sempre — bug corrigido nesta
      branch).
- [ ] Gerar plano alimentar com um perfil **sem** diabetes → funciona
      normalmente.
- [ ] Gerar plano com diabetes marcado no questionário → recebe a
      mensagem de restrição, não um plano.
- [ ] Pagar via PIX (valor de teste) → `subscriptions.status = 'active'`,
      acesso PRO liberado.
- [ ] Pagar via Stripe (cartão de teste) → assinatura ativa, `/pricing`
      mostra "renovação automática ativa" com a próxima data de cobrança.
- [ ] Cancelar assinatura Stripe pela UI → confirma no Stripe Dashboard
      que `cancel_at_period_end` ficou `true` na assinatura real (não só
      no nosso banco).
- [ ] `/account` → excluir conta de teste → confirma que o usuário some
      do Supabase Auth e as fotos somem do bucket `meal-photos`.

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
