# Controle de custo de IA

## Cotas de uso (contagem)

Definidas em `src/lib/plans.ts` (`PLAN_LIMITS`), consumidas atomicamente
via a RPC Postgres `consume_usage_quota` (`src/lib/aiUsage.ts` →
`consumeUsageQuota`):

| Feature | Free | PRO |
|---|---|---|
| Planos alimentares / mês | 1 | 6 |
| Mensagens de chat / mês | 0 | 300 |
| Análises de refeição / mês (foto + manual combinadas) | 0 | 30 |

A cota é incrementada **antes** de chamar a OpenAI, não depois — evita a
condição de corrida de "SELECT count() depois INSERT" (duas requisições
simultâneas conseguindo passar do limite), ao custo de, numa falha rara da
OpenAI, o usuário perder uma unidade de cota sem receber resultado. Não
implementamos estorno automático nesse caso — considerar se o volume de
falhas justificar.

Nenhum plano é "ilimitado" de propósito — toda a comunicação ao usuário
(pricing, landing, sidebar) foi ajustada para dizer "uso amplo sujeito à
política de uso justo" em vez de prometer algo que o código não cumpre.

## Log de custo (`ai_usage_logs`)

Toda chamada à OpenAI (`meal_plan`, `chat`, `photo_analysis`,
`photo_analysis_manual`) registra tokens de entrada/saída e um custo
estimado em BRL (`logAiUsage`). **Nunca** grava o prompt, a imagem em
base64, nem qualquer texto do usuário — só metadados agregados.

O custo é estimado com uma tabela de preços aproximada
(`MODEL_PRICING_USD_PER_1M` em `src/lib/aiUsage.ts`) e um câmbio
USD→BRL configurável (`USD_BRL_RATE`, padrão 5.5). **Isso precisa ser
revisado periodicamente** — preços da OpenAI mudam, e o câmbio real varia
todo dia; o objetivo aqui é ordem de grandeza para o circuit breaker, não
faturamento exato.

## Circuit breakers

Dois, independentes, ambos **desligados por padrão** (só ativam quando a
variável de ambiente correspondente é configurada com um valor > 0 — a
proteção nunca bloqueia a aplicação silenciosamente antes de alguém
decidir um orçamento):

- `AI_DAILY_BUDGET_BRL` — teto de gasto global por dia
  (`checkDailyAiBudget`). Estourado → todas as chamadas de IA (qualquer
  usuário) retornam 503 com mensagem amigável até a virada do dia.
- `AI_USER_MONTHLY_BUDGET_BRL` — teto de gasto por usuário no mês
  (`checkUserMonthlyBudget`). Estourado → 402 pedindo para falar com o
  suporte.

Ambos consultam `ai_usage_logs` diretamente (soma de `estimated_cost_brl`
no período) — não há cache, então cada chamada de IA faz uma query extra
de agregação. Para o volume atual (early-stage) isso é aceitável; se
crescer, considere materializar um contador incremental em vez de somar
a tabela inteira a cada requisição.

## O que NÃO está implementado

- **Alertas ativos** (Slack/e-mail quando o orçamento estoura) — hoje só
  vira `console.error`, que só é visível olhando os logs da Vercel (ou via
  Sentry, se/quando integrado). Não há push de notificação.
- **Dashboard de custo** — os dados existem em `ai_usage_logs`, mas não há
  nenhuma tela no app nem query pronta além do que os circuit breakers já
  fazem. Um `SELECT feature, date_trunc('day', created_at), sum(estimated_cost_brl)
  FROM ai_usage_logs GROUP BY 1, 2` no SQL Editor do Supabase já dá uma
  visão básica enquanto isso não existe.
- **Structured Outputs / JSON Schema da OpenAI**: as chamadas usam
  `response_format: { type: 'json_object' }` (JSON mode), não o
  Structured Outputs mais recente com schema JSON estrito. A validação de
  formato acontece depois, no lado da aplicação, com Zod
  (`mealPlanContentSchema`, `photoAnalysisResultSchema`) — funciona, mas
  migrar para Structured Outputs reduziria ainda mais a chance de a IA
  fugir do formato esperado.
