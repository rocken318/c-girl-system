begin;
select plan(4);
insert into public.stores(id,name) values
  ('50000000-0000-0000-0000-000000000001','店A'),
  ('50000000-0000-0000-0000-000000000002','店B');
insert into auth.users(id) values
  ('51000000-0000-0000-0000-0000000000a1'),
  ('51000000-0000-0000-0000-0000000000a2'),
  ('51000000-0000-0000-0000-0000000000c1');
insert into public.profiles(id,store_id,role,display_name,is_integrated_viewer,active_store_id) values
  ('51000000-0000-0000-0000-0000000000a1','50000000-0000-0000-0000-000000000001','admin','統合',true,'50000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-0000000000a2','50000000-0000-0000-0000-000000000001','admin','A管理',false,'50000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-0000000000c1','50000000-0000-0000-0000-000000000001','cast','Acast',false,'50000000-0000-0000-0000-000000000001');
insert into public.user_store_memberships(user_id,store_id,role,is_primary) values
  ('51000000-0000-0000-0000-0000000000a1','50000000-0000-0000-0000-000000000001','admin',true),
  ('51000000-0000-0000-0000-0000000000a2','50000000-0000-0000-0000-000000000001','admin',true),
  ('51000000-0000-0000-0000-0000000000c1','50000000-0000-0000-0000-000000000001','cast',true);
insert into public.casts(id,store_id,user_id,source_name) values
  ('52000000-0000-0000-0000-0000000000c1','50000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-0000000000c1','Acast');
insert into public.sales_targets(store_id,scope,period_type,period_key,target_amount) values
  ('50000000-0000-0000-0000-000000000001','store','month','2026-09',3000000),
  ('50000000-0000-0000-0000-000000000002','store','month','2026-09',1000000);
insert into public.sales_targets(store_id,scope,cast_id,period_type,period_key,target_amount) values
  ('50000000-0000-0000-0000-000000000001','cast','52000000-0000-0000-0000-0000000000c1','month','2026-09',500000);

set local role authenticated;
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-0000000000a1',true);
-- seed_p1_2025 が active stores 2店 × 2026-09 の店舗目標を投入済みのため +2
select is((select count(*)::int from public.sales_targets where scope='store'), 4, '統合は全店の店舗目標');
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-0000000000a2',true);
select is((select count(*)::int from public.sales_targets where store_id='50000000-0000-0000-0000-000000000002'), 0, 'A管理は他店の目標が見えない');
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-0000000000c1',true);
select is((select count(*)::int from public.sales_targets), 1, 'castは自分のcast目標のみ');
select throws_ok($$ insert into public.sales_targets(store_id,scope,period_type,period_key,target_amount)
  values ('50000000-0000-0000-0000-000000000001','store','month','2026-10',1) $$, '42501', null, 'castは目標を書けない');
select * from finish();
rollback;
