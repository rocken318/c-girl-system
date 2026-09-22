-- 補助関数は RLS 用。anon からの直接RPC呼び出しを塞ぎ、authenticated にのみ付与。
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.current_store_id()',
    'public.current_is_integrated()',
    'public.has_store_access(uuid)',
    'public.role_at_store(uuid)',
    'public.is_store_admin(uuid)',
    'public.managed_cast_ids()',
    'public.managed_cast_user_ids()',
    'public.current_cast_id()',
    'public.current_role_name()'
  ] loop
    execute format('revoke all on function %s from public;', fn);
    execute format('revoke all on function %s from anon;', fn);
    execute format('grant execute on function %s to authenticated;', fn);
  end loop;
end $$;
