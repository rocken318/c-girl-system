-- =============================================================
-- seed_p1_2025.sql  P1 Task 8: 2025ダミー売上 + サンプル目標
--   前年比・達成率デモ用
--   INSERT ... SELECT で環境非依存（cast_id ハードコードなし）
--   冪等: on conflict do nothing（何度流してもエラーなし・重複なし）
-- =============================================================

-- -------------------------------------------------------------
-- 1) 2025年ダミー日次売上
--    各アクティブcast × 2025年1〜12月 × 出勤日(2,4,…,28日の14日)に分散
--    月15日集約だとグラフが15日だけ極端に跳ねるため日次に分散させる
--    数値は hashtext ベース擬似乱数（決定的・再実行しても同値・日ごとに変動）
-- -------------------------------------------------------------
insert into public.daily_records (store_id, cast_id, date, data)
select
  c.store_id,
  c.id,
  make_date(2025, m.mon, d.day) as date,
  jsonb_build_object(
    'id',             'p1y25_' || c.id::text || '_' || m.mon::text || '_' || d.day::text,
    'date',           to_char(make_date(2025, m.mon, d.day), 'YYYY-MM-DD'),
    'castId',         c.id::text,
    'storeId',        c.store_id::text,
    'attended',       true,
    'isAbsent',       false,
    'hours',          5,
    'isLate',         false,
    'attendanceType', 'normal',
    'honShimei',      (abs(hashtext(c.id::text || m.mon::text || 'h' || d.day::text)) % 5),
    'banaiShimei',    (abs(hashtext(c.id::text || 'b' || m.mon::text || d.day::text)) % 3),
    'douhan',         (case when abs(hashtext(c.id::text || 'd' || m.mon::text || d.day::text)) % 3 = 0 then 1 else 0 end),
    'drinks',         (abs(hashtext(c.id::text || 'dr' || m.mon::text || d.day::text)) % 12),
    'bottles',        (case when abs(hashtext(c.id::text || 'bo' || m.mon::text || d.day::text)) % 5 = 0 then 1 else 0 end),
    'extensions',     (abs(hashtext(c.id::text || 'e' || m.mon::text || d.day::text)) % 3),
    'advancePay',     0,
    -- 1日あたり：本指名 2〜12万、フリー 0.5〜4万（月合計は概ね従来と同水準に分散）
    'nominatedSales', 20000 + (abs(hashtext(c.id::text || 'n' || m.mon::text || d.day::text)) % 100000),
    'freeSales',       5000 + (abs(hashtext(c.id::text || 'f' || m.mon::text || d.day::text)) % 35000)
  )
from public.casts c
cross join (select generate_series(1, 12) as mon) m
cross join (select generate_series(1, 14) * 2 as day) d
where c.status = 'active'
on conflict (cast_id, date) do nothing;

-- -------------------------------------------------------------
-- 2) サンプル店舗目標（2026-09 月次）
--    sales_targets_store_uniq = (store_id, period_type, period_key) where scope='store'
--    部分インデックスなので on conflict on constraint は使えない → do nothing
-- -------------------------------------------------------------
insert into public.sales_targets (store_id, scope, cast_id, period_type, period_key, target_amount)
select
  s.id,
  'store',
  null,
  'month',
  '2026-09',
  case when s.kind = 'cabaret' then 8000000 else 3000000 end
from public.stores s
where s.status = 'active'
on conflict do nothing;

-- -------------------------------------------------------------
-- 3) サンプルキャスト個人目標（2026-09 月次・全アクティブcast 一律50万）
--    sales_targets_cast_uniq = (store_id, cast_id, period_type, period_key) where scope='cast'
-- -------------------------------------------------------------
insert into public.sales_targets (store_id, scope, cast_id, period_type, period_key, target_amount)
select
  c.store_id,
  'cast',
  c.id,
  'month',
  '2026-09',
  500000
from public.casts c
where c.status = 'active'
on conflict do nothing;
