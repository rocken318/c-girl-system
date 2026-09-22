# QR出退勤 ＋ Supabase基盤（P0+P1）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contextデモを Supabase 実運用基盤（Postgres+Auth+RLS）へ移行し、店の共有端末で個人QRをかざしてサーバー時刻で打刻する出退勤を実装する。

**Architecture:** `app/supabase/` にSQLマイグレーションとRLS/RPCを置き、ローカル Supabase（Docker）+ pgTAP で検証。アプリ側は `lib/supabase.ts` クライアントと型付きデータアクセス層を新設し、既存 Context を段階的に Supabase バックに差し替え（UIページは流用）。打刻は `punch(token)` RPC（SECURITY DEFINER, サーバー時刻）に一本化。

**Tech Stack:** Supabase (Postgres 15, Auth, RLS), supabase-js, Vitest（ロジック/回帰テスト）, pgTAP（DB/RLS/RPCテスト）, @zxing/browser（QRスキャン）, qrcode（QR生成）, React 19 + Vite。

参照仕様：`docs/superpowers/specs/2026-09-12-qr-attendance-backend-design.md`

---

## ファイル構成（新規/変更）

```
app/
  supabase/
    config.toml                         # supabase init 生成
    migrations/
      0001_stores_profiles.sql          # stores, profiles
      0002_casts_staff.sql              # casts, staff_profiles
      0003_time_records_audit.sql       # time_records, audit_logs, business_date関数
      0004_punch_rpc.sql                # punch(token) RPC
      0005_rls_policies.sql             # 全テーブルRLS
      0006_domain_tables.sql            # settings/performance/shift/payroll 等 既存移行先
    seed.sql                            # 既存 seed.ts 由来の初期データ
    tests/
      business_date_test.sql            # pgTAP: 営業日カットオーバー
      punch_rpc_test.sql                # pgTAP: 打刻状態遷移/拒否
      rls_test.sql                      # pgTAP: IDOR/店舗スコープ
  src/
    lib/
      supabase.ts                       # supabase-js クライアント
      businessDate.ts                   # 営業日計算（クライアント表示用・SQLと同ロジック）
    store/
      AuthContext.tsx                   # 変更：Supabase Auth へ
      SettingsContext.tsx               # 変更：Supabase 取得へ
      PerformanceContext.tsx            # 変更：Supabase 取得へ
      ShiftContext.tsx                  # 変更：Supabase 取得へ
      PayrollSnapshotContext.tsx        # 変更：Supabase 取得へ
    data/
      timeRecords.ts                    # time_records 取得/補正アクセサ
      qr.ts                             # punch_token → QR payload ユーティリティ
    pages/
      KioskPage.tsx                     # 新規：/kiosk 端末スキャナ
      cast/MyQrPage.tsx                 # 新規：自分のQR
      cast/AttendancePage.tsx           # 変更：打刻履歴（出/退/勤務時間）
      admin/AttendanceAdminPage.tsx     # 新規：勤怠一覧＋手動補正
    components/
      QrScanner.tsx                     # 新規：カメラスキャナ（@zxing/browser）
  .env.local                            # VITE_SUPABASE_URL / ANON_KEY（gitignore）
  vitest.config.ts                      # 新規
  src/test/                             # Vitest テスト
```

テストの実行前提：`cd app && npx supabase start`（ローカルDB起動）。pgTAP テストは `npx supabase test db` で実行。Vitest は `npm run test`。

---

## フェーズP0：基盤

### Task 1: Vitest テスト基盤の導入

**Files:**
- Modify: `app/package.json`
- Create: `app/vitest.config.ts`
- Create: `app/src/test/smoke.test.ts`

- [ ] **Step 1: 依存追加**

Run:
```bash
cd app && npm i -D vitest@^2 @testing-library/react@^16 @testing-library/jest-dom@^6 jsdom@^25
```
Expected: 追加され `package-lock.json` 更新。

- [ ] **Step 2: スクリプト追加（package.json の "scripts" に）**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: vitest.config.ts 作成**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, setupFiles: [] },
});
```

- [ ] **Step 4: 失敗→成功のスモーク**

`app/src/test/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
describe('smoke', () => {
  it('runs', () => { expect(1 + 1).toBe(2); });
});
```
Run: `cd app && npm run test`
Expected: PASS（1 test）。

- [ ] **Step 5: Commit**
```bash
git add app/package.json app/package-lock.json app/vitest.config.ts app/src/test/smoke.test.ts
git commit -m "chore: Vitest テスト基盤を追加"
```

---

### Task 2: Supabase プロジェクト初期化（ローカル）

**Files:**
- Create: `app/supabase/config.toml`（`supabase init` が生成）
- Modify: `app/.gitignore`（`.env.local`, `supabase/.temp` を無視）

- [ ] **Step 1: init**

Run: `cd app && npx supabase init`
Expected: `supabase/config.toml` 生成。既存なら上書き確認→Yes。

- [ ] **Step 2: ローカル起動で接続確認**

Run: `cd app && npx supabase start`
Expected: API URL / anon key / service_role key / DB URL が表示される。`npx supabase status` で再確認可。

- [ ] **Step 3: .gitignore 追記**

`app/.gitignore` に追記：
```
.env.local
supabase/.temp/
supabase/.branches/
```

- [ ] **Step 4: .env.local 作成（start の出力値を転記）**

`app/.env.local`:
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<supabase start が表示した anon key>
```

