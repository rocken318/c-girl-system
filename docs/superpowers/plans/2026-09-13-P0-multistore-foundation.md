# P0 基盤＋複数店対応（マルチストア正式化）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 系列2店（NEWCLUB Kingyo / B club）を正式運用できるよう、多対多メンバーシップ・統合閲覧ロール・アクティブ店舗・店舗スコープRLSを導入し、既存の `store_1` 固定を撤廃、実データ投入の受け皿（テンプレ＋取込）を用意する。

**Architecture:** 既存Supabase基盤（profiles.store_id単一＋`current_store_id()`ベースRLS）を、`user_store_memberships`（多対多）＋`profiles.is_integrated_viewer`/`active_store_id`＋新補助関数（`has_store_access`/`role_at_store`/`is_store_admin`）へ拡張。全RLSを「`has_store_access(store_id)`＋店舗内ロール」に置換（統合=全店閲覧・横断書込不可／一般=所属店／兼務黒服=複数店／cast=自分）。アプリは`activeStoreId`を持ち、ハードコード`store_1`を撤廃。

**Tech Stack:** Supabase (Postgres17, RLS, RPC), supabase-js, Vitest, pgTAP, React19+Vite+TS+Tailwind。

参照仕様：`docs/superpowers/specs/2026-09-13-P0-multistore-foundation-design.md`、親：`docs/superpowers/specs/2026-09-13-拡張全体設計とハンドオフ.md`、既存基盤：`docs/superpowers/specs/2026-09-12-qr-attendance-backend-design.md`

## 前提・現状
- 既存マイグレーション `app/supabase/migrations/0001〜0006`。`profiles.store_id`はNOT NULL単一。RLSは `store_id = current_store_id()` 型。補助関数 `current_store_id()`/`current_role_name()`/`current_cast_id()`（SECURITY DEFINER）。
- ローカル：`cd app && npx supabase start|db reset|test db`、`npm run test|build|lint`。pgTAPは `supabase/tests/*.sql`。
- ハードコード `store_1`：`src/pages/admin/ImportPage.tsx`(`STORE_ID`), `src/pages/admin/PerformanceEntryPage.tsx`, `src/data/seed.ts`（デモfallback）。
- 回帰：SAKURA給与 ¥396,000（`src/test/payrollRegression.test.ts`）。

## ファイル構成（新規/変更）
```
app/supabase/migrations/
  0007_multistore.sql        # stores列追加, user_store_memberships, profiles列, backfill
  0008_multistore_funcs.sql  # has_store_access / role_at_store / is_store_admin / current_store_id改修 / current_is_integrated
  0009_rls_multistore.sql    # 全RLSポリシーを has_store_access ベースへ置換
app/supabase/tests/
  multistore_funcs_test.sql  # 補助関数 pgTAP
  multistore_rls_test.sql    # 統合/一般/兼務/cast/横断書込不可 の pgTAP
app/supabase/seed.sql        # 2店＋統合(owner/常務)＋兼務黒服 を追記/改修
app/src/store/AuthContext.tsx        # memberships/isIntegratedViewer/activeStoreId/switchStore
app/src/data/stores.ts               # 店舗・メンバーシップ取得、switchActiveStore RPC呼び出し
app/src/components/StoreSwitcher.tsx  # 最小の店舗切替UI（兼務/統合のみ表示）
app/src/components/AdminLayout.tsx    # ヘッダに StoreSwitcher 配置
app/src/pages/admin/ImportPage.tsx    # STORE_ID撤廃→activeStoreId、取込先=アクティブ店舗
app/src/pages/admin/PerformanceEntryPage.tsx  # store_1撤廃→activeStoreId
app/src/lib/importTemplate.ts         # 投入テンプレのカラム定義＋パース/マッピング（新規）
app/src/test/importTemplate.test.ts   # テンプレパースのVitest（新規）
```

---

### Task 1: マイグレーション 0007 — stores列・メンバーシップ・profiles列・backfill

**Files:**
- Create: `app/supabase/migrations/0007_multistore.sql`
- Create: `app/supabase/tests/multistore_funcs_test.sql`（本タスクでは backfill 検証のみ記載、関数はTask2で追記）

- [ ] **Step 1: マイグレーション作成**

