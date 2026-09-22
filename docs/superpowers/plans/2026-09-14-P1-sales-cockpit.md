# P1 売上コックピット Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 経営が毎日開く売上コックピット（期間トグル・目標達成率・前年同期比・店間比較・キャスト別達成率）を管理ダッシュボードに作り、キャスト個人目標もマイページに表示する。

**Architecture:** 目標は新テーブル `sales_targets`（店舗＋キャスト、期間種別 day/month/quarter/half/year、マスタ駆動）。売上は既存 `daily_records`（nominatedSales+freeSales）から集計。純関数 `lib/targets.ts` で期間キー/範囲/集計/達成率/前年比を計算（テスト必須）。recharts で推移＋前年重ね線。RLSはP0パターン（統合=全店閲覧／自店adminのみ書込／castは自分のcast目標のみ）。

**Tech Stack:** Supabase(Postgres/RLS), supabase-js, React19+Vite+TS+Tailwind, recharts, Vitest, pgTAP。

参照仕様：`docs/superpowers/specs/2026-09-14-P1-sales-cockpit-design.md`。前提：P0完了（`current_store_id`/`has_store_access`/`is_store_admin`/`current_cast_id`/`current_is_integrated`、casts/daily_records/settings 等）。

## ファイル構成
```
app/supabase/migrations/0011_sales_targets.sql   # テーブル+部分unique+RLS
app/supabase/tests/sales_targets_test.sql        # pgTAP RLS
app/src/lib/targets.ts                           # 純関数（期間/集計/達成率/前年比）
app/src/test/targets.test.ts                     # Vitest
app/src/data/targets.ts                          # DBアクセス（目標CRUD・売上集計取得）
app/src/components/SalesTrendChart.tsx           # recharts 折れ線(当年+前年)
app/src/pages/admin/DashboardPage.tsx            # コックピット強化
app/src/pages/admin/SalesTargetSettingsPage.tsx  # 目標設定UI（新規） + ルート/ナビ
app/src/pages/cast/MyPage.tsx                    # 個人目標ウィジェット追加
app/supabase/seed.sql                            # サンプル目標 + 2025ダミー
app/supabase/seed_p1_2025.sql                    # 本番適用用: 2025ダミー売上+サンプル目標
```

---

### Task 1: lib/targets.ts 純関数（期間・集計・達成率・前年比）

**Files:**
- Create: `app/src/lib/targets.ts`
- Create: `app/src/test/targets.test.ts`

- [ ] **Step 1: 失敗テスト**

`app/src/test/targets.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { periodKey, periodRange, prevYearPeriodKey, sumSales, achievementRate, yoyDelta } from '../lib/targets';

describe('periodKey', () => {
  it('各種別', () => {
    const d = new Date('2026-08-15T12:00:00+09:00');
    expect(periodKey(d, 'day')).toBe('2026-08-15');
    expect(periodKey(d, 'month')).toBe('2026-08');
    expect(periodKey(d, 'quarter')).toBe('2026-Q3');
    expect(periodKey(d, 'half')).toBe('2026-H2');
    expect(periodKey(d, 'year')).toBe('2026');
  });
});
describe('periodRange', () => {
  it('month/quarter/half/year の範囲', () => {
    expect(periodRange('2026-02', 'month')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodRange('2026-Q1', 'quarter')).toEqual({ start: '2026-01-01', end: '2026-03-31' });
    expect(periodRange('2026-H2', 'half')).toEqual({ start: '2026-07-01', end: '2026-12-31' });
    expect(periodRange('2026', 'year')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(periodRange('2026-09-14', 'day')).toEqual({ start: '2026-09-14', end: '2026-09-14' });
  });
});
describe('prevYearPeriodKey', () => {
  it('年を-1', () => {
    expect(prevYearPeriodKey('2026-08', 'month')).toBe('2025-08');
    expect(prevYearPeriodKey('2026-Q3', 'quarter')).toBe('2025-Q3');
    expect(prevYearPeriodKey('2026', 'year')).toBe('2025');
  });
});
describe('sumSales', () => {
  it('範囲内の nominatedSales+freeSales を合算', () => {
    const recs = [
      { date: '2026-08-01', nominatedSales: 100, freeSales: 20 },
      { date: '2026-08-31', nominatedSales: 200, freeSales: 0 },
      { date: '2026-09-01', nominatedSales: 999, freeSales: 999 },
    ];
    expect(sumSales(recs, '2026-08-01', '2026-08-31')).toBe(320);
  });
});
describe('achievementRate', () => {
  it('達成率%（target0は0）', () => {
    expect(achievementRate(50, 100)).toBe(50);
    expect(achievementRate(0, 0)).toBe(0);
  });
});
describe('yoyDelta', () => {
  it('前年比（lastYear0はrate=null）', () => {
    expect(yoyDelta(120, 100)).toEqual({ diff: 20, rate: 20 });
    expect(yoyDelta(120, 0)).toEqual({ diff: 120, rate: null });
  });
});
```
Run: `cd app && npm run test -- targets` → FAIL。

