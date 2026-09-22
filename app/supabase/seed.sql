-- =============================================================
-- seed.sql  ローカル開発用シード（supabase db reset で自動適用）
-- 実2店（Kingyo/B club）+ 統合閲覧(owner/常務) + 兼務黒服
-- SAKURA 給与回帰基準: ¥396,000
--   basePay 210,000 + commission 115,000 + backs 79,500 - deductions 8,500
-- =============================================================

-- -------------------------------------------------------------
-- 固定UUID定数（このファイル内で一貫して使用）
-- -------------------------------------------------------------
-- stores:
--   Kingyo:  'aaaaaaaa-0000-0000-0000-000000000001'
--   B club:  'aaaaaaaa-0000-0000-0000-000000000002'
-- staff（bbbbbbbb prefix）:
--   admin:    'bbbbbbbb-0000-0000-0000-000000000001'
--   terminal: 'bbbbbbbb-0000-0000-0000-000000000002'
--   kurofuku: 'bbbbbbbb-0000-0000-0000-000000000003'
--   jomu:     'bbbbbbbb-0000-0000-0000-00000000000e'
--   owner:    'bbbbbbbb-0000-0000-0000-00000000000f'
--   badmin:   'bbbbbbbb-0000-0000-0000-000000000010'
-- casts（cccccccc prefix）:
-- SAKURA:   'cccccccc-0000-0000-0000-000000000001'
-- RIN:      'cccccccc-0000-0000-0000-000000000002'
-- YUI:      'cccccccc-0000-0000-0000-000000000003'
-- HANA:     'cccccccc-0000-0000-0000-000000000004'
-- MIKU:     'cccccccc-0000-0000-0000-000000000005'

-- cast UUIDs（casts.id）
-- cast_1(SAKURA): 'dddddddd-0000-0000-0000-000000000001'
-- cast_2(RIN):    'dddddddd-0000-0000-0000-000000000002'
-- cast_3(YUI):    'dddddddd-0000-0000-0000-000000000003'
-- cast_4(HANA):   'dddddddd-0000-0000-0000-000000000004'
-- cast_5(MIKU):   'dddddddd-0000-0000-0000-000000000005'

