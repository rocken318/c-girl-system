-- stores 列追加
alter table public.stores add column if not exists kind text;
alter table public.stores add column if not exists address text;
alter table public.stores add column if not exists area text;
alter table public.stores add column if not exists status text not null default 'active'
  check (status in ('active','inactive'));

-- profiles 列追加（統合閲覧ロール・アクティブ店舗）
alter table public.profiles add column if not exists is_integrated_viewer boolean not null default false;
alter table public.profiles add column if not exists active_store_id uuid references public.stores(id);

-- 多対多メンバーシップ
create table if not exists public.user_store_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  role public.user_role not null,
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  unique (user_id, store_id)
);
create index if not exists idx_memberships_user on public.user_store_memberships (user_id);
create index if not exists idx_memberships_store on public.user_store_memberships (store_id);

alter table public.user_store_memberships enable row level security;

-- backfill: 既存 profiles.store_id → membership(is_primary=true, role=profiles.role)
insert into public.user_store_memberships (user_id, store_id, role, is_primary, status)
select p.id, p.store_id, p.role, true, 'active'
from public.profiles p
on conflict (user_id, store_id) do nothing;

-- backfill: active_store_id 未設定を主店舗で初期化
update public.profiles set active_store_id = store_id where active_store_id is null;
