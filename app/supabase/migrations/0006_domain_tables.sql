-- 設定マスタ（storeごと1行、JSONで既存 Settings を保持）
create table public.settings (
  store_id uuid primary key references public.stores(id),
  data jsonb not null   -- 既存 Settings 型をそのまま格納（マスタ駆動の単一ソース）
);
-- 月次実績（既存 Performance 型）
create table public.performances (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  cast_id uuid not null references public.casts(id),
  month text not null,            -- YYYY-MM
  data jsonb not null,            -- 既存 Performance 型
  unique (cast_id, month)
);
-- 日次実績（既存 DailyRecord 型。P3のペナルティ判定にも使用）
create table public.daily_records (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  cast_id uuid not null references public.casts(id),
  date date not null,
  data jsonb not null,            -- 既存 DailyRecord 型
  unique (cast_id, date)
);
-- シフト提出/確定（既存 ShiftContext 型）
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  cast_id uuid not null references public.casts(id),
  date date not null,
  status text not null default 'submitted' check (status in ('submitted','approved','published','rejected')),
  data jsonb not null,
  unique (cast_id, date)
);
-- 給与スナップショット（確定=不変）
create table public.payrolls (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  cast_id uuid not null references public.casts(id),
  period text not null,           -- YYYY-MM
  status text not null default 'draft' check (status in ('draft','confirmed')),
  snapshot jsonb not null,        -- 確定時の明細一式
  confirmed_at timestamptz,
  unique (cast_id, period)
);

alter table public.settings enable row level security;
alter table public.performances enable row level security;
alter table public.daily_records enable row level security;
alter table public.shifts enable row level security;
alter table public.payrolls enable row level security;

-- RLS：settings は admin 書込・店内SELECT
create policy settings_select on public.settings for select using (store_id = current_store_id());
create policy settings_admin_write on public.settings for all
  using (store_id = current_store_id() and current_role_name()='admin')
  with check (store_id = current_store_id() and current_role_name()='admin');

-- 共通：cast自分 / kurofuku担当 / admin全件 の SELECT + admin全書込 を4テーブルに付与
do $$
declare t text;
begin
  foreach t in array array['performances','daily_records','shifts','payrolls'] loop
    execute format($f$
      create policy %1$s_select on public.%1$s for select using (
        store_id = current_store_id() and (
          current_role_name()='admin'
          or cast_id = current_cast_id()
          or (current_role_name()='kurofuku' and cast_id in (select id from public.casts where manager_id = auth.uid()))
        )
      );
      create policy %1$s_admin_write on public.%1$s for all
        using (store_id = current_store_id() and current_role_name()='admin')
        with check (store_id = current_store_id() and current_role_name()='admin');
    $f$, t);
  end loop;
end $$;

-- cast 自身のシフト提出（insert/update 自分の行のみ）
create policy shifts_cast_insert on public.shifts for insert
  with check (store_id = current_store_id() and cast_id = current_cast_id());
create policy shifts_cast_update on public.shifts for update
  using (store_id = current_store_id() and cast_id = current_cast_id() and status='submitted')
  with check (store_id = current_store_id() and cast_id = current_cast_id());