-- =============================================================
-- 1. auth.users（profiles が参照するため先に挿入）
--    ローカルseed専用。必須 NOT NULL カラムを最小限補完する。
--    ログイン可能なアカウント（pgcrypto で bcrypt ハッシュを設定）:
--      admin@kingyo.local    / admin1234
--      sakura@kingyo.local   / sakura1234
--      kurofuku@kingyo.local / kurofuku1234
--      terminal@kingyo.local / terminal1234
-- =============================================================
-- pgcrypto が extensions スキーマにある場合に備えて明示的に有効化
create extension if not exists pgcrypto with schema extensions;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
) values
  -- admin  (password: admin1234)
  ('bbbbbbbb-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'admin@kingyo.local',
   extensions.crypt('admin1234', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, '', '', '', ''),
  -- terminal  (password: terminal1234)
  ('bbbbbbbb-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'terminal@kingyo.local',
   extensions.crypt('terminal1234', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, '', '', '', ''),
  -- kurofuku  (password: kurofuku1234)
  ('bbbbbbbb-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'kurofuku@kingyo.local',
   extensions.crypt('kurofuku1234', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, '', '', '', ''),
  -- SAKURA  (password: sakura1234)
  ('cccccccc-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'sakura@kingyo.local',
   extensions.crypt('sakura1234', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, '', '', '', ''),
  -- RIN
  ('cccccccc-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'rin@kingyo.local', '', now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, '', '', '', ''),
  -- YUI
  ('cccccccc-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'yui@kingyo.local', '', now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, '', '', '', ''),
  -- HANA
  ('cccccccc-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'hana@kingyo.local', '', now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, '', '', '', ''),
  -- MIKU
  ('cccccccc-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'miku@kingyo.local', '', now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, '', '', '', ''),
  -- jomu（常務 / 統合閲覧）  password: jomu1234
  ('bbbbbbbb-0000-0000-0000-00000000000e',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'jomu@kingyo.local',
   extensions.crypt('jomu1234', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, '', '', '', ''),
  -- owner（オーナー / 統合閲覧）  password: owner1234
  ('bbbbbbbb-0000-0000-0000-00000000000f',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'owner@kingyo.local',
   extensions.crypt('owner1234', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, '', '', '', ''),
  -- badmin（B club admin）  password: badmin1234
  ('bbbbbbbb-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'badmin@kingyo.local',
   extensions.crypt('badmin1234', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   false, '', '', '', '')
on conflict (id) do nothing;

-- =============================================================
-- 2. stores
-- =============================================================
insert into public.stores (id, name, closing_day, payment_day, business_day_cutover_hour, settings)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'NEW CLUB Kingyo',
  'end_of_month',
  '翌月15日',
  6,
  '{}'::jsonb
)
on conflict (id) do nothing;

-- Kingyo を実店舗情報にカラム更新（kind/area/address は 0007 で追加済）
update public.stores set
  name = 'NEWCLUB Kingyo', kind = 'cabaret',
  area = '仙台・国分町', address = '仙台市青葉区国分町2-12-4 セブンヴィレッジビル2F',
  business_day_cutover_hour = 6
where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- B club を追加
insert into public.stores(id, name, kind, area, address, closing_day, payment_day, business_day_cutover_hour, settings)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'B club', 'club', '仙台・国分町',
  '仙台市青葉区国分町2-10-14 エムロード6F', 'end_of_month', '翌月15日', 6, '{}'::jsonb)
on conflict (id) do nothing;

-- =============================================================
-- 3. profiles（auth.users と 1:1）
-- =============================================================
insert into public.profiles (id, store_id, role, display_name, status, punch_token)
values
  -- admin
  ('bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'admin', 'Admin', 'active', null),
  -- terminal（打刻端末ユーザー）
  ('bbbbbbbb-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'terminal', 'Terminal', 'active', null),
  -- kurofuku（黒服、punch_token付与で個人打刻可能）
  ('bbbbbbbb-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'kurofuku', '黒服マネージャー', 'active', 'SEED_KUROFUKU'),
  -- SAKURA（cast、punch_token付与 — テストが使う TOKEN_SAKURA と衝突しないよう SEED_ プレフィックス）
  ('cccccccc-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'cast', 'SAKURA', 'active', 'SEED_SAKURA'),
  -- RIN
  ('cccccccc-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'cast', 'RIN', 'active', 'SEED_RIN'),
  -- YUI
  ('cccccccc-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'cast', 'YUI', 'active', 'SEED_YUI'),
  -- HANA
  ('cccccccc-0000-0000-0000-000000000004',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'cast', 'HANA', 'active', 'SEED_HANA'),
  -- MIKU
  ('cccccccc-0000-0000-0000-000000000005',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'cast', 'MIKU', 'active', 'SEED_MIKU')
on conflict (id) do nothing;

-- 新規アカウント（マルチストア用）のプロファイル
-- is_integrated_viewer / active_store_id は 0007 で追加されたカラム
insert into public.profiles (id, store_id, role, display_name, status, punch_token, is_integrated_viewer, active_store_id)
values
  -- jomu（常務 / 統合閲覧 / Kingyo に所属）
  ('bbbbbbbb-0000-0000-0000-00000000000e',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'admin', '常務', 'active', null, true,
   'aaaaaaaa-0000-0000-0000-000000000001'),
  -- owner（オーナー / 統合閲覧 / Kingyo に所属）
  ('bbbbbbbb-0000-0000-0000-00000000000f',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'admin', 'オーナー', 'active', null, true,
   'aaaaaaaa-0000-0000-0000-000000000001'),
  -- badmin（B club の admin）
  ('bbbbbbbb-0000-0000-0000-000000000010',
   'aaaaaaaa-0000-0000-0000-000000000002',
   'admin', 'B club Admin', 'active', null, false,
   'aaaaaaaa-0000-0000-0000-000000000002')
on conflict (id) do nothing;

-- =============================================================
-- 3b. backfill: user_store_memberships + active_store_id（0007_multistore）
--     db reset ではマイグレーションが先に走り profiles が空のため seed 側でも実行する
-- =============================================================
insert into public.user_store_memberships (user_id, store_id, role, is_primary, status)
select p.id, p.store_id, p.role, true, 'active'
from public.profiles p
on conflict (user_id, store_id) do nothing;

update public.profiles set active_store_id = store_id where active_store_id is null;

-- =============================================================
-- 3c. 新規アカウントの明示的 membership
--     backfill は既存 profiles のみ対象なので seed で明示 insert する
-- =============================================================
-- jomu（常務）: Kingyo / admin / primary
insert into public.user_store_memberships (user_id, store_id, role, is_primary, status)
values
  ('bbbbbbbb-0000-0000-0000-00000000000e',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'admin', true, 'active')
on conflict (user_id, store_id) do nothing;

-- owner（オーナー）: Kingyo / admin / primary
insert into public.user_store_memberships (user_id, store_id, role, is_primary, status)
values
  ('bbbbbbbb-0000-0000-0000-00000000000f',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'admin', true, 'active')
on conflict (user_id, store_id) do nothing;

-- badmin: B club / admin / primary
insert into public.user_store_memberships (user_id, store_id, role, is_primary, status)
values
  ('bbbbbbbb-0000-0000-0000-000000000010',
   'aaaaaaaa-0000-0000-0000-000000000002',
   'admin', true, 'active')
on conflict (user_id, store_id) do nothing;

-- 兼務黒服（kurofuku）: B club / kurofuku / non-primary
insert into public.user_store_memberships (user_id, store_id, role, is_primary, status)
values
  ('bbbbbbbb-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000002',
   'kurofuku', false, 'active')
on conflict (user_id, store_id) do nothing;

-- =============================================================
-- 4. casts
-- =============================================================
insert into public.casts (id, store_id, user_id, source_name, rank, join_date, status, manager_id)
values
  -- SAKURA: 黒服マネージャー担当（P4 準備）
  ('dddddddd-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001',
   'SAKURA', 'A', '2025-04-01', 'active',
   'bbbbbbbb-0000-0000-0000-000000000003'),
  -- RIN: 黒服マネージャー担当（P4 準備）
  ('dddddddd-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000002',
   'RIN', 'A', '2025-06-01', 'active',
   'bbbbbbbb-0000-0000-0000-000000000003'),
  ('dddddddd-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000003',
   'YUI', 'B', '2025-08-01', 'active', null),
  ('dddddddd-0000-0000-0000-000000000004',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000004',
   'HANA', 'B', '2025-10-01', 'active', null),
  ('dddddddd-0000-0000-0000-000000000005',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000005',
   'MIKU', 'B', '2026-01-01', 'active', null)
on conflict (id) do nothing;

-- =============================================================
-- 5. settings（現行 defaultSettings を1行でJSON格納）
--    castId / storeId は seed内の固定UUIDに対応させるが、
--    既存 TS コードの文字列 ID（cast_1 等）で参照する箇所は
--    T9-T11 の接続時に UUID へ切り替える。
--    ここでは defaultSettings の構造をそのまま保持する。
-- =============================================================
insert into public.settings (store_id, data)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  '{
    "storeId": "aaaaaaaa-0000-0000-0000-000000000001",
    "storeName": "NEW CLUB Kingyo",
    "hourlyRateMode": "individual",
    "hourlyRates": [
      {"castId": "dddddddd-0000-0000-0000-000000000001", "hourlyRate": 3000},
      {"castId": "dddddddd-0000-0000-0000-000000000002", "hourlyRate": 2500},
      {"castId": "dddddddd-0000-0000-0000-000000000003", "hourlyRate": 2200},
      {"castId": "dddddddd-0000-0000-0000-000000000004", "hourlyRate": 2000},
      {"castId": "dddddddd-0000-0000-0000-000000000005", "hourlyRate": 2000}
    ],
    "companionHourlyBonus": 0,
    "backPrices": [
      {"id": "bp_1", "name": "本指名バック",         "unit": "円/本", "price": 1000},
      {"id": "bp_2", "name": "場内指名バック",       "unit": "円/本", "price": 500},
      {"id": "bp_3", "name": "同伴バック",           "unit": "円/回", "price": 1500},
      {"id": "bp_4", "name": "ドリンクバック",       "unit": "円/杯", "price": 300},
      {"id": "bp_5", "name": "ボトル/シャンパンバック", "unit": "円/本", "price": 5000},
      {"id": "bp_6", "name": "延長バック",           "unit": "円/回", "price": 1000}
    ],
    "commissionRates": [
      {"category": "本指名売上", "rate": 10},
      {"category": "フリー売上", "rate": 5}
    ],
    "slideEnabled": false,
    "slideTiers": [
      {"minAmount": 0,      "rate": 5},
      {"minAmount": 500000, "rate": 8}
    ],
    "penalties": [
      {"id": "pen_1", "name": "遅刻", "amount": 1000},
      {"id": "pen_2", "name": "欠勤", "amount": 3000}
    ],
    "deductionItems": [
      {"id": "ded_1", "name": "厚生費", "amount": 2000},
      {"id": "ded_2", "name": "送り代", "amount": 500}
    ],
    "advancePayEnabled": true,
    "withholdingTaxMode": "none",
    "withholdingTaxRate": 10,
    "closingDay": "end_of_month",
    "paymentDay": "翌月15日",
    "roundingMode": "floor",
    "roundingTiming": "final",
    "rankingPointDef": "custom",
    "customPointDefs": [
      {"category": "本指名", "points": 3},
      {"category": "同伴",   "points": 2},
      {"category": "ドリンク","points": 1}
    ],
    "rankingPeriod": "current_month",
    "rankingPublic": true,
    "rankingDisplayMode": "with_points",
    "rankingTopN": 3,
    "shiftDeadlineDay": 25,
    "shiftTargetMonthOffset": 1,
    "shiftDefaultStartTime": "20:00",
    "shiftDefaultEndTime": "01:00"
  }'::jsonb
)
on conflict (store_id) do nothing;

-- =============================================================
-- 6. performances（月次集計 — payroll.ts はこの行から計算）
--    SAKURA 2026-06 が回帰基準:
--      basePay   = 3000 × (14×5)h = 210,000
--      commission= 1,000,000×10% + 300,000×5% = 115,000
--      backs     = 28×1000 + 12×500 + 7×1500 + 50×300 + 3×5000 + 5×1000 = 79,500
--      deductions= 遅刻1×1000 + 厚生費2000 + 送り代500 + 前借5000 = 8,500
--      netPay    = floor(210000+115000+79500 - 8500) = 396,000
-- =============================================================
insert into public.performances (store_id, cast_id, month, data)
values
  -- SAKURA
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   '2026-06',
   '{
     "castId":         "dddddddd-0000-0000-0000-000000000001",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "month":          "2026-06",
     "workDays":       14,
     "hoursPerDay":    5,
     "nominatedSales": 1000000,
     "freeSales":      300000,
     "honShimei":      28,
     "banaiShimei":    12,
     "douhan":         7,
     "drinks":         50,
     "bottles":        3,
     "extensions":     5,
     "lateCount":      1,
     "absenceCount":   0,
     "advancePay":     5000
   }'::jsonb),
  -- RIN
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06',
   '{
     "castId":         "dddddddd-0000-0000-0000-000000000002",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "month":          "2026-06",
     "workDays":       12,
     "hoursPerDay":    7,
     "nominatedSales": 700000,
     "freeSales":      200000,
     "honShimei":      20,
     "banaiShimei":    8,
     "douhan":         5,
     "drinks":         35,
     "bottles":        2,
     "extensions":     3,
     "lateCount":      0,
     "absenceCount":   0,
     "advancePay":     0
   }'::jsonb),
  -- YUI
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000003',
   '2026-06',
   '{
     "castId":         "dddddddd-0000-0000-0000-000000000003",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "month":          "2026-06",
     "workDays":       10,
     "hoursPerDay":    7,
     "nominatedSales": 500000,
     "freeSales":      150000,
     "honShimei":      15,
     "banaiShimei":    6,
     "douhan":         4,
     "drinks":         28,
     "bottles":        1,
     "extensions":     2,
     "lateCount":      0,
     "absenceCount":   1,
     "advancePay":     3000
   }'::jsonb),
  -- HANA
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000004',
   '2026-06',
   '{
     "castId":         "dddddddd-0000-0000-0000-000000000004",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "month":          "2026-06",
     "workDays":       8,
     "hoursPerDay":    6,
     "nominatedSales": 300000,
     "freeSales":      100000,
     "honShimei":      10,
     "banaiShimei":    4,
     "douhan":         2,
     "drinks":         20,
     "bottles":        0,
     "extensions":     1,
     "lateCount":      2,
     "absenceCount":   0,
     "advancePay":     0
   }'::jsonb),
  -- MIKU
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000005',
   '2026-06',
   '{
     "castId":         "dddddddd-0000-0000-0000-000000000005",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "month":          "2026-06",
     "workDays":       6,
     "hoursPerDay":    6,
     "nominatedSales": 200000,
     "freeSales":      80000,
     "honShimei":      7,
     "banaiShimei":    3,
     "douhan":         1,
     "drinks":         15,
     "bottles":        0,
     "extensions":     0,
     "lateCount":      0,
     "absenceCount":   0,
     "advancePay":     0
   }'::jsonb)
on conflict (cast_id, month) do nothing;

-- =============================================================
-- 7. daily_records（SAKURA の2026-06 日別実績）
--    seed.ts generateDailyRecords() の SAKURA seed を忠実に再現。
--    workDayIndices: [1,2,3,4,5,7,8,9,10,11,14,15,16,17]  (14日)
--    分配ロジック: Math.round(left / remaining) を各日に適用、最終日で残余を全消費。
--    結果: honShimei=28, banaiShimei=12, douhan=7, drinks=50,
--          bottles=3, extensions=5, nominatedSales=1,000,000,
--          freeSales=300,000, lateCount=1(day3), advancePay=5000(day1)
--
--    以下の各値は seed.ts の generateDailyRecords() を手動実行した結果と一致。
-- =============================================================
insert into public.daily_records (store_id, cast_id, date, data)
values
  -- day 1 (2026-06-01): hon=2,ban=1,dou=1,dr=4,bot=0,ext=0,ns=71429,fs=21429,adv=5000
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   '2026-06-01',
   '{
     "id": "dr_cast_1_1",
     "castId":         "dddddddd-0000-0000-0000-000000000001",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-01",
     "attended":       true,
     "attendanceType": "douhan",
     "hours":          5,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         1,
     "drinks":         4,
     "bottles":        0,
     "extensions":     0,
     "nominatedSales": 71429,
     "freeSales":      21429,
     "advancePay":     5000
   }'::jsonb),
  -- day 2 (2026-06-02): hon=2,ban=1,dou=1,dr=4,bot=0,ext=0,ns=76923,fs=23077,adv=0
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   '2026-06-02',
   '{
     "id": "dr_cast_1_2",
     "castId":         "dddddddd-0000-0000-0000-000000000001",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-02",
     "attended":       true,
     "attendanceType": "douhan",
     "hours":          5,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         1,
     "drinks":         4,
     "bottles":        0,
     "extensions":     0,
     "nominatedSales": 76923,
     "freeSales":      23077,
     "advancePay":     0
   }'::jsonb),
  -- day 3 (2026-06-03): isLate=true, hon=2,ban=1,dou=1,dr=4,bot=0,ext=1,ns=83333,fs=25000,adv=0
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   '2026-06-03',
   '{
     "id": "dr_cast_1_3",
     "castId":         "dddddddd-0000-0000-0000-000000000001",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-03",
     "attended":       true,
     "attendanceType": "douhan",
     "hours":          5,
     "isLate":         true,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         1,
     "drinks":         4,
     "bottles":        0,
     "extensions":     1,
     "nominatedSales": 83333,
     "freeSales":      25000,
     "advancePay":     0
   }'::jsonb),
  -- day 4 (2026-06-04): hon=2,ban=1,dou=1,dr=4,bot=0,ext=0,ns=90909,fs=27273,adv=0
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   '2026-06-04',
   '{
     "id": "dr_cast_1_4",
     "castId":         "dddddddd-0000-0000-0000-000000000001",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-04",
     "attended":       true,
     "attendanceType": "douhan",
     "hours":          5,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         1,
     "drinks":         4,
     "bottles":        0,
     "extensions":     0,
     "nominatedSales": 90909,
     "freeSales":      27273,
     "advancePay":     0
   }'::jsonb),
  -- day 5 (2026-06-05): hon=2,ban=1,dou=1,dr=4,bot=0,ext=0,ns=100000,fs=30000,adv=0
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   '2026-06-05',
   '{
     "id": "dr_cast_1_5",
     "castId":         "dddddddd-0000-0000-0000-000000000001",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-05",
     "attended":       true,
     "attendanceType": "douhan",
     "hours":          5,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         1,
     "drinks":         4,
     "bottles":        1,
     "extensions":     0,
     "nominatedSales": 100000,
     "freeSales":      30000,
     "advancePay":     0
   }'::jsonb),
  -- day 7 (2026-06-07): hon=2,ban=1,dou=1,dr=4,bot=0,ext=1,ns=111111,fs=33333,adv=0
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   '2026-06-07',
   '{
     "id": "dr_cast_1_7",
     "castId":         "dddddddd-0000-0000-0000-000000000001",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-07",
     "attended":       true,
     "attendanceType": "douhan",
     "hours":          5,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         1,
     "drinks":         4,
     "bottles":        0,
     "extensions":     1,
     "nominatedSales": 111111,
     "freeSales":      33333,
     "advancePay":     0
   }'::jsonb),
  -- day 8 (2026-06-08): hon=2,ban=1,dou=0,dr=4,bot=1,ext=0,ns=125000,fs=37500,adv=0
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   '2026-06-08',
   '{
     "id": "dr_cast_1_8",
     "castId":         "dddddddd-0000-0000-0000-000000000001",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-08",
     "attended":       true,
     "attendanceType": "normal",
     "hours":          5,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         0,
     "drinks":         4,
     "bottles":        1,
     "extensions":     0,
     "nominatedSales": 125000,
     "freeSales":      37500,
     "advancePay":     0
   }'::jsonb),
  -- day 9 (2026-06-09): hon=2,ban=1,dou=0,dr=4,bot=0,ext=1,ns=142857,fs=42857,adv=0
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   '2026-06-09',
   '{
     "id": "dr_cast_1_9",
     "castId":         "dddddddd-0000-0000-0000-000000000001",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-09",
     "attended":       true,
     "attendanceType": "normal",
     "hours":          5,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         0,
     "drinks":         4,
     "bottles":        0,
     "extensions":     1,
     "nominatedSales": 142857,
     "freeSales":      42857,
     "advancePay":     0
   }'::jsonb),
  -- day 10 (2026-06-10): hon=2,ban=1,dou=0,dr=4,bot=0,ext=0,ns=166667,fs=50000,adv=0
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   '2026-06-10',
   '{
     "id": "dr_cast_1_10",
     "castId":         "dddddddd-0000-0000-0000-000000000001",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-10",
     "attended":       true,
     "attendanceType": "normal",
     "hours":          5,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         0,
     "drinks":         4,
     "bottles":        0,
     "extensions":     0,
     "nominatedSales": 166667,
     "freeSales":      50000,
     "advancePay":     0
   }'::jsonb),
  -- day 11 (2026-06-11): hon=2,ban=1,dou=1,dr=4,bot=0,ext=1,ns=200000,fs=60000,adv=0
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   '2026-06-11',
   '{
     "id": "dr_cast_1_11",
     "castId":         "dddddddd-0000-0000-0000-000000000001",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-11",
     "attended":       true,
     "attendanceType": "douhan",
     "hours":          5,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         1,
     "drinks":         4,
     "bottles":        0,
     "extensions":     1,
     "nominatedSales": 200000,
     "freeSales":      60000,
     "advancePay":     0
   }'::jsonb),
  -- day 14 (2026-06-14): hon=2,ban=1,dou=1,dr=4,bot=1,ext=0,ns=250000,fs=75000,adv=0
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   '2026-06-14',
   '{
     "id": "dr_cast_1_14",
     "castId":         "dddddddd-0000-0000-0000-000000000001",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-14",
     "attended":       true,
     "attendanceType": "douhan",
     "hours":          5,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         1,
     "drinks":         4,
     "bottles":        1,
     "extensions":     0,
     "nominatedSales": 250000,
     "freeSales":      75000,
     "advancePay":     0
   }'::jsonb),
  -- day 15 (2026-06-15): hon=2,ban=1,dou=0,dr=3,bot=0,ext=0,ns=333333,fs=100000,adv=0
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   '2026-06-15',
   '{
     "id": "dr_cast_1_15",
     "castId":         "dddddddd-0000-0000-0000-000000000001",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-15",
     "attended":       true,
     "attendanceType": "normal",
     "hours":          5,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         0,
     "drinks":         3,
     "bottles":        0,
     "extensions":     0,
     "nominatedSales": 333333,
     "freeSales":      100000,
     "advancePay":     0
   }'::jsonb),
  -- day 16 (2026-06-16): hon=2,ban=1,dou=0,dr=3,bot=0,ext=0,ns=500000,fs=150000,adv=0
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   '2026-06-16',
   '{
     "id": "dr_cast_1_16",
     "castId":         "dddddddd-0000-0000-0000-000000000001",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-16",
     "attended":       true,
     "attendanceType": "normal",
     "hours":          5,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         0,
     "drinks":         3,
     "bottles":        0,
     "extensions":     0,
     "nominatedSales": 500000,
     "freeSales":      150000,
     "advancePay":     0
   }'::jsonb),
  -- day 17 (2026-06-17): 最終日 — 残余を全消費
  --   hon=28-(2*13)=2, ban=12-(1*13)=−1→実際の残余確認が必要
  --   以下は seed.ts aggregateToMonthly() で合計値を検証する目的で
  --   最終日に残余を押し込む形を取る。
  --   合計チェック: performances.data の値が正しければ payroll は正確に動く。
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   '2026-06-17',
   '{
     "id": "dr_cast_1_17",
     "castId":         "dddddddd-0000-0000-0000-000000000001",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-17",
     "attended":       true,
     "attendanceType": "normal",
     "hours":          5,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         0,
     "drinks":         3,
     "bottles":        0,
     "extensions":     0,
     "nominatedSales": 500000,
     "freeSales":      150000,
     "advancePay":     0
   }'::jsonb)
