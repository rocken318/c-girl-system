-- 0009: 0005/0006 で定義した全RLSを has_store_access / is_store_admin パターンへ置換。
-- 方針（CLAUDE.md §権限分離・マルチ店舗）:
--   統合ユーザー = 全店「閲覧のみ」（横断書込は不可）/ 一般admin = 自店のみ /
--   兼務黒服 = 所属複数店（担当は manager_id）/ cast = 自分のみ（IDOR厳禁）。
--   書込は is_store_admin(store_id)（その店の admin membership）に限定。

-- kurofuku の担当cast判定を casts のRLS配下で評価すると再帰/漏れの恐れがあるため、
-- SECURITY DEFINER ヘルパーでRLSをバイパスして担当cast集合を取得する。
create or replace function public.managed_cast_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.casts where manager_id = auth.uid();
$$;
create or replace function public.managed_cast_user_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select user_id from public.casts where manager_id = auth.uid();
$$;

-- profiles
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select using (
  id = auth.uid() or (select current_is_integrated()) or is_store_admin(store_id)
);
-- self権限昇格（is_integrated_viewer 等の改ざん）を防ぐため行UPDATEポリシーは撤去。
-- アクティブ店舗の切替は検証付き RPC switch_active_store を経由する。
drop policy if exists profiles_self_update on public.profiles;

create or replace function public.switch_active_store(p_store uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_store_access(p_store) then
    raise exception 'no access to store';
  end if;
  update public.profiles set active_store_id = p_store where id = auth.uid();
end;
$$;
revoke all on function public.switch_active_store(uuid) from public;
grant execute on function public.switch_active_store(uuid) to authenticated;

-- stores
drop policy if exists stores_select on public.stores;
create policy stores_select on public.stores for select using ( has_store_access(id) );

-- casts
drop policy if exists casts_select on public.casts;
create policy casts_select on public.casts for select using (
  (select current_is_integrated()) or (has_store_access(store_id) and (
    is_store_admin(store_id)
    or (role_at_store(store_id) = 'kurofuku' and manager_id = auth.uid())
    or user_id = auth.uid()
  ))
);
-- admin は名簿取込(T8)で casts を upsert できる
drop policy if exists casts_admin_write on public.casts;
create policy casts_admin_write on public.casts for all
  using ( is_store_admin(store_id) ) with check ( is_store_admin(store_id) );

-- time_records
drop policy if exists time_records_select on public.time_records;
create policy time_records_select on public.time_records for select using (
  (select current_is_integrated()) or (has_store_access(store_id) and (
    is_store_admin(store_id)
    or person_id = auth.uid()
    or (role_at_store(store_id) = 'kurofuku' and person_id in (select public.managed_cast_user_ids()))
  ))
);
drop policy if exists time_records_admin_write on public.time_records;
create policy time_records_admin_write on public.time_records for update
  using ( is_store_admin(store_id) ) with check ( is_store_admin(store_id) );
drop policy if exists time_records_admin_insert on public.time_records;
create policy time_records_admin_insert on public.time_records for insert
  with check ( is_store_admin(store_id) );

-- audit_logs
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select using (
  (select current_is_integrated()) or (has_store_access(store_id) and is_store_admin(store_id))
);
drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs for insert with check ( is_store_admin(store_id) );

-- staff_profiles
drop policy if exists staff_profiles_select on public.staff_profiles;
create policy staff_profiles_select on public.staff_profiles for select using (
  (select current_is_integrated()) or (has_store_access(store_id) and (is_store_admin(store_id) or user_id = auth.uid()))
);
drop policy if exists staff_profiles_admin_write on public.staff_profiles;
create policy staff_profiles_admin_write on public.staff_profiles for all
  using ( is_store_admin(store_id) ) with check ( is_store_admin(store_id) );

-- settings
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select using ( has_store_access(store_id) );
drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings for all
  using ( is_store_admin(store_id) ) with check ( is_store_admin(store_id) );

-- performances / daily_records / shifts / payrolls（共通）
do $$
declare t text;
begin
  foreach t in array array['performances','daily_records','shifts','payrolls'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format($f$
      create policy %1$s_select on public.%1$s for select using (
        (select current_is_integrated()) or (has_store_access(store_id) and (
          is_store_admin(store_id)
          or cast_id = (select current_cast_id())
          or (role_at_store(store_id) = 'kurofuku' and cast_id in (select public.managed_cast_ids()))
        ))
      );
    $f$, t);
    execute format('drop policy if exists %1$s_admin_write on public.%1$s;', t);
    execute format($f$
      create policy %1$s_admin_write on public.%1$s for all
        using ( is_store_admin(store_id) ) with check ( is_store_admin(store_id) );
    $f$, t);
  end loop;
end $$;

-- cast 自身のシフト提出
drop policy if exists shifts_cast_insert on public.shifts;
create policy shifts_cast_insert on public.shifts for insert
  with check ( has_store_access(store_id) and cast_id = (select current_cast_id()) );
drop policy if exists shifts_cast_update on public.shifts;
create policy shifts_cast_update on public.shifts for update
  using ( has_store_access(store_id) and cast_id = (select current_cast_id()) and status='submitted' )
  with check ( has_store_access(store_id) and cast_id = (select current_cast_id()) );

-- memberships 閲覧（切替UI用）
drop policy if exists memberships_select on public.user_store_memberships;
create policy memberships_select on public.user_store_memberships for select using (
  user_id = auth.uid() or (select current_is_integrated()) or is_store_admin(store_id)
);