- [ ] **Step 5: Commit**
```bash
git add app/supabase/config.toml app/.gitignore
git commit -m "chore: Supabase ローカル環境を初期化"
```

---

### Task 3: stores / profiles マイグレーション

**Files:**
- Create: `app/supabase/migrations/0001_stores_profiles.sql`

- [ ] **Step 1: マイグレーション作成**

`app/supabase/migrations/0001_stores_profiles.sql`:
```sql
-- 店舗
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  closing_day text not null default 'end_of_month',
  payment_day text,
  business_day_cutover_hour int not null default 6
    check (business_day_cutover_hour between 0 and 12),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 認証主体（auth.users と 1:1）
create type public.user_role as enum ('admin','kurofuku','cast','terminal');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  role public.user_role not null,
  display_name text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  punch_token text unique,               -- cast/kurofuku のみ
  created_at timestamptz not null default now()
);
create index on public.profiles (store_id);
create index on public.profiles (punch_token);

alter table public.stores enable row level security;
alter table public.profiles enable row level security;

-- 自分のstore_idを引く補助（RLSで多用、SECURITY DEFINERで再帰RLSを回避）
create or replace function public.current_store_id()
returns uuid language sql stable security definer set search_path = public as $$
  select store_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role_name()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;
```

- [ ] **Step 2: 適用して検証**

Run: `cd app && npx supabase db reset`
Expected: 全マイグレーションが流れ、エラー無く完了（"Finished supabase db reset"）。

- [ ] **Step 3: テーブル存在確認**

Run:
```bash
cd app && npx supabase db reset >/dev/null 2>&1; docker exec $(docker ps -qf name=supabase_db) psql -U postgres -c "\dt public.*"
```
Expected: `stores` と `profiles` が一覧に出る。

- [ ] **Step 4: Commit**
```bash
git add app/supabase/migrations/0001_stores_profiles.sql
git commit -m "feat(db): stores/profiles スキーマ + store_id補助関数"
```

---

### Task 4: casts / staff_profiles マイグレーション

**Files:**
- Create: `app/supabase/migrations/0002_casts_staff.sql`

- [ ] **Step 1: マイグレーション作成**

`app/supabase/migrations/0002_casts_staff.sql`:
```sql
create table public.casts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  user_id uuid unique references public.profiles(id),
  source_name text not null,                  -- 源氏名
  real_name_encrypted text,                   -- 暗号化（アプリ層/将来pgcrypto）
  rank text,
  manager_id uuid references public.profiles(id),  -- 担当黒服
  join_date date,
  leave_date date,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);
create index on public.casts (store_id);
create index on public.casts (manager_id);

create table public.staff_profiles (      -- 黒服固有（P2で hourly_rate を使用）
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  user_id uuid unique references public.profiles(id),
  hourly_rate int not null default 0,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);
create index on public.staff_profiles (store_id);

alter table public.casts enable row level security;
alter table public.staff_profiles enable row level security;

-- cast の user_id から cast_id を引く補助
create or replace function public.current_cast_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.casts where user_id = auth.uid();
$$;
```

- [ ] **Step 2: 適用して検証**

Run: `cd app && npx supabase db reset`
Expected: エラー無く完了。

- [ ] **Step 3: Commit**
```bash
git add app/supabase/migrations/0002_casts_staff.sql
git commit -m "feat(db): casts/staff_profiles スキーマ + 担当黒服リレーション"
```

---

### Task 5: time_records / audit_logs / 営業日関数

**Files:**
- Create: `app/supabase/migrations/0003_time_records_audit.sql`
- Create: `app/supabase/tests/business_date_test.sql`

- [ ] **Step 1: マイグレーション作成**

`app/supabase/migrations/0003_time_records_audit.sql`:
```sql
-- 打刻時刻(JST)と店舗カットオーバー時刻から営業日を算出
create or replace function public.business_date(p_at timestamptz, p_cutover int)
returns date language sql immutable as $$
  select ((p_at at time zone 'Asia/Tokyo') - make_interval(hours => p_cutover))::date;
$$;

create table public.time_records (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  person_id uuid not null references public.profiles(id),
  role_at_punch public.user_role not null check (role_at_punch in ('cast','kurofuku')),
  business_date date not null,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  worked_minutes int generated always as (
    case when clock_out_at is null then null
         else (extract(epoch from (clock_out_at - clock_in_at)) / 60)::int end
  ) stored,
  source text not null default 'qr' check (source in ('qr','manual')),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now()
);
create index on public.time_records (store_id, business_date);
create index on public.time_records (person_id, business_date);
-- 1人1営業日につき「未退勤の記録」は1件まで
create unique index time_records_one_open
  on public.time_records (person_id, business_date)
  where clock_out_at is null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  actor_user_id uuid references public.profiles(id),
  action text not null,
  target text,
  before jsonb,
  after jsonb,
  ip text,
  at timestamptz not null default now()
);
create index on public.audit_logs (store_id, at);

alter table public.time_records enable row level security;
alter table public.audit_logs enable row level security;
```

- [ ] **Step 2: pgTAP テスト作成**

`app/supabase/tests/business_date_test.sql`:
```sql
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
```

- [ ] **Step 3: テスト実行（失敗確認→適用後成功）**

Run: `cd app && npx supabase db reset && npx supabase test db`
Expected: `business_date_test.sql` が 3/3 PASS。

- [ ] **Step 4: Commit**
```bash
git add app/supabase/migrations/0003_time_records_audit.sql app/supabase/tests/business_date_test.sql
git commit -m "feat(db): time_records/audit_logs + 営業日関数(pgTAP)"
```

