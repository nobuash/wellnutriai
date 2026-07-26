-- =====================================================================
-- WellNutriAI — Consentimento versionado dos termos
--
-- Corrige dois problemas confirmados:
-- 1) accepted_terms_at nunca era persistido de verdade porque o
--    trigger protect_plan_column (005_security_hardening.sql) reseta
--    esse campo para qualquer conexão que não seja service_role, e o
--    fluxo de aceite rodava com a sessão do próprio usuário.
-- 2) o gate de acesso em src/app/(app)/layout.tsx checava apenas
--    user.user_metadata.accepted_terms (JWT), que o próprio usuário
--    pode escrever livremente via supabase.auth.updateUser() — ou
--    seja, dava para pular a tela de termos sem nunca aceitar nada.
--
-- A partir desta migration, o aceite é gravado pelo servidor (service
-- role, via /api/accept-terms) e o gate passa a ler profiles.accepted_terms.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_version TEXT,
  ADD COLUMN IF NOT EXISTS privacy_version TEXT;

CREATE TABLE IF NOT EXISTS public.user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user ON public.user_consents (user_id, created_at DESC);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_consents_select_own" ON public.user_consents;
CREATE POLICY "user_consents_select_own" ON public.user_consents
  FOR SELECT USING (auth.uid() = user_id);

-- Sem policy de INSERT/UPDATE/DELETE para o usuário: o registro de
-- consentimento só pode ser criado pelo servidor (service_role, que
-- ignora RLS), garantindo que o usuário não possa fabricar seu próprio
-- histórico de aceite.
