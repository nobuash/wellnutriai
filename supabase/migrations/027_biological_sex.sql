-- =====================================================================
-- WellNutriAI — Sexo biológico para cálculo metabólico determinístico
--
-- A fórmula de Mifflin-St Jeor (BMR) depende de um termo aditivo/
-- subtrativo por sexo biológico (+5 homens / -161 mulheres). Até
-- agora esse dado não era coletado e o cálculo de calorias era
-- delegado inteiramente à IA sem esse insumo (ver
-- src/lib/nutrition/energy.ts, que substitui esse cálculo por código
-- determinístico).
--
-- Coluna nullable de propósito: questionários já respondidos não têm
-- esse dado e não devem ser invalidados retroativamente. O schema Zod
-- da aplicação (src/lib/validation.ts) passa a exigir o campo em
-- SUBMISSÕES NOVAS; o módulo de cálculo recusa calcular BMR/TDEE
-- quando o valor está ausente, em vez de adivinhar ou usar um valor
-- padrão.
-- =====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'biological_sex') THEN
    CREATE TYPE biological_sex AS ENUM ('male', 'female');
  END IF;
END $$;

ALTER TABLE public.nutrition_questionnaires
  ADD COLUMN IF NOT EXISTS biological_sex biological_sex;
