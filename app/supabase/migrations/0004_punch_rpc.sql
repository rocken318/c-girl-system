-- 共有端末からの打刻。サーバー時刻(now())のみを使用。
-- 戻り：人物名・動作(in/out)・時刻。
create or replace function public.punch(p_token text)
returns table(person_name text, action text, at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_caller_role public.user_role := public.current_role_name();
  v_caller_store uuid := public.current_store_id();
  v_person public.profiles;
  v_cutover int;
  v_bdate date;
  v_open public.time_records;
  v_now timestamptz := now();
begin
  -- 呼び出し元は terminal か admin のみ（NULL=profiles行なし/anon等は明示拒否）
  if v_caller_role is null or v_caller_role not in ('terminal','admin') then
    raise exception 'not authorized to punch';
  end if;

  select * into v_person from public.profiles
    where punch_token = p_token and status = 'active';
  if not found then
    raise exception 'invalid token';
  end if;
  -- 別店舗トークン拒否（呼出元store_idがNULLなら拒否）
  if v_caller_store is null or v_person.store_id <> v_caller_store then
    raise exception 'cross-store token';
  end if;
  if v_person.role not in ('cast','kurofuku') then
    raise exception 'token not punchable';
  end if;

  select business_day_cutover_hour into v_cutover from public.stores where id = v_person.store_id;
  v_bdate := public.business_date(v_now, v_cutover);

  -- 同営業日の未退勤記録
  select * into v_open from public.time_records
    where person_id = v_person.id and business_date = v_bdate and clock_out_at is null
    order by clock_in_at desc limit 1;

  if found then
    -- 連打防止：30秒以内の再スキャンは無視（出勤として返す）
    if v_now - v_open.clock_in_at < interval '30 seconds' then
      return query select v_person.display_name, 'in'::text, v_open.clock_in_at;
      return;
    end if;
    update public.time_records set clock_out_at = v_now, updated_by = auth.uid()
      where id = v_open.id;
    return query select v_person.display_name, 'out'::text, v_now;
  else
    -- 同時スキャンで部分ユニークインデックス(time_records_one_open)違反が出たら
    -- 既存の未退勤行を読み直して 'in' を返す（生の23505を出さない）
    begin
      insert into public.time_records(store_id, person_id, role_at_punch, business_date, clock_in_at, source, created_by)
        values (v_person.store_id, v_person.id, v_person.role, v_bdate, v_now, 'qr', auth.uid());
      return query select v_person.display_name, 'in'::text, v_now;
    exception when unique_violation then
      select * into v_open from public.time_records
        where person_id = v_person.id and business_date = v_bdate and clock_out_at is null
        order by clock_in_at desc limit 1;
      return query select v_person.display_name, 'in'::text, v_open.clock_in_at;
    end;
  end if;
end;
$$;

revoke all on function public.punch(text) from public;
grant execute on function public.punch(text) to authenticated;