---

### Task 6: punch(token) RPC

**Files:**
- Create: `app/supabase/migrations/0004_punch_rpc.sql`
- Create: `app/supabase/tests/punch_rpc_test.sql`

- [ ] **Step 1: RPC 作成**

`app/supabase/migrations/0004_punch_rpc.sql`:
```sql
-- 共有端末からの打刻。サーバー時刻(now())のみを使用。
-- 戻り：人物名・動作(in/out)・時刻。
create or replace function public.punch(p_token text)
returns table(person_name text, action text, at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_caller_role public.user_role := public.current_role_name();
  v_caller_store uuid := public.current_store_id();
  v_person public.profiles;
  v_cutover int;
  v_bdate date;
  v_open public.time_records;
  v_now timestamptz := now();
begin
  -- 呼び出し元は terminal か admin のみ
  if v_caller_role not in ('terminal','admin') then
    raise exception 'not authorized to punch';
  end if;

  select * into v_person from public.profiles
    where punch_token = p_token and status = 'active';
  if not found then
    raise exception 'invalid token';
  end if;
  -- 別店舗トークン拒否
  if v_person.store_id <> v_caller_store then
    raise exception 'cross-store token';
  end if;
  if v_person.role not in ('cast','kurofuku') then
    raise exception 'token not punchable';
  end if;

  select business_day_cutover_hour into v_cutover from public.stores where id = v_person.store_id;
  v_bdate := public.business_date(v_now, v_cutover);

  -- 同営業日の未退勤記録
  select * into v_open from public.time_records
    where person_id = v_person.id and business_date = v_bdate and clock_out_at is null
    order by clock_in_at desc limit 1;

  if found then
    -- 連打防止：30秒以内の再スキャンは無視（出勤として返す）
    if v_now - v_open.clock_in_at < interval '30 seconds' then
      return query select v_person.display_name, 'in'::text, v_open.clock_in_at;
      return;
    end if;
    update public.time_records set clock_out_at = v_now, updated_by = auth.uid()
      where id = v_open.id;
    return query select v_person.display_name, 'out'::text, v_now;
  else
    insert into public.time_records(store_id, person_id, role_at_punch, business_date, clock_in_at, source, created_by)
      values (v_person.store_id, v_person.id, v_person.role, v_bdate, v_now, 'qr', auth.uid());
    return query select v_person.display_name, 'in'::text, v_now;
  end if;
end;
$$;

revoke all on function public.punch(text) from public;
grant execute on function public.punch(text) to authenticated;
```

- [ ] **Step 2: pgTAP テスト作成**

`app/supabase/tests/punch_rpc_test.sql`:
```sql
begin;
select plan(5);

-- 固定UUIDでテストデータ
insert into public.stores(id,name) values ('00000000-0000-0000-0000-0000000000s1','店A');
insert into public.stores(id,name) values ('00000000-0000-0000-0000-0000000000s2','店B');
-- auth.users をモック（ローカルのみ）
insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000term'),
  ('00000000-0000-0000-0000-00000000cst1'),
  ('00000000-0000-0000-0000-00000000cst2');
insert into public.profiles(id,store_id,role,display_name,punch_token) values
  ('00000000-0000-0000-0000-00000000term','00000000-0000-0000-0000-0000000000s1','terminal','端末A',null),
  ('00000000-0000-0000-0000-00000000cst1','00000000-0000-0000-0000-0000000000s1','cast','サクラ','TOKEN_SAKURA'),
  ('00000000-0000-0000-0000-00000000cst2','00000000-0000-0000-0000-0000000000s2','cast','別店','TOKEN_OTHER');

-- 端末Aとして実行
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000term', true);

-- 1回目：出勤
select is((select action from public.punch('TOKEN_SAKURA')), 'in', '初回は出勤');
-- 即再打刻（30秒以内）：inのまま（退勤にならない）
select is((select action from public.punch('TOKEN_SAKURA')), 'in', '30秒以内は無視');
-- 無効トークン
select throws_ok($$ select public.punch('NOPE') $$, 'invalid token', '無効トークン拒否');
-- 別店舗トークン
select throws_ok($$ select public.punch('TOKEN_OTHER') $$, 'cross-store token', '別店舗拒否');
-- 未退勤が1件だけ存在
select is((select count(*)::int from public.time_records where person_id='00000000-0000-0000-0000-00000000cst1' and clock_out_at is null), 1, '未退勤は1件');

select * from finish();
rollback;
```

注：UUIDは16進形式に調整すること（上記の `s1`/`term` 等はプレースホルダ表現。実行時は `11111111-1111-1111-1111-111111111111` のような有効UUIDに置換）。有効UUID例：店A=`11111111-...-1111`、端末=`22222222-...-2222`、サクラ=`33333333-...-3333`、別店=`44444444-...-4444`、店B=`55555555-...-5555`。

- [ ] **Step 3: テスト実行**

Run: `cd app && npx supabase db reset && npx supabase test db`
Expected: `punch_rpc_test.sql` 5/5 PASS（30秒無視・無効・別店舗拒否を含む）。

- [ ] **Step 4: Commit**
```bash
git add app/supabase/migrations/0004_punch_rpc.sql app/supabase/tests/punch_rpc_test.sql
git commit -m "feat(db): punch RPC（サーバー時刻・状態遷移・不正拒否）+ pgTAP"
```

---

### Task 7: RLS ポリシー（IDOR厳禁）

