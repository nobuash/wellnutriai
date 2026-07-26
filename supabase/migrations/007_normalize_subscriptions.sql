-- =====================================================================
-- WellNutriAI — Normaliza o modelo de assinaturas (multi-provedor)
--
-- Aditivo e idempotente: não remove nem renomeia colunas existentes
-- (mp_subscription_id, mp_status seguem funcionando como estavam).
-- Os campos abaixo passam a ser a forma preferida de ler/escrever o
-- estado da assinatura, independente do provedor (Stripe ou Mercado
-- Pago). O código da aplicação passa a fazer "dual write" nas duas
-- gerações de coluna durante a transição.
--
-- Remoção futura planejada: quando todo o código e todos os dados
-- históricos estiverem migrados para as colunas novas, mp_subscription_id
-- e mp_status podem ser removidas em uma migration separada.
-- =====================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider TEXT CHECK (provider IN ('stripe', 'mercadopago')),
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT CHECK (
    status IN ('pending', 'active', 'past_due', 'incomplete', 'canceled', 'expired', 'payment_failed')
  ),
  ADD COLUMN IF NOT EXISTS billing_interval TEXT CHECK (billing_interval IN ('monthly', 'quarterly', 'annual')),
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

-- Backfill determinístico a partir dos dados legados existentes.
-- IDs de assinatura Stripe sempre começam com "sub_"; qualquer outra
-- coisa gravada em mp_subscription_id até hoje veio do Mercado Pago
-- (payment id numérico ou id de preapproval).
UPDATE public.subscriptions
SET
  provider = CASE WHEN mp_subscription_id LIKE 'sub\_%' ESCAPE '\' THEN 'stripe' ELSE 'mercadopago' END,
  provider_subscription_id = mp_subscription_id,
  status = CASE mp_status
    WHEN 'authorized' THEN 'active'
    WHEN 'pending'    THEN 'pending'
    WHEN 'paused'     THEN 'past_due'
    WHEN 'cancelled'  THEN 'canceled'
    ELSE 'expired'
  END,
  current_period_end = expires_at
WHERE provider IS NULL;

-- Uma linha de assinatura por (provedor, id do provedor). O id do
-- provedor já era globalmente único em mp_subscription_id; mantemos
-- a mesma garantia aqui.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_provider_sub_id
  ON public.subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_current_period_end ON public.subscriptions (current_period_end);

COMMENT ON COLUMN public.subscriptions.mp_subscription_id IS
  'DEPRECATED: mantido apenas para compatibilidade. Use provider_subscription_id.';
COMMENT ON COLUMN public.subscriptions.mp_status IS
  'DEPRECATED: mantido apenas para compatibilidade. Use status.';

-- =====================================================================
-- CORREÇÃO DE SEGURANÇA: a policy genérica criada em 001_initial_schema.sql
-- permite que o próprio usuário faça UPDATE/INSERT/DELETE em qualquer
-- coluna da sua própria linha em `subscriptions` — incluindo `status` e
-- `current_period_end`, que agora são a fonte da verdade do acesso PRO
-- (ver src/lib/entitlement.ts). Sem essa correção, um usuário poderia
-- chamar `supabase.from('subscriptions').update({status:'active',
-- current_period_end:'2099-01-01'})` pelo próprio client SDK e conceder
-- PRO para si mesmo permanentemente.
--
-- Nenhum código do frontend escreve em `subscriptions` (confirmado por
-- busca em src/): todas as escritas legítimas já acontecem via rotas de
-- servidor com service_role. Por isso é seguro remover totalmente a
-- permissão de escrita do usuário autenticado — mantemos apenas leitura.
-- =====================================================================
drop policy if exists "subscriptions_insert_own" on public.subscriptions;
drop policy if exists "subscriptions_update_own" on public.subscriptions;
drop policy if exists "subscriptions_delete_own" on public.subscriptions;
-- subscriptions_select_own permanece (usuário pode ler a própria assinatura).