`app/supabase/migrations/0007_multistore.sql`:
```sql
-- stores 列追加
alter table public.stores add column if not exists kind text;
alter table public.stores add column if not exists address text;
alter table public.stores add column if not exists area text;
alter table public.stores add column if not exists status text not null default 'active'
  check (status in ('active','inactive'));

-- profiles 列追加（統合閲覧ロール・アクティブ店舗）
alter table public.profiles add column if not exists is_integrated_viewer boolean not null default false;
alter table public.profiles add column if not exists active_store_id uuid references public.stores(id);

-- 多対多メンバーシップ
create table if not exists public.user_store_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  role public.user_role not null,
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  unique (user_id, store_id)
);
create index if not exists idx_memberships_user on public.user_store_memberships (user_id);
create index if not exists idx_memberships_store on public.user_store_memberships (store_id);

alter table public.user_store_memberships enable row level security;

-- backfill: 既存 profiles.store_id → membership(is_primary=true, role=profiles.role)
insert into public.user_store_memberships (user_id, store_id, role, is_primary, status)
select p.id, p.store_id, p.role, true, 'active'
from public.profiles p
on conflict (user_id, store_id) do nothing;

-- backfill: active_store_id 未設定を主店舗で初期化
update public.profiles set active_store_id = store_id where active_store_id is null;
```

- [ ] **Step 2: 適用**

Run: `cd app && npx supabase db reset`
Expected: 0001〜0007 が順に適用されエラー無し（"Finished supabase db reset"）。

- [ ] **Step 3: backfill 検証 pgTAP**

`app/supabase/tests/multistore_funcs_test.sql`（この時点では backfill のみ）:
```sql
begin;
select plan(2);
-- seed 適用後、全 profiles に membership が1件以上ある
select is(
  (select count(*)::int from public.profiles p
    where not exists (select 1 from public.user_store_memberships m where m.user_id = p.id)),
  0, '全profilesにmembershipがある');
-- active_store_id が全 profiles で非NULL
select is(
  (select count(*)::int from public.profiles where active_store_id is null),
  0, 'active_store_idが初期化済み');
select * from finish();
rollback;
```

- [ ] **Step 4: テスト実行**

Run: `cd app && npx supabase db reset && npx supabase test db`
Expected: 既存 business_date/punch/rls と `multistore_funcs_test`(2) が全PASS。

- [ ] **Step 5: Commit**
```bash
git add app/supabase/migrations/0007_multistore.sql app/supabase/tests/multistore_funcs_test.sql
git commit -m "feat(db): stores列/メンバーシップ/profiles列追加+backfill(0007)"
```

---

### Task 2: マイグレーション 0008 — 補助関数（アクセス判定）

**Files:**
- Create: `app/supabase/migrations/0008_multistore_funcs.sql`
- Modify: `app/supabase/tests/multistore_funcs_test.sql`

- [ ] **Step 1: 関数マイグレーション作成**

`app/supabase/migrations/0008_multistore_funcs.sql`:
```sql
-- アクティブ店舗：profiles.active_store_id、未設定なら主(is_primary)membership
create or replace function public.current_store_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select active_store_id from public.profiles where id = auth.uid()),
    (select store_id from public.user_store_memberships
       where user_id = auth.uid() and is_primary and status='active' limit 1)
  );
$$;

-- 統合閲覧ロール
create or replace function public.current_is_integrated()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_integrated_viewer from public.profiles where id = auth.uid()), false);
$$;

-- 指定店舗にアクセスできるか（統合 or membership保有）
create or replace function public.has_store_access(p_store uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_is_integrated()
      or exists (select 1 from public.user_store_memberships
                 where user_id = auth.uid() and store_id = p_store and status='active');
$$;

-- 指定店舗での役割（membership.role）。無ければ null
create or replace function public.role_at_store(p_store uuid)
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.user_store_memberships
   where user_id = auth.uid() and store_id = p_store and status='active' limit 1;
$$;

-- 指定店舗の admin か
create or replace function public.is_store_admin(p_store uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.role_at_store(p_store) = 'admin';
$$;
```

- [ ] **Step 2: 関数 pgTAP を追記**

