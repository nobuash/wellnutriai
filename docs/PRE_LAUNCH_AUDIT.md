# Auditoria pré-lançamento — WellNutriAI

Branch: `fix/pre-launch-p0` (a definir no commit). Base: `main` no commit `8b2170c` (após a rodada de SEO técnico, PRs #27–#29).

## Metodologia

Cada item foi lido na implementação real antes de qualquer mudança — três agentes de exploração mapearam por completo o núcleo de nutrição/IA, consentimento/legal/entitlement, e infraestrutura/testes antes da primeira linha de código deste round. Nenhuma correção partiu de suposição sobre o que "provavelmente" o código fazia.

Este documento cobre os 28 itens do pedido original, na ordem de prioridade dada. **Só os itens P0 (1–8) foram implementados nesta rodada** — ver a seção "Escopo desta rodada" abaixo para o motivo de os demais terem ficado documentados, não implementados.

## Escopo desta rodada

28 itens cobrindo trava regulatória, documentos jurídicos, consentimento de dados sensíveis, cálculo metabólico determinístico, validação de IA, migração de major version do Next, suite E2E completa, Turnstile, orçamento de IA, observabilidade, reconciliação de pagamento, retenção de fotos, CSP, cotas atômicas, dependências e auth é, honestamente, várias semanas de trabalho sênior — não uma sessão. Implementar tudo de uma vez, sem checkpoint, num sistema que já processa pagamentos reais (Stripe) e dados de saúde reais, seria exatamente o tipo de mudança grande e não-revisável que um engenheiro sênior evita.

Por isso esta rodada entregou **P0 (itens 1–8) por completo**, validado item a item (type-check + lint + test + build depois de cada um, não só no final), e deixou **P0/P1 itens 9–10 e P1–P3 (itens 11–28) documentados com severidade, risco e solução proposta**, prontos para serem a próxima rodada.

---

## A. Itens implementados nesta rodada (P0, 1–8)

| ID | Severidade | Problema | Risco | Solução | Arquivos | Testes | Status | Depende de humano? | Advogado? | Nutricionista? | Config. externa |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Crítico | Nenhuma trava explícita de lançamento para geração de plano personalizado | Produto opera comercialmente sem revisão regulatória registrada | `REGULATORY_REVIEW_APPROVED` (server-only, runtime, `NODE_ENV=production`) bloqueia `/api/meal-plan` e edição de plano no chat com mensagem neutra até ser explicitamente `'true'` | `src/lib/regulatory.ts`, `src/app/api/meal-plan/route.ts`, `src/app/api/chat/route.ts`, `.env.example` | `src/lib/__tests__/regulatory.test.ts` (4 casos) | ✅ Feito | Sim — decidir e setar a variável | Sim (é quem decide se pode operar assim) | Não | Setar `REGULATORY_REVIEW_APPROVED=true` na Vercel quando aprovado |
| 2 | Crítico | Documentos legais com `[PLACEHOLDER...]` podem ir ao ar | Termos/Privacidade/Cancelamento/Retenção publicados incompletos | Dados institucionais centralizados em `src/config/legal.ts` (env vars); build de produção real na Vercel (`VERCEL_ENV=production`) falha enquanto algum estiver ausente; dev/CI/preview só avisam | `src/config/legal.ts`, `src/lib/legalDocsGate.js`, `next.config.js`, 5 páginas legais, `.env.example` | `src/lib/__tests__/legalDocsGate.test.ts` (6 casos) + verificado com `VERCEL_ENV=production npm run build` (falha como esperado) | ✅ Feito | Sim — fornecer razão social/CNPJ/endereço/DPO/etc. | Sim | Não | 9 env vars na Vercel (ver PRODUCTION_CHECKLIST.md) |
| 3 | Crítico | Sem consentimento específico para dado de saúde do questionário | Base legal genérica (Termos) pode não ser suficiente para dado sensível (LGPD art. 11) | Colunas versionadas + tabela de auditoria `health_data_consents` + endpoints de concessão/revogação; só passa a **bloquear** com `HEALTH_DATA_CONSENT_REQUIRED=true` (decisão do jurídico) | `supabase/migrations/026_health_data_consent.sql`, `src/lib/healthDataConsent.ts`, `src/app/api/health-data-consent/route.ts` (+`/revoke`), `src/app/api/questionnaire/route.ts`, `src/app/api/meal-plan/route.ts` | `src/lib/__tests__/healthDataConsent.test.ts` (5 casos) | ✅ Feito (estrutura); enforcement desligado por padrão | Sim — decidir a base legal e, se for consentimento, ligar a variável | Sim | Não | Rodar a migration 026; decidir `HEALTH_DATA_CONSENT_REQUIRED` |
| 4 | Alto | Sem estrutura para transparência de transferência internacional (LGPD art. 33) | OpenAI/Supabase/Stripe/MP/Vercel processam dados sem essa informação documentada | `src/config/dataProcessors.ts` (array tipado, vazio por padrão) + seção nova "5. Transferência internacional" em `/privacy`, que renderiza a lista quando preenchida | `src/config/dataProcessors.ts`, `src/app/privacy/page.tsx` | Coberto indiretamente pelo build (renderização condicional); não precisa de teste unitário próprio (é um array de dados, não lógica) | ✅ Feito (estrutura vazia — nenhum dado inventado) | Sim — confirmar operador/país/mecanismo com cada fornecedor | Sim | Não | Nenhuma (edição direta do arquivo depois de confirmado) |
| 5 | Crítico | BMR/TDEE calculados pela IA, sem `sexo biológico` coletado (Mifflin-St Jeor incompleta) | Cálculo calórico inconsistente/impreciso; matemática central delegada a um LLM | Módulo determinístico `src/lib/nutrition/energy.ts` (BMR, TDEE, fator de atividade, ajuste de objetivo, água); prompt passa a **receber** os valores, não calculá-los; campo `biological_sex` novo e obrigatório no questionário | `src/lib/nutrition/energy.ts`, migration `027_biological_sex.sql`, `src/lib/validation.ts`, `src/types/database.ts`, `src/lib/openai/prompts.ts`, `src/app/api/meal-plan/route.ts`, `questionnaire/page-client.tsx` | `src/lib/nutrition/__tests__/energy.test.ts` (9 casos, incluindo valores calculados à mão) | ✅ Feito | Não | Não | Sim — revisar fatores/ajustes usados (déficit 17.5%, superávit 10%, água 35ml/kg — mesmos valores que já estavam no prompt antigo) | Rodar a migration 027 |
| 6 | Alto | Zod só valida tipo/formato, não consistência matemática do plano gerado | IA pode devolver `total_calories` sem bater com macros/refeições, números negativos/NaN/absurdos | `src/lib/nutrition/mealPlanMath.ts` — valida 4/4/9, soma refeições vs total, meta vs calculado, números inválidos; 1 retry controlado; aborta sem salvar se persistir | `src/lib/nutrition/mealPlanMath.ts`, `src/app/api/meal-plan/route.ts`, `src/app/api/chat/route.ts` | `src/lib/nutrition/__tests__/mealPlanMath.test.ts` (11 casos) | ✅ Feito | Não | Não | Não | Nenhuma |
| 7 | Crítico | Chat dava conselho numérico/clínico livremente em texto para perfis de alto risco | Bloqueio existia só para escrita estruturada do plano, não para o texto livre da conversa | `getNutritionSafetyMode()` centraliza a decisão (sempre a partir do questionário salvo, nunca do que o usuário disser no chat); prompt do chat ganha bloco "MODO RESTRITO" que proíbe meta numérica/ajuste de macro/interpretação clínica em modo restrito | `src/lib/mealPlanSafety.ts`, `src/lib/openai/prompts.ts`, `src/app/api/chat/route.ts`, `src/app/api/meal-plan/route.ts` | `mealPlanSafety.test.ts` (+4 casos) + `src/lib/openai/__tests__/prompts.test.ts` (5 casos novos) | ✅ Feito | Não | Não | Sim — revisar se o texto do bloco restrito está adequado | Nenhuma |
| 8 | Alto | PRO podia ser vendido a perfis onde a geração de plano nunca vai funcionar | Cobrança sem entregar o benefício principal anunciado | `/pricing` consulta o modo de segurança do usuário; troca os botões de pagamento por aviso claro quando restricted; `/api/payment/stripe/intent` replica o bloqueio no servidor (defesa em profundidade) | `pricing/page-client.tsx`, `src/app/api/payment/stripe/intent/route.ts` | `route.concurrency.test.ts` (+2 casos: bloqueia perfil restrito, não bloqueia perfil normal) | ✅ Feito | Não | Não | Sim — revisar o texto do aviso | Nenhuma |

### Migrations criadas nesta rodada
- `supabase/migrations/026_health_data_consent.sql`
- `supabase/migrations/027_biological_sex.sql`

**Nenhuma foi aplicada em produção por mim** — não tenho acesso ao projeto Supabase de produção. Ver PRODUCTION_CHECKLIST.md para como aplicar.

### Variáveis de ambiente novas
`REGULATORY_REVIEW_APPROVED`, `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_CNPJ`, `LEGAL_ENTITY_ADDRESS`, `DPO_CONTACT_EMAIL`, `SUPPORT_CONTACT_EMAIL`, `LEGAL_DOCS_UPDATED_AT`, `REFUND_POLICY_TEXT`, `BACKUP_RETENTION_POLICY_TEXT`, `LEGAL_MINIMUM_RETENTION_TEXT`, `HEALTH_DATA_CONSENT_VERSION`, `HEALTH_DATA_CONSENT_REQUIRED` — todas documentadas em `.env.example`.

---

## B. Itens documentados, não implementados nesta rodada (9–28)

Severidade e risco avaliados a partir do código real (via os três agentes de mapeamento); solução é uma proposta concreta, não um esboço vago — mas nada aqui foi escrito.

| ID | Severidade | Problema (confirmado no código) | Risco | Solução proposta | Depende de humano? |
|---|---|---|---|---|---|
| 9 | Alto | Next 14.2.35 (não é mais a versão LTS suportada) | Sem patches de segurança futuros do framework | Migração faseada e isolada (worktree próprio), codemods oficiais, checar PWA/CSP/Supabase SSR a cada fase, nunca um `npm update` cego | Sim — janela de deploy, aprovação de risco |
| 10 | Alto | Zero teste de integração/E2E; Playwright citado no pedido mas nunca configurado no repo | Regressão de RLS, pagamento ou auth só é pega manualmente ou em produção | Playwright contra projeto Supabase de teste dedicado (nunca produção); cobrir auth, RLS cross-user, quota, Stripe sandbox, exclusão de conta | Sim — criar projeto Supabase de teste, chaves sandbox Stripe |
| 11 | Médio | Turnstile instalado, zero uso; signup/forgot-password chamam Supabase Auth direto do client, sem rota própria | Sem proteção contra criação de conta em massa | Criar rota de API para signup que valida token Turnstile server-side antes de `supabase.auth.signUp`; CSP já libera o host | Sim — obter site key/secret do Cloudflare |
| 12 | Médio | `AI_DAILY_BUDGET_BRL`/`AI_USER_MONTHLY_BUDGET_BRL` opcionais — ausência = sem limite | Custo de IA pode crescer sem teto em produção | Adicionar ao `REQUIRED_ENV_VARS` de `next.config.js` quando `NODE_ENV=production`; alertas em 70/90/100% (hoje só `console.error`) | Sim — decidir os valores de orçamento |
| 13 | Baixo | Tabela de custo por modelo hardcoded (`MODEL_PRICING_USD_PER_1M`); modelo desconhecido = custo silenciosamente 0 | Orçamento fica "cego" para gasto real se o modelo mudar sem atualizar a tabela | Mover para config versionada com teste que falha se `MODELS.TEXT`/`MODELS.VISION` não estiver na tabela | Não |
| 14 | Alto | Zero observabilidade (nenhum Sentry/equivalente); zero health check endpoint | Erro em produção só aparece no log da Vercel, ninguém é avisado proativamente | Sentry (ou similar) com sanitização central; `/api/health/live` e `/api/health/ready` sem chamar OpenAI a cada check | Sim — criar conta/DSN |
| 15 | (incluído no 14) | — | — | — | — |
| 16 | Médio | Sem reconciliação periódica Stripe↔banco; sem alerta de webhook falhando repetidamente | Divergência de estado financeiro pode passar despercebida | Job periódico (Vercel Cron) comparando `subscriptions` vs Stripe; alerta (via observabilidade do item 14) em falha repetida | Sim — depende do item 14 existir primeiro |
| 17 | Médio | Upload de foto sem cleanup em nenhuma falha posterior (confirmado: nenhum `.remove()` no código) | Arquivos órfãos acumulam no bucket `meal-photos` indefinidamente | `try/finally` no `/api/photo-analysis`: remove o objeto do Storage se qualquer etapa após o upload falhar | Não |
| 18 | Médio | Sem política técnica de retenção de fotos (nem prazo, nem cleanup automático) | `/data-retention` promete comportamento que o código não implementa | `MEAL_PHOTO_RETENTION_DAYS` (env) + job de cleanup, só depois do prazo ser decidido | Sim — decidir o prazo |
| 19 | Baixo | Frase "seus dados ficam privados e são usados apenas para gerar seu plano" no questionário contradizia `/privacy` | Copy inconsistente com o comportamento real (chat, OpenAI, storage, cota) | **Já corrigido nesta rodada** (estava no mesmo arquivo do item 5) — ver `questionnaire/page-client.tsx` | — |
| 20 | Médio | CSP com `unsafe-inline`/`unsafe-eval` (documentado como risco conhecido há 4 rounds) | Superfície de XSS maior que o necessário | Remover `unsafe-eval`; migrar para nonce/`strict-dynamic`; testar Stripe Embedded Checkout e Mercado Pago SDK em staging antes | Sim — precisa de ambiente de staging real para testar sem quebrar pagamento |
| 21 | Baixo | Security headers já corretos (HSTS, X-Frame-Options, etc.) — nada crítico pendente aqui | — | Adicionar teste automático que verifica os headers de produção (hoje não existe) | Não |
| 22 | Médio | Cota de IA é consumida antes da chamada à OpenAI, sem "refund" se a geração falhar (confirmado: nenhum código de estorno de cota) | Usuário perde 1 unidade de cota mensal mesmo sem receber plano/resposta | Padrão reserve→commit/release: reservar, executar, liberar em erro do servidor/provider (nunca em erro do usuário) | Não |
| 23 | (junto com 22) | — | — | — | — |
| 24 | Médio | 38 vulnerabilidades reportadas pelo Dependabot (20 altas) — não investigadas nesta rodada | Dependência desatualizada com CVE conhecida | Revisar por grupo de prioridade (runtime > Next/React > Supabase/OpenAI/Stripe > dev), `type-check+lint+test+build` a cada grupo | Sim — revisar cada PR do Dependabot |
| 25 | Baixo | Boa parte já está correta: lockfile versionado, `npm ci` no CI, Dependabot ativo | Falta confirmar branch protection e secret scanning (configuração do GitHub, não do código) | Checklist manual no GitHub (Settings → Branches, Settings → Security) | Sim — só o dono do repo consegue configurar |
| 26 | Baixo | Configuração do Supabase Dashboard (confirmação de e-mail, rate limit de auth, CAPTCHA nativo, SMTP) não é auditável a partir do código | Pode estar mal configurada sem que o repo revele isso | Checklist manual — ver PRODUCTION_CHECKLIST.md | Sim |
| 27 | Médio | Sem runbook de disaster recovery documentado | Sem plano claro de restore/RPO/RTO em incidente | Documentar com dados reais do plano Supabase contratado (não inventar) | Sim — só o mantenedor sabe o plano contratado |
| 28 | Baixo | Nodemailer/Gmail em produção + `resend` instalado e não usado | Decisão de produto pendente, não um bug | Avaliar migrar para Resend só se fizer sentido — não mexer sem necessidade | Sim — decisão de produto |

---

## C. O que NÃO pôde ser corrigido só por código

- **Decisão regulatória** (item 1): só o mantenedor pode decidir e registrar que o produto pode operar.
- **Textos jurídicos reais** (item 2): CNPJ/razão social/endereço/DPO — o mantenedor já informou que ainda não tem CNPJ (ver memória do projeto), então isso fica bloqueado até a formalização.
- **Base legal do dado de saúde** (item 3): decisão jurídica sobre LGPD art. 11.
- **Confirmação por fornecedor** (item 4): país de destino e mecanismo de transferência real com cada operador.
- **Revisão nutricional** (item 5): os fatores usados (déficit 17.5%, superávit 10%, água 35ml/kg) são os mesmos que já estavam no prompt anterior — só ficaram determinísticos. Vale revisão por nutricionista antes do lançamento comercial.
- **Ambiente de staging real** (itens 9, 10, 20): upgrade de Next e remoção de `unsafe-eval` da CSP não devem ser testados só localmente antes de ir para um domínio com pagamento real.
- **Contas externas** (itens 10, 11, 14): Supabase de teste, Turnstile, Sentry.

## D. Riscos residuais

- Enquanto `REGULATORY_REVIEW_APPROVED` e `HEALTH_DATA_CONSENT_REQUIRED` continuarem no padrão seguro (desligado/ausente), a geração de plano fica **bloqueada em produção** — isso é intencional, não um bug: o sistema está corretamente dizendo "não pronto" até vocês decidirem.
- O build de produção real na Vercel vai **falhar** enquanto as 9 variáveis de `src/config/legal.ts` não estiverem preenchidas — também intencional.
- Itens 9 (Next) e 20 (CSP) são os de maior risco técnico residual se não forem tratados com cuidado — ambos têm potencial de quebrar o checkout de pagamento se apressados.

## E. Testes — evidência (fase P0, depois de todos os 8 itens)

```
type-check: OK (tsc --noEmit, 0 erros)
lint:       OK (next lint, 0 warnings) — 2 avisos runtime esperados (Mercado Pago
            desabilitado, documentos legais incompletos), não são erros de lint
test:       21 arquivos, 160 testes, 160 passando
build:      OK, 49 rotas — e confirmado que VERCEL_ENV=production falha
            exatamente como projetado quando os docs legais estão incompletos
```

Testes novos desta rodada: `regulatory.test.ts` (4), `legalDocsGate.test.ts` (6), `healthDataConsent.test.ts` (5), `energy.test.ts` (9), `mealPlanMath.test.ts` (11), `mealPlanSafety.test.ts` (+4), `prompts.test.ts` (5, novo arquivo), `route.concurrency.test.ts` (+2), `validation.test.ts` (+4) = **50 testes novos**, todos cobrindo uma regra crítica nova.
