-- =============================================================
-- seed_fill_2026.sql  2026年1〜8月のダミー日次売上（月次/年次グラフ比較用）
--   9月は既存データがあるため除外（重複回避）
--   各アクティブcast × 2026年1〜8月 × 出勤日(2,4,…,28日の14日)
--   2025より約15%高め（前年比プラス成長のデモ）。hashtext擬似乱数=決定的・冪等
-- =============================================================
insert into public.daily_records (store_id, cast_id, date, data)
select
  c.store_id,
  c.id,
  make_date(2026, m.mon, d.day) as date,
  jsonb_build_object(
    'id',             'fill26_' || c.id::text || '_' || m.mon::text || '_' || d.day::text,
    'date',           to_char(make_date(2026, m.mon, d.day), 'YYYY-MM-DD'),
    'castId',         c.id::text,
    'storeId',        c.store_id::text,
    'attended',       true,
    'isAbsent',       false,
    'hours',          5,
    'isLate',         false,
    'attendanceType', 'normal',
    'honShimei',      (abs(hashtext(c.id::text || m.mon::text || 'h26' || d.day::text)) % 6),
    'banaiShimei',    (abs(hashtext(c.id::text || 'b26' || m.mon::text || d.day::text)) % 3),
    'douhan',         (case when abs(hashtext(c.id::text || 'd26' || m.mon::text || d.day::text)) % 3 = 0 then 1 else 0 end),
    'drinks',         (abs(hashtext(c.id::text || 'dr26' || m.mon::text || d.day::text)) % 14),
    'bottles',        (case when abs(hashtext(c.id::text || 'bo26' || m.mon::text || d.day::text)) % 4 = 0 then 1 else 0 end),
    'extensions',     (abs(hashtext(c.id::text || 'e26' || m.mon::text || d.day::text)) % 3),
    'advancePay',     0,
    -- 2025比 約+15%（本指名 2.5〜14万、フリー 0.6〜4.6万）
    'nominatedSales', 25000 + (abs(hashtext(c.id::text || 'n26' || m.mon::text || d.day::text)) % 115000),
    'freeSales',       6000 + (abs(hashtext(c.id::text || 'f26' || m.mon::text || d.day::text)) % 40000)
  )
from public.casts c
cross join (select generate_series(1, 8) as mon) m
cross join (select generate_series(1, 14) * 2 as day) d
where c.status = 'active'
on conflict (cast_id, date) do nothing;
