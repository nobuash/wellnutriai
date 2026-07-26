-- =====================================================================
-- WellNutriAI — Fecha o bypass de consentimento
--
-- PROBLEMA CONFIRMADO: protect_plan_column (005_security_hardening.sql)
-- só restaura plan, accepted_terms_at e created_at para conexões que
-- não são service_role. accepted_terms, terms_version e
-- privacy_version — adicionados na migration 008 — nunca foram
-- protegidos. Um usuário podia chamar, direto do client SDK:
--
--   supabase.from('profiles').update({
--     accepted_terms: true, terms_version: '1', privacy_version: '1'
--   })
--
-- e passar pelo gate de /accept-terms (que checa exatamente essas
-- colunas, ver src/app/(app)/layout.tsx) sem nunca ter aceitado nada
-- pela rota oficial /api/accept-terms. O round 1 corrigiu o caminho
-- legítimo (a rota grava certo agora) mas não fechou o ilegítimo.
--
-- Reescreve a função para proteger todos os campos administrativos —
-- não só os de consentimento — e mantém "name" como o único campo que
-- o próprio usuário pode alterar (é o único editável hoje, ver
-- src/app/(app)/layout.tsx). Também protege "email": mudança de e-mail
-- deve passar pelo fluxo de verificação do Supabase Auth, não por um
-- update direto na tabela profiles.
-- =====================================================================

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
  end if;
  return new;
end;
$$;

-- O trigger já existe (criado em 005_security_hardening.sql) e chama
-- esta mesma função — CREATE OR REPLACE acima já é suficiente, não é
-- preciso recriar o trigger em si.
