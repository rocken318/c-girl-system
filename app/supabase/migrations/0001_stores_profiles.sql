-- 店舗
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  closing_day text not null default 'end_of_month',
  payment_day text,
  business_day_cutover_hour int not null default 6
    check (business_day_cutover_hour between 0 and 12),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 認証主体（auth.users と 1:1）
create type public.user_role as enum ('admin','kurofuku','cast','terminal');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  role public.user_role not null,
  display_name text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  punch_token text unique,               -- cast/kurofuku のみ
  created_at timestamptz not null default now()
);
create index on public.profiles (store_id);
create index on public.profiles (punch_token);

alter table public.stores enable row level security;
alter table public.profiles enable row level security;

-- 自分のstore_idを引く補助（RLSで多用、SECURITY DEFINERで再帰RLSを回避）
create or replace function public.current_store_id()
returns uuid language sql stable security definer set search_path = public as $$
  select store_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role_name()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;
