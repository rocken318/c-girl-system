begin;
select plan(6);

insert into public.stores(id,name) values
  ('10000000-0000-0000-0000-000000000001','店A'),
  ('10000000-0000-0000-0000-000000000002','店B');
insert into auth.users(id) values
  ('20000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-00000000000b'),
  ('20000000-0000-0000-0000-00000000000c');
insert into public.profiles(id,store_id,role,display_name,is_integrated_viewer,active_store_id) values
  ('20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','admin','統合',true,'10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000001','admin','A管理',false,'10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','kurofuku','兼務',false,'10000000-0000-0000-0000-000000000001');
insert into public.user_store_memberships(user_id,store_id,role,is_primary) values
  ('20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','admin',true),
  ('20000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000001','admin',true),
  ('20000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','kurofuku',true),
  ('20000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000002','kurofuku',false);

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-00000000000a',true);
select ok(public.has_store_access('10000000-0000-0000-0000-000000000002'), '統合は他店アクセス可');
select ok(public.current_is_integrated(), '統合フラグtrue');
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-00000000000b',true);
select ok(not public.has_store_access('10000000-0000-0000-0000-000000000002'), 'A管理は他店アクセス不可');
select ok(public.is_store_admin('10000000-0000-0000-0000-000000000001'), 'A管理は店Aでadmin');
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-00000000000c',true);
select ok(public.has_store_access('10000000-0000-0000-0000-000000000002'), '兼務は店Bアクセス可');
select is(public.role_at_store('10000000-0000-0000-0000-000000000002')::text, 'kurofuku', '兼務は店Bでkurofuku');

select * from finish();
rollback;