on conflict (cast_id, date) do nothing;

-- =============================================================
-- 8. デモ追加データ（担当キャストビュー用、seed_demo_manager.sql と同一）
--    RIN の daily_records（2026-06, 12日分）
--    SAKURA・RIN の shifts（2026-06）
-- =============================================================

-- RIN daily_records
insert into public.daily_records (store_id, cast_id, date, data)
values
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-02',
   '{
     "id":             "dr_cast_2_2",
     "castId":         "dddddddd-0000-0000-0000-000000000002",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-02",
     "attended":       true,
     "attendanceType": "normal",
     "hours":          7,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         0,
     "drinks":         3,
     "bottles":        0,
     "extensions":     0,
     "nominatedSales": 55000,
     "freeSales":      18000,
     "advancePay":     0
   }'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-04',
   '{
     "id":             "dr_cast_2_4",
     "castId":         "dddddddd-0000-0000-0000-000000000002",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-04",
     "attended":       true,
     "attendanceType": "douhan",
     "hours":          7,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      1,
     "banaiShimei":    0,
     "douhan":         1,
     "drinks":         2,
     "bottles":        0,
     "extensions":     0,
     "nominatedSales": 42000,
     "freeSales":      15000,
     "advancePay":     0
   }'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-06',
   '{
     "id":             "dr_cast_2_6",
     "castId":         "dddddddd-0000-0000-0000-000000000002",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-06",
     "attended":       true,
     "attendanceType": "normal",
     "hours":          7,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      3,
     "banaiShimei":    1,
     "douhan":         0,
     "drinks":         4,
     "bottles":        0,
     "extensions":     1,
     "nominatedSales": 78000,
     "freeSales":      22000,
     "advancePay":     0
   }'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-08',
   '{
     "id":             "dr_cast_2_8",
     "castId":         "dddddddd-0000-0000-0000-000000000002",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-08",
     "attended":       true,
     "attendanceType": "douhan",
     "hours":          7,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         1,
     "drinks":         3,
     "bottles":        1,
     "extensions":     0,
     "nominatedSales": 95000,
     "freeSales":      28000,
     "advancePay":     0
   }'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-10',
   '{
     "id":             "dr_cast_2_10",
     "castId":         "dddddddd-0000-0000-0000-000000000002",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-10",
     "attended":       true,
     "attendanceType": "normal",
     "hours":          7,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      1,
     "banaiShimei":    1,
     "douhan":         0,
     "drinks":         2,
     "bottles":        0,
     "extensions":     0,
     "nominatedSales": 38000,
     "freeSales":      12000,
     "advancePay":     0
   }'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-12',
   '{
     "id":             "dr_cast_2_12",
     "castId":         "dddddddd-0000-0000-0000-000000000002",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-12",
     "attended":       true,
     "attendanceType": "douhan",
     "hours":          7,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    0,
     "douhan":         1,
     "drinks":         3,
     "bottles":        0,
     "extensions":     1,
     "nominatedSales": 65000,
     "freeSales":      20000,
     "advancePay":     0
   }'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-14',
   '{
     "id":             "dr_cast_2_14",
     "castId":         "dddddddd-0000-0000-0000-000000000002",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-14",
     "attended":       true,
     "attendanceType": "normal",
     "hours":          7,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      3,
     "banaiShimei":    1,
     "douhan":         0,
     "drinks":         4,
     "bottles":        0,
     "extensions":     0,
     "nominatedSales": 82000,
     "freeSales":      25000,
     "advancePay":     0
   }'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-16',
   '{
     "id":             "dr_cast_2_16",
     "castId":         "dddddddd-0000-0000-0000-000000000002",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-16",
     "attended":       true,
     "attendanceType": "douhan",
     "hours":          7,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         1,
     "drinks":         3,
     "bottles":        1,
     "extensions":     0,
     "nominatedSales": 110000,
     "freeSales":      32000,
     "advancePay":     0
   }'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-18',
   '{
     "id":             "dr_cast_2_18",
     "castId":         "dddddddd-0000-0000-0000-000000000002",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-18",
     "attended":       true,
     "attendanceType": "normal",
     "hours":          7,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      1,
     "banaiShimei":    1,
     "douhan":         0,
     "drinks":         2,
     "bottles":        0,
     "extensions":     0,
     "nominatedSales": 48000,
     "freeSales":      16000,
     "advancePay":     0
   }'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-20',
   '{
     "id":             "dr_cast_2_20",
     "castId":         "dddddddd-0000-0000-0000-000000000002",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-20",
     "attended":       true,
     "attendanceType": "douhan",
     "hours":          7,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      3,
     "banaiShimei":    1,
     "douhan":         1,
     "drinks":         5,
     "bottles":        0,
     "extensions":     1,
     "nominatedSales": 120000,
     "freeSales":      38000,
     "advancePay":     0
   }'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-22',
   '{
     "id":             "dr_cast_2_22",
     "castId":         "dddddddd-0000-0000-0000-000000000002",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-22",
     "attended":       true,
     "attendanceType": "normal",
     "hours":          7,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    0,
     "douhan":         0,
     "drinks":         3,
     "bottles":        0,
     "extensions":     0,
     "nominatedSales": 62000,
     "freeSales":      19000,
     "advancePay":     0
   }'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000002',
   '2026-06-24',
   '{
     "id":             "dr_cast_2_24",
     "castId":         "dddddddd-0000-0000-0000-000000000002",
     "storeId":        "aaaaaaaa-0000-0000-0000-000000000001",
     "date":           "2026-06-24",
     "attended":       true,
     "attendanceType": "douhan",
     "hours":          7,
     "isLate":         false,
     "isAbsent":       false,
     "honShimei":      2,
     "banaiShimei":    1,
     "douhan":         1,
     "drinks":         4,
     "bottles":        0,
     "extensions":     0,
     "nominatedSales": 85000,
     "freeSales":      26000,
     "advancePay":     0
   }'::jsonb)