`app/supabase/tests/multistore_funcs_test.sql` を次の内容に置換（plan 6。固定UUIDでテストデータを作り、ロール切替で関数挙動を検証）:
```sql
begin;
select plan(6);

insert into public.stores(id,name) values
  ('10000000-0000-0000-0000-000000000001','店A'),
  ('10000000-0000-0000-0000-000000000002','店B');
insert into auth.users(id) values
  ('20000000-0000-0000-0000-00000000000a'),  -- 統合
  ('20000000-0000-0000-0000-00000000000b'),  -- 店Aのadmin
  ('20000000-0000-0000-0000-00000000000c');  -- 兼務黒服(A,B)
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
-- 統合は両店にアクセス可
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-00000000000a',true);
select ok(public.has_store_access('10000000-0000-0000-0000-000000000002'), '統合は他店アクセス可');
select ok(public.current_is_integrated(), '統合フラグtrue');
-- 店Aadminは店Bにアクセス不可・店Aでadmin
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-00000000000b',true);
select ok(not public.has_store_access('10000000-0000-0000-0000-000000000002'), 'A管理は他店アクセス不可');
select ok(public.is_store_admin('10000000-0000-0000-0000-000000000001'), 'A管理は店Aでadmin');
-- 兼務黒服は両店アクセス可・店Bでkurofuku
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-00000000000c',true);
select ok(public.has_store_access('10000000-0000-0000-0000-000000000002'), '兼務は店Bアクセス可');
select is(public.role_at_store('10000000-0000-0000-0000-000000000002')::text, 'kurofuku', '兼務は店Bでkurofuku');

select * from finish();
rollback;
```

- [ ] **Step 3: テスト実行**

Run: `cd app && npx supabase db reset && npx supabase test db`
Expected: `multistore_funcs_test` が 6/6 PASS。既存テストも全PASS。

- [ ] **Step 4: Commit**
```bash
git add app/supabase/migrations/0008_multistore_funcs.sql app/supabase/tests/multistore_funcs_test.sql
git commit -m "feat(db): マルチストア補助関数(has_store_access/role_at_store/is_store_admin)+current_store_id改修(0008)"
```

---

### Task 3: マイグレーション 0009 — 全RLSを has_store_access ベースへ置換

**Files:**
- Create: `app/supabase/migrations/0009_rls_multistore.sql`
- Create: `app/supabase/tests/multistore_rls_test.sql`

- [ ] **Step 1: RLS置換マイグレーション作成**

`app/supabase/migrations/0009_rls_multistore.sql`:
```sql
-- 旧ポリシーを破棄して新設（has_store_access + 店舗内ロール）
-- profiles
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select using (
  id = auth.uid() or current_is_integrated() or is_store_admin(store_id)
);

-- stores（所属 or 統合）
drop policy if exists stores_select on public.stores;
create policy stores_select on public.stores for select using ( has_store_access(id) );

-- casts
drop policy if exists casts_select on public.casts;
create policy casts_select on public.casts for select using (
  current_is_integrated() or (has_store_access(store_id) and (
    is_store_admin(store_id)
    or (role_at_store(store_id) = 'kurofuku' and manager_id = auth.uid())
    or user_id = auth.uid()
  ))
);

-- time_records
drop policy if exists time_records_select on public.time_records;
create policy time_records_select on public.time_records for select using (
  current_is_integrated() or (has_store_access(store_id) and (
    is_store_admin(store_id)
    or person_id = auth.uid()
    or (role_at_store(store_id) = 'kurofuku' and person_id in (
          select c.user_id from public.casts c where c.manager_id = auth.uid()))
  ))
);
drop policy if exists time_records_admin_write on public.time_records;
create policy time_records_admin_write on public.time_records for update
  using ( is_store_admin(store_id) ) with check ( is_store_admin(store_id) );
drop policy if exists time_records_admin_insert on public.time_records;
create policy time_records_admin_insert on public.time_records for insert
  with check ( is_store_admin(store_id) );

-- audit_logs
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select using (
  current_is_integrated() or is_store_admin(store_id)
);
drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs for insert with check ( is_store_admin(store_id) );

-- staff_profiles
drop policy if exists staff_profiles_select on public.staff_profiles;
create policy staff_profiles_select on public.staff_profiles for select using (
  current_is_integrated() or (has_store_access(store_id) and (is_store_admin(store_id) or user_id = auth.uid()))
);
drop policy if exists staff_profiles_admin_write on public.staff_profiles;
create policy staff_profiles_admin_write on public.staff_profiles for all
  using ( is_store_admin(store_id) ) with check ( is_store_admin(store_id) );

-- settings
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select using ( has_store_access(store_id) );
drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings for all
  using ( is_store_admin(store_id) ) with check ( is_store_admin(store_id) );

-- performances / daily_records / shifts / payrolls（共通パターン）
do $$
declare t text;
begin
  foreach t in array array['performances','daily_records','shifts','payrolls'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format($f$
      create policy %1$s_select on public.%1$s for select using (
        current_is_integrated() or (has_store_access(store_id) and (
          is_store_admin(store_id)
          or cast_id = current_cast_id()
          or (role_at_store(store_id) = 'kurofuku' and cast_id in (
                select id from public.casts where manager_id = auth.uid()))
        ))
      );
    $f$, t);
    execute format('drop policy if exists %1$s_admin_write on public.%1$s;', t);
    execute format($f$
      create policy %1$s_admin_write on public.%1$s for all
        using ( is_store_admin(store_id) ) with check ( is_store_admin(store_id) );
    $f$, t);
  end loop;
end $$;

-- cast 自身のシフト提出（自店のみ）
drop policy if exists shifts_cast_insert on public.shifts;
create policy shifts_cast_insert on public.shifts for insert
  with check ( has_store_access(store_id) and cast_id = current_cast_id() );
drop policy if exists shifts_cast_update on public.shifts;
create policy shifts_cast_update on public.shifts for update
  using ( has_store_access(store_id) and cast_id = current_cast_id() and status='submitted' )
  with check ( has_store_access(store_id) and cast_id = current_cast_id() );

-- memberships 自身の閲覧（店舗切替UI用）＋adminは自店分閲覧
drop policy if exists memberships_select on public.user_store_memberships;
create policy memberships_select on public.user_store_memberships for select using (
  user_id = auth.uid() or current_is_integrated() or is_store_admin(store_id)
);
```

