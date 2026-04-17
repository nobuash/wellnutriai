-- =====================================================================
-- WellNutriAI - Atualiza subscriptions para suportar Mercado Pago
-- Execute este arquivo no SQL Editor do Supabase
-- =====================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS mp_subscription_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS mp_status          TEXT NOT NULL DEFAULT 'pending'
                                              CHECK (mp_status IN ('pending','authorized','paused','cancelled')),
  ADD COLUMN IF NOT EXISTS next_payment_date  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Índice para busca rápida pelo ID do MP
CREATE INDEX IF NOT EXISTS idx_subscriptions_mp_id
  ON public.subscriptions (mp_subscription_id)
  WHERE mp_subscription_id IS NOT NULL;
