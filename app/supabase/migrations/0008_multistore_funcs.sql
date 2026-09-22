-- アクティブ店舗：profiles.active_store_id、未設定なら主(is_primary)membership
create or replace function public.current_store_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select active_store_id from public.profiles where id = auth.uid()),
    (select store_id from public.user_store_memberships
       where user_id = auth.uid() and is_primary and status='active' limit 1)
  );
$$;

create or replace function public.current_is_integrated()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_integrated_viewer from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.has_store_access(p_store uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_is_integrated()
      or exists (select 1 from public.user_store_memberships
                 where user_id = auth.uid() and store_id = p_store and status='active');
$$;

create or replace function public.role_at_store(p_store uuid)
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.user_store_memberships
   where user_id = auth.uid() and store_id = p_store and status='active' limit 1;
$$;

create or replace function public.is_store_admin(p_store uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.role_at_store(p_store) = 'admin';
$$;
