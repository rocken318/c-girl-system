begin;
select plan(8);

insert into auth.users(id) values
 ('11111111-1111-1111-1111-111111111111'),  -- admin
 ('22222222-2222-2222-2222-222222222222'),  -- cast1
 ('33333333-3333-3333-3333-333333333333'),  -- cast2
 ('44444444-4444-4444-4444-444444444444');  -- kurofuku
insert into public.stores(id,name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','店A');
insert into public.profiles(id,store_id,role,display_name,active_store_id) values
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','admin','管理','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cast','C1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
 ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cast','C2','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
 ('44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','kurofuku','K1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.user_store_memberships(user_id,store_id,role,is_primary) values
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','admin',true),
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cast',true),
 ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cast',true),
 ('44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','kurofuku',true);
-- casts：cast1 は kurofuku(44..) の担当 / cast2 は担当外(manager_id NULL)
insert into public.casts(store_id,user_id,source_name,manager_id) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','C1源氏名','44444444-4444-4444-4444-444444444444'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','C2源氏名',null);
insert into public.time_records(store_id,person_id,role_at_punch,business_date,clock_in_at) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','cast','2026-06-15',now()),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','cast','2026-06-15',now());

set local role authenticated;
-- cast1 として：自分の1件のみ見える（IDOR防止）
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', true);
select is((select count(*)::int from public.time_records), 1, 'castは自分の勤怠のみ');
-- admin として：全件見える
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', true);
select is((select count(*)::int from public.time_records), 2, 'adminは店内全件');
-- cast1 が cast2 の行を読めない
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', true);
select is((select count(*)::int from public.time_records where person_id='33333333-3333-3333-3333-333333333333'), 0, 'castは他者行を読めない');
-- kurofuku(44..) として：担当cast1(22..)の勤怠は見える（正）
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', true);
select is((select count(*)::int from public.time_records where person_id='22222222-2222-2222-2222-222222222222'), 1, 'kurofukuは担当castの勤怠を見られる');
-- kurofuku(44..) として：担当外cast2(33..)の勤怠は見えない（負＝IDOR防止）
select is((select count(*)::int from public.time_records where person_id='33333333-3333-3333-3333-333333333333'), 0, 'kurofukuは担当外castの勤怠を読めない');

-- audit_logs insert: cast ユーザーは挿入できない（admin 限定）
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', true);
select throws_ok(
  $$insert into public.audit_logs(store_id, actor_user_id, action)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '22222222-2222-2222-2222-222222222222',
            'test_action')$$,
  '42501',
  null,
  'audit_logs insert は cast ユーザーに拒否される'
);
-- audit_logs insert: admin ユーザーは挿入できる
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', true);
select lives_ok(
  $$insert into public.audit_logs(store_id, actor_user_id, action)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111',
            'test_action')$$,
  'audit_logs insert は admin ユーザーに許可される'
);
select is((select count(*)::int from public.audit_logs
           where action='test_action' and actor_user_id='11111111-1111-1111-1111-111111111111'),
          1, 'admin の audit_logs insert が反映されている');

select * from finish();
rollback;
