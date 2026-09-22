-- =============================================================
-- seed_demo_manager.sql
-- 黒服「担当キャスト」ビュー用デモデータ（2026-06）
--
-- 対象:
--   RIN  (cast_id: dddddddd-0000-0000-0000-000000000002)
--   SAKURA (cast_id: dddddddd-0000-0000-0000-000000000001)
--
-- 内容:
--   1. RIN の 2026-06 daily_records（12日分）
--   2. SAKURA の 2026-06 shifts（14日分, published）
--   3. RIN の 2026-06 shifts（12日分, approved/published）
--
-- 冪等: on conflict do nothing
-- =============================================================

-- -------------------------------------------------------------
-- 1. RIN の daily_records（2026-06、12日分）
--    売上が日ごとに変動するリアルなデモデータ
--    storeId = aaaaaaaa-0000-0000-0000-000000000001
--    cast_id = dddddddd-0000-0000-0000-000000000002
-- -------------------------------------------------------------
insert into public.daily_records (store_id, cast_id, date, data)
values
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-02',
   '{"id":"dr_cast_2_2","castId":"dddddddd-0000-0000-0000-000000000002","storeId":"aaaaaaaa-0000-0000-0000-000000000001","date":"2026-06-02","attended":true,"attendanceType":"normal","hours":7,"isLate":false,"isAbsent":false,"honShimei":2,"banaiShimei":1,"douhan":0,"drinks":3,"bottles":0,"extensions":0,"nominatedSales":55000,"freeSales":18000,"advancePay":0}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-04',
   '{"id":"dr_cast_2_4","castId":"dddddddd-0000-0000-0000-000000000002","storeId":"aaaaaaaa-0000-0000-0000-000000000001","date":"2026-06-04","attended":true,"attendanceType":"douhan","hours":7,"isLate":false,"isAbsent":false,"honShimei":1,"banaiShimei":0,"douhan":1,"drinks":2,"bottles":0,"extensions":0,"nominatedSales":42000,"freeSales":15000,"advancePay":0}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-06',
   '{"id":"dr_cast_2_6","castId":"dddddddd-0000-0000-0000-000000000002","storeId":"aaaaaaaa-0000-0000-0000-000000000001","date":"2026-06-06","attended":true,"attendanceType":"normal","hours":7,"isLate":false,"isAbsent":false,"honShimei":3,"banaiShimei":1,"douhan":0,"drinks":4,"bottles":0,"extensions":1,"nominatedSales":78000,"freeSales":22000,"advancePay":0}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-08',
   '{"id":"dr_cast_2_8","castId":"dddddddd-0000-0000-0000-000000000002","storeId":"aaaaaaaa-0000-0000-0000-000000000001","date":"2026-06-08","attended":true,"attendanceType":"douhan","hours":7,"isLate":false,"isAbsent":false,"honShimei":2,"banaiShimei":1,"douhan":1,"drinks":3,"bottles":1,"extensions":0,"nominatedSales":95000,"freeSales":28000,"advancePay":0}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-10',
   '{"id":"dr_cast_2_10","castId":"dddddddd-0000-0000-0000-000000000002","storeId":"aaaaaaaa-0000-0000-0000-000000000001","date":"2026-06-10","attended":true,"attendanceType":"normal","hours":7,"isLate":false,"isAbsent":false,"honShimei":1,"banaiShimei":1,"douhan":0,"drinks":2,"bottles":0,"extensions":0,"nominatedSales":38000,"freeSales":12000,"advancePay":0}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-12',
   '{"id":"dr_cast_2_12","castId":"dddddddd-0000-0000-0000-000000000002","storeId":"aaaaaaaa-0000-0000-0000-000000000001","date":"2026-06-12","attended":true,"attendanceType":"douhan","hours":7,"isLate":false,"isAbsent":false,"honShimei":2,"banaiShimei":0,"douhan":1,"drinks":3,"bottles":0,"extensions":1,"nominatedSales":65000,"freeSales":20000,"advancePay":0}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-14',
   '{"id":"dr_cast_2_14","castId":"dddddddd-0000-0000-0000-000000000002","storeId":"aaaaaaaa-0000-0000-0000-000000000001","date":"2026-06-14","attended":true,"attendanceType":"normal","hours":7,"isLate":false,"isAbsent":false,"honShimei":3,"banaiShimei":1,"douhan":0,"drinks":4,"bottles":0,"extensions":0,"nominatedSales":82000,"freeSales":25000,"advancePay":0}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-16',
   '{"id":"dr_cast_2_16","castId":"dddddddd-0000-0000-0000-000000000002","storeId":"aaaaaaaa-0000-0000-0000-000000000001","date":"2026-06-16","attended":true,"attendanceType":"douhan","hours":7,"isLate":false,"isAbsent":false,"honShimei":2,"banaiShimei":1,"douhan":1,"drinks":3,"bottles":1,"extensions":0,"nominatedSales":110000,"freeSales":32000,"advancePay":0}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-18',
   '{"id":"dr_cast_2_18","castId":"dddddddd-0000-0000-0000-000000000002","storeId":"aaaaaaaa-0000-0000-0000-000000000001","date":"2026-06-18","attended":true,"attendanceType":"normal","hours":7,"isLate":false,"isAbsent":false,"honShimei":1,"banaiShimei":1,"douhan":0,"drinks":2,"bottles":0,"extensions":0,"nominatedSales":48000,"freeSales":16000,"advancePay":0}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-20',
   '{"id":"dr_cast_2_20","castId":"dddddddd-0000-0000-0000-000000000002","storeId":"aaaaaaaa-0000-0000-0000-000000000001","date":"2026-06-20","attended":true,"attendanceType":"douhan","hours":7,"isLate":false,"isAbsent":false,"honShimei":3,"banaiShimei":1,"douhan":1,"drinks":5,"bottles":0,"extensions":1,"nominatedSales":120000,"freeSales":38000,"advancePay":0}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-22',
   '{"id":"dr_cast_2_22","castId":"dddddddd-0000-0000-0000-000000000002","storeId":"aaaaaaaa-0000-0000-0000-000000000001","date":"2026-06-22","attended":true,"attendanceType":"normal","hours":7,"isLate":false,"isAbsent":false,"honShimei":2,"banaiShimei":0,"douhan":0,"drinks":3,"bottles":0,"extensions":0,"nominatedSales":62000,"freeSales":19000,"advancePay":0}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-24',
   '{"id":"dr_cast_2_24","castId":"dddddddd-0000-0000-0000-000000000002","storeId":"aaaaaaaa-0000-0000-0000-000000000001","date":"2026-06-24","attended":true,"attendanceType":"douhan","hours":7,"isLate":false,"isAbsent":false,"honShimei":2,"banaiShimei":1,"douhan":1,"drinks":4,"bottles":0,"extensions":0,"nominatedSales":85000,"freeSales":26000,"advancePay":0}'::jsonb)
