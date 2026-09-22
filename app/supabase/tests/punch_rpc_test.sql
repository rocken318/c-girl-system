begin;
select plan(7);

insert into public.stores(id,name) values
  ('11111111-1111-1111-1111-111111111111','店A'),
  ('55555555-5555-5555-5555-555555555555','店B');
insert into auth.users(id) values
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333'),
  ('44444444-4444-4444-4444-444444444444'),
  ('66666666-6666-6666-6666-666666666666');
insert into public.profiles(id,store_id,role,display_name,punch_token,active_store_id) values
  ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','terminal','端末A',null,'11111111-1111-1111-1111-111111111111'),
  ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','cast','サクラ','TOKEN_SAKURA','11111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555','cast','別店','TOKEN_OTHER','55555555-5555-5555-5555-555555555555'),
  ('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111','cast','アゲ','TOKEN_AGED','11111111-1111-1111-1111-111111111111');
insert into public.user_store_memberships(user_id,store_id,role,is_primary) values
  ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','terminal',true),
  ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','cast',true),
  ('44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555','cast',true),
  ('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111','cast',true);

-- 'out'検証用：30秒超前に出勤した未退勤行をsuperuser権限で事前挿入（RLS回避）
insert into public.time_records(store_id, person_id, role_at_punch, business_date, clock_in_at, source)
  values ('11111111-1111-1111-1111-111111111111','66666666-6666-6666-6666-666666666666','cast',
          public.business_date(now(), (select business_day_cutover_hour from public.stores where id='11111111-1111-1111-1111-111111111111')),
          now() - interval '60 seconds', 'qr');

set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', true);

-- 1回目：出勤
select is((select action from public.punch('TOKEN_SAKURA')), 'in', '初回は出勤');
-- 即再打刻（30秒以内）：inのまま
select is((select action from public.punch('TOKEN_SAKURA')), 'in', '30秒以内は無視');
-- 無効トークン
select throws_ok($$ select public.punch('NOPE') $$, 'invalid token', '無効トークン拒否');
-- 別店舗トークン
select throws_ok($$ select public.punch('TOKEN_OTHER') $$, 'cross-store token', '別店舗拒否');
-- 退勤：30秒超の未退勤行がある人物は out を返す
select is((select action from public.punch('TOKEN_AGED')), 'out', '30秒超は退勤');

-- RLSをバイパスしてsuper権限で確認
set local role postgres;
-- 未退勤が1件だけ存在（サクラ）
select is((select count(*)::int from public.time_records where person_id='33333333-3333-3333-3333-333333333333' and clock_out_at is null), 1, '未退勤は1件');
-- アゲの退勤行は clock_out_at がセットされている
select isnt((select clock_out_at from public.time_records where person_id='66666666-6666-6666-6666-666666666666' order by clock_in_at desc limit 1), null, 'clock_out_atがセットされる');

select * from finish();
rollback;