- [ ] **Step 2: 実装**

`app/src/lib/targets.ts`:
```ts
export type PeriodType = 'day' | 'month' | 'quarter' | 'half' | 'year';
export interface DailyLike { date: string; nominatedSales: number; freeSales: number }

function pad(n: number): string { return String(n).padStart(2, '0'); }

/** JST基準で期間キーを算出 */
export function periodKey(at: Date, type: PeriodType): string {
  const jst = new Date(at.getTime() + 9 * 3600_000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1; // 1-12
  const d = jst.getUTCDate();
  switch (type) {
    case 'day': return `${y}-${pad(m)}-${pad(d)}`;
    case 'month': return `${y}-${pad(m)}`;
    case 'quarter': return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
    case 'half': return `${y}-H${m <= 6 ? 1 : 2}`;
    case 'year': return `${y}`;
  }
}

function lastDayOfMonth(y: number, m: number): number { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** period_key → {start,end}（両端 YYYY-MM-DD） */
export function periodRange(key: string, type: PeriodType): { start: string; end: string } {
  if (type === 'day') return { start: key, end: key };
  if (type === 'year') { const y = Number(key); return { start: `${y}-01-01`, end: `${y}-12-31` }; }
  if (type === 'month') {
    const [ys, ms] = key.split('-'); const y = Number(ys), m = Number(ms);
    return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}` };
  }
  if (type === 'quarter') {
    const [ys, q] = key.split('-Q'); const y = Number(ys); const qn = Number(q);
    const sm = (qn - 1) * 3 + 1; const em = sm + 2;
    return { start: `${y}-${pad(sm)}-01`, end: `${y}-${pad(em)}-${pad(lastDayOfMonth(y, em))}` };
  }
  // half
  const [ys, h] = key.split('-H'); const y = Number(ys); const hn = Number(h);
  const sm = hn === 1 ? 1 : 7; const em = hn === 1 ? 6 : 12;
  return { start: `${y}-${pad(sm)}-01`, end: `${y}-${pad(em)}-${pad(lastDayOfMonth(y, em))}` };
}

export function prevYearPeriodKey(key: string, _type: PeriodType): string {
  const y = key.slice(0, 4); const py = String(Number(y) - 1);
  return py + key.slice(4);
}

export function sumSales(records: DailyLike[], start: string, end: string): number {
  return records
    .filter((r) => r.date >= start && r.date <= end)
    .reduce((acc, r) => acc + (r.nominatedSales || 0) + (r.freeSales || 0), 0);
}

export function achievementRate(actual: number, target: number): number {
  if (!target) return 0;
  return Math.round((actual / target) * 1000) / 10; // %小数1桁
}