**Files:**
- Create: `app/supabase/migrations/0005_rls_policies.sql`
- Create: `app/supabase/tests/rls_test.sql`

- [ ] **Step 1: ポリシー作成**

`app/supabase/migrations/0005_rls_policies.sql`:
```sql
-- profiles：自分の行、または同店adminは全件
create policy profiles_self_select on public.profiles for select
  using ( id = auth.uid()
          or (store_id = current_store_id() and current_role_name() = 'admin') );

-- stores：自店のみ
create policy stores_select on public.stores for select
  using ( id = current_store_id() );

-- casts：admin=全件 / kurofuku=担当のみ / cast=自分
create policy casts_select on public.casts for select
  using (
    store_id = current_store_id() and (
      current_role_name() = 'admin'
      or (current_role_name() = 'kurofuku' and manager_id = auth.uid())
      or (current_role_name() = 'cast' and user_id = auth.uid())
    )
  );

-- time_records：SELECT
create policy time_records_select on public.time_records for select
  using (
    store_id = current_store_id() and (
      current_role_name() = 'admin'
      or person_id = auth.uid()                                   -- 自分の勤怠
      or (current_role_name() = 'kurofuku' and person_id in (     -- 担当キャストの勤怠
            select c.user_id from public.casts c where c.manager_id = auth.uid()))
    )
  );
-- time_records：手動補正は admin のみ（打刻は RPC が SECURITY DEFINER で実施）
create policy time_records_admin_write on public.time_records for update
  using ( store_id = current_store_id() and current_role_name() = 'admin' )
  with check ( store_id = current_store_id() and current_role_name() = 'admin' );
create policy time_records_admin_insert on public.time_records for insert
  with check ( store_id = current_store_id() and current_role_name() = 'admin' );

-- audit_logs：admin のみ閲覧
create policy audit_select on public.audit_logs for select
  using ( store_id = current_store_id() and current_role_name() = 'admin' );
create policy audit_insert on public.audit_logs for insert
  with check ( store_id = current_store_id() );
```

- [ ] **Step 2: pgTAP RLS テスト作成**

`app/supabase/tests/rls_test.sql`（有効UUIDを使用。店A=`11111111-1111-1111-1111-111111111111` 等）:
```sql
begin;
select plan(3);

insert into auth.users(id) values
 ('11111111-1111-1111-1111-111111111111'),  -- admin
 ('22222222-2222-2222-2222-222222222222'),  -- cast1
 ('33333333-3333-3333-3333-333333333333');  -- cast2
insert into public.stores(id,name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','店A');
insert into public.profiles(id,store_id,role,display_name) values
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','admin','管理'),
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cast','C1'),
 ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cast','C2');
insert into public.time_records(store_id,person_id,role_at_punch,business_date,clock_in_at) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','cast','2026-06-15',now()),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','cast','2026-06-15',now());

set local role authenticated;
-- cast1 として：自分の1件のみ見える（IDOR防止）
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', true);
select is((select count(*)::int from public.time_records), 1, 'castは自分の勤怠のみ');
-- admin として：全件見える
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', true);
select is((select count(*)::int from public.time_records), 2, 'adminは店内全件');
-- cast1 が cast2 の行を update できない
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', true);
select is((select count(*)::int from public.time_records where person_id='33333333-3333-3333-3333-333333333333'), 0, 'castは他者行を読めない');

select * from finish();
rollback;
```

- [ ] **Step 3: テスト実行**

Run: `cd app && npx supabase db reset && npx supabase test db`
Expected: `rls_test.sql` 3/3 PASS（cast は自分の行のみ＝IDOR防止、admin は全件）。

- [ ] **Step 4: Commit**
```bash
git add app/supabase/migrations/0005_rls_policies.sql app/supabase/tests/rls_test.sql
git commit -m "feat(db): RLSポリシー（store_idスコープ+IDOR防止）+ pgTAP"
```

---

### Task 8: ドメインテーブル移行 + seed（回帰基準）

**Files:**
- Create: `app/supabase/migrations/0006_domain_tables.sql`
- Create: `app/supabase/seed.sql`

- [ ] **Step 1: ドメインテーブル作成**

