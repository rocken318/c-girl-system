create table public.sales_targets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  scope text not null check (scope in ('store','cast')),
  cast_id uuid references public.casts(id),
  period_type text not null check (period_type in ('day','month','quarter','half','year')),
  period_key text not null,
  target_amount bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope='cast' and cast_id is not null) or (scope='store' and cast_id is null))
);
create unique index sales_targets_store_uniq on public.sales_targets (store_id, period_type, period_key) where scope='store';
create unique index sales_targets_cast_uniq  on public.sales_targets (store_id, cast_id, period_type, period_key) where scope='cast';
create index on public.sales_targets (store_id, period_type, period_key);

alter table public.sales_targets enable row level security;

create policy sales_targets_select on public.sales_targets for select using (
  current_is_integrated() or (has_store_access(store_id) and (
    is_store_admin(store_id)
    or (scope='cast' and cast_id = current_cast_id())
  ))
);
create policy sales_targets_admin_write on public.sales_targets for all
  using ( is_store_admin(store_id) ) with check ( is_store_admin(store_id) );