export function yoyDelta(current: number, lastYear: number): { diff: number; rate: number | null } {
  const diff = current - lastYear;
  if (!lastYear) return { diff, rate: null };
  return { diff, rate: Math.round((diff / lastYear) * 1000) / 10 };
}
```

- [ ] **Step 3: PASS＋回帰**

Run: `cd app && npm run test`
Expected: targets 全PASS、payrollRegression ¥281,000 維持、全体PASS。

- [ ] **Step 4: Commit**
```bash
git add app/src/lib/targets.ts app/src/test/targets.test.ts
git commit -m "feat(targets): 期間/集計/達成率/前年比の純関数(テスト付)"
```

---

### Task 2: マイグレーション 0011 sales_targets + RLS + pgTAP

**Files:**
- Create: `app/supabase/migrations/0011_sales_targets.sql`
- Create: `app/supabase/tests/sales_targets_test.sql`

- [ ] **Step 1: マイグレーション作成**

`app/supabase/migrations/0011_sales_targets.sql`:
```sql
create table public.sales_targets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  scope text not null check (scope in ('store','cast')),
  cast_id uuid references public.casts(id),
  period_type text not null check (period_type in ('day','month','quarter','half','year')),
  period_key text not null,
  target_amount bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope='cast' and cast_id is not null) or (scope='store' and cast_id is null))
);
-- 部分ユニーク（store目標は cast_id null）
create unique index sales_targets_store_uniq on public.sales_targets (store_id, period_type, period_key) where scope='store';
create unique index sales_targets_cast_uniq  on public.sales_targets (store_id, cast_id, period_type, period_key) where scope='cast';
create index on public.sales_targets (store_id, period_type, period_key);

alter table public.sales_targets enable row level security;

create policy sales_targets_select on public.sales_targets for select using (
  current_is_integrated() or (has_store_access(store_id) and (
    is_store_admin(store_id)
    or (scope='cast' and cast_id = current_cast_id())
  ))
);
create policy sales_targets_admin_write on public.sales_targets for all
  using ( is_store_admin(store_id) ) with check ( is_store_admin(store_id) );
```

- [ ] **Step 2: pgTAP 作成**

`app/supabase/tests/sales_targets_test.sql`（plan 4。店A/B・統合・A店admin・A店cast。有効UUID）:
```sql
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
-- 統合：全店の店舗目標が見える(2)
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-0000000000a1',true);
select is((select count(*)::int from public.sales_targets where scope='store'), 2, '統合は全店の店舗目標');
-- A店admin：自店のみ(store1+cast1=2件), 店Bは0
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-0000000000a2',true);
select is((select count(*)::int from public.sales_targets where store_id='50000000-0000-0000-0000-000000000002'), 0, 'A管理は他店の目標が見えない');
-- A店cast：自分のcast目標のみ(1)、店舗目標は見えない
select set_config('request.jwt.claim.sub','51000000-0000-0000-0000-0000000000c1',true);
select is((select count(*)::int from public.sales_targets), 1, 'castは自分のcast目標のみ');
-- A店cast は書込不可
select throws_ok($$ insert into public.sales_targets(store_id,scope,period_type,period_key,target_amount)
  values ('50000000-0000-0000-0000-000000000001','store','month','2026-10',1) $$, '42501', null, 'castは目標を書けない');
select * from finish();
rollback;
```

- [ ] **Step 3: 実行**

Run: `cd app && npx supabase db reset && npx supabase test db`
Expected: sales_targets_test 4/4 PASS、既存全PASS（退行なし）。

- [ ] **Step 4: Commit**
```bash
git add app/supabase/migrations/0011_sales_targets.sql app/supabase/tests/sales_targets_test.sql
git commit -m "feat(db): sales_targets(店舗+キャスト目標)+RLS+pgTAP(0011)"
```

---

### Task 3: data/targets.ts（目標CRUD・売上集計取得）

**Files:**
- Create: `app/src/data/targets.ts`

- [ ] **Step 1: 実装**

`app/src/data/targets.ts`:
```ts
import { supabase } from '../lib/supabase';
import type { PeriodType, DailyLike } from '../lib/targets';

export interface SalesTarget {
  id: string; store_id: string; scope: 'store' | 'cast';
  cast_id: string | null; period_type: PeriodType; period_key: string; target_amount: number;
}

/** 指定店舗・期間種別・キーの店舗目標を1件取得（無ければnull） */
export async function fetchStoreTarget(storeId: string, periodType: PeriodType, periodKey: string): Promise<number | null> {
  const { data, error } = await supabase.from('sales_targets')
    .select('target_amount')
    .eq('store_id', storeId).eq('scope', 'store').eq('period_type', periodType).eq('period_key', periodKey)
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.target_amount) : null;
}