- [ ] **Step 2: RLS pgTAP 作成**

`app/supabase/tests/multistore_rls_test.sql`（plan 6。店A/店B・統合・店Aadmin・兼務黒服・店Acast を作り、time_records で検証）:
```sql
begin;
select plan(6);

insert into public.stores(id,name) values
  ('30000000-0000-0000-0000-000000000001','店A'),
  ('30000000-0000-0000-0000-000000000002','店B');
insert into auth.users(id) values
  ('40000000-0000-0000-0000-0000000000a1'),  -- 統合
  ('40000000-0000-0000-0000-0000000000a2'),  -- 店Aadmin
  ('40000000-0000-0000-0000-0000000000c1'),  -- 店Acast
  ('40000000-0000-0000-0000-0000000000b1');  -- 店Bcast
insert into public.profiles(id,store_id,role,display_name,is_integrated_viewer,active_store_id) values
  ('40000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-000000000001','admin','統合',true,'30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-0000000000a2','30000000-0000-0000-0000-000000000001','admin','A管理',false,'30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-0000000000c1','30000000-0000-0000-0000-000000000001','cast','Acast',false,'30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-0000000000b1','30000000-0000-0000-0000-000000000002','cast','Bcast',false,'30000000-0000-0000-0000-000000000002');
insert into public.user_store_memberships(user_id,store_id,role,is_primary) values
  ('40000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-000000000001','admin',true),
  ('40000000-0000-0000-0000-0000000000a2','30000000-0000-0000-0000-000000000001','admin',true),
  ('40000000-0000-0000-0000-0000000000c1','30000000-0000-0000-0000-000000000001','cast',true),
  ('40000000-0000-0000-0000-0000000000b1','30000000-0000-0000-0000-000000000002','cast',true);
insert into public.time_records(store_id,person_id,role_at_punch,business_date,clock_in_at) values
  ('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000000c1','cast','2026-06-15',now()),
  ('30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-0000000000b1','cast','2026-06-15',now());

set local role authenticated;
-- 統合：両店 time_records が見える(2)
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-0000000000a1',true);
select is((select count(*)::int from public.time_records), 2, '統合は全店勤怠が見える');
-- 店Aadmin：店Aのみ(1)、店Bは見えない
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-0000000000a2',true);
select is((select count(*)::int from public.time_records), 1, 'A管理は自店のみ');
select is((select count(*)::int from public.time_records where store_id='30000000-0000-0000-0000-000000000002'), 0, 'A管理は他店が見えない');
-- 店Acast：自分のみ(1)、他人(Bcast)は0
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-0000000000c1',true);
select is((select count(*)::int from public.time_records), 1, 'castは自分のみ(IDOR)');
-- 統合でも他店へ書込不可（店Bへ insert が弾かれる＝0件のまま）
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-0000000000a1',true);
select throws_ok($$ insert into public.time_records(store_id,person_id,role_at_punch,business_date,clock_in_at)
  values ('30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-0000000000b1','cast','2026-06-16',now()) $$,
  '42501', null, '統合でも他店への書込は不可');
-- 店Aadmin は自店へ insert 可
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-0000000000a2',true);
select lives_ok($$ insert into public.time_records(store_id,person_id,role_at_punch,business_date,clock_in_at)
  values ('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000000c1','cast','2026-06-17',now()) $$,
  'A管理は自店へ書込可');

select * from finish();
rollback;
```

