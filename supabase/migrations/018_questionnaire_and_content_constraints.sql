-- =====================================================================
-- WellNutriAI — Limites no banco para conteúdo que alimenta prompts de IA
--
-- O questionário, o chat e o plano alimentar eventualmente viram texto
-- dentro de um prompt da OpenAI. Sem limite no banco, a única barreira
-- era a validação Zod do formulário — inútil contra alguém inserindo
-- direto pelo client SDK (ver 017_restrict_server_generated_tables.sql,
-- que já fecha esse caminho para as tabelas geradas pelo servidor;
-- nutrition_questionnaires também passa a ser só leitura pro usuário).
--
-- Usa NOT VALID + validação em bloco protegido (mesma técnica de
-- 009_minimum_age.sql): nunca falha a migration por causa de dado
-- antigo que já viola o novo limite, só avisa via NOTICE para revisão
-- manual, e ainda assim passa a proteger todo INSERT/UPDATE novo.
-- =====================================================================

create or replace function public.array_items_max_length(arr text[], max_len int)
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(char_length(item) <= max_len), true) from unnest(arr) as item;
$$;

do $$
begin
  alter table public.nutrition_questionnaires
    add constraint nutrition_questionnaires_routine_length
    check (routine is null or char_length(routine) <= 500) not valid;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.nutrition_questionnaires
    add constraint nutrition_questionnaires_weight_range
    check (weight >= 30 and weight <= 300) not valid;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.nutrition_questionnaires
    add constraint nutrition_questionnaires_height_range
    check (height >= 100 and height <= 250) not valid;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.nutrition_questionnaires
    add constraint nutrition_questionnaires_body_fat_range
    check (body_fat is null or (body_fat >= 3 and body_fat <= 60)) not valid;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.nutrition_questionnaires
    add constraint nutrition_questionnaires_allergies_limit
    check (cardinality(allergies) <= 20 and public.array_items_max_length(allergies, 60)) not valid;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.nutrition_questionnaires
    add constraint nutrition_questionnaires_preferences_limit
    check (cardinality(dietary_preferences) <= 20 and public.array_items_max_length(dietary_preferences, 60)) not valid;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.nutrition_questionnaires
    add constraint nutrition_questionnaires_disliked_limit
    check (cardinality(disliked_foods) <= 30 and public.array_items_max_length(disliked_foods, 60)) not valid;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.chat_messages
    add constraint chat_messages_length check (char_length(message) <= 4000) not valid;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.meal_plans
    add constraint meal_plans_content_size check (pg_column_size(content) <= 50000) not valid;
exception when duplicate_object then null;
end $$;

-- Valida cada constraint contra os dados existentes em blocos
-- SEPARADOS: um BEGIN...EXCEPTION é uma subtransação, então se todas
-- estivessem no mesmo bloco, uma falha de validação numa (dado antigo
-- fora do limite) faria rollback do bloco inteiro e desfaria a
-- validação das outras que estavam limpas. Cada uma aqui é
-- independente — as demais continuam sendo validadas mesmo se uma
-- falhar.
do $$ begin
  alter table public.nutrition_questionnaires validate constraint nutrition_questionnaires_routine_length;
exception when check_violation then
  raise notice 'nutrition_questionnaires_routine_length não pôde ser validada contra dados existentes — ficou NOT VALID (protege writes novos).';
end $$;

do $$ begin
  alter table public.nutrition_questionnaires validate constraint nutrition_questionnaires_weight_range;
exception when check_violation then
  raise notice 'nutrition_questionnaires_weight_range não pôde ser validada contra dados existentes — ficou NOT VALID (protege writes novos).';
end $$;

do $$ begin
  alter table public.nutrition_questionnaires validate constraint nutrition_questionnaires_height_range;
exception when check_violation then
  raise notice 'nutrition_questionnaires_height_range não pôde ser validada contra dados existentes — ficou NOT VALID (protege writes novos).';
end $$;

do $$ begin
  alter table public.nutrition_questionnaires validate constraint nutrition_questionnaires_body_fat_range;
exception when check_violation then
  raise notice 'nutrition_questionnaires_body_fat_range não pôde ser validada contra dados existentes — ficou NOT VALID (protege writes novos).';
end $$;

do $$ begin
  alter table public.nutrition_questionnaires validate constraint nutrition_questionnaires_allergies_limit;
exception when check_violation then
  raise notice 'nutrition_questionnaires_allergies_limit não pôde ser validada contra dados existentes — ficou NOT VALID (protege writes novos).';
end $$;

do $$ begin
  alter table public.nutrition_questionnaires validate constraint nutrition_questionnaires_preferences_limit;
exception when check_violation then
  raise notice 'nutrition_questionnaires_preferences_limit não pôde ser validada contra dados existentes — ficou NOT VALID (protege writes novos).';
end $$;

do $$ begin
  alter table public.nutrition_questionnaires validate constraint nutrition_questionnaires_disliked_limit;
exception when check_violation then
  raise notice 'nutrition_questionnaires_disliked_limit não pôde ser validada contra dados existentes — ficou NOT VALID (protege writes novos).';
end $$;

do $$ begin
  alter table public.chat_messages validate constraint chat_messages_length;
exception when check_violation then
  raise notice 'chat_messages_length não pôde ser validada contra dados existentes — ficou NOT VALID (protege writes novos).';
end $$;

do $$ begin
  alter table public.meal_plans validate constraint meal_plans_content_size;
exception when check_violation then
  raise notice 'meal_plans_content_size não pôde ser validada contra dados existentes — ficou NOT VALID (protege writes novos).';
end $$;
