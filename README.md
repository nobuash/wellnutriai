# WellNutriAI 🥗

SaaS de planos alimentares **sugeridos por inteligência artificial**, construído com Next.js 14, Supabase e OpenAI.

> ⚠️ **Aviso legal crítico:** o WellNutriAI **não prescreve dietas** e **não substitui nutricionista**. Toda saída da IA é apresentada como "plano alimentar sugerido por inteligência artificial" e o aceite do termo de responsabilidade é obrigatório antes do uso. Usuários com diabetes (tipo 1, tipo 2 ou pré-diabetes) **não recebem plano personalizado automatizado** — ver `docs/production-hardening-audit.md`.

Para o histórico completo de hardening de produção (pagamentos, segurança,
cotas de IA, LGPD/consentimento), veja `docs/production-hardening-audit.md`
e os demais arquivos em `docs/`.

---

## 🏗️ Stack

- **Frontend**: Next.js 14 (App Router) + React 18 + TailwindCSS
- **Backend**: Next.js API Routes (Node runtime)
- **Banco + Auth + Storage**: Supabase (Postgres + RLS)
- **IA**: OpenAI (`gpt-4.1-mini` para texto/chat, `gpt-4o` para visão)
- **Pagamentos**: Mercado Pago (PIX e cartão avulso) + Stripe (assinatura recorrente)
- **Estado**: React Query (TanStack Query)
- **Forms**: React Hook Form + Zod
- **UI**: Tailwind + Lucide Icons + Sonner (toasts)
- **PWA**: `@ducanh2912/next-pwa` (cache restrito a assets estáticos — ver `docs/security.md`)

---

## 📁 Estrutura

```
src/
├── app/
│   ├── (auth)/            # login, signup, forgot/reset-password, accept-terms
│   ├── (app)/             # dashboard, questionnaire, meal-plan, chat, photo-analysis,
│   │                       pricing, hydration, account, support, install-app
│   ├── api/
│   │   ├── meal-plan, chat, photo-analysis, accept-terms, entitlement, account/delete
│   │   └── payment/        # subscribe, pix, card, verify, cancel, webhook, stripe/*
│   ├── layout.tsx
│   ├── page.tsx           # landing page
│   └── globals.css
├── components/
├── lib/
│   ├── supabase/          # client (browser), server (SSR), service (service_role), middleware
│   ├── openai/            # client + prompts (linguagem legalmente segura)
│   ├── stripe/, mercadopago/
│   ├── entitlement.ts     # fonte única da verdade do acesso PRO
│   ├── plans.ts           # limites de uso por plano
│   ├── aiUsage.ts         # log de custo de IA + circuit breakers de orçamento
│   ├── distributedRateLimit.ts / ratelimit.ts
│   ├── mealPlanSafety.ts  # gate médico + validação de alergia + schema Zod do plano
│   ├── photoAnalysisSchema.ts
│   ├── consent.ts         # versionamento de termos/privacidade
│   └── validation.ts      # schemas Zod
├── types/database.ts
├── middleware.ts
supabase/
└── migrations/            # 001 → 012, todas idempotentes
docs/
├── production-hardening-audit.md   # achados confirmados + status de cada correção
├── payment-flows.md
├── security.md
├── data-retention.md
├── ai-cost-control.md
├── deployment-checklist.md
└── incident-response.md
```

---

## 🚀 Setup

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar Supabase

1. Crie um projeto em https://supabase.com
2. No **SQL Editor**, execute os arquivos de `supabase/migrations/` **em ordem**,
   de `001_initial_schema.sql` até o mais recente. Todos são idempotentes
   (seguros para rodar de novo).
3. Em **Authentication → Providers**, habilite **Email**.
4. Em **Authentication → URL Configuration**, configure o Site URL de produção
   e os Redirect URLs (necessário para o fluxo de recuperação de senha).

### 3. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha — o arquivo já está
organizado por integração (Supabase, OpenAI, Mercado Pago, Stripe, e-mail,
consentimento, orçamento de IA). Variáveis ausentes de
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` ou `OPENAI_API_KEY` fazem o `next build` falhar
imediatamente com uma mensagem clara.

### 4. Rodar em desenvolvimento

```bash
npm run dev
```

Abra http://localhost:3000

---

## 🔒 Segurança, pagamentos, custo de IA e LGPD

Documentado em detalhe em `docs/`:

- `docs/security.md` — RLS, autenticação, rate limiting, cabeçalhos, o que
  ainda depende de configuração externa (Turnstile, Sentry).
- `docs/payment-flows.md` — diferença entre PIX/cartão avulso (Mercado
  Pago, sem renovação automática) e assinatura recorrente (Stripe, com
  cancelamento real via API), e por que `profiles.plan` nunca é a fonte da
  verdade de acesso PRO.
- `docs/ai-cost-control.md` — cotas por plano, log de custo, circuit
  breakers de orçamento.
- `docs/data-retention.md` — o que é coletado, como a exclusão de conta
  funciona.
- `docs/deployment-checklist.md` — passo a passo para colocar esta branch
  em produção.
- `docs/incident-response.md` — runbook para os incidentes mais prováveis
  (pagamento não ativou PRO, cobrança após cancelamento, orçamento de IA
  estourado).

---

## 💰 Planos

Definido em `src/lib/plans.ts` — nenhum plano é tecnicamente ilimitado; a
comunicação ao usuário diz "uso amplo sujeito à política de uso justo".

| Recurso                              | Free | Pro |
|---------------------------------------|------|-----|
| Planos alimentares/mês                | 1    | 6   |
| Mensagens de chat/mês                 | 0    | 300 |
| Análises de refeição/mês (foto+manual)| 0    | 30  |

Consumo é atômico via RPC Postgres (`consume_usage_quota`), não uma
contagem seguida de insert — evita duas requisições simultâneas furarem o
limite.

---

## 🧪 Fluxo do usuário

1. **Landing** (`/`) → "Criar conta"
2. **Signup** → cria conta (profile via trigger do Supabase)
3. **`/accept-terms`** → gate lê `profiles.accepted_terms` no banco (não
   `user_metadata` do JWT — esse é gravável pelo próprio usuário e não pode
   ser um controle de acesso)
4. **`/questionnaire`** → dados pessoais (idade mínima 18 anos)
5. **`/meal-plan`** → gera plano via `POST /api/meal-plan` — bloqueado com
   explicação para condições médicas de alto risco (diabetes)
6. **`/chat`** → conversa contextualizada, pode editar o plano (com as
   mesmas validações de segurança/alergia da geração inicial)
7. **`/photo-analysis`** → upload ou entrada manual (PRO)
8. **`/pricing`** → assinar (PIX/cartão MP ou Stripe) e gerenciar/cancelar
9. **`/account`** → excluir conta (apaga dados, fotos, cancela assinatura)

---

## 🧰 CI

`.github/workflows/ci.yml` roda `type-check`, `lint` e `build` em todo PR
e push para `main`, com env vars fictícias só para o build passar. Não há
suite de testes automatizados ainda (ver `docs/production-hardening-audit.md`
para o que falta).

---

## 📜 Licença

Proprietário. Todos os direitos reservados.
