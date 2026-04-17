-- =====================================================================
-- WellNutriAI - Schema inicial
-- Execute este arquivo no SQL Editor do Supabase
-- =====================================================================

-- 1. PROFILES -------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  plan text not null default 'free' check (plan in ('free','pro')),
  accepted_terms boolean not null default false,
  accepted_terms_at timestamptz,
  created_at timestamptz not null default now()
);

-- Trigger: cria profile automaticamente ao registrar usuário
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. QUESTIONÁRIOS NUTRICIONAIS ------------------------------------------
create table if not exists public.nutrition_questionnaires (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  age int not null check (age > 0 and age < 120),
  weight numeric(5,2) not null check (weight > 0),
  height numeric(5,2) not null check (height > 0),
  body_fat numeric(4,1),
  goal text not null check (goal in ('gain_muscle','lose_fat','maintain')),
  activity_level text not null check (activity_level in ('sedentary','light','moderate','intense','athlete')),
  allergies text[] default '{}',
  dietary_preferences text[] default '{}',
  disliked_foods text[] default '{}',
  meals_per_day int not null default 4 check (meals_per_day between 2 and 8),
  routine text,
  created_at timestamptz not null default now()
);

create index if not exists idx_questionnaires_user on public.nutrition_questionnaires(user_id, created_at desc);

-- 3. PLANOS ALIMENTARES --------------------------------------------------
create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  questionnaire_id uuid references public.nutrition_questionnaires(id) on delete set null,
  content jsonb not null,
  calories_estimate int,
  created_at timestamptz not null default now()
);

create index if not exists idx_meal_plans_user on public.meal_plans(user_id, created_at desc);

-- 4. MENSAGENS DE CHAT ---------------------------------------------------
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','ai')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_user on public.chat_messages(user_id, created_at asc);

-- 5. ANÁLISE DE FOTOS ----------------------------------------------------
create table if not exists public.meal_photo_analysis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_photo_user on public.meal_photo_analysis(user_id, created_at desc);

-- 6. ASSINATURAS ---------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('free','pro')),
  created_at timestamptz not null default now()
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.nutrition_questionnaires enable row level security;
alter table public.meal_plans enable row level security;
alter table public.chat_messages enable row level security;
alter table public.meal_photo_analysis enable row level security;
alter table public.subscriptions enable row level security;

-- PROFILES: usuário só lê/atualiza seu próprio profile
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Policies genéricas (mesmo padrão) para todas as tabelas user_id
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'nutrition_questionnaires',
    'meal_plans',
    'chat_messages',
    'meal_photo_analysis',
    'subscriptions'
  ])
  loop
    execute format('drop policy if exists "%s_select_own" on public.%I', t, t);
    execute format('create policy "%s_select_own" on public.%I for select using (auth.uid() = user_id)', t, t);

    execute format('drop policy if exists "%s_insert_own" on public.%I', t, t);
    execute format('create policy "%s_insert_own" on public.%I for insert with check (auth.uid() = user_id)', t, t);

    execute format('drop policy if exists "%s_update_own" on public.%I', t, t);
    execute format('create policy "%s_update_own" on public.%I for update using (auth.uid() = user_id)', t, t);

    execute format('drop policy if exists "%s_delete_own" on public.%I', t, t);
    execute format('create policy "%s_delete_own" on public.%I for delete using (auth.uid() = user_id)', t, t);
  end loop;
end $$;

-- =====================================================================
-- STORAGE: bucket para fotos de refeições
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

drop policy if exists "meal_photos_insert_own" on storage.objects;
create policy "meal_photos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'meal-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "meal_photos_select_own" on storage.objects;
create policy "meal_photos_select_own" on storage.objects
  for select using (
    bucket_id = 'meal-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
