
-- ==========================================
-- ENTASIS CRM — Supabase schema + security
-- À coller dans le SQL Editor Supabase
-- ==========================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role text not null default 'advisor' check (role in ('manager', 'advisor')),
  advisor_code text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deals (
  id text primary key,
  month text not null,
  client text not null,
  product text not null,
  pp_m numeric(14,2) not null default 0,
  pu numeric(14,2) not null default 0,
  advisor_code text not null,
  co_advisor_code text,
  source text,
  status text not null default 'En cours',
  company text,
  notes text,
  priority text not null default 'Normale',
  tags jsonb not null default '[]'::jsonb,
  date_expected text,
  date_signed text,
  client_phone text,
  client_email text,
  client_age integer,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.objectifs (
  month text primary key,
  pp_target numeric(14,2) not null default 0,
  pu_target numeric(14,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  deal_id text references public.deals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Utility triggers ----------

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute procedure public.handle_updated_at();

drop trigger if exists trg_deals_updated_at on public.deals;
create trigger trg_deals_updated_at
before update on public.deals
for each row execute procedure public.handle_updated_at();

drop trigger if exists trg_objectifs_updated_at on public.objectifs;
create trigger trg_objectifs_updated_at
before update on public.objectifs
for each row execute procedure public.handle_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ---------- Auth helper functions ----------

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'manager'
      and is_active = true
  );
$$;

create or replace function public.current_advisor_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select advisor_code
  from public.profiles
  where id = auth.uid()
    and is_active = true;
$$;

-- ---------- RLS ----------

alter table public.profiles enable row level security;
alter table public.deals enable row level security;
alter table public.objectifs enable row level security;
alter table public.activities enable row level security;

-- Profiles
drop policy if exists "profiles_select_self_or_manager" on public.profiles;
create policy "profiles_select_self_or_manager"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_manager());

drop policy if exists "profiles_update_self_or_manager" on public.profiles;
create policy "profiles_update_self_or_manager"
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_manager())
with check (id = auth.uid() or public.is_manager());

-- Deals
drop policy if exists "deals_select_scope" on public.deals;
create policy "deals_select_scope"
on public.deals
for select
to authenticated
using (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
  or co_advisor_code = public.current_advisor_code()
);

drop policy if exists "deals_insert_scope" on public.deals;
create policy "deals_insert_scope"
on public.deals
for insert
to authenticated
with check (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
  or co_advisor_code = public.current_advisor_code()
);

drop policy if exists "deals_update_scope" on public.deals;
create policy "deals_update_scope"
on public.deals
for update
to authenticated
using (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
  or co_advisor_code = public.current_advisor_code()
)
with check (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
  or co_advisor_code = public.current_advisor_code()
);

drop policy if exists "deals_delete_scope" on public.deals;
create policy "deals_delete_scope"
on public.deals
for delete
to authenticated
using (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
  or co_advisor_code = public.current_advisor_code()
);

-- Objectifs
drop policy if exists "objectifs_read_authenticated" on public.objectifs;
create policy "objectifs_read_authenticated"
on public.objectifs
for select
to authenticated
using (true);

drop policy if exists "objectifs_write_manager" on public.objectifs;
create policy "objectifs_write_manager"
on public.objectifs
for all
to authenticated
using (public.is_manager())
with check (public.is_manager());

-- Activities
drop policy if exists "activities_select_scope" on public.activities;
create policy "activities_select_scope"
on public.activities
for select
to authenticated
using (public.is_manager() or user_id = auth.uid());

drop policy if exists "activities_insert_authenticated" on public.activities;
create policy "activities_insert_authenticated"
on public.activities
for insert
to authenticated
with check (user_id = auth.uid());

-- ---------- Seed objectifs ----------

insert into public.objectifs (month, pp_target, pu_target)
values
  ('JANVIER', 140000, 400000),
  ('FÉVRIER', 140000, 400000),
  ('MARS', 160000, 400000),
  ('AVRIL', 140000, 400000),
  ('MAI', 140000, 400000),
  ('JUIN', 150000, 400000),
  ('JUILLET', 100000, 300000),
  ('AOÛT', 80000, 250000),
  ('SEPTEMBRE', 140000, 400000),
  ('OCTOBRE', 150000, 400000),
  ('NOVEMBRE', 150000, 400000),
  ('DÉCEMBRE', 120000, 350000)
on conflict (month) do update
set pp_target = excluded.pp_target,
    pu_target = excluded.pu_target;

-- ---------- Optional: assign roles after creating users ----------
-- update public.profiles set role = 'manager', advisor_code = 'LOUIS', full_name = 'Louis Hatton' where email = 'ton-email@entasis-conseil.fr';
-- update public.profiles set role = 'advisor', advisor_code = 'JEAN', full_name = 'Jean ...' where email = 'jean@entasis-conseil.fr';
