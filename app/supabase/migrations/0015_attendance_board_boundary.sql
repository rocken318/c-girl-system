-- 出欠ボード境界：売上/給与を露出せず、出欠のみを読む/書くための層。
-- daily_records の全列 SELECT を黒服に開けず、出欠列だけのビューと
-- 出欠フィールドのみを更新する SECURITY DEFINER RPC を提供する。

-- 読み取り：出欠専用ビュー（definer 実行で daily_records RLS をバイパスしつつ
-- 出欠列のみ公開。store と role は WHERE で担保）。
create or replace view public.attendance_board_view
with (security_invoker = false) as
  select
    dr.store_id,
    dr.cast_id,
    dr.date,
    (dr.data->>'attended')::boolean        as attended,
    dr.data->>'attendanceType'             as attendance_type,
    (dr.data->>'isLate')::boolean          as is_late,
    (dr.data->>'isAbsent')::boolean        as is_absent,
    coalesce((dr.data->>'douhan')::int, 0) as douhan,
    dr.data->>'douhanTime'                 as douhan_time
  from public.daily_records dr
  where dr.store_id = public.current_store_id()
    and public.current_role_name() in ('admin','kurofuku');

grant select on public.attendance_board_view to authenticated;

-- 書き込み：出欠フィールドのみをマージ更新する RPC（売上等は保持）。
create or replace function public.record_attendance(
  p_cast_id uuid,
  p_date date,
  p_attended boolean,
  p_is_late boolean,
  p_is_absent boolean,
  p_attendance_type text,
  p_douhan int,
  p_douhan_time text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role := public.current_role_name();
  v_store uuid := public.current_store_id();
  v_cast_store uuid;
  v_data jsonb;
begin
  if v_role is null or v_role not in ('admin','kurofuku') then
    raise exception 'not authorized to record attendance';
  end if;
  select store_id into v_cast_store from public.casts where id = p_cast_id;
  if v_cast_store is null or v_store is null or v_cast_store <> v_store then
    raise exception 'cross-store or unknown cast';
  end if;
  if p_attendance_type not in ('normal','douhan','late','absent','same_day_absence') then
    raise exception 'invalid attendance type';
  end if;

  select data into v_data from public.daily_records
    where cast_id = p_cast_id and date = p_date and store_id = v_store;
  if v_data is null then v_data := '{}'::jsonb; end if;

  -- 出欠フィールドのみ上書き（売上・指名等は保持）
  v_data := v_data || jsonb_build_object(
    'attended', p_attended,
    'isLate', p_is_late,
    'isAbsent', p_is_absent,
    'attendanceType', p_attendance_type,
    'douhan', coalesce(p_douhan, 0),
    'castId', p_cast_id,
    'storeId', v_store,
    'date', to_char(p_date, 'YYYY-MM-DD')
  );
  if p_douhan_time is not null and p_douhan_time <> '' then
    v_data := v_data || jsonb_build_object('douhanTime', p_douhan_time);
  else
    v_data := v_data - 'douhanTime';
  end if;

  insert into public.daily_records (store_id, cast_id, date, data)
    values (v_store, p_cast_id, p_date, v_data)
    on conflict (cast_id, date) do update set data = excluded.data;
end;
$$;

grant execute on function public.record_attendance(uuid, date, boolean, boolean, boolean, text, int, text) to authenticated;