- [ ] **Step 3: テスト実行**

Run: `cd app && npx supabase db reset && npx supabase test db`
Expected: `multistore_rls_test` 6/6 PASS。既存の rls_test/punch/business_date/funcs も全PASS（退行なし）。

- [ ] **Step 4: Commit**
```bash
git add app/supabase/migrations/0009_rls_multistore.sql app/supabase/tests/multistore_rls_test.sql
git commit -m "feat(db): 全RLSをhas_store_accessベースへ置換(統合/所属/兼務/cast)(0009)"
```

---

### Task 4: seed 更新 — 実2店＋統合(オーナー/常務)＋兼務黒服

**Files:**
- Modify: `app/supabase/seed.sql`

- [ ] **Step 1: 既存 seed を読み、店舗・profiles・memberships を更新**

`app/supabase/seed.sql` を次の方針で編集（既存の固定UUIDは維持し、追記/更新）:
- 既存 store（`aaaaaaaa-0000-0000-0000-000000000001`）を実店舗 **Kingyo** としてカラム更新：
```sql
update public.stores set
  name = 'NEWCLUB Kingyo', kind = 'cabaret',
  area = '仙台・国分町', address = '仙台市青葉区国分町2-12-4 セブンヴィレッジビル2F',
  business_day_cutover_hour = 6
where id = 'aaaaaaaa-0000-0000-0000-000000000001';
```
- **B club** を追加（固定UUID `aaaaaaaa-0000-0000-0000-000000000002`）：
```sql
insert into public.stores(id,name,kind,area,address,closing_day,payment_day,business_day_cutover_hour,settings)
values ('aaaaaaaa-0000-0000-0000-000000000002','B club','club','仙台・国分町',
  '仙台市青葉区国分町2-10-14 エムロード6F','end_of_month','翌月15日',6,'{}'::jsonb)
on conflict (id) do nothing;
```
- **オーナー/常務**（統合）アカウントを auth.users＋profiles（`is_integrated_viewer=true`, active_store=Kingyo）で追加。ログイン可能にするため既存同様 `extensions.crypt('owner1234', extensions.gen_salt('bf'))` を設定（例 email `owner@kingyo.local` / `jomu@kingyo.local`、固定UUID `bbbbbbbb-0000-0000-0000-00000000000o`相当の有効UUID）。
- 既存 admin/kurofuku/cast の membership は 0007 の backfill で生成されるが、seed では明示的に `on conflict do nothing` で両立。
- **B club の最小アカウント**（B店 admin 1名）＋ **兼務黒服**：既存 kurofuku（`bbbbbbbb-0000-0000-0000-000000000003`）に B club の membership を追加（role='kurofuku'）:
```sql
insert into public.user_store_memberships(user_id,store_id,role,is_primary,status)
values ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000002','kurofuku',false,'active')
on conflict (user_id,store_id) do nothing;
```
- 統合アカウントの membership は両店に作らず、`is_integrated_viewer=true` で横断（has_store_access が true を返す）。active_store は Kingyo。

（具体UUID・emailは実装時に既存seedの命名規則に合わせて確定。ログインパスワードは report で明記すること。）

- [ ] **Step 2: 適用＋全テスト**

Run: `cd app && npx supabase db reset && npx supabase test db`
Expected: 全 pgTAP PASS（backfill/funcs/rls 含む、退行なし）。

- [ ] **Step 3: 回帰（SAKURA ¥396,000）**

Run: `cd app && npm run test`
Expected: payrollRegression 含む全PASS（¥396,000維持）。

- [ ] **Step 4: Commit**
```bash
git add app/supabase/seed.sql
git commit -m "feat(db): seedを実2店(Kingyo/B club)+統合(owner/常務)+兼務黒服に更新"
```

---

### Task 5: AuthContext をマルチストア対応（memberships/activeStore/switch）

**Files:**
- Create: `app/src/data/stores.ts`
- Modify: `app/src/store/AuthContext.tsx`

- [ ] **Step 1: 現行 AuthContext を読む**

Run: `sed -n '1,200p' app/src/store/AuthContext.tsx`
Expected: `AuthUser`/`fetchAuthUser`/`loginAsRole` を把握。

- [ ] **Step 2: stores データアクセサ**

