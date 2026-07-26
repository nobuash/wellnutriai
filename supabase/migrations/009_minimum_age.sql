-- =====================================================================
-- WellNutriAI — Idade mínima de 18 anos
--
-- O questionário é inserido diretamente pelo cliente autenticado
-- (supabase.from('nutrition_questionnaires').insert(...) em
-- src/app/(app)/questionnaire/page.tsx), então a validação Zod no
-- frontend é só UX — a única barreira real contra um cliente
-- adulterado é este CHECK constraint no banco.
--
-- Usamos NOT VALID + VALIDATE em separado para não quebrar a migration
-- caso já existam questionários de menores de 18 anos no banco: a
-- constraint passa a valer para todo INSERT/UPDATE novo imediatamente,
-- mas não apaga nem rejeita retroativamente linhas antigas.
-- =====================================================================

ALTER TABLE public.nutrition_questionnaires
  DROP CONSTRAINT IF EXISTS nutrition_questionnaires_age_check;

ALTER TABLE public.nutrition_questionnaires
  ADD CONSTRAINT nutrition_questionnaires_age_check
  CHECK (age >= 18 AND age < 120) NOT VALID;

-- Tenta validar contra os dados existentes; se houver linhas antigas
-- com age < 18, este comando falha e a constraint fica marcada como
-- NOT VALID (ainda protege writes novos) até alguém decidir o que
-- fazer com os registros antigos — rode manualmente depois de revisar:
--   SELECT id, user_id, age FROM nutrition_questionnaires WHERE age < 18;
DO $$
BEGIN
  ALTER TABLE public.nutrition_questionnaires VALIDATE CONSTRAINT nutrition_questionnaires_age_check;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'Existem questionários com age < 18 — constraint aplicada só a novos registros. Revise manualmente.';
END $$;