on conflict (cast_id, date) do nothing;

-- -------------------------------------------------------------
-- 2. SAKURA の 2026-06 shifts（14日分, status='published'）
--    確定シフト行: data に startTime/endTime のみ（ShiftContext の rowToConfirmedShift に対応）
--    cast_id = dddddddd-0000-0000-0000-000000000001
--    出勤日: seed daily_records の workDayIndices [1,2,3,4,5,7,8,9,10,11,14,15,16,17]
--    id は uuid auto-generate（unique制約は cast_id,date）
-- -------------------------------------------------------------
insert into public.shifts (store_id, cast_id, date, status, data)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '2026-06-01', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '2026-06-02', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '2026-06-03', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '2026-06-04', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '2026-06-05', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '2026-06-07', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '2026-06-08', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '2026-06-09', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '2026-06-10', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '2026-06-11', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '2026-06-14', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '2026-06-15', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '2026-06-16', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', '2026-06-17', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb)
on conflict (cast_id, date) do nothing;

-- -------------------------------------------------------------
-- 3. RIN の 2026-06 shifts（12日分、approved/published 混在）
--    cast_id = dddddddd-0000-0000-0000-000000000002
-- -------------------------------------------------------------
insert into public.shifts (store_id, cast_id, date, status, data)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', '2026-06-02', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', '2026-06-04', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', '2026-06-06', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', '2026-06-08', 'approved',  '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', '2026-06-10', 'approved',  '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', '2026-06-12', 'approved',  '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', '2026-06-14', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', '2026-06-16', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', '2026-06-18', 'approved',  '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', '2026-06-20', 'approved',  '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', '2026-06-22', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', '2026-06-24', 'published', '{"startTime":"20:00","endTime":"01:00"}'::jsonb)
on conflict (cast_id, date) do nothing;
