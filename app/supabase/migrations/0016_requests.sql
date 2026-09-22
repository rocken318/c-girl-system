-- 各種申請（欠勤届/遅刻届/同伴報告/シフト変更/その他）。キャストが申請→管理者が承認/却下。
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  cast_id uuid not null references public.casts(id),
  type text not null,
  date date not null,
  detail text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create index on public.requests (store_id, status);
create index on public.requests (cast_id);
alter table public.requests enable row level security;

-- SELECT: 統合=全店 / 自店admin・kurofuku / cast=自分
create policy requests_select on public.requests for select using (
  current_is_integrated()
  or (has_store_access(store_id) and (
        is_store_admin(store_id)
        or current_role_name() = 'kurofuku'
        or cast_id = current_cast_id()
  ))
);
-- INSERT: cast が自分の申請を作成
create policy requests_cast_insert on public.requests for insert with check (
  store_id = current_store_id() and cast_id = current_cast_id()
);
-- UPDATE: 自店admin が承認/却下
create policy requests_admin_update on public.requests for update
  using ( is_store_admin(store_id) ) with check ( is_store_admin(store_id) );