`app/src/data/stores.ts`:
```ts
import { supabase } from '../lib/supabase';

export interface StoreMembership {
  storeId: string;
  storeName: string;
  role: 'admin' | 'kurofuku' | 'cast' | 'terminal';
  isPrimary: boolean;
}

/** 自分のメンバーシップ一覧（RLSで自分の行のみ）＋店名join */
export async function fetchMyMemberships(): Promise<StoreMembership[]> {
  const { data, error } = await supabase
    .from('user_store_memberships')
    .select('store_id, role, is_primary, stores(name)')
    .eq('status', 'active');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    storeId: r.store_id as string,
    storeName: ((r.stores as { name?: string } | null)?.name) ?? '',
    role: r.role as StoreMembership['role'],
    isPrimary: r.is_primary as boolean,
  }));
}

/** アクティブ店舗を切替（membership検証はRLS/更新ポリシー側。統合者は全店可） */
export async function setActiveStore(storeId: string): Promise<void> {
  const { error } = await supabase.auth.getUser().then(async ({ data }) => {
    const uid = data.user?.id;
    if (!uid) return { error: new Error('no session') };
    return supabase.from('profiles').update({ active_store_id: storeId }).eq('id', uid);
  });
  if (error) throw error;
}
```
注：`profiles` の UPDATE を許すポリシーが必要（自分の active_store_id のみ）。Task 3 のマイグレーションに次を追加しておくこと（本タスクでマイグレーションに追記して db reset）:
```sql
-- profiles: 本人が自分の active_store_id を更新可（切替用。RLSは has_store_access で妥当性担保は別途RPCでも可）
create policy profiles_self_update on public.profiles for update
  using ( id = auth.uid() ) with check ( id = auth.uid() );
```
（セキュリティ上、切替先の妥当性＝ has_store_access は UI/将来RPCで担保。P0では本人更新のみ許可で可。）

- [ ] **Step 3: AuthContext 拡張**

`AuthContext.tsx` を変更：`fetchAuthUser` で memberships と `is_integrated_viewer`/`active_store_id` を取得し、`AuthUser` に以下を追加（既存フィールドは維持）:
```ts
// AuthUser に追加
memberships: StoreMembership[];
isIntegratedViewer: boolean;
activeStoreId: string;
```
コンテキストに `switchStore(storeId: string): Promise<void>`（`setActiveStore` 呼び出し→再 fetch）を追加。既存 `storeId` は activeStoreId と同値を維持（後方互換）。

- [ ] **Step 4: ビルド**

Run: `cd app && npm run build`
Expected: 型エラー無し。

- [ ] **Step 5: 手動確認**

ローカルで統合アカウント（owner）ログイン→`memberships`/`isIntegratedViewer=true`/`activeStoreId` が取得できること、`switchStore('<B club id>')` 後に再ログイン無しで active が変わることを確認（コンソール/画面で）。

- [ ] **Step 6: Commit**
```bash
git add app/src/data/stores.ts app/src/store/AuthContext.tsx app/supabase/migrations/0009_rls_multistore.sql
git commit -m "feat(auth): memberships/activeStore/statusをAuthContextへ+店舗切替"
```

---

### Task 6: 店舗切替UI（最小）

**Files:**
- Create: `app/src/components/StoreSwitcher.tsx`
- Modify: `app/src/components/AdminLayout.tsx`

- [ ] **Step 1: StoreSwitcher**

`app/src/components/StoreSwitcher.tsx`:
```tsx
import { useAuth } from '../store/AuthContext';

export function StoreSwitcher() {
  const { user, switchStore } = useAuth();
  if (!user) return null;
  // 統合者は全メンバーシップ＋（将来）全店。兼務者は複数membership。単一所属は非表示。
  const options = user.memberships;
  if (!user.isIntegratedViewer && options.length <= 1) return null;
  return (
    <select
      value={user.activeStoreId}
      onChange={(e) => { void switchStore(e.target.value); }}
      className="rounded-lg border border-gold/30 bg-ink/5 px-3 py-1.5 text-sm font-mincho text-ink"
      aria-label="店舗切替"
    >
      {options.map((m) => (
        <option key={m.storeId} value={m.storeId}>{m.storeName}</option>
      ))}
    </select>
  );
}
```
注：統合者が「membershipに無い店」も切り替えたい場合、options に全stores（`fetchAllStores()`）を使う。P0では membership 店＋自店で十分（全店合算はP3）。統合者の全店切替が必要なら `fetchMyMemberships` の代わりに stores 全件（RLSで統合は全store_select可）を options にする。

