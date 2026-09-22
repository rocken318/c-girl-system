-- profiles：自分の行、または同店adminは全件
create policy profiles_self_select on public.profiles for select
  using ( id = auth.uid()
          or (store_id = current_store_id() and current_role_name() = 'admin') );

-- stores：自店のみ
create policy stores_select on public.stores for select
  using ( id = current_store_id() );

-- casts：admin=全件 / kurofuku=担当のみ / cast=自分
create policy casts_select on public.casts for select
  using (
    store_id = current_store_id() and (
      current_role_name() = 'admin'
      or (current_role_name() = 'kurofuku' and manager_id = auth.uid())
      or (current_role_name() = 'cast' and user_id = auth.uid())
    )
  );

-- time_records：SELECT
create policy time_records_select on public.time_records for select
  using (
    store_id = current_store_id() and (
      current_role_name() = 'admin'
      or person_id = auth.uid()                                   -- 自分の勤怠
      or (current_role_name() = 'kurofuku' and person_id in (     -- 担当キャストの勤怠
            select c.user_id from public.casts c where c.manager_id = auth.uid()))
    )
  );
-- time_records：手動補正は admin のみ（打刻は RPC が SECURITY DEFINER で実施）
create policy time_records_admin_write on public.time_records for update
  using ( store_id = current_store_id() and current_role_name() = 'admin' )
  with check ( store_id = current_store_id() and current_role_name() = 'admin' );
create policy time_records_admin_insert on public.time_records for insert
  with check ( store_id = current_store_id() and current_role_name() = 'admin' );

-- staff_profiles: admin=店内全件 / 本人=自分の行
create policy staff_profiles_select on public.staff_profiles for select
  using ( store_id = current_store_id() and ( current_role_name()='admin' or user_id = auth.uid() ) );
create policy staff_profiles_admin_write on public.staff_profiles for all
  using ( store_id = current_store_id() and current_role_name()='admin' )
  with check ( store_id = current_store_id() and current_role_name()='admin' );

-- audit_logs：admin のみ閲覧
create policy audit_select on public.audit_logs for select
  using ( store_id = current_store_id() and current_role_name() = 'admin' );
create policy audit_insert on public.audit_logs for insert
  with check ( store_id = current_store_id() and current_role_name() = 'admin' );
