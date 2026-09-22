begin;
select plan(11);

insert into public.stores(id,name) values
  ('30000000-0000-0000-0000-000000000001','店A'),
  ('30000000-0000-0000-0000-000000000002','店B');
insert into auth.users(id) values
  ('40000000-0000-0000-0000-0000000000a1'),  -- 統合(店A所属/閲覧のみ)
  ('40000000-0000-0000-0000-0000000000a2'),  -- 店A admin
  ('40000000-0000-0000-0000-0000000000c1'),  -- 店A cast(kurofuku担当)
  ('40000000-0000-0000-0000-0000000000c2'),  -- 店A cast(担当外)
  ('40000000-0000-0000-0000-0000000000d1'),  -- 店A kurofuku(兼務黒服)
  ('40000000-0000-0000-0000-0000000000b1');  -- 店B cast
insert into public.profiles(id,store_id,role,display_name,is_integrated_viewer,active_store_id) values
  ('40000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-000000000001','admin','統合',true,'30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-0000000000a2','30000000-0000-0000-0000-000000000001','admin','A管理',false,'30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-0000000000c1','30000000-0000-0000-0000-000000000001','cast','Acast1',false,'30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-0000000000c2','30000000-0000-0000-0000-000000000001','cast','Acast2',false,'30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-0000000000d1','30000000-0000-0000-0000-000000000001','kurofuku','A黒服',false,'30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-0000000000b1','30000000-0000-0000-0000-000000000002','cast','Bcast',false,'30000000-0000-0000-0000-000000000002');
insert into public.user_store_memberships(user_id,store_id,role,is_primary) values
  ('40000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-000000000001','admin',true),
  ('40000000-0000-0000-0000-0000000000a2','30000000-0000-0000-0000-000000000001','admin',true),
  ('40000000-0000-0000-0000-0000000000c1','30000000-0000-0000-0000-000000000001','cast',true),
  ('40000000-0000-0000-0000-0000000000c2','30000000-0000-0000-0000-000000000001','cast',true),
  ('40000000-0000-0000-0000-0000000000d1','30000000-0000-0000-0000-000000000001','kurofuku',true),
  ('40000000-0000-0000-0000-0000000000b1','30000000-0000-0000-0000-000000000002','cast',true);
-- casts: Acast1 は A黒服(k1) の担当 / Acast2 は担当外(manager_id null)
insert into public.casts(store_id,user_id,source_name,manager_id) values
  ('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000000c1','Acast1源氏','40000000-0000-0000-0000-0000000000d1'),
  ('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000000c2','Acast2源氏',null);
insert into public.time_records(store_id,person_id,role_at_punch,business_date,clock_in_at) values
  ('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000000c1','cast','2026-06-15',now()),
  ('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000000c2','cast','2026-06-15',now()),
  ('30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-0000000000b1','cast','2026-06-15',now());

set local role authenticated;

-- 統合: 全店勤怠が見える（店A2件+店B1件）
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-0000000000a1',true);
select is((select count(*)::int from public.time_records), 3, '統合は全店勤怠が見える');

-- A管理: 自店のみ（店A2件）
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-0000000000a2',true);
select is((select count(*)::int from public.time_records), 2, 'A管理は自店のみ');
select is((select count(*)::int from public.time_records where store_id='30000000-0000-0000-0000-000000000002'), 0, 'A管理は他店が見えない');

-- cast: 自分のみ（IDOR）
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-0000000000c1',true);
select is((select count(*)::int from public.time_records), 1, 'castは自分のみ(IDOR)');

-- 兼務黒服(店A kurofuku): 担当cast(Acast1)の勤怠は見える / 担当外(Acast2)は見えない
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-0000000000d1',true);
select is((select count(*)::int from public.time_records where person_id='40000000-0000-0000-0000-0000000000c1'), 1, '兼務黒服は担当castの勤怠を見られる(managed_cast経由)');
select is((select count(*)::int from public.time_records where person_id='40000000-0000-0000-0000-0000000000c2'), 0, '兼務黒服は担当外castの勤怠は見られない');

-- 統合でも他店への書込は不可（閲覧のみ）
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-0000000000a1',true);
select throws_ok($$ insert into public.time_records(store_id,person_id,role_at_punch,business_date,clock_in_at)
  values ('30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-0000000000b1','cast','2026-06-16',now()) $$,
  '42501', null, '統合でも他店への書込は不可');

-- A管理は自店へ書込可
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-0000000000a2',true);
select lives_ok($$ insert into public.time_records(store_id,person_id,role_at_punch,business_date,clock_in_at)
  values ('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000000c1','cast','2026-06-17',now()) $$,
  'A管理は自店へ書込可');

-- cast は自分の profiles を is_integrated_viewer=true に昇格できない（profiles_self_update撤去）
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-0000000000c1',true);
update public.profiles set is_integrated_viewer = true where id = '40000000-0000-0000-0000-0000000000c1';
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-0000000000a1',true);  -- 統合で検証(SELECT可)
select is((select count(*)::int from public.profiles
           where id='40000000-0000-0000-0000-0000000000c1' and is_integrated_viewer), 0,
          'castは自分を統合閲覧者に昇格できない(profiles_self_update撤去)');

-- switch_active_store: 所属店へは成功 / 未所属かつ非統合の店は例外
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-0000000000c1',true);
select lives_ok($$ select public.switch_active_store('30000000-0000-0000-0000-000000000001') $$,
  'switch_active_store: 所属店へは成功');
select throws_ok($$ select public.switch_active_store('30000000-0000-0000-0000-000000000002') $$,
  'no access to store', 'switch_active_store: 未所属・非統合の店は例外');

select * from finish();
rollback;
