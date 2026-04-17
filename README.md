# WellNutriAI 🥗

SaaS de planos alimentares **sugeridos por inteligência artificial**, construído com Next.js 14, Supabase e OpenAI.

> ⚠️ **Aviso legal crítico:** o WellNutriAI **não prescreve dietas** e **não substitui nutricionista**. Toda saída da IA é apresentada como "plano alimentar sugerido por inteligência artificial" e o aceite do termo de responsabilidade é obrigatório antes do uso.

---

## 🏗️ Stack

- **Frontend**: Next.js 14 (App Router) + React 18 + TailwindCSS
- **Backend**: Next.js API Routes (Node runtime)
- **Banco + Auth + Storage**: Supabase
- **IA**: OpenAI (`gpt-4o-mini` para texto, `gpt-4o` para visão)
- **Estado**: React Query (TanStack Query)
- **Forms**: React Hook Form + Zod
- **UI**: Tailwind + Lucide Icons + Sonner (toasts)

---

## 📁 Estrutura

```
src/
├── app/
│   ├── (auth)/            # login, signup, accept-terms
│   ├── (app)/             # dashboard, questionnaire, meal-plan, chat, photo-analysis, pricing
│   ├── api/               # meal-plan, chat, photo-analysis
│   ├── layout.tsx         # layout raiz + providers
│   ├── page.tsx           # landing page
│   └── globals.css
├── components/
│   ├── ui/                # Button, Input, Card, Disclaimer
│   ├── Sidebar.tsx
│   └── Providers.tsx      # React Query + Toaster
├── lib/
│   ├── supabase/          # client, server, middleware SSR
│   ├── openai/            # client + prompts (linguagem legalmente segura)
│   ├── plans.ts           # controle free/pro centralizado
│   ├── validation.ts      # schemas Zod
│   └── utils.ts
├── types/
│   └── database.ts
├── middleware.ts          # ⚠️ BLOCKING FLOW de aceite de termos
supabase/
└── migrations/
    └── 001_initial_schema.sql
```

### Arquitetura por camadas

- **UI**: `components/` e páginas em `app/`
- **Lógica de negócio**: `lib/plans.ts`, `lib/validation.ts`
- **Serviços**: `lib/supabase/`, `lib/openai/`
- **Validação**: schemas Zod em `lib/validation.ts` (cliente e servidor)
- **Controle de plano**: `lib/plans.ts` — fonte única da verdade

---

## 🚀 Setup

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar Supabase

1. Crie um projeto em https://supabase.com
2. No **SQL Editor**, execute integralmente o arquivo:
   ```
   supabase/migrations/001_initial_schema.sql
   ```
   Isso cria: tabelas, RLS, trigger `handle_new_user`, bucket privado `meal-photos` e policies.

3. Em **Authentication → Providers**, habilite **Email**.

### 3. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...    # ainda não usado, mas reservado
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Rodar em desenvolvimento

```bash
npm run dev
```

Abra http://localhost:3000

---

## 🔒 Segurança implementada

### Row Level Security (RLS)
Todas as 6 tabelas com RLS ativado. Usuário só acessa seus próprios dados:
- `auth.uid() = user_id` em SELECT, INSERT, UPDATE, DELETE

### Storage privado
Bucket `meal-photos` é privado; paths são prefixados com `{user_id}/` e a policy exige match do user_id.

### API keys
- `OPENAI_API_KEY` **nunca** é exposta ao cliente — todas as chamadas à OpenAI acontecem em API routes.
- `SUPABASE_ANON_KEY` é pública por design (RLS é quem protege os dados).

### Blocking flow de termos
O `middleware.ts` **força redirect para `/accept-terms`** sempre que o usuário tenta acessar uma rota protegida sem ter `accepted_terms = true` no banco. Cada API route também valida o aceite (defesa em profundidade).

### Validação
- Client-side: Zod via React Hook Form
- Server-side: Zod em toda API route que recebe body

### Controle de plano
`lib/plans.ts` é consultado em cada API route para verificar limites. Retorna HTTP 402 com flag `upgrade: true` quando o limite é atingido — o frontend mostra um toast com CTA para `/pricing`.

---

## ⚖️ Compliance legal

### Linguagem da IA
Todos os prompts em `lib/openai/prompts.ts` instruem explicitamente:
- ❌ Nunca usar "dieta prescrita", "prescrição", "tratamento"
- ✅ Sempre usar "plano alimentar sugerido", "você poderia considerar"
- ✅ Orientar busca de profissional em casos médicos

### Disclaimer
- Componente `<Disclaimer />` em todo layout autenticado
- Texto `LEGAL_DISCLAIMER` injetado no JSON do plano (defesa extra caso IA omita)
- Termo completo em `/accept-terms`, armazenado com timestamp

### Aceite obrigatório
```ts
profiles.accepted_terms      // boolean
profiles.accepted_terms_at   // timestamp
```

---

## 💰 Planos

| Recurso                  | Free        | Pro         |
|--------------------------|-------------|-------------|
| Planos alimentares/mês   | 1           | ilimitado   |
| Mensagens de chat/dia    | 10          | ilimitado   |
| Análise por foto         | ❌          | ✅          |

Definido em `src/lib/plans.ts`.

---

## 🧪 Fluxo do usuário

1. **Landing** (`/`) → clica em "Criar conta"
2. **Signup** → cria conta (profile é criado via trigger do Supabase)
3. **`/accept-terms`** → middleware redireciona aqui enquanto `accepted_terms = false`
4. **`/dashboard`** → visão geral
5. **`/questionnaire`** → preenche dados pessoais
6. **`/meal-plan`** → gera plano via `POST /api/meal-plan`
7. **`/chat`** → conversa contextualizada (questionário + plano + últimas 10 mensagens)
8. **`/photo-analysis`** → upload + análise Vision (PRO)

---

## 🔌 API Routes

### `POST /api/meal-plan`
Gera um plano alimentar a partir do questionário mais recente.
- Valida: autenticação → aceite de termos → limite do plano → questionário existe
- Chama OpenAI com `response_format: json_object`
- Persiste em `meal_plans`

### `POST /api/chat`
Body: `{ message: string }`
- Valida: auth → termos → limite diário
- Monta contexto: questionário + resumo do plano + últimas 10 mensagens
- Salva mensagem do user e resposta da IA

### `POST /api/photo-analysis`
FormData com `image` (JPEG/PNG/WebP, máx 5MB).
- Valida: auth → termos → plano é PRO → arquivo válido
- Upload em `meal-photos/{user_id}/...`
- Envia base64 para `gpt-4o` com Vision
- Persiste resultado

---

## 🏭 Produção — o que configurar

### Obrigatório
- [ ] Gateway de pagamento (Stripe/MercadoPago) — substituir `/pricing` mutação direta por checkout + webhook
- [ ] Rate limiting nas API routes (Upstash Ratelimit ou Vercel Edge Config)
- [ ] Configurar domínio custom em Supabase Auth (email templates)
- [ ] Observabilidade: Sentry ou similar
- [ ] CSP headers em `next.config.js`

### Recomendado
- [ ] Captcha em signup (hCaptcha/Cloudflare Turnstile)
- [ ] Verificação de email obrigatória
- [ ] Logs estruturados no backend
- [ ] Backup automatizado do Supabase

---

## 📜 Licença

Proprietário. Todos os direitos reservados.
# wellnutriai
