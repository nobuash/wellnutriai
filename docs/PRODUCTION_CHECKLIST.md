# Checklist de produção — WellNutriAI

Companion de `docs/PRE_LAUNCH_AUDIT.md`. Este documento é a lista de ações — a auditoria explica o porquê de cada uma.

Convenção: `[ ]` pendente, `[x]` já resolvido (nesta rodada ou antes dela), `[~]` estrutura pronta, falta decisão/dado humano.

---

## Jurídico/regulatório

- [ ] Decidir e registrar formalmente se o WellNutriAI pode operar gerando planos alimentares personalizados por IA sem revisão prévia por profissional habilitado. Quando aprovado: `REGULATORY_REVIEW_APPROVED=true` na Vercel (Production).
- [ ] Obter CNPJ / formalizar a empresa (bloqueador confirmado: ainda não existe, segundo o mantenedor).
- [ ] Preencher `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_CNPJ`, `LEGAL_ENTITY_ADDRESS`, `DPO_CONTACT_EMAIL`, `SUPPORT_CONTACT_EMAIL`, `LEGAL_DOCS_UPDATED_AT` na Vercel.
- [ ] Redigir (com advogado) e preencher `REFUND_POLICY_TEXT`, `BACKUP_RETENTION_POLICY_TEXT`, `LEGAL_MINIMUM_RETENTION_TEXT`.
- [ ] Decidir a base legal (LGPD art. 7º/11) para o dado de saúde do questionário. Se for consentimento: `HEALTH_DATA_CONSENT_REQUIRED=true`.
- [ ] Confirmar com OpenAI/Supabase/Stripe/Mercado Pago/Vercel: país de destino, mecanismo de transferência internacional, contato — preencher `src/config/dataProcessors.ts`.
- [x] Cada página jurídica incompleta fica com `noindex` e fora do `sitemap.xml` automaticamente até os campos que ELA usa estarem preenchidos (`src/config/legal.ts` + cada `page.tsx` + `src/app/sitemap.ts`) — a página continua acessível (mostrando os `[PLACEHOLDER: ...]`), só não é promovida como definitiva. Isso NÃO bloqueia o build/deploy do resto do site (decisão tomada em 2026-09-03, a pedido do mantenedor, para não travar streak/TACO/P0 por dado institucional que só essas 5 páginas precisam — ver histórico do `next.config.js` para a versão anterior que bloqueava o build inteiro).
- [x] Trava de runtime que impede geração de plano sem aprovação regulatória (`src/lib/regulatory.ts`) — essa continua bloqueando de verdade em produção, não foi afetada pela mudança acima.

## Privacidade/LGPD

