-- =====================================================================
-- WellNutriAI — Consentimento específico para dados de saúde
--
-- O questionário nutricional coleta dado sensível no sentido do art.
-- 11 da LGPD (diabetes, gestação, amamentação, doença renal/hepática,
-- transtorno alimentar, alergia severa, uso de insulina, outra
-- condição médica). Até aqui, o único aceite registrado era o
-- genérico de Termos/Privacidade (user_consents,
-- 008_terms_consent.sql) — sem registro separado, versionado e
-- revogável específico para esse dado.
--
-- Esta migration só cria a estrutura. A decisão de qual base legal do
-- art. 7º/11 da LGPD se aplica (consentimento vs. outra base) é do
-- jurídico — ver HEALTH_DATA_CONSENT_REQUIRED em
-- src/lib/healthDataConsent.ts, que só passa a exigir o aceite quando
-- essa variável for explicitamente ligada.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS health_data_consent_version TEXT,
  ADD COLUMN IF NOT EXISTS health_data_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_data_consent_revoked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.health_data_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('granted', 'revoked')),
  version TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_data_consents_user ON public.health_data_consents (user_id, created_at DESC);

ALTER TABLE public.health_data_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "health_data_consents_select_own" ON public.health_data_consents;
CREATE POLICY "health_data_consents_select_own" ON public.health_data_consents
  FOR SELECT USING (auth.uid() = user_id);

-- Sem policy de INSERT/UPDATE/DELETE para o usuário — mesmo motivo de
-- user_consents: o histórico só pode ser escrito pelo servidor
-- (service_role), nunca fabricado pelo próprio usuário.

-- Estende protect_plan_column (014_secure_consent_columns.sql) para
-- também travar as 3 colunas novas fora de service_role — do
-- contrário um usuário poderia se auto-conceder consentimento de
-- saúde direto pelo client SDK, do mesmo jeito que já foi corrigido
-- para accepted_terms/terms_version/privacy_version.
create or replace function public.protect_plan_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('role') <> 'service_role' then
    new.plan := old.plan;
    new.accepted_terms := old.accepted_terms;
    new.accepted_terms_at := old.accepted_terms_at;
    new.terms_version := old.terms_version;
    new.privacy_version := old.privacy_version;
    new.email := old.email;
    new.created_at := old.created_at;
    new.health_data_consent_version := old.health_data_consent_version;
    new.health_data_consent_at := old.health_data_consent_at;
    new.health_data_consent_revoked_at := old.health_data_consent_revoked_at;
  end if;
  return new;
end;
$$;
