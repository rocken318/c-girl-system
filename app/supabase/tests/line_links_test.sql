begin;
select plan(2);

insert into public.stores(id,name) values
  ('60000000-0000-0000-0000-000000000001','店A'),
  ('60000000-0000-0000-0000-000000000002','店B');
insert into auth.users(id) values
  ('61000000-0000-0000-0000-0000000000a1'),  -- 統合
  ('61000000-0000-0000-0000-0000000000a2'),  -- 店A admin
  ('61000000-0000-0000-0000-0000000000b1');  -- 店B admin
insert into public.profiles(id,store_id,role,display_name,is_integrated_viewer,active_store_id) values
  ('61000000-0000-0000-0000-0000000000a1','60000000-0000-0000-0000-000000000001','admin','統合',true,'60000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-0000000000a2','60000000-0000-0000-0000-000000000001','admin','A管理',false,'60000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-0000000000b1','60000000-0000-0000-0000-000000000002','admin','B管理',false,'60000000-0000-0000-0000-000000000002');
insert into public.user_store_memberships(user_id,store_id,role,is_primary) values
  ('61000000-0000-0000-0000-0000000000a1','60000000-0000-0000-0000-000000000001','admin',true),
  ('61000000-0000-0000-0000-0000000000a2','60000000-0000-0000-0000-000000000001','admin',true),
  ('61000000-0000-0000-0000-0000000000b1','60000000-0000-0000-0000-000000000002','admin',true);

-- line_links: 店A に1件、店B に1件（service roleのDMLはRLS対象外なので直接INSERT可）
insert into public.line_links(store_id,line_user_id) values
  ('60000000-0000-0000-0000-000000000001','U_aaa'),
  ('60000000-0000-0000-0000-000000000002','U_bbb');

set local role authenticated;

-- 統合は全店のline_linksが見える（2件）
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-0000000000a1',true);
select is((select count(*)::int from public.line_links), 2, '統合は全件SELECT可');

-- 店A adminは店Aのみ（店Bのline_linksは見えない）
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-0000000000a2',true);
select is((select count(*)::int from public.line_links where store_id='60000000-0000-0000-0000-000000000002'), 0, '店A adminは他店のline_linksが見えない');

select * from finish();
rollback;
