create table public.casts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  user_id uuid unique references public.profiles(id),
  source_name text not null,                  -- 源氏名
  real_name_encrypted text,                   -- 暗号化（アプリ層/将来pgcrypto）
  rank text,
  manager_id uuid references public.profiles(id),  -- 担当黒服
  join_date date,
  leave_date date,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);
create index on public.casts (store_id);
create index on public.casts (manager_id);

create table public.staff_profiles (      -- 黒服固有（P2で hourly_rate を使用）
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  user_id uuid unique references public.profiles(id),
  hourly_rate int not null default 0,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);
create index on public.staff_profiles (store_id);

alter table public.casts enable row level security;
alter table public.staff_profiles enable row level security;

-- cast の user_id から cast_id を引く補助
create or replace function public.current_cast_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.casts where user_id = auth.uid();
$$;
