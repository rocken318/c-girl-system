create table public.line_links (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  cast_id uuid references public.casts(id),
  profile_id uuid references public.profiles(id),
  line_user_id text not null unique,
  linked_at timestamptz not null default now()
);
create index on public.line_links (store_id);
alter table public.line_links enable row level security;
-- admin/統合のみ SELECT（書込は service role = RLS対象外）
create policy line_links_select on public.line_links for select using (
  current_is_integrated() or (store_id is not null and is_store_admin(store_id))
);
