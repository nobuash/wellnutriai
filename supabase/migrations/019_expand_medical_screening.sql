-- =====================================================================
-- WellNutriAI — Expande a triagem médica do questionário
--
-- Até agora só diabetes_type bloqueava geração personalizada (ver
-- src/lib/mealPlanSafety.ts, round 1). O questionário não coletava
-- gestação, amamentação, doença renal/hepática, histórico de
-- transtorno alimentar, alergia severa/anafilaxia ou uso de insulina —
-- então o sistema não tinha como saber e bloquear esses casos.
--
-- Campos booleanos simples + um texto livre curto para "outra
-- condição relevante". Nenhum é obrigatório (default false), então
-- não quebra a inserção de questionários antigos.
-- =====================================================================

alter table public.nutrition_questionnaires
  add column if not exists is_pregnant boolean not null default false,
  add column if not exists is_breastfeeding boolean not null default false,
  add column if not exists has_kidney_disease boolean not null default false,
  add column if not exists has_liver_disease boolean not null default false,
  add column if not exists has_eating_disorder_history boolean not null default false,
  add column if not exists has_severe_allergy boolean not null default false,
  add column if not exists uses_insulin boolean not null default false,
  add column if not exists other_medical_condition text;

do $$
begin
  alter table public.nutrition_questionnaires
    add constraint nutrition_questionnaires_other_condition_length
    check (other_medical_condition is null or char_length(other_medical_condition) <= 300) not valid;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.nutrition_questionnaires
    validate constraint nutrition_questionnaires_other_condition_length;
exception when check_violation then
  raise notice 'other_medical_condition com mais de 300 caracteres em dados existentes — constraint ficou NOT VALID.';
end $$;