`app/supabase/migrations/0006_domain_tables.sql`（既存 `settings.ts`/`seed.ts` の形に対応。給与ロジックは既存 `payroll.ts` を唯一のエンジンとして温存し、入力データを本テーブルから供給）:
```sql
-- 設定マスタ（storeごと1行、JSONで既存 Settings を保持）
create table public.settings (
  store_id uuid primary key references public.stores(id),
  data jsonb not null   -- 既存 Settings 型をそのまま格納（マスタ駆動の単一ソース）
);
-- 月次実績（既存 Performance 型）
create table public.performances (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  cast_id uuid not null references public.casts(id),
  month text not null,            -- YYYY-MM
  data jsonb not null,            -- 既存 Performance 型
  unique (cast_id, month)
);
-- 日次実績（既存 DailyRecord 型。P3のペナルティ判定にも使用）
create table public.daily_records (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  cast_id uuid not null references public.casts(id),
  date date not null,
  data jsonb not null,            -- 既存 DailyRecord 型
  unique (cast_id, date)
);
-- シフト提出/確定（既存 ShiftContext 型）
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  cast_id uuid not null references public.casts(id),
  date date not null,
  status text not null default 'submitted' check (status in ('submitted','approved','published','rejected')),
  data jsonb not null,
  unique (cast_id, date)
);
-- 給与スナップショット（確定=不変）
create table public.payrolls (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  cast_id uuid not null references public.casts(id),
  period text not null,           -- YYYY-MM
  status text not null default 'draft' check (status in ('draft','confirmed')),
  snapshot jsonb not null,        -- 確定時の明細一式
  confirmed_at timestamptz,
  unique (cast_id, period)
);

alter table public.settings enable row level security;
alter table public.performances enable row level security;
alter table public.daily_records enable row level security;
alter table public.shifts enable row level security;
alter table public.payrolls enable row level security;

-- RLS：admin=店内全件 / cast=自分 / kurofuku=担当 の SELECT、書込は admin（cast のシフト提出は別途）
create policy settings_select on public.settings for select using (store_id = current_store_id());
create policy settings_admin_write on public.settings for all
  using (store_id = current_store_id() and current_role_name()='admin')
  with check (store_id = current_store_id() and current_role_name()='admin');

-- 共通：cast自分 / kurofuku担当 / admin全件 の SELECT を performances/daily_records/shifts/payrolls に付与
do $$
declare t text;
begin
  foreach t in array array['performances','daily_records','shifts','payrolls'] loop
    execute format($f$
      create policy %1$s_select on public.%1$s for select using (
        store_id = current_store_id() and (
          current_role_name()='admin'
          or cast_id = current_cast_id()
          or (current_role_name()='kurofuku' and cast_id in (select id from public.casts where manager_id = auth.uid()))
        )
      );
      create policy %1$s_admin_write on public.%1$s for all
        using (store_id = current_store_id() and current_role_name()='admin')
        with check (store_id = current_store_id() and current_role_name()='admin');
    $f$, t);
  end loop;
end $$;

-- cast 自身のシフト提出（insert/update 自分の行のみ）
create policy shifts_cast_insert on public.shifts for insert
  with check (store_id = current_store_id() and cast_id = current_cast_id());
create policy shifts_cast_update on public.shifts for update
  using (store_id = current_store_id() and cast_id = current_cast_id() and status='submitted')
  with check (cast_id = current_cast_id());
```

- [ ] **Step 2: seed 作成（既存 seed.ts の値を投入、回帰基準 SAKURA を含む）**

`app/supabase/seed.sql`：1店舗・admin・端末・主要キャスト（SAKURA）と、SAKURA の6月実績（回帰基準 ¥480,000 を再現する performance/daily_records）を既存 `src/data/seed.ts` から転記して INSERT する。`settings` には現行 `src/store/settings.ts` の既定 Settings を JSON で1行投入。
（実装時は `src/data/seed.ts` と `src/store/settings.ts` の現行値を正として転記すること。）

- [ ] **Step 3: 適用して全pgTAP再実行**

Run: `cd app && npx supabase db reset && npx supabase test db`
Expected: 既存の business_date / punch / rls テストが全PASS（退行なし）。

- [ ] **Step 4: Commit**
```bash
git add app/supabase/migrations/0006_domain_tables.sql app/supabase/seed.sql
git commit -m "feat(db): ドメインテーブル(settings/performances/daily/shifts/payrolls)+RLS+seed"
```

---

### Task 9: Supabase クライアント + 営業日クライアント関数

**Files:**
- Create: `app/src/lib/supabase.ts`
- Create: `app/src/lib/businessDate.ts`
- Create: `app/src/test/businessDate.test.ts`

- [ ] **Step 1: supabase-js 追加**

Run: `cd app && npm i @supabase/supabase-js@^2`

- [ ] **Step 2: クライアント作成**

`app/src/lib/supabase.ts`:
```ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
});
```

- [ ] **Step 3: 失敗テスト（営業日計算）**

`app/src/test/businessDate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { businessDate } from '../lib/businessDate';

describe('businessDate (cutover=6)', () => {
  it('深夜2時は前日', () => {
    expect(businessDate(new Date('2026-06-15T02:00:00+09:00'), 6)).toBe('2026-06-14');
  });
  it('6時は当日', () => {
    expect(businessDate(new Date('2026-06-15T06:00:00+09:00'), 6)).toBe('2026-06-15');
  });
});
```
Run: `cd app && npm run test -- businessDate`
Expected: FAIL（`businessDate` 未定義）。

- [ ] **Step 4: 実装（SQLと同ロジック、JST固定）**

`app/src/lib/businessDate.ts`:
```ts
/** 打刻時刻と店舗カットオーバー時刻(時)から営業日(YYYY-MM-DD, JST)を算出。SQL public.business_date と一致させる。 */
export function businessDate(at: Date, cutoverHour: number): string {
  // JSTのミリ秒に変換 → cutover時間を引く → 日付部分
  const jst = new Date(at.getTime() + 9 * 3600_000);
  const shifted = new Date(jst.getTime() - cutoverHour * 3600_000);
  return shifted.toISOString().slice(0, 10);
}
```

- [ ] **Step 5: テスト成功**

Run: `cd app && npm run test -- businessDate`
Expected: PASS（2 tests）。

- [ ] **Step 6: Commit**
```bash
git add app/package.json app/package-lock.json app/src/lib/supabase.ts app/src/lib/businessDate.ts app/src/test/businessDate.test.ts
git commit -m "feat: supabaseクライアント + 営業日計算(テスト付)"
```

---

### Task 10: 認証を Supabase Auth へ

**Files:**
- Modify: `app/src/store/AuthContext.tsx`

- [ ] **Step 1: 現行 AuthContext を確認**