- [ ] **Step 2: AdminLayout に配置**

`AdminLayout.tsx` のヘッダ領域に `<StoreSwitcher />` を追加（ロゴ/タイトルの近く）。既存レイアウトを壊さない。

- [ ] **Step 3: ビルド＋確認**

Run: `cd app && npm run build`
Expected: 型エラー無し。単一所属adminでは出ない／統合・兼務では出て切替できることを確認。

- [ ] **Step 4: Commit**
```bash
git add app/src/components/StoreSwitcher.tsx app/src/components/AdminLayout.tsx
git commit -m "feat(ui): 管理ヘッダに店舗切替(兼務/統合のみ表示)"
```

---

### Task 7: store_1 ハードコード撤廃

**Files:**
- Modify: `app/src/pages/admin/ImportPage.tsx`
- Modify: `app/src/pages/admin/PerformanceEntryPage.tsx`

- [ ] **Step 1: ImportPage**

`app/src/pages/admin/ImportPage.tsx` の `const STORE_ID = 'store_1';` を撤廃し、`const { user } = useAuth();` から `const storeId = user?.activeStoreId;` を使用。取込先＝アクティブ店舗。`storeId` 未確定時は取込ボタンを無効化し「店舗を選択してください」を表示。

- [ ] **Step 2: PerformanceEntryPage**

`app/src/pages/admin/PerformanceEntryPage.tsx` の `storeId: 'store_1'`（複数箇所）を `user?.activeStoreId` 由来に置換。`useAuth` が未導入なら import 追加。

- [ ] **Step 3: 残存 store_1 の確認**

Run: `grep -rn "store_1" app/src --include=*.ts --include=*.tsx`
Expected: 実クエリ経路に `store_1` が無いこと（`src/data/seed.ts` のデモfallback定義のみ残置可。ただしfallbackが実保存に使われないことを確認）。

- [ ] **Step 4: ビルド**

Run: `cd app && npm run build`
Expected: 型エラー無し。

- [ ] **Step 5: Commit**
```bash
git add app/src/pages/admin/ImportPage.tsx app/src/pages/admin/PerformanceEntryPage.tsx
git commit -m "refactor: store_1固定を撤廃しアクティブ店舗参照へ"
```

---

### Task 8: データ投入テンプレ＋取込（受け皿）

**Files:**
- Create: `app/src/lib/importTemplate.ts`
- Create: `app/src/test/importTemplate.test.ts`
- Modify: `app/src/pages/admin/ImportPage.tsx`（テンプレ選択＋パース結果プレビュー）

- [ ] **Step 1: テンプレ定義＋パースの失敗テスト**

`app/src/test/importTemplate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseCastRoster } from '../lib/importTemplate';

describe('parseCastRoster', () => {
  it('ヘッダ付きCSVをキャスト行に変換', () => {
    const csv = '源氏名,ランク,入店日,時給\nSAKURA,A,2025-04-01,3000\nRIN,A,2025-06-01,3000';
    const rows = parseCastRoster(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ sourceName: 'SAKURA', rank: 'A', joinDate: '2025-04-01', hourlyRate: 3000 });
  });
  it('空行・余分な空白を無視', () => {
    const csv = '源氏名,ランク,入店日,時給\n  MIKU , B , 2026-01-01 , 2800 \n';
    const rows = parseCastRoster(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceName).toBe('MIKU');
    expect(rows[0].hourlyRate).toBe(2800);
  });
});
```
Run: `cd app && npm run test -- importTemplate`
Expected: FAIL（未定義）。

- [ ] **Step 2: 実装**

`app/src/lib/importTemplate.ts`:
```ts
export interface CastRosterRow {
  sourceName: string;
  rank: string;
  joinDate: string;   // YYYY-MM-DD
  hourlyRate: number;
}

/** 投入テンプレ(キャスト名簿)のヘッダ定義。店に配布する列順。 */
export const CAST_ROSTER_HEADERS = ['源氏名', 'ランク', '入店日', '時給'] as const;

/** ヘッダ付きCSVをキャスト名簿行へ変換。空行は無視、前後空白trim。 */
export function parseCastRoster(csv: string): CastRosterRow[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => {
    const [sourceName, rank, joinDate, hourly] = line.split(',').map((c) => c.trim());
    return { sourceName, rank, joinDate, hourlyRate: Number(hourly) || 0 };
  });
}
```

- [ ] **Step 3: テスト成功**

Run: `cd app && npm run test -- importTemplate`
Expected: PASS（2 tests）。