/** 店舗の daily_records を範囲で取得し {date,castId,nominatedSales,freeSales} を返す */
export interface StoreDaily extends DailyLike { castId: string }
export async function fetchStoreDaily(storeId: string, start: string, end: string): Promise<StoreDaily[]> {
  const { data, error } = await supabase.from('daily_records')
    .select('data')
    .eq('store_id', storeId).gte('date', start).lte('date', end);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => {
    const d = r.data as Record<string, unknown>;
    return {
      date: d.date as string,
      castId: d.castId as string,
      nominatedSales: Number(d.nominatedSales) || 0,
      freeSales: Number(d.freeSales) || 0,
    };
  });
}

/** 目標 upsert（自店adminのみ・RLS担保） */
export async function upsertTarget(t: Omit<SalesTarget, 'id'>): Promise<void> {
  const conflict = t.scope === 'store'
    ? 'store_id,period_type,period_key'
    : 'store_id,cast_id,period_type,period_key';
  const { error } = await supabase.from('sales_targets').upsert(t as Record<string, unknown>, { onConflict: conflict });
  if (error) throw error;
}

/** キャスト個人の目標を取得 */
export async function fetchCastTarget(storeId: string, castId: string, periodType: PeriodType, periodKey: string): Promise<number | null> {
  const { data, error } = await supabase.from('sales_targets')
    .select('target_amount')
    .eq('store_id', storeId).eq('scope', 'cast').eq('cast_id', castId)
    .eq('period_type', periodType).eq('period_key', periodKey).maybeSingle();
  if (error) throw error;
  return data ? Number(data.target_amount) : null;
}
```
注：`upsert` の onConflict は部分ユニークindexの列に合わせる。scope='store' 行は cast_id を渡さない（null）。

- [ ] **Step 2: ビルド**

Run: `cd app && npm run build`
Expected: 型エラー無し。

- [ ] **Step 3: Commit**
```bash
git add app/src/data/targets.ts
git commit -m "feat(targets): 目標CRUD・店舗売上集計のデータアクセス"
```

---

### Task 4: recharts + SalesTrendChart

**Files:**
- Modify: `app/package.json`
- Create: `app/src/components/SalesTrendChart.tsx`

- [ ] **Step 1: 依存追加**

Run: `cd app && npm i recharts@^2`

- [ ] **Step 2: チャートコンポーネント**

`app/src/components/SalesTrendChart.tsx`：propsで `data: { label: string; current: number; lastYear: number }[]` を受け、recharts の `LineChart` で当年(current)と前年(lastYear)の2本の折れ線＋`Tooltip`/`Legend`/`ResponsiveContainer` を描画。色は当年=#c8243e、前年=グレー系。y軸は¥表記（`toLocaleString`）。空データ時は「データなし」。
```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

export interface TrendPoint { label: string; current: number; lastYear: number }