Run: `sed -n '1,80p' app/src/store/AuthContext.tsx`
Expected: 現在のユーザー型・login/logout API を把握。

- [ ] **Step 2: Supabase セッション対応に変更**

`AuthContext.tsx` を、(a) `supabase.auth.signInWithPassword` でログイン、(b) セッションから `profiles`（role/store_id/cast情報）を取得して既存 `user` 形状にマッピング、(c) `onAuthStateChange` で購読、に変更する。既存の `useAuth()` のインターフェース（`user`, `login`, `logout`, `user.role`, `user.castData`）は互換を保ち、呼び出し側ページを壊さない。

- [ ] **Step 3: 型チェック/ビルド**

Run: `cd app && npm run build`
Expected: 型エラー無し。

- [ ] **Step 4: 手動確認（ローカルSupabase起動中）**

admin/cast でログイン→それぞれのトップに遷移できること、ログアウトでログイン画面に戻ることを確認。

- [ ] **Step 5: Commit**
```bash
git add app/src/store/AuthContext.tsx
git commit -m "feat(auth): Supabase Auth へ移行（useAuth互換維持）"
```

---

### Task 11: 既存 Context を Supabase バックへ（回帰：SAKURA ¥480,000）

**Files:**
- Modify: `app/src/store/SettingsContext.tsx`, `PerformanceContext.tsx`, `ShiftContext.tsx`, `PayrollSnapshotContext.tsx`
- Create: `app/src/test/payrollRegression.test.ts`

- [ ] **Step 1: 回帰テストを先に固定（現行ロジックの基準値）**

`app/src/test/payrollRegression.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { calcPayroll } from '../lib/payroll';        // 既存エンジン（関数名は実体に合わせる）
import { defaultSettings } from '../store/settings';  // 既定設定
import { seedPerformances } from '../data/seed';      // SAKURAの実績を含む

describe('payroll regression', () => {
  it('SAKURA は ¥480,000', () => {
    const sakura = seedPerformances.find(p => /SAKURA|サクラ/.test(p.castId) || true); // 実体に合わせ特定
    const result = calcPayroll(sakura!, defaultSettings);
    expect(result.netPay).toBe(480000);
  });
});
```
注：import 名（`calcPayroll`/`defaultSettings`/`seedPerformances`/`netPay`）は現行コードの実体に合わせて確定すること。

- [ ] **Step 2: テスト実行（現行ロジックで PASS することを確認＝基準固定）**

Run: `cd app && npm run test -- payrollRegression`
Expected: PASS（¥480,000）。ここが移行の不変条件。

- [ ] **Step 3: 各 Context を Supabase 取得へ**

`SettingsContext` は `settings` テーブルの `data` を取得して既存 `Settings` として提供。`PerformanceContext` は `performances`/`daily_records` を、`ShiftContext` は `shifts` を、`PayrollSnapshotContext` は `payrolls` を取得/保存するよう変更。**データ形状（型）とエクスポートするフック名は不変**にして UI ページを壊さない。デモ用のインメモリfallback（環境変数でSupabase未接続時）は残してよい。

- [ ] **Step 4: 回帰テスト再実行**

Run: `cd app && npm run test`
Expected: payrollRegression を含む全テスト PASS（移行後も ¥480,000）。

- [ ] **Step 5: ビルド**

Run: `cd app && npm run build`
Expected: 型エラー無し。

- [ ] **Step 6: Commit**
```bash
git add app/src/store/*.tsx app/src/test/payrollRegression.test.ts
git commit -m "feat: 既存ContextをSupabaseバックへ移行（SAKURA¥480,000回帰維持）"
```

---

## フェーズP1：QR出退勤

### Task 12: QRユーティリティ + 自分のQR画面

**Files:**
- Create: `app/src/data/qr.ts`
- Create: `app/src/pages/cast/MyQrPage.tsx`
- Modify: `app/src/App.tsx`（ルート追加）
- Create: `app/src/test/qr.test.ts`

- [ ] **Step 1: qrcode 追加**

Run: `cd app && npm i qrcode@^1 && npm i -D @types/qrcode`

- [ ] **Step 2: 失敗テスト（QRペイロード生成）**

`app/src/test/qr.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { punchPayload } from '../data/qr';
describe('punchPayload', () => {
  it('tokenをそのままペイロード化', () => {
    expect(punchPayload('TOKEN_ABC')).toBe('kingyo:punch:TOKEN_ABC');
  });
});
```
Run: `cd app && npm run test -- qr`
Expected: FAIL。

- [ ] **Step 3: 実装**

`app/src/data/qr.ts`:
```ts
const PREFIX = 'kingyo:punch:';
/** 端末スキャナが解釈するQRペイロード文字列を生成 */
export function punchPayload(token: string): string {
  return PREFIX + token;
}
/** スキャン文字列から token を取り出す（不正なら null） */
export function parsePunchPayload(scanned: string): string | null {
  return scanned.startsWith(PREFIX) ? scanned.slice(PREFIX.length) : null;
}
```

- [ ] **Step 4: テスト成功**

Run: `cd app && npm run test -- qr`
Expected: PASS。

- [ ] **Step 5: 自分のQR画面**

`app/src/pages/cast/MyQrPage.tsx`：`useAuth()` から自分の `punch_token` を取得し、`QRCode.toDataURL(punchPayload(token))` で生成した画像を大きく表示。「この画面を店の端末にかざしてください」の案内を添える。`App.tsx` の cast ルートに `qr` を追加し、黒服からも同画面に到達できるようにする。