- [ ] **Step 4: ImportPage にテンプレ取込導線**

`ImportPage.tsx` に「キャスト名簿テンプレ（CSV）取込」セクションを追加：
- テンプレ列（`CAST_ROSTER_HEADERS`）のDL用サンプルテキスト表示
- ファイル選択→`parseCastRoster`→プレビュー表（件数・各行）
- 「取込実行」で **アクティブ店舗** に `casts` を upsert（source_name/rank/join_date＋`staff`ではなくcast）。`import_batches` で冪等（同一店舗・同一バッチは洗い替え）。実ロードは受領データで行うが、導線と保存ロジックを通す。
- 保存は supabase（RLSで自店adminのみ）。storeId未確定時は無効化。

- [ ] **Step 5: ビルド＋テスト**

Run: `cd app && npm run build && npm run test`
Expected: 型エラー無し・全テストPASS。

- [ ] **Step 6: Commit**
```bash
git add app/src/lib/importTemplate.ts app/src/test/importTemplate.test.ts app/src/pages/admin/ImportPage.tsx
git commit -m "feat(import): キャスト名簿テンプレ定義+パース+取込導線(アクティブ店舗/冪等)"
```

---

### Task 9: 総合確認＋メモリ更新

**Files:** 検証のみ（＋メモリ）

- [ ] **Step 1: DBテスト全PASS**

Run: `cd app && npx supabase db reset && npx supabase test db`
Expected: business_date/punch/rls/multistore_funcs/multistore_rls すべてPASS。

- [ ] **Step 2: ユニット/回帰全PASS**

Run: `cd app && npm run test`
Expected: importTemplate/payrollRegression 含む全PASS（SAKURA ¥396,000）。

- [ ] **Step 3: lint＋build**

Run: `cd app && npm run lint && npm run build`
Expected: buildエラー無し。lintは既存水準（新規エラーを増やさない）。

- [ ] **Step 4: 手動スモーク**

ローカルSupabase起動・seed投入の上で：
1. 統合(owner)ログイン→店舗切替で Kingyo/B club を行き来でき、各店のデータが見える
2. 兼務黒服ログイン→2店が切替可、担当キャストのみ閲覧
3. 店Aadminログイン→切替UI非表示（単一所属）、他店データ不可
4. ImportPage でアクティブ店舗にキャスト名簿CSVを取込プレビュー→保存

- [ ] **Step 5: 本番反映メモ（別途運用で実行）**

本番は `cd app && npx supabase db push`（0007-0009適用）＋ seed差分（B club・統合アカウント・兼務membership）を適用。既存1店はリネーム。※実行は人手確認のうえ。

- [ ] **Step 6: メモリ更新＋Commit**

`project_kingyo.md` に「P0 マルチストア（メンバーシップ/統合ロール/アクティブ店舗/RLS置換/取込テンプレ）」を追記。
```bash
git add -A && git commit -m "chore: P0 総合確認(DB/unit/回帰/lint/build)完了"
```

---

## Self-Review 結果
- **Spec coverage:** §4.1 stores列→T1 / §4.2 memberships→T1 / §4.3 統合フラグ→T1 / §4.4 active_store→T1 / §5 補助関数→T2 / §6 RLS→T3 / §7 店舗スコープ化→T5,T6,T7 / §8 取込→T8 / §9 seed→T4 / §10 テスト→T1-4,T8,T9。全要件にタスク対応。
- **Placeholder scan:** seed(T4)とImportPage保存(T8)に「実装時に既存命名規則へ」「実ロードは受領後」と明記（値の転記元・方針を指定、未定義の放置なし）。pgTAPのUUIDは有効形式で記載。
- **型整合:** `has_store_access`/`role_at_store`/`is_store_admin`/`current_store_id`/`current_is_integrated`（SQL）、`StoreMembership`/`fetchMyMemberships`/`setActiveStore`/`switchStore`/`activeStoreId`/`isIntegratedViewer`/`memberships`（TS）、`parseCastRoster`/`CastRosterRow`/`CAST_ROSTER_HEADERS` は全タスク一貫。
- 注意点：T5 で `profiles_self_update` ポリシーを 0009 に追記する旨を明記（active_store切替のため）。

## P1以降への接続
- P1(売上目標)：`sales_targets(store_id,...)` は本P0の store スコープ/RLSパターンをそのまま踏襲。
- P3(全店合算)：統合ユーザーは既に全店 SELECT 可。合算ダッシュボード画面を足すだけ。