export function SalesTrendChart({ data }: { data: TrendPoint[] }) {
  if (!data.length) return <p className="text-sm text-ink-tertiary">データなし</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={(v) => `¥${Number(v).toLocaleString()}`} tick={{ fontSize: 11 }} width={72} />
        <Tooltip formatter={(v: number) => `¥${Number(v).toLocaleString()}`} />
        <Legend />
        <Line type="monotone" dataKey="current" name="今年" stroke="#c8243e" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="lastYear" name="前年" stroke="#b8a06a" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: ビルド**

Run: `cd app && npm run build`
Expected: 型エラー無し。

- [ ] **Step 4: Commit**
```bash
git add app/package.json app/package-lock.json app/src/components/SalesTrendChart.tsx
git commit -m "feat(ui): recharts + 売上推移チャート(当年/前年)"
```

---

### Task 5: DashboardPage コックピット強化

**Files:**
- Modify: `app/src/pages/admin/DashboardPage.tsx`

- [ ] **Step 1: 現状把握** — `sed -n '1,80p' app/src/pages/admin/DashboardPage.tsx` で既存構造・useAuth利用を確認。

- [ ] **Step 2: コックピット実装**
`DashboardPage.tsx` に以下を実装（`useAuth` の `activeStoreId`/`isIntegratedViewer`/`memberships`、`lib/targets` と `data/targets`、`SalesTrendChart` を使用）：
- **期間トグル** state `periodType: PeriodType`（既定 'month'）＋対象 `periodKey`（既定＝今日の該当期間、`periodKey(new Date(), type)`）。トグルUI（日/月/四半期/半期/年ボタン）。
- 選択期間の `periodRange` で `fetchStoreDaily(activeStoreId, start, end)` → `sumSales` で総売上。
- `fetchStoreTarget` で店舗目標 → `achievementRate` → **達成率バー**（総売上/目標）。
- 前年：`prevYearPeriodKey`＋`periodRange` で前年同期の売上を `fetchStoreDaily`→`sumSales`、`yoyDelta` で前年比％表示。
- **推移グラフ**：期間に応じた粒度で系列生成（month選択→日別/または月内日別、year選択→月別 等。実装簡易化のため：day=当日単一、month=日別、quarter/half/year=月別）。当年と前年で同じ粒度の系列を作り `SalesTrendChart` に渡す（`{label, current, lastYear}[]`）。
- **店間比較**：`isIntegratedViewer` の場合、全店（`fetchAccessibleStores` 由来 or memberships）ぶんの総売上・達成率を並べたカード群。一般adminは自店のみ。
- **キャスト別**：期間の `fetchStoreDaily` を castId で集計→売上ランキング。各castの `fetchCastTarget`（当月）で達成率表示（任意、月次のみで可）。
- 非同期は loading 表示。`activeStoreId` 未確定はプロンプト。

- [ ] **Step 3: ビルド** — Run: `cd app && npm run build` → 型エラー無し。

- [ ] **Step 4: 手動/疎通確認** — admin（Kingyo）で当月の総売上・達成率・キャスト別が出る、owner（統合）で店間比較が出る、を確認（ローカルSupabase or REST）。

- [ ] **Step 5: Commit**
```bash
git add app/src/pages/admin/DashboardPage.tsx
git commit -m "feat(dashboard): 売上コックピット(期間トグル/達成率/前年比/店間比較/キャスト別)"
```

---

### Task 6: 目標設定UI（管理）

**Files:**
- Create: `app/src/pages/admin/SalesTargetSettingsPage.tsx`
- Modify: `app/src/App.tsx`（ルート）, `app/src/components/AdminLayout.tsx`（ナビ「売上目標」）

- [ ] **Step 1: ページ実装**
`SalesTargetSettingsPage.tsx`：アクティブ店舗に対し、
- 店舗目標：期間種別セレクト＋期間キー入力（例 当月キーを既定表示）＋金額入力→保存（`upsertTarget({scope:'store',...})`）。現在値は `fetchStoreTarget` で表示。
- キャスト個人目標：アクティブ店舗のcast一覧（`casts` 取得）ごとに当月目標を入力→保存（`upsertTarget({scope:'cast',cast_id,...})`）。
- 自店adminのみ（RLS担保）。保存成功/失敗表示。storeId未確定は無効化。

- [ ] **Step 2: ルート/ナビ** — `App.tsx` admin配下に `sales-targets` ルート、`AdminLayout` ナビに「売上目標」を追加。`RequireAuth role="admin"` 配下。

- [ ] **Step 3: ビルド** — `cd app && npm run build` 型エラー無し。

- [ ] **Step 4: Commit**
```bash
git add app/src/pages/admin/SalesTargetSettingsPage.tsx app/src/App.tsx app/src/components/AdminLayout.tsx
git commit -m "feat(admin): 売上目標設定(店舗+キャスト個人)"
```

---

### Task 7: キャストのマイページに個人目標ウィジェット

**Files:**
- Modify: `app/src/pages/cast/MyPage.tsx`

- [ ] **Step 1: 実装**
`MyPage.tsx` に、当月の自分のcast目標（`fetchCastTarget(user.castData.storeId, user.castData.id, 'month', periodKey(new Date(),'month'))`）と、当月売上（`fetchStoreDaily` は店舗全件のため、cast向けは自分の daily を集計する軽い取得を追加：`supabase.from('daily_records').select('data').eq('cast_id', castId).gte/lte(当月範囲)` → `sumSales`）を比較し「**今月あと¥Xで目標達成**」＋達成率バー（`achievementRate`）を表示。目標未設定なら非表示 or 「目標未設定」。

- [ ] **Step 2: ビルド** — `cd app && npm run build` 型エラー無し。

- [ ] **Step 3: Commit**
```bash
git add app/src/pages/cast/MyPage.tsx
git commit -m "feat(cast): マイページに個人売上目標の達成状況を表示"
```

---

### Task 8: 2025ダミー売上 + サンプル目標（seed + 本番適用ファイル）

**Files:**
- Create: `app/supabase/seed_p1_2025.sql`
- Modify: `app/supabase/seed.sql`（同内容を追記）

- [ ] **Step 1: 生成方針**
`app/supabase/seed_p1_2025.sql`（冪等・on conflict do nothing）:
- 両店のアクティブcastに対し、**2025年の各月**、キャスト別の月次ダミー売上を `daily_records` に投入（各月に代表1〜数日分でよい。売上=nominatedSales+freeSales が月合計になるよう、月内数日にランダム分散、または月1レコードに月合計を入れる簡易法）。**2025年データのみ**（既存2026は触らない）。id は `p1y25_<cast>_<month>` 等で一意、`(cast_id,date)` 冪等。
- **サンプル目標**：各店の月次店舗目標（例 Kingyo 2026-09 = 3,000,000、B club 2026-09 = 1,000,000）と、数名のcast月次目標（例 500,000）を `sales_targets` に投入（on conflict do nothing）。前年比・達成率がすぐ見えるように 2025各月＋2026-09 の店舗目標を入れる。
- 生成はスクリプト（node）でSQL出力→ファイル化してよい（scratchpad利用可）。値はダミー乱数（シード固定）。

- [ ] **Step 2: ローカル適用＋テスト**
Run: `cd app && npx supabase db reset && npx supabase test db`（seed に追記済みの内容が流れる。pgTAP退行なし）。`npm run test`（全PASS）。

- [ ] **Step 3: Commit**
```bash
git add app/supabase/seed_p1_2025.sql app/supabase/seed.sql
git commit -m "feat(db): 2025ダミー売上+サンプル目標(前年比/達成率デモ用)"
```

---

### Task 9: 総合確認 + メモリ更新

**Files:** 検証のみ（＋メモリ）

- [ ] **Step 1: DB/ユニット/ビルド/lint**
```
cd app && npx supabase db reset && npx supabase test db   # 全pgTAP PASS(sales_targets含む)
cd app && npm run test                                    # targets/回帰¥281,000含む全PASS
cd app && npm run build                                   # 型エラー無し
cd app && npm run lint                                    # 新規エラー増やさない
```

- [ ] **Step 2: 手動スモーク**
admin(Kingyo)：期間トグル切替で総売上/達成率/推移(前年重ね)/キャスト別が出る。owner(統合)：店間比較。cast(sakura)：マイページに個人目標。目標設定で店舗/cast目標を保存→ダッシュボードに反映。

- [ ] **Step 3: 本番反映（順序厳守）**
`supabase db push`（0011）→ `seed_p1_2025.sql` を本番へ適用（2025ダミー＋サンプル目標）→ `git push`（フロント自動デプロイ）。※実行は人手確認のうえ。

- [ ] **Step 4: メモリ更新 + Commit**
`project_kingyo.md` に「P1 売上コックピット（sales_targets/期間トグル/達成率/前年比/店間比較/recharts）」を追記。
```bash
git add -A && git commit -m "chore: P1 総合確認完了"
```

---

## Self-Review 結果
- **Spec coverage:** §4.1 sales_targets→T2 / §5 期間モデル→T1 / §6 集計ロジック→T1 / §7.1 コックピット→T4,T5 / §7.2 cast目標→T7 / §7.3 目標設定→T6 / §8 2025ダミー→T8 / §9 recharts→T4 / §10 テスト→T1,T2,T9 / §11 反映→T9。全対応。
- **Placeholder:** T5(系列粒度)/T8(ダミー生成)は方針＋簡易法を明記（未定義放置なし）。pgTAPのUUIDは有効値。
- **型整合:** `PeriodType`/`DailyLike`/`periodKey`/`periodRange`/`prevYearPeriodKey`/`sumSales`/`achievementRate`/`yoyDelta`（lib）、`SalesTarget`/`fetchStoreTarget`/`fetchStoreDaily`/`upsertTarget`/`fetchCastTarget`/`StoreDaily`（data）、`SalesTrendChart`/`TrendPoint`（component）は各タスクで一貫。

## 反映順序（P0で確立）
DB migration(0011) → seed_p1_2025(データ) → git push(フロント)。逆順だと未存在テーブル参照でフロントが壊れる。