- [ ] **Step 6: ビルド**

Run: `cd app && npm run build`
Expected: 型エラー無し。

- [ ] **Step 7: Commit**
```bash
git add app/src/data/qr.ts app/src/pages/cast/MyQrPage.tsx app/src/App.tsx app/src/test/qr.test.ts app/package.json app/package-lock.json
git commit -m "feat(qr): QRペイロードユーティリティ + 自分のQR画面"
```

---

### Task 13: 端末スキャナ + 打刻（/kiosk）

**Files:**
- Create: `app/src/components/QrScanner.tsx`
- Create: `app/src/pages/KioskPage.tsx`
- Modify: `app/src/App.tsx`（`/kiosk` ルート）

- [ ] **Step 1: スキャナライブラリ追加**

Run: `cd app && npm i @zxing/browser@^0.1 @zxing/library@^0.21`

- [ ] **Step 2: スキャナコンポーネント**

`app/src/components/QrScanner.tsx`：`@zxing/browser` の `BrowserQRCodeReader` でカメラ起動し、`onResult(text: string)` を親へ通知。アンマウント時に `reset()`。カメラ権限エラーを表示。

- [ ] **Step 3: 端末ページ**

`app/src/pages/KioskPage.tsx`：フルスクリーン。`QrScanner` を表示し、スキャン文字列を `parsePunchPayload` で検証→tokenを得たら `supabase.rpc('punch', { p_token: token })` を呼ぶ。戻り（person_name/action/at）を大きくフィードバック表示：「{name} さん {出勤 or 退勤} {HH:mm}」。成功/失敗で色分け・効果音。3秒後にスキャン待受へ自動復帰。端末アカウントでのログインを前提とし、未ログインならログインへ誘導。

- [ ] **Step 4: ルート追加**

`App.tsx` に `<Route path="/kiosk" element={<KioskPage />} />` を追加（認証必須だが role=terminal 想定）。

- [ ] **Step 5: ビルド + 手動確認**

Run: `cd app && npm run build`（型OK）。ローカルSupabase起動・端末アカウントでログインし、Task12で表示した自分のQRをWebカメラにかざして「出勤→（30秒後）退勤」が記録されることを確認。`time_records` に行が入ること。

- [ ] **Step 6: Commit**
```bash
git add app/src/components/QrScanner.tsx app/src/pages/KioskPage.tsx app/src/App.tsx app/package.json app/package-lock.json
git commit -m "feat(kiosk): 端末QRスキャナ + punch RPC 連携（サーバー時刻打刻）"
```

---

### Task 14: キャスト勤怠履歴（出/退/勤務時間）

**Files:**
- Create: `app/src/data/timeRecords.ts`
- Modify: `app/src/pages/cast/AttendancePage.tsx`
- Create: `app/src/test/timeRecords.test.ts`

- [ ] **Step 1: アクセサ + 整形関数の失敗テスト**

`app/src/test/timeRecords.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatWorked } from '../data/timeRecords';
describe('formatWorked', () => {
  it('125分 → 2時間5分', () => { expect(formatWorked(125)).toBe('2時間5分'); });
  it('null → 勤務中', () => { expect(formatWorked(null)).toBe('勤務中'); });
});
```
Run: `cd app && npm run test -- timeRecords`
Expected: FAIL。

- [ ] **Step 2: 実装**

`app/src/data/timeRecords.ts`：
```ts
import { supabase } from '../lib/supabase';

export interface TimeRecord {
  id: string; business_date: string;
  clock_in_at: string; clock_out_at: string | null; worked_minutes: number | null;
}

/** 自分（RLSで自動スコープ）の勤怠を月で取得 */
export async function fetchMyTimeRecords(month: string): Promise<TimeRecord[]> {
  const { data, error } = await supabase
    .from('time_records')
    .select('id,business_date,clock_in_at,clock_out_at,worked_minutes')
    .gte('business_date', `${month}-01`)
    .lte('business_date', `${month}-31`)
    .order('business_date');
  if (error) throw error;
  return data ?? [];
}

export function formatWorked(minutes: number | null): string {
  if (minutes === null) return '勤務中';
  return `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}
