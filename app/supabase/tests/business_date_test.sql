begin;
select plan(3);
-- カットオーバー6時：02:00(JST)は前日扱い
select is( public.business_date('2026-06-15T02:00:00+09:00'::timestamptz, 6), '2026-06-14'::date, '深夜2時は前日営業日');
-- 06:00ちょうどは当日
select is( public.business_date('2026-06-15T06:00:00+09:00'::timestamptz, 6), '2026-06-15'::date, '6時は当日');
-- 23:00は当日
select is( public.business_date('2026-06-15T23:00:00+09:00'::timestamptz, 6), '2026-06-15'::date, '23時は当日');
select * from finish();
rollback;