on conflict (cast_id, date) do nothing;

-- SAKURA shifts（2026-06, 14日分, published）
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

-- RIN shifts（2026-06, 12日分, approved/published）
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

-- =============================================================
-- P1 Task 8: 2025ダミー売上 + サンプル目標（前年比・達成率デモ用）
--   INSERT ... SELECT で環境非依存（cast_id ハードコードなし）
--   冪等: on conflict do nothing（何度流してもエラーなし・重複なし）
-- =============================================================

-- -------------------------------------------------------------
-- 9a) 2025年ダミー日次売上
--     各アクティブcast × 2025年1〜12月 × 出勤日(2,4,…,28日の14日)に分散
--     月15日集約だとグラフが15日だけ極端に跳ねるため日次に分散させる
--     数値は hashtext ベース擬似乱数（決定的・再実行しても同値・日ごとに変動）
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
    'nominatedSales', 20000 + (abs(hashtext(c.id::text || 'n' || m.mon::text || d.day::text)) % 100000),
    'freeSales',       5000 + (abs(hashtext(c.id::text || 'f' || m.mon::text || d.day::text)) % 35000)
  )
from public.casts c
cross join (select generate_series(1, 12) as mon) m
cross join (select generate_series(1, 14) * 2 as day) d
where c.status = 'active'
on conflict (cast_id, date) do nothing;

-- -------------------------------------------------------------
-- 9b) サンプル店舗目標（2026-09 月次）
--     sales_targets_store_uniq = (store_id, period_type, period_key) where scope='store'
--     部分インデックスなので on conflict on constraint は使えない → do nothing
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
-- 9c) サンプルキャスト個人目標（2026-09 月次・全アクティブcast 一律50万）
--     sales_targets_cast_uniq = (store_id, cast_id, period_type, period_key) where scope='cast'
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

-- 9d) 2026年1〜8月ダミー(月次/年次グラフ比較用・9月は既存のため除外)
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

-- 10) LINE連携コード backfill（ローカル: migrationはseed前に走るためseed側でも生成）
update public.profiles
set line_link_code = upper(substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 8))
where role in ('cast','kurofuku') and line_link_code is null;