```

- [ ] **Step 3: テスト成功**

Run: `cd app && npm run test -- timeRecords`
Expected: PASS。

- [ ] **Step 4: AttendancePage 拡張**

`AttendancePage.tsx` に、`fetchMyTimeRecords` の結果から「日付・出勤時刻・退勤時刻・勤務時間（`formatWorked`）」の表を追加。既存の売上履歴表はそのまま残す。出勤時刻は `clock_in_at` を JST `HH:mm` 表示。

- [ ] **Step 5: ビルド**

Run: `cd app && npm run build`
Expected: 型エラー無し。

- [ ] **Step 6: Commit**
```bash
git add app/src/data/timeRecords.ts app/src/pages/cast/AttendancePage.tsx app/src/test/timeRecords.test.ts
git commit -m "feat(cast): 勤怠履歴に出退勤時刻・勤務時間を表示"
```

---

### Task 15: 管理者 勤怠一覧 + 手動補正（監査ログ）

**Files:**
- Create: `app/src/pages/admin/AttendanceAdminPage.tsx`
- Modify: `app/src/App.tsx`（admin ルート）, `app/src/components/AdminLayout.tsx`（ナビ項目）

- [ ] **Step 1: 一覧取得**

`AttendanceAdminPage.tsx`：`time_records` を営業日で絞って店内全件取得（admin は RLS で全件可）。`profiles` と join して氏名表示。日付フィルタ。

- [ ] **Step 2: 手動補正 + 監査ログ**

行の `clock_in_at`/`clock_out_at` を編集し保存時に (a) `time_records` を update（source='manual'）、(b) `audit_logs` に before/after を insert。保存前に確認。補正は admin のみ（RLSで担保済）。

- [ ] **Step 3: ナビ/ルート追加**

`AdminLayout.tsx` のナビに「勤怠」を追加、`App.tsx` の admin ルートに `attendance` を追加。

- [ ] **Step 4: ビルド + 手動確認**

Run: `cd app && npm run build`（型OK）。admin でログイン→勤怠一覧表示→1件補正→`audit_logs` に記録される、cast では当該ページに入れない（403相当/リダイレクト）ことを確認。

- [ ] **Step 5: Commit**
```bash
git add app/src/pages/admin/AttendanceAdminPage.tsx app/src/App.tsx app/src/components/AdminLayout.tsx
git commit -m "feat(admin): 勤怠一覧 + 手動補正（監査ログ記録）"
```

---

### Task 16: 黒服 自分の勤怠ビュー

**Files:**
- Modify: `app/src/App.tsx`（kurofuku レイアウト/ルート）
- Create: `app/src/pages/kurofuku/KurofukuAttendancePage.tsx`
- Create: `app/src/components/KurofukuLayout.tsx`（cast レイアウト準拠）

- [ ] **Step 1: レイアウト**

`KurofukuLayout.tsx`：`CastLayout` を踏襲し、黒服向けナビ（自分のQR / 自分の勤怠）を持つ。`RequireAuth role="kurofuku"` でガード。

- [ ] **Step 2: 勤怠ページ**

`KurofukuAttendancePage.tsx`：`fetchMyTimeRecords`（RLSで自分の行のみ）を使い、出退勤・勤務時間（`formatWorked`）を表示。担当キャスト閲覧はP4の旨を注記。

- [ ] **Step 3: ルート追加**

`App.tsx` に `/kurofuku` ルート群（index=自分の勤怠, `qr`=MyQrPage）を追加。`RequireAuth` を role='kurofuku' に対応させる。

- [ ] **Step 4: ビルド + 手動確認**

Run: `cd app && npm run build`（型OK）。黒服アカウントでログイン→自分のQR・自分の勤怠のみ見える。他キャストは見えない。

- [ ] **Step 5: Commit**
```bash
git add app/src/pages/kurofuku/KurofukuAttendancePage.tsx app/src/components/KurofukuLayout.tsx app/src/App.tsx
git commit -m "feat(kurofuku): 黒服レイアウト + 自分のQR/勤怠ビュー"
```

---

### Task 17: 総合確認（テスト・lint・build・回帰）

**Files:**
- 変更なし（検証のみ）

- [ ] **Step 1: DBテスト全PASS**

Run: `cd app && npx supabase db reset && npx supabase test db`
Expected: business_date / punch / rls すべて PASS。

- [ ] **Step 2: ユニット/回帰テスト全PASS**

Run: `cd app && npm run test`
Expected: smoke/businessDate/qr/timeRecords/payrollRegression すべて PASS（SAKURA ¥480,000 維持）。

- [ ] **Step 3: lint + build**

Run: `cd app && npm run lint && npm run build`
Expected: エラー無し。

- [ ] **Step 4: E2Eスモーク（手動）**

ローカルSupabase起動・seed投入の上で：
1. `/kiosk` を端末アカウントで開く
2. cast のQRをスキャン→出勤表示、30秒後に再スキャン→退勤表示
3. cast でログイン→勤怠履歴に出退勤・勤務時間が出る／他人の勤怠は見えない
4. admin で勤怠一覧→補正→`audit_logs` 記録
5. 黒服でログイン→自分の勤怠のみ

- [ ] **Step 5: メモリ更新 + Commit**

`project_kingyo.md` の完了機能に「Supabase基盤(P0)・QR出退勤(P1)」を追記。
```bash
git add -A
git commit -m "chore: P0+P1 総合確認（DB/unit/回帰テスト・lint・build）完了"
```

---

## Self-Review 結果

- **Spec coverage:** §2ロール→T3,T10 / §3安全設計→T6 / §4スキーマ→T3-6,T8 / §5 RLS→T7,T8 / §6画面→T12-16 / §7移行→T10,T11 / §8テスト→T5,T6,T7,T11,T17。全要件にタスク対応あり。
- **Placeholder:** seed(T8)と回帰テストの import 名(T11)は「現行コードの実体に合わせる」と明記（値の転記元を指定済み、未定義の放置なし）。punch テストのUUIDは有効値への置換方法を明記。
- **型整合:** `businessDate`/`business_date`（TS/SQLで同ロジック）、`punch(p_token)` RPC名、`formatWorked`、`fetchMyTimeRecords`、`punchPayload/parsePunchPayload`、`current_store_id/current_role_name/current_cast_id` は全タスクで一貫。

## P2以降への引き継ぎ
- `staff_profiles.hourly_rate` と `time_records.worked_minutes` が揃ったのでP2（黒服給与）は「時給×勤務分」を payroll エンジンに足すだけ。
- `shifts`（承認済）×`time_records`（打刻無し）でP3（当日欠勤ペナルティ）判定、`settings.data.penalties` の状態別固定額を控除。
- RLSの kurofuku 担当SELECTは用意済みのためP4は画面実装中心。