- [x] Consentimento de Termos/Privacidade versionado e auditável (`user_consents`) — já existia.
- [x] Estrutura de consentimento específico para dado de saúde (`health_data_consents`) — nova nesta rodada, enforcement desligado até decisão jurídica.
- [x] Frase inconsistente do questionário ("dados ficam privados... só para gerar plano") corrigida para texto factual apontando para `/privacy`.
- [ ] Revisar LGPD art. 11 (base legal para dado sensível — ver "Jurídico" acima).
- [ ] Confirmar retenção de backup do Supabase junto ao plano contratado (`BACKUP_RETENTION_POLICY_TEXT`).
- [ ] Banner de consentimento de cookies — já implementado (PR #28 anterior a este round), continua correto: só aparece quando GA4 está configurado.

## Segurança nutricional

- [x] Bloqueio de geração automática para condição de alto risco (já existia, `isHighRiskCondition`).
- [x] `getNutritionSafetyMode()` centralizado, usado em geração de plano, chat (texto livre e edição estruturada) e venda do PRO.
- [x] Cálculo de BMR/TDEE determinístico, fora do LLM (`src/lib/nutrition/energy.ts`), com `biological_sex` obrigatório e nunca inferido.
- [x] Validação matemática determinística do output da IA (4/4/9, soma de refeições, números inválidos) além do Zod.
- [x] PRO não é vendido sem aviso claro para perfil restricted (UI + servidor).
- [ ] Nutricionista habilitado revisar os fatores usados em `src/lib/nutrition/energy.ts` (déficit/superávit/água) antes do lançamento comercial — são os mesmos valores que já estavam em uso, agora só determinísticos.
- [ ] Rodar migrations `026_health_data_consent.sql` e `027_biological_sex.sql` em produção (ver "Supabase" abaixo).

## Supabase

- [ ] Aplicar `supabase/migrations/026_health_data_consent.sql` e `027_biological_sex.sql` no projeto de produção (`supabase db push` ou via SQL Editor do dashboard — confirmar qual é o fluxo já usado pelo time, não documentado no repo).
- [ ] Confirmar que não há drift de schema entre o repo e produção antes de aplicar (histórico já mostrou pelo menos um caso de colunas em produção sem migration correspondente — ver `docs/deployment-checklist.md`).
- [ ] `src/types/database.ts` está desatualizado em relação ao schema real (faltam ~12 tabelas) — considerar `supabase gen types typescript` numa rodada futura.
- [ ] Configuração do Dashboard (fora do repo, não auditável por código): confirmação de e-mail obrigatória, Site URL de produção, redirect URLs permitidas, rate limit de auth, SMTP customizado.

## Stripe

- [x] Fluxo de assinatura, webhook idempotente, ativação, cancelamento — já existiam e não foram tocados nesta rodada.
- [x] Checkout agora recusa perfil restricted antes de criar a sessão (`/api/payment/stripe/intent`).
- [ ] Item 16 (não implementado nesta rodada): job de reconciliação periódica Stripe↔banco, alerta de webhook falhando repetidamente.

## OpenAI

- [x] Prompt de geração de plano não decide mais BMR/TDEE — recebe os valores já calculados.
- [x] Prompt do chat ganhou modo restrito textual, além do bloqueio de código já existente para edição estruturada.
- [ ] Item 12 (não implementado): tornar `AI_DAILY_BUDGET_BRL`/`AI_USER_MONTHLY_BUDGET_BRL` obrigatórios em produção.
- [ ] Item 13 (não implementado): tabela de custo por modelo versionada, com teste que falha para modelo desconhecido.

## Vercel

- [ ] Confirmar `VERCEL_ENV` está disponível no build (é automático da plataforma — só confirmar que o deploy de produção real usa o domínio de produção, não um preview apontado manualmente para produção).
- [ ] Configurar as ~12 variáveis de ambiente novas desta rodada (ver lista em PRE_LAUNCH_AUDIT.md seção A) no ambiente **Production** do projeto.
- [ ] Considerar replicar algumas (ex: nenhuma das de legal/regulatório) no ambiente **Preview**, caso queiram testar o fluxo completo em um preview antes de ir para produção — hoje elas ficam "desligadas" em preview de propósito.

## Auth

- [x] Autenticação de rotas privadas já é server-side em duas camadas (confirmado, não alterado).
- [ ] Item 11 (não implementado): Cloudflare Turnstile em signup/forgot-password — hoje sem CAPTCHA algum, e signup/login chamam Supabase Auth direto do client (sem rota própria no Next).
- [ ] Auditar manualmente a configuração de rate limit/CAPTCHA nativo do Supabase Auth Dashboard.

## Observabilidade

- [ ] Item 14 (não implementado): nenhuma ferramenta instalada (Sentry ou equivalente), nenhum health check (`/api/health/*`).
- [ ] Até lá, a única fonte de erro em produção é o log da Vercel (confirmado em `docs/incident-response.md`).

## Backup

- [ ] Item 27 (não implementado): runbook de disaster recovery — precisa dos dados reais do plano Supabase contratado, que eu não tenho.

## E2E

- [ ] Item 10 (não implementado): Playwright não está configurado no repo. Precisa de um projeto Supabase de teste dedicado — nunca rodar E2E destrutivo contra produção.

## Segurança

- [ ] Item 20 (não implementado): CSP ainda usa `unsafe-inline`/`unsafe-eval` — risco conhecido e documentado há 4 rounds, não removido por falta de staging para testar Stripe/Mercado Pago sem risco.
- [x] Security headers (HSTS, X-Frame-Options, etc.) já corretos.
- [ ] Item 24: 38 vulnerabilidades no Dependabot (20 altas) não investigadas nesta rodada.
- [ ] Item 25: confirmar branch protection e secret scanning no GitHub (configuração de plataforma, não de código).
- [ ] Item 9 (não implementado): Next 14.2.35 não é mais LTS — migração faseada recomendada como projeto isolado.

## Suporte

- [ ] Item 28 (não implementado): avaliar Gmail App Password vs Resend (ambos presentes hoje) — decisão de produto, não um bug.

## Go-live

Antes de considerar o sistema pronto para comercialização real:

- [ ] Todos os itens de "Jurídico/regulatório" acima resolvidos.
- [ ] `REGULATORY_REVIEW_APPROVED=true` e (se aplicável) `HEALTH_DATA_CONSENT_REQUIRED` decidido.
- [x] Migrations 026, 027 e 028 aplicadas em produção (confirmado em 2026-09-03).
- [ ] Nutricionista revisou os fatores de `src/lib/nutrition/energy.ts`.
- [ ] `PRIVACY_PAGE_COMPLETE`, `TERMS_PAGE_COMPLETE`, `CANCELLATION_PAGE_COMPLETE`, `DATA_RETENTION_PAGE_COMPLETE` e `FAIR_USE_PAGE_COMPLETE` (`src/config/legal.ts`) todos `true` — confirma que nenhuma página jurídica pública ainda está com `noindex`/fora do sitemap por dado institucional faltando. **O build passar sozinho não confirma mais isso** (ver nota abaixo).
- [ ] Itens 9–28 avaliados e sequenciados como próxima rodada (nenhum é bloqueador do tipo P0, mas vários são importantes antes de escalar tráfego real).

**Não classifique como GO só porque o build passou.** Desde 2026-09-03 o build de produção **não falha mais** por documento jurídico incompleto — só emite aviso no log e deixa a página específica com `noindex`/fora do sitemap (decisão do mantenedor, para não travar o resto do produto). Isso significa que "build verde" deixou de ser prova de documentação jurídica completa — confira o item acima em vez disso. Pelo critério da seção "Definição de pronto para comercializar" do pedido original, hoje o sistema está **NO-GO**, com bloqueadores claros e documentados acima, a maioria deles dependendo de uma decisão ou dado que só o mantenedor tem.
