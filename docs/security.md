# Segurança

Resumo do que está implementado, onde, e o que ainda depende de
configuração externa ou trabalho futuro. Ver
`docs/production-hardening-audit.md` para o histórico de achados.

## Autorização e RLS

- `profiles.plan`, `accepted_terms_at`, `created_at` só são graváveis por
  `service_role` — trigger `protect_plan_column`
  (`005_security_hardening.sql`) reseta esses campos para o valor antigo em
  qualquer conexão que não seja service role.
- `subscriptions` só permite `SELECT` para o dono da linha; toda escrita
  exige `service_role` (`007_normalize_subscriptions.sql`).
- `usage_counters`, `ai_usage_logs`, `rate_limits`, `processed_webhooks`,
  `audit_log`: RLS habilitada com `using (false)` — nenhum usuário
  autenticado lê ou escreve diretamente, só via RPC `SECURITY DEFINER` ou
  service role.
- Funções `SECURITY DEFINER` (`consume_usage_quota`, `check_rate_limit`)
  usam `set search_path = ''` e nomes totalmente qualificados
  (`public.tabela`), para não ficar vulnerável a sequestro de search_path.
- Buckets do Storage (`meal-photos`) são privados; upload/leitura/exclusão
  restritos ao próprio usuário via `storage.foldername(name)[1] =
  auth.uid()`. URLs assinadas nunca são gravadas permanentemente no banco
  (só o `path` — ver `docs/data-retention.md`).

## Autenticação

- Middleware (`src/middleware.ts` + `src/lib/supabase/middleware.ts`)
  redireciona não autenticados para `/login` em rotas protegidas.
- Gate de aceite de termos lê `profiles.accepted_terms` (banco), não
  `user_metadata` do JWT — o segundo é gravável pelo próprio usuário via
  `supabase.auth.updateUser()` e não pode ser um controle de acesso.
- Fluxo de esqueci-senha usa uma página de confirmação intermediária
  (`/reset-password/confirm`) em vez de link direto para o endpoint de
  verify do Supabase, porque scanners de segurança de e-mail corporativo
  (ex: Outlook Safe Links) pré-visitam e consomem links de uso único antes
  do clique real do usuário.
- Exclusão de conta (`/api/account/delete`) exige reautenticação com a
  senha atual antes de apagar qualquer coisa.

## Rate limiting

Duas camadas, propositalmente diferentes:
- `src/lib/ratelimit.ts` — em memória, por instância. Suficiente só como
  proteção de burst dentro de uma instância quente; **não é confiável**
  com múltiplas instâncias Vercel simultâneas (o próprio arquivo já
  documentava essa limitação).
- `src/lib/distributedRateLimit.ts` + RPC `check_rate_limit` — janela fixa
  atômica no Postgres, funciona entre instâncias. Aplicado às rotas de
  criação/gestão de cobrança (`subscribe`, `pix`, `card`, `verify`,
  `stripe/intent`, `cancel`), que antes desta auditoria não tinham
  rate limit nenhum.
- Login, cadastro e recuperação de senha usam os métodos do Supabase Auth
  diretamente do cliente (`signInWithPassword`, `signUp`,
  `resetPasswordForEmail`) — não passam por uma rota nossa, então dependem
  do rate limiting nativo do Supabase Auth. Se precisar de limites mais
  rígidos, configure em Supabase Dashboard → Authentication → Rate Limits.

## Cabeçalhos de segurança

`next.config.js` já define HSTS, X-Frame-Options, X-Content-Type-Options,
Referrer-Policy, Permissions-Policy e CSP. A CSP mantém `'unsafe-eval'` e
`'unsafe-inline'` em `script-src` — **não removidos nesta rodada**: o
checkout embutido da Stripe e o SDK do Mercado Pago tipicamente exigem
inline/eval para funcionar, e remover sem testar contra as duas integrações
reais arrisca quebrar pagamento em produção sem que isso apareça em
`next build`. Risco restante documentado — teste remoção incremental
(`'strict-dynamic'` + nonce, por exemplo) em um ambiente de staging antes
de aplicar em produção.

## Gerenciamento de secrets

- `.gitignore` ignora `.env*` por padrão, com exceção explícita só pra
  `.env.example` (round 4) — mais seguro que listar sufixos
  específicos (`.env.local`, `.env*.local`), que deixavam passar
  despercebido um `.env.production`/`.env.staging` sem sufixo `.local`.
- **Verificado (round 4)**: nenhum arquivo `.env` real (só
  `.env.example`, que é template com placeholders) foi commitado em
  nenhum momento do histórico do repositório — checado via
  `git log --all --diff-filter=A --name-only` para nomes de arquivo e
  `git log --all -p` com grep por padrões de chave conhecidos
  (`sk_live_`, `sk_test_`, `whsec_`, JWT, chaves de API do Google,
  tokens do GitHub/Slack). Nenhum resultado além dos placeholders do
  `.env.example`.
- **GitHub secret scanning e push protection**: já estavam habilitados
  automaticamente (repositório público). Confirmado via
  `gh api repos/nobuash/wellnutriai --jq '.security_and_analysis'`.
- **Dependabot**: alertas de vulnerabilidade e atualizações de
  segurança habilitados via API nesta rodada (estavam desligados).
  `.github/dependabot.yml` adicionado para PRs semanais de
  atualização de dependências (npm + GitHub Actions), com major
  versions sempre em PR individual (nunca agrupadas).
- **Rotação de chaves — não automatizada, processo manual**: se
  qualquer chave (Stripe, Mercado Pago, Supabase service role, OpenAI)
  precisar ser rotacionada (suspeita de vazamento, desligamento de
  colaborador com acesso, rotina periódica), gere a nova chave no
  painel do provedor, atualize a variável correspondente no Vercel
  (Production **e** Preview separadamente) e revogue a chave antiga só
  depois de confirmar que o deploy novo está saudável. Não há
  automação disso hoje — ficou fora do escopo por exigir integração
  com a API de cada provedor (Stripe, Mercado Pago, Supabase, OpenAI
  têm mecanismos de rotação distintos entre si).
- **Ambientes com chaves diferentes**: hoje o projeto usa as mesmas
  variáveis do Vercel para Production e Preview (confirmado em
  `docs/deployment-checklist.md`). Recomendado usar chaves de TESTE do
  Stripe/Mercado Pago em Preview e chaves reais só em Production — não
  implementado nesta rodada (é uma configuração no painel do Vercel,
  não uma mudança de código).

## O que exige configuração externa (não implementado em código)

- **Cloudflare Turnstile**: pacote instalado
  (`@marsidev/react-turnstile`), mas não há nenhuma referência a ele em
  `src/` — cadastro não tem captcha hoje. Requer criar um site no
  Cloudflare Turnstile e integrar `NEXT_PUBLIC_TURNSTILE_SITE_KEY` /
  `TURNSTILE_SECRET_KEY` (já estão no `.env.example`).
- **Sentry/observabilidade**: nenhum SDK instalado. `SENTRY_DSN` /
  `NEXT_PUBLIC_SENTRY_DSN` estão no `.env.example` como preparação, mas
  precisam de `npm install @sentry/nextjs` + configuração de projeto no
  Sentry antes de fazer sentido.
- **Testes de RLS automatizados**: não implementados (não há suite de
  testes no repositório — ver `.github/workflows/ci.yml`).
