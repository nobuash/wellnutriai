-- =====================================================================
-- WellNutriAI — Trava escrita direta em tabelas geradas pelo servidor
--
-- PROBLEMA CONFIRMADO: as policies genéricas de 001_initial_schema.sql
-- ("insert/update/delete own") continuam ativas em meal_plans,
-- chat_messages, meal_photo_analysis e nutrition_questionnaires — só
-- subscriptions foi travada no round 1. Um usuário podia, direto do
-- client SDK:
--
--   supabase.from('chat_messages').insert({
--     user_id: auth.uid(), role: 'ai', message: 'instrução maliciosa...'
--   })
--
-- e forjar uma mensagem "da IA", que depois entra como contexto de
-- conversas futuras (vetor de prompt injection armazenada) — RLS só
-- checava auth.uid() = user_id, nunca o valor de "role". O mesmo vale
-- para inserir um meal_plans ou meal_photo_analysis fabricado, ou um
-- nutrition_questionnaires com valores fora dos limites esperados
-- (idade, alergias, preferências sem tamanho máximo).
--
-- A partir de agora, só SELECT continua liberado para o dono da linha
-- — toda escrita passa a exigir service_role. As rotas de API
-- correspondentes (meal-plan, chat, photo-analysis, questionnaire)
-- foram atualizadas para usar createServiceClient().
-- =====================================================================

drop policy if exists "meal_plans_insert_own" on public.meal_plans;
drop policy if exists "meal_plans_update_own" on public.meal_plans;
drop policy if exists "meal_plans_delete_own" on public.meal_plans;

drop policy if exists "chat_messages_insert_own" on public.chat_messages;
drop policy if exists "chat_messages_update_own" on public.chat_messages;
drop policy if exists "chat_messages_delete_own" on public.chat_messages;

drop policy if exists "meal_photo_analysis_insert_own" on public.meal_photo_analysis;
drop policy if exists "meal_photo_analysis_update_own" on public.meal_photo_analysis;
drop policy if exists "meal_photo_analysis_delete_own" on public.meal_photo_analysis;

drop policy if exists "nutrition_questionnaires_insert_own" on public.nutrition_questionnaires;
drop policy if exists "nutrition_questionnaires_update_own" on public.nutrition_questionnaires;
drop policy if exists "nutrition_questionnaires_delete_own" on public.nutrition_questionnaires;
-- *_select_own permanece em todas as quatro tabelas.
