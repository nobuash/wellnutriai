-- =====================================================================
-- WellNutriAI — Trava consume_usage_quota e check_rate_limit para service_role
--
-- PROBLEMA CONFIRMADO: as duas funções foram criadas SECURITY DEFINER
-- com "grant execute ... to authenticated", e ambas recebem parâmetros
-- de identidade/limite vindos diretamente do chamador
-- (p_user_id, p_limit, p_key, p_max, p_window_seconds). Qualquer
-- usuário autenticado podia chamar, por exemplo:
--
--   supabase.rpc('consume_usage_quota', {
--     p_user_id: '<uuid de outro usuário>',
--     p_feature: 'chat', p_period_key: '2026-07', p_limit: 0
--   })
--
-- direto do client SDK no navegador, sem passar pela nossa API — nada
-- validava p_user_id = auth.uid(). Isso permite esgotar a cota de
-- outra pessoa (negação de serviço direcionada) ou, com check_rate_limit,
-- escolher p_max altíssimo pra nunca ser limitado, ou um p_key
-- adivinhado de outro usuário pra "sujar" o contador dele.
--
-- SECURITY DEFINER só é seguro combinado com um grant restrito — a
-- função em si sempre teve os parâmetros corretos, o problema era quem
-- podia chamá-la. A partir de agora, só service_role pode: as rotas de
-- API já foram atualizadas para chamar via createServiceClient()
-- (ver src/lib/aiUsage.ts e src/lib/distributedRateLimit.ts).
-- =====================================================================

revoke all on function public.consume_usage_quota(uuid, text, text, int) from authenticated;
revoke all on function public.consume_usage_quota(uuid, text, text, int) from anon;
revoke all on function public.consume_usage_quota(uuid, text, text, int) from public;
grant execute on function public.consume_usage_quota(uuid, text, text, int) to service_role;

revoke all on function public.check_rate_limit(text, int, int) from authenticated;
revoke all on function public.check_rate_limit(text, int, int) from anon;
revoke all on function public.check_rate_limit(text, int, int) from public;
grant execute on function public.check_rate_limit(text, int, int) to service_role;
