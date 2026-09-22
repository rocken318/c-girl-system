# シフト×出欠ボード Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 黒服・管理者が当日/月次のシフト出欠を一覧し、黒服が全店キャストの出欠確認(5区分)とシフト即時変更を行えるボードを追加する。

**Architecture:** 出欠は既存 `daily_records.data`(jsonb) の `attended`/`isLate`/`isAbsent`/`attendanceType`/`douhan`/`douhanTime` に記録（新スキーマなし）。純関数で区分↔フィールドを相互変換し、非破壊マージで売上を保持。シフトは既存 `ShiftContext` を再利用し `shifts` へ即時反映。UIは黒服/管理者共用の `ShiftAttendanceBoard`。黒服の全店書込は Supabase RLS ポリシー追加で許可。

**Tech Stack:** React + TypeScript + Vite + Tailwind、状態は Context、永続化は Supabase(PostgREST)、テストは Vitest。

作業ディレクトリは `app/`（`Y:/kingyo管理システム/キンギョ管理システム/app`）。すべてのコマンドは `app/` 直下で実行する。

---

## File Structure

- Create: `app/src/lib/attendanceStatus.ts` — 出欠区分の型・区分↔`daily_records`フィールド変換・非破壊マージ・表示補助（純関数、テスト対象）
- Create: `app/src/test/attendanceStatus.test.ts` — 上記のユニットテスト
- Modify: `app/src/data/seed.ts:31-56` — `DailyRecord.attendanceType` の型を5区分に拡張
- Modify: `app/src/data/attendance.ts` — 全店キャスト取得・月次出欠取得・出欠upsert(非破壊)を追加
- Modify: `app/src/store/ShiftContext.tsx` — `ConfirmedShift` に監査項目、`confirmShift` で `updatedBy`/`updatedAt` を記録
- Create: `app/src/components/ShiftAttendanceBoard.tsx` — 共有ボード（当日ビュー＋月次ビュー）
- Create: `app/src/pages/kurofuku/KurofukuShiftBoardPage.tsx` — 黒服用ページ（ボードを全店・編集可で表示）
- Modify: `app/src/components/KurofukuLayout.tsx:6-10` — 「シフト/出欠」タブ追加
- Modify: `app/src/App.tsx` — 黒服ルート追加、管理者ボードルート追加
- Modify: `app/src/pages/admin/AttendanceAdminPage.tsx` — ボードへのリンク/統合（隣接タブ）
- Create: `app/supabase/migrations/0014_kurofuku_shift_attendance_rls.sql` — 黒服の全店 SELECT/書込 RLS

---

## Task 1: 出欠区分ロジック（区分↔フィールド変換）

**Files:**
- Create: `app/src/lib/attendanceStatus.ts`
- Test: `app/src/test/attendanceStatus.test.ts`
- Modify: `app/src/data/seed.ts:32-40`

- [ ] **Step 1: `DailyRecord.attendanceType` の型を拡張**

`app/src/data/seed.ts` の `DailyRecord` 定義内、該当行を変更：

```ts
  attendanceType: 'normal' | 'douhan' | 'late' | 'absent' | 'same_day_absence';  // 出欠区分マーカー
```

- [ ] **Step 2: 失敗するテストを書く**

`app/src/test/attendanceStatus.test.ts` を新規作成：

```ts
import { describe, it, expect } from 'vitest';
import {
  statusToFields,
  fieldsToStatus,
  countsAsAttended,
  type AttendanceStatus,
} from '../lib/attendanceStatus';

describe('statusToFields', () => {
  it('出勤', () => {
    expect(statusToFields('present')).toEqual({
      attended: true, isLate: false, isAbsent: false, attendanceType: 'normal',
    });
  });
  it('同伴出勤', () => {
    expect(statusToFields('douhan')).toEqual({
      attended: true, isLate: false, isAbsent: false, attendanceType: 'douhan',
    });
  });
  it('遅刻', () => {
    expect(statusToFields('late')).toEqual({
      attended: true, isLate: true, isAbsent: false, attendanceType: 'late',
    });
  });
  it('欠勤', () => {
    expect(statusToFields('absent')).toEqual({
      attended: false, isLate: false, isAbsent: true, attendanceType: 'absent',
    });
  });
  it('当欠', () => {
    expect(statusToFields('same_day_absence')).toEqual({
      attended: false, isLate: false, isAbsent: true, attendanceType: 'same_day_absence',
    });
  });
});

describe('fieldsToStatus', () => {
  it('未確認: 出勤も欠勤もマークなし', () => {
    expect(fieldsToStatus({ attended: false, isLate: false, isAbsent: false, attendanceType: 'normal' }))
      .toBe('unconfirmed');
  });
  it('当欠を区別', () => {
    expect(fieldsToStatus({ attended: false, isLate: false, isAbsent: true, attendanceType: 'same_day_absence' }))
      .toBe('same_day_absence');
  });
  it('事前欠勤', () => {
    expect(fieldsToStatus({ attended: false, isLate: false, isAbsent: true, attendanceType: 'absent' }))
      .toBe('absent');
  });
  it('同伴出勤', () => {
    expect(fieldsToStatus({ attended: true, isLate: false, isAbsent: false, attendanceType: 'douhan' }))
      .toBe('douhan');
  });
  it('遅刻', () => {
    expect(fieldsToStatus({ attended: true, isLate: true, isAbsent: false, attendanceType: 'late' }))
      .toBe('late');
  });
  it('通常出勤', () => {
    expect(fieldsToStatus({ attended: true, isLate: false, isAbsent: false, attendanceType: 'normal' }))
      .toBe('present');
  });
});

describe('countsAsAttended', () => {
  it('出勤・同伴・遅刻は出勤扱い', () => {
    expect(countsAsAttended('present')).toBe(true);
    expect(countsAsAttended('douhan')).toBe(true);
    expect(countsAsAttended('late')).toBe(true);
  });
  it('欠勤・当欠・未確認は非出勤', () => {
    expect(countsAsAttended('absent')).toBe(false);
    expect(countsAsAttended('same_day_absence')).toBe(false);
    expect(countsAsAttended('unconfirmed')).toBe(false);
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `npm test -- src/test/attendanceStatus.test.ts`
Expected: FAIL（`../lib/attendanceStatus` が存在しない）

- [ ] **Step 4: 最小実装**

`app/src/lib/attendanceStatus.ts` を新規作成：

```ts
/** 出欠区分。unconfirmed は「予定はあるが未記録」の初期状態。 */
export type AttendanceStatus =
  | 'unconfirmed'
  | 'present'
  | 'douhan'
  | 'late'
  | 'absent'
  | 'same_day_absence';

/** UI で選択できる区分（未確認は選択肢に含めない）。 */
export const ATTENDANCE_STATUSES: Exclude<AttendanceStatus, 'unconfirmed'>[] = [
  'present', 'douhan', 'late', 'absent', 'same_day_absence',
];

export interface AttendanceFields {
  attended: boolean;
  isLate: boolean;
  isAbsent: boolean;
  attendanceType: 'normal' | 'douhan' | 'late' | 'absent' | 'same_day_absence';
}

/** 区分 → daily_records の出欠フィールド。 */
export function statusToFields(status: Exclude<AttendanceStatus, 'unconfirmed'>): AttendanceFields {
  switch (status) {
    case 'present':          return { attended: true,  isLate: false, isAbsent: false, attendanceType: 'normal' };
    case 'douhan':           return { attended: true,  isLate: false, isAbsent: false, attendanceType: 'douhan' };
    case 'late':             return { attended: true,  isLate: true,  isAbsent: false, attendanceType: 'late' };
    case 'absent':           return { attended: false, isLate: false, isAbsent: true,  attendanceType: 'absent' };
    case 'same_day_absence': return { attended: false, isLate: false, isAbsent: true,  attendanceType: 'same_day_absence' };
  }
}

/** daily_records の出欠フィールド → 区分。マークが無ければ unconfirmed。 */
export function fieldsToStatus(fields: {
  attended?: boolean;
  isLate?: boolean;
  isAbsent?: boolean;
  attendanceType?: string;
}): AttendanceStatus {
  const { attended = false, isLate = false, isAbsent = false, attendanceType = 'normal' } = fields;
  if (isAbsent) {
    return attendanceType === 'same_day_absence' ? 'same_day_absence' : 'absent';
  }
  if (attended) {
    if (attendanceType === 'douhan') return 'douhan';
    return isLate ? 'late' : 'present';
  }
  return 'unconfirmed';
}

/** 出勤率で「出勤日」として数える区分か（出勤/同伴/遅刻）。 */
export function countsAsAttended(status: AttendanceStatus): boolean {
  return status === 'present' || status === 'douhan' || status === 'late';
}
```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `npm test -- src/test/attendanceStatus.test.ts`
Expected: PASS（全ケース）

- [ ] **Step 6: コミット**

```bash
git add src/lib/attendanceStatus.ts src/test/attendanceStatus.test.ts src/data/seed.ts
git commit -m "feat: 出欠区分ロジック(区分↔daily_recordsフィールド変換)"
```

---

## Task 2: 出欠データの非破壊マージ

**Files:**
- Modify: `app/src/lib/attendanceStatus.ts`
- Test: `app/src/test/attendanceStatus.test.ts`

- [ ] **Step 1: 失敗するテストを追加**

`app/src/test/attendanceStatus.test.ts` の末尾に追記：

```ts
import { mergeAttendanceData } from '../lib/attendanceStatus';

describe('mergeAttendanceData', () => {
  const existing = {
    id: 'dr_1', castId: 'cast_1', storeId: 'store_1', date: '2026-09-15',
    nominatedSales: 50000, freeSales: 20000, honShimei: 3, banaiShimei: 1,
    drinks: 5, bottles: 1, extensions: 2, hours: 5, advancePay: 0,
    attended: false, isLate: false, isAbsent: false, attendanceType: 'normal', douhan: 0,
  };

  it('売上フィールドを破壊しない', () => {
    const merged = mergeAttendanceData(existing, 'present');
    expect(merged.nominatedSales).toBe(50000);
    expect(merged.freeSales).toBe(20000);
    expect(merged.honShimei).toBe(3);
    expect(merged.attended).toBe(true);
    expect(merged.attendanceType).toBe('normal');
  });

  it('同伴出勤: douhanTime を保存し douhan を1に（未計上時）', () => {
    const merged = mergeAttendanceData({ ...existing, douhan: 0 }, 'douhan', '19:00');
    expect(merged.attendanceType).toBe('douhan');
    expect(merged.douhanTime).toBe('19:00');
    expect(merged.douhan).toBe(1);
  });

  it('同伴出勤の再マークは冪等（既存件数を維持）', () => {
    const merged = mergeAttendanceData({ ...existing, douhan: 2 }, 'douhan', '19:00');
    expect(merged.douhan).toBe(2);
  });

  it('欠勤・当欠は douhan を0に', () => {
    const merged = mergeAttendanceData({ ...existing, douhan: 1 }, 'absent');
    expect(merged.douhan).toBe(0);
    expect(merged.isAbsent).toBe(true);
  });

  it('既存レコードが空でも新規フィールドを組める', () => {
    const merged = mergeAttendanceData({}, 'late');
    expect(merged.attended).toBe(true);
    expect(merged.isLate).toBe(true);
    expect(merged.attendanceType).toBe('late');
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- src/test/attendanceStatus.test.ts`
Expected: FAIL（`mergeAttendanceData` が未定義）

- [ ] **Step 3: 最小実装**

`app/src/lib/attendanceStatus.ts` の末尾に追記：

```ts
/**
 * 既存の daily_records.data に出欠区分をマージする（純関数）。
 * 売上・指名・時間などのフィールドは既存値を保持（非破壊）。
 * - 同伴出勤: douhanTime を設定し、未計上(0)なら douhan=1（再マークは冪等）。
 * - 欠勤/当欠: douhan=0（来ていないため）。
 * - 出勤/遅刻: douhan は既存値を維持。
 */
export function mergeAttendanceData(
  existing: Record<string, unknown>,
  status: Exclude<AttendanceStatus, 'unconfirmed'>,
  douhanTime?: string,
): Record<string, unknown> {
  const fields = statusToFields(status);
  const merged: Record<string, unknown> = { ...existing, ...fields };

  const currentDouhan = Number(existing.douhan) || 0;
  if (status === 'douhan') {
    merged.douhan = currentDouhan >= 1 ? currentDouhan : 1;
    if (douhanTime) merged.douhanTime = douhanTime;
  } else if (status === 'absent' || status === 'same_day_absence') {
    merged.douhan = 0;
  } else {
    merged.douhan = currentDouhan;
  }
  return merged;
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test -- src/test/attendanceStatus.test.ts`
Expected: PASS（全ケース）

- [ ] **Step 5: コミット**

```bash
git add src/lib/attendanceStatus.ts src/test/attendanceStatus.test.ts
git commit -m "feat: 出欠データの非破壊マージ(mergeAttendanceData)"
```

---

## Task 3: データ層（全店キャスト・月次出欠取得・出欠upsert）

**Files:**
- Modify: `app/src/data/attendance.ts`

- [ ] **Step 1: 取得・upsert 関数を追加**

`app/src/data/attendance.ts` の末尾に追記（既存 import の `supabase` を利用）：

```ts
import { mergeAttendanceData } from '../lib/attendanceStatus';
import type { AttendanceStatus } from '../lib/attendanceStatus';

export interface StoreCast { id: string; name: string }

/** 所属店の稼働中キャスト（RLS: kurofuku=全店(0014後)/admin=全件→store_idで絞る）。 */
export async function fetchStoreCasts(storeId: string): Promise<StoreCast[]> {
  const { data, error } = await supabase
    .from('casts')
    .select('id, source_name')
    .eq('store_id', storeId)
    .eq('status', 'active')
    .order('source_name');
  if (error) throw error;
  return (data ?? []).map((c: { id: string; source_name: string }) => ({ id: c.id, name: c.source_name }));
}

/** キー: `${castId}__${date}`、値: daily_records.data。対象店・対象月の出欠を引く。 */
export async function fetchMonthAttendance(
  storeId: string,
  month: string,
): Promise<Map<string, Record<string, unknown>>> {
  const { start, end } = periodRange(month, 'month');
  const { data, error } = await supabase
    .from('daily_records')
    .select('cast_id, date, data')
    .eq('store_id', storeId)
    .gte('date', start)
    .lte('date', end);
  if (error) throw error;
  const map = new Map<string, Record<string, unknown>>();
  for (const r of data ?? []) {
    const row = r as { cast_id: string; date: string; data: Record<string, unknown> };
    map.set(`${row.cast_id}__${row.date}`, row.data ?? {});
  }
  return map;
}

/**
 * 出欠を記録する。該当日の daily_records を非破壊マージで upsert。
 * 既存行があれば data のみ更新（売上を保持）、無ければ新規作成。
 */
export async function upsertAttendance(params: {
  storeId: string;
  castId: string;
  date: string;
  status: Exclude<AttendanceStatus, 'unconfirmed'>;
  douhanTime?: string;
}): Promise<void> {
  const { storeId, castId, date, status, douhanTime } = params;

  const { data: existingRows, error: selErr } = await supabase
    .from('daily_records')
    .select('data')
    .eq('cast_id', castId)
    .eq('date', date)
    .eq('store_id', storeId)
    .limit(1);
  if (selErr) throw selErr;

  const existing = (existingRows?.[0]?.data ?? {}) as Record<string, unknown>;
  const merged = mergeAttendanceData(existing, status, douhanTime);
  // 新規行の識別子・所属を補完
  merged.castId = castId;
  merged.storeId = storeId;
  merged.date = date;

  const { error: upErr } = await supabase
    .from('daily_records')
    .upsert(
      { store_id: storeId, cast_id: castId, date, data: merged },
      { onConflict: 'cast_id,date' },
    );
  if (upErr) throw upErr;
}
```

- [ ] **Step 2: 型チェック（ビルド）で検証**

Run: `npm run build`
Expected: 成功（TypeScript エラーなし）。既存 `periodRange` import が使われていることを確認。

- [ ] **Step 3: コミット**

```bash
git add src/data/attendance.ts
git commit -m "feat: 出欠データ層(全店キャスト・月次取得・非破壊upsert)"
```

---

## Task 4: ShiftContext に監査項目を追加

**Files:**
- Modify: `app/src/store/ShiftContext.tsx:33-40`（`ConfirmedShift`）
- Modify: `app/src/store/ShiftContext.tsx:356-383`（`confirmShift`）

- [ ] **Step 1: `ConfirmedShift` に監査フィールドを追加**

`ConfirmedShift` インターフェース定義を変更：

```ts
export interface ConfirmedShift {
  id: string;
  storeId: string;
  castId: string;
  date: string;          // YYYY-MM-DD
  startTime: string;
  endTime: string;
  published: boolean;
  updatedBy?: string;    // 変更者 profile_id（黒服の即時変更を監査）
  updatedAt?: string;    // 変更時刻 ISO
}
```

- [ ] **Step 2: `confirmShift` の upsert に監査情報を含める**

`confirmShift` 内の `.upsert({...})` の `data` を変更：

```ts
        data: {
          startTime: shift.startTime,
          endTime: shift.endTime,
          ...(shift.updatedBy ? { updatedBy: shift.updatedBy } : {}),
          ...(shift.updatedAt ? { updatedAt: shift.updatedAt } : {}),
        },
```

- [ ] **Step 3: 型チェック（ビルド）で検証**

Run: `npm run build`
Expected: 成功（既存の `confirmShift` 呼び出し側は `updatedBy`/`updatedAt` が任意のため影響なし）。

- [ ] **Step 4: コミット**

```bash
git add src/store/ShiftContext.tsx
git commit -m "feat: 確定シフトに変更者/変更時刻の監査項目を追加"
```

---

## Task 5: 共有ボード `ShiftAttendanceBoard`

**Files:**
- Create: `app/src/components/ShiftAttendanceBoard.tsx`

当日ビュー（点呼）と月次ビュー（グリッド）を持つ共有コンポーネント。シフトは `useShift()`、出欠は `data/attendance.ts` を使う。`canEdit` が false の場合は表示のみ。

- [ ] **Step 1: コンポーネントを作成**

`app/src/components/ShiftAttendanceBoard.tsx` を新規作成：

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShift } from '../store/ShiftContext';
import {
  fetchStoreCasts, fetchMonthAttendance, upsertAttendance,
  type StoreCast,
} from '../data/attendance';
import {
  fieldsToStatus, mergeAttendanceData, ATTENDANCE_STATUSES,
  type AttendanceStatus,
} from '../lib/attendanceStatus';

interface Props {
  storeId: string;
  canEdit: boolean;
  currentUserId: string;
}

type View = 'day' | 'month';

// ── helpers ────────────────────────────────────────────────────────────────
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthOfDate(date: string): string { return date.slice(0, 7); }
function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function currentMonth(): string { return monthOfDate(todayStr()); }
function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${Number(m)}月`;
}
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
function dow(date: string): string { return DOW[new Date(date + 'T00:00:00').getDay()]; }

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  unconfirmed: '未確認',
  present: '出勤',
  douhan: '同伴',
  late: '遅刻',
  absent: '欠勤',
  same_day_absence: '当欠',
};
const STATUS_CLASS: Record<AttendanceStatus, string> = {
  unconfirmed: 'bg-gray-100 text-gray-500',
  present: 'bg-emerald-100 text-emerald-700',
  douhan: 'bg-brand/10 text-brand',
  late: 'bg-amber-100 text-amber-700',
  absent: 'bg-red-100 text-red-700',
  same_day_absence: 'bg-red-200 text-red-800',
};

// ── component ───────────────────────────────────────────────────────────────
export function ShiftAttendanceBoard({ storeId, canEdit, currentUserId }: Props) {
  const { confirmedShifts, confirmShift } = useShift();
  const [view, setView] = useState<View>('day');
  const [month, setMonth] = useState<string>(currentMonth);
  const [casts, setCasts] = useState<StoreCast[]>([]);
  const [attendance, setAttendance] = useState<Map<string, Record<string, unknown>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // `${castId}__${date}`

  const castName = useMemo(() => new Map(casts.map(c => [c.id, c.name])), [casts]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchStoreCasts(storeId), fetchMonthAttendance(storeId, month)])
      .then(([cs, att]) => { setCasts(cs); setAttendance(att); })
      .catch(() => setError('データの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [storeId, month]);

  useEffect(() => { reload(); }, [reload]);

  const statusOf = useCallback((castId: string, date: string): AttendanceStatus => {
    const data = attendance.get(`${castId}__${date}`);
    return data ? fieldsToStatus(data) : 'unconfirmed';
  }, [attendance]);

  const setStatus = useCallback(async (
    castId: string, date: string,
    status: Exclude<AttendanceStatus, 'unconfirmed'>, douhanTime?: string,
  ) => {
    if (!canEdit) return;
    const key = `${castId}__${date}`;
    setSaving(key);
    try {
      await upsertAttendance({ storeId, castId, date, status, douhanTime });
      // ローカル反映（再取得を避け即時更新）
      setAttendance(prev => {
        const next = new Map(prev);
        const existing = next.get(key) ?? {};
        next.set(key, mergeAttendanceData(existing, status, douhanTime));
        return next;
      });
    } catch {
      setError('出欠の保存に失敗しました');
    } finally {
      setSaving(null);
    }
  }, [canEdit, storeId]);

  // 当日シフト（今日, 確定/公開）
  const today = todayStr();
  const todaysShifts = useMemo(
    () => confirmedShifts
      .filter(s => s.storeId === storeId && s.date === today)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [confirmedShifts, storeId, today],
  );

  const daySummary = useMemo(() => {
    let present = 0, unconfirmed = 0, absent = 0;
    for (const s of todaysShifts) {
      const st = statusOf(s.castId, today);
      if (st === 'unconfirmed') unconfirmed++;
      else if (st === 'absent' || st === 'same_day_absence') absent++;
      else present++;
    }
    return { total: todaysShifts.length, present, unconfirmed, absent };
  }, [todaysShifts, statusOf, today]);

  if (loading) return <div className="p-4 text-sm text-ink-tertiary">読み込み中…</div>;

  return (
    <div className="p-4 space-y-4 animate-fade-in-up">
      {error && <div className="glass rounded-xl p-3 text-sm text-red-700 bg-red-50">{error}</div>}

      {/* View switch */}
      <div className="flex gap-2">
        {(['day', 'month'] as View[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-xl text-sm transition-all ${
              view === v ? 'bg-brand text-white font-bold shadow-soft' : 'glass text-ink-secondary'
            }`}
          >
            {v === 'day' ? '当日' : '月次'}
          </button>
        ))}
      </div>

      {view === 'day' ? (
        <>
          <div className="grid grid-cols-4 gap-2">
            {[
              ['予定', daySummary.total],
              ['出勤', daySummary.present],
              ['未確認', daySummary.unconfirmed],
              ['欠勤', daySummary.absent],
            ].map(([label, n]) => (
              <div key={label as string} className="glass rounded-xl p-2 text-center shadow-soft">
                <p className="text-[10px] text-ink-tertiary">{label}</p>
                <p className="font-mincho text-lg font-bold text-ink">{n}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {todaysShifts.length === 0 && (
              <p className="text-sm text-ink-tertiary">本日の出勤予定はありません。</p>
            )}
            {todaysShifts.map(s => (
              <AttendanceRow
                key={s.castId}
                name={castName.get(s.castId) ?? s.castId}
                sub={`${s.startTime}–${s.endTime}`}
                status={statusOf(s.castId, today)}
                saving={saving === `${s.castId}__${today}`}
                canEdit={canEdit}
                onSelect={(st, dt) => setStatus(s.castId, today, st, dt)}
              />
            ))}
          </div>
        </>
      ) : (
        <MonthGrid
          month={month}
          onMonthChange={setMonth}
          casts={casts}
          statusOf={statusOf}
          canEdit={canEdit}
          onSelect={(castId, date, st, dt) => setStatus(castId, date, st, dt)}
          savingKey={saving}
        />
      )}
    </div>
  );
}

// ── 出欠1行（区分ピッカー付き）─────────────────────────────────────────────
function AttendanceRow(props: {
  name: string; sub: string; status: AttendanceStatus;
  saving: boolean; canEdit: boolean;
  onSelect: (status: Exclude<AttendanceStatus, 'unconfirmed'>, douhanTime?: string) => void;
}) {
  const { name, sub, status, saving, canEdit, onSelect } = props;
  const [open, setOpen] = useState(false);
  const [douhanTime, setDouhanTime] = useState('19:00');

  return (
    <div className="glass rounded-xl p-3 shadow-soft">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-ink">{name}</p>
          <p className="text-xs text-ink-tertiary">{sub}</p>
        </div>
        <button
          disabled={!canEdit || saving}
          onClick={() => setOpen(o => !o)}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold ${STATUS_CLASS[status]} ${
            canEdit ? '' : 'opacity-100'
          }`}
        >
          {saving ? '保存中…' : STATUS_LABEL[status]}
        </button>
      </div>
      {open && canEdit && (
        <div className="mt-3 space-y-2 border-t border-ink/10 pt-3">
          <div className="flex flex-wrap gap-1.5">
            {ATTENDANCE_STATUSES.map(st => (
              <button
                key={st}
                onClick={() => {
                  onSelect(st, st === 'douhan' ? douhanTime : undefined);
                  setOpen(false);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs ${STATUS_CLASS[st]}`}
              >
                {STATUS_LABEL[st]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            同伴時刻
            <input
              type="time"
              value={douhanTime}
              onChange={e => setDouhanTime(e.target.value)}
              className="glass rounded-md px-2 py-1 text-xs"
            />
          </label>
        </div>
      )}
    </div>
  );
}

// ── 月次グリッド ─────────────────────────────────────────────────────────────
function MonthGrid(props: {
  month: string;
  onMonthChange: (m: string) => void;
  casts: StoreCast[];
  statusOf: (castId: string, date: string) => AttendanceStatus;
  canEdit: boolean;
  onSelect: (castId: string, date: string, status: Exclude<AttendanceStatus, 'unconfirmed'>, douhanTime?: string) => void;
  savingKey: string | null;
}) {
  const { month, onMonthChange, casts, statusOf, canEdit, onSelect } = props;
  const [sel, setSel] = useState<{ castId: string; date: string } | null>(null);
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => {
    const d = String(i + 1).padStart(2, '0');
    return `${month}-${d}`;
  });

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const nd = new Date(y, m - 1 + delta, 1);
    onMonthChange(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => shiftMonth(-1)} className="glass rounded-lg px-3 py-1 text-sm">‹</button>
        <span className="font-mincho font-bold text-ink">{formatMonth(month)}</span>
        <button onClick={() => shiftMonth(1)} className="glass rounded-lg px-3 py-1 text-sm">›</button>
      </div>
      <div className="overflow-auto">
        <table className="text-[10px] border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white/80 px-1 py-1 text-left">キャスト</th>
              {days.map(d => (
                <th key={d} className="px-1 py-1 w-6 text-center text-ink-tertiary">
                  {Number(d.slice(-2))}<br />{dow(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {casts.map(c => (
              <tr key={c.id}>
                <td className="sticky left-0 bg-white/80 px-1 py-1 whitespace-nowrap">{c.name}</td>
                {days.map(d => {
                  const st = statusOf(c.id, d);
                  return (
                    <td key={d} className="p-0.5 text-center">
                      <button
                        disabled={!canEdit}
                        onClick={() => setSel({ castId: c.id, date: d })}
                        className={`w-5 h-5 rounded ${STATUS_CLASS[st]}`}
                        title={`${c.name} ${d} ${STATUS_LABEL[st]}`}
                      >
                        {st === 'unconfirmed' ? '' : STATUS_LABEL[st].charAt(0)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && canEdit && (
        <div className="glass rounded-xl p-3 shadow-elevated space-y-2">
          <p className="text-sm font-medium text-ink">
            {casts.find(c => c.id === sel.castId)?.name} / {sel.date}（{dow(sel.date)}）
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ATTENDANCE_STATUSES.map(st => (
              <button
                key={st}
                onClick={() => {
                  onSelect(sel.castId, sel.date, st, st === 'douhan' ? '19:00' : undefined);
                  setSel(null);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs ${STATUS_CLASS[st]}`}
              >
                {STATUS_LABEL[st]}
              </button>
            ))}
            <button onClick={() => setSel(null)} className="px-2.5 py-1 rounded-lg text-xs glass text-ink-secondary">閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 型チェック（ビルド）で検証**

Run: `npm run build`
Expected: 成功（TypeScript/未使用importなし）。

- [ ] **Step 3: コミット**

```bash
git add src/components/ShiftAttendanceBoard.tsx
git commit -m "feat: 共有シフト×出欠ボード(当日点呼+月次グリッド)"
```

---

## Task 6: 黒服の導線（ページ・タブ・ルート）

**Files:**
- Create: `app/src/pages/kurofuku/KurofukuShiftBoardPage.tsx`
- Modify: `app/src/components/KurofukuLayout.tsx:6-10`
- Modify: `app/src/App.tsx:136-139`

- [ ] **Step 1: 黒服ページを作成**

`app/src/pages/kurofuku/KurofukuShiftBoardPage.tsx` を新規作成：

```tsx
import { useAuth } from '../../store/AuthContext';
import { ShiftAttendanceBoard } from '../../components/ShiftAttendanceBoard';

export function KurofukuShiftBoardPage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="space-y-2">
      <div className="px-4 pt-4">
        <h2 className="font-mincho text-xl font-bold text-ink">シフト / 出欠</h2>
        <p className="text-xs text-ink-tertiary mt-0.5">所属店の全キャスト</p>
      </div>
      <ShiftAttendanceBoard storeId={user.storeId} canEdit currentUserId={user.id} />
    </div>
  );
}
```

- [ ] **Step 2: 黒服タブを追加**

`app/src/components/KurofukuLayout.tsx` の `tabs` 配列を変更（`CalendarIcon` は既存 import）：

```tsx
const tabs = [
  { path: '/kurofuku/casts', label: '担当キャスト', Icon: UsersIcon },
  { path: '/kurofuku/board', label: 'シフト/出欠', Icon: CalendarIcon },
  { path: '/kurofuku/attendance', label: '自分の勤怠', Icon: CalendarIcon },
  { path: '/kurofuku/qr', label: '自分のQR', Icon: QrCodeIcon },
];
```

- [ ] **Step 3: 黒服ルートを追加**

`app/src/App.tsx` の import 群に追加：

```tsx
import { KurofukuShiftBoardPage } from './pages/kurofuku/KurofukuShiftBoardPage';
```

Kurofuku routes ブロック（`<Route path="casts" ...>` の直後）に追加：

```tsx
        <Route path="board" element={<KurofukuShiftBoardPage />} />
```

- [ ] **Step 4: 型チェック（ビルド）で検証**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 5: コミット**

```bash
git add src/pages/kurofuku/KurofukuShiftBoardPage.tsx src/components/KurofukuLayout.tsx src/App.tsx
git commit -m "feat: 黒服にシフト/出欠タブ・ルートを追加(全店・編集可)"
```

---

## Task 7: 管理者の導線（ボード統合）

**Files:**
- Create: `app/src/pages/admin/ShiftAttendanceBoardPage.tsx`
- Modify: `app/src/App.tsx`（admin routes）
- Modify: `app/src/pages/admin/AttendanceAdminPage.tsx`（先頭にボードへのリンク）

- [ ] **Step 1: 管理者ページを作成**

`app/src/pages/admin/ShiftAttendanceBoardPage.tsx` を新規作成：

```tsx
import { useAuth } from '../../store/AuthContext';
import { ShiftAttendanceBoard } from '../../components/ShiftAttendanceBoard';

export function ShiftAttendanceBoardPage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="space-y-2">
      <div className="px-4 pt-4">
        <h2 className="font-mincho text-xl font-bold text-ink">シフト / 出欠ボード</h2>
        <p className="text-xs text-ink-tertiary mt-0.5">当日点呼・月次一覧</p>
      </div>
      <ShiftAttendanceBoard storeId={user.storeId} canEdit currentUserId={user.id} />
    </div>
  );
}
```

- [ ] **Step 2: 管理者ルートを追加**

`app/src/App.tsx` の import 群に追加：

```tsx
import { ShiftAttendanceBoardPage } from './pages/admin/ShiftAttendanceBoardPage';
```

Admin routes ブロック（`<Route path="attendance" ...>` の直後）に追加：

```tsx
        <Route path="attendance-board" element={<ShiftAttendanceBoardPage />} />
```

- [ ] **Step 3: 勤怠管理ページからボードへの導線を追加**

`app/src/pages/admin/AttendanceAdminPage.tsx` の import に `Link` を追加（`react-router-dom` から）し、ページ最上部の見出し直後に導線を追加。既存の JSX ルート要素の先頭に以下を挿入：

```tsx
import { Link } from 'react-router-dom';
```

コンポーネントの返却 JSX の先頭付近（最初の見出しブロックの直後）に：

```tsx
      <Link
        to="/admin/attendance-board"
        className="glass rounded-xl px-4 py-2 text-sm text-brand font-medium inline-block shadow-soft"
      >
        シフト / 出欠ボードを開く →
      </Link>
```

- [ ] **Step 4: 型チェック（ビルド）で検証**

Run: `npm run build`
Expected: 成功。`Link` 追加で既存の他 import と重複しないことを確認（既に import 済みなら二重 import しない）。

- [ ] **Step 5: コミット**

```bash
git add src/pages/admin/ShiftAttendanceBoardPage.tsx src/App.tsx src/pages/admin/AttendanceAdminPage.tsx
git commit -m "feat: 管理者にシフト/出欠ボードを統合"
```

---

## Task 8: 黒服の全店 RLS ポリシー

**Files:**
- Create: `app/supabase/migrations/0014_kurofuku_shift_attendance_rls.sql`

現状（`0005`/`0006`）は kurofuku の `casts`/`daily_records`/`shifts` SELECT が「担当のみ(manager_id=auth.uid())」、書込は admin 限定。黒服の**全店 SELECT** と **shifts/daily_records の書込**を追加する。ヘルパ関数 `current_role_name()` / `current_store_id()` は既存。

- [ ] **Step 1: マイグレーションを作成**

`app/supabase/migrations/0014_kurofuku_shift_attendance_rls.sql` を新規作成：

```sql
-- 黒服(kurofuku)にシフト/出欠ボード用の全店アクセスを付与する。
-- RLS ポリシーは OR で評価されるため、既存の「担当のみ」ポリシーを残したまま
-- 店舗単位の広いポリシーを追加する。

-- casts: 黒服が自店の全キャストを閲覧
create policy casts_kurofuku_store_select on public.casts
  for select using (
    current_role_name() = 'kurofuku' and store_id = current_store_id()
  );

-- daily_records: 黒服が自店の出欠を閲覧・記録（SELECT / INSERT / UPDATE）
create policy daily_records_kurofuku_store_select on public.daily_records
  for select using (
    current_role_name() = 'kurofuku' and store_id = current_store_id()
  );
create policy daily_records_kurofuku_store_insert on public.daily_records
  for insert with check (
    current_role_name() = 'kurofuku' and store_id = current_store_id()
  );
create policy daily_records_kurofuku_store_update on public.daily_records
  for update using (
    current_role_name() = 'kurofuku' and store_id = current_store_id()
  ) with check (
    current_role_name() = 'kurofuku' and store_id = current_store_id()
  );

-- shifts: 黒服が自店のシフトを閲覧・即時変更（SELECT / INSERT / UPDATE / DELETE）
create policy shifts_kurofuku_store_select on public.shifts
  for select using (
    current_role_name() = 'kurofuku' and store_id = current_store_id()
  );
create policy shifts_kurofuku_store_insert on public.shifts
  for insert with check (
    current_role_name() = 'kurofuku' and store_id = current_store_id()
  );
create policy shifts_kurofuku_store_update on public.shifts
  for update using (
    current_role_name() = 'kurofuku' and store_id = current_store_id()
  ) with check (
    current_role_name() = 'kurofuku' and store_id = current_store_id()
  );
create policy shifts_kurofuku_store_delete on public.shifts
  for delete using (
    current_role_name() = 'kurofuku' and store_id = current_store_id()
  );
```

- [ ] **Step 2: ポリシー名の重複がないか確認**

Run: `grep -rn "kurofuku_store" supabase/migrations/`
Expected: `0014` 以外にヒットしない（ポリシー名の一意性）。

- [ ] **Step 3: コミット**

```bash
git add supabase/migrations/0014_kurofuku_shift_attendance_rls.sql
git commit -m "feat: 黒服の全店シフト/出欠 RLS ポリシー(0014)"
```

- [ ] **Step 4: 適用（手動・要ユーザー確認）**

このマイグレーションは Supabase 本番へ適用が必要。適用手順（`supabase db push` または Supabase ダッシュボードの SQL エディタで実行）はユーザーに確認・依頼する。**適用前は黒服から他担当のキャストが見えず、書込が 403 になる**点に注意。

---

## Task 9: 統合検証

**Files:** なし（検証のみ）

- [ ] **Step 1: 全テスト**

Run: `npm test`
Expected: 既存＋新規（`attendanceStatus.test.ts`）すべて PASS。

- [ ] **Step 2: 型チェック/ビルド**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: 手動確認（`npm run dev`）**

以下を確認：
- 黒服ログイン → 「シフト/出欠」タブ → 当日ビューに本日の出勤予定が全店分表示。区分トグルで出勤/同伴(時刻)/遅刻/欠勤/当欠を切替でき、バッジ色が変わる。
- 月次ビューでグリッド表示、セルタップで区分変更。
- 管理者ログイン → 勤怠管理 → 「シフト/出欠ボードを開く」→ 同ボード表示・編集可。
- 出欠を記録した日について、実績入力（PerformanceEntry）で売上を入れても出欠が消えない／その逆（非破壊）。

- [ ] **Step 4: 完了コミット（必要なら）**

```bash
git add -A
git commit -m "test: シフト×出欠ボード 統合検証" || echo "no changes"
```

---

## Task 10: 黒服のシフト即時変更（時刻編集・追加・削除）

**Files:**
- Modify: `app/src/components/ShiftAttendanceBoard.tsx`

当日ビューで、確定シフトの開始/終了時刻編集・シフト追加・削除を `ShiftContext` 経由で即時反映する。監査のため `updatedBy`(currentUserId)/`updatedAt`(ISO) を付与（Task4）。

- [ ] **Step 1: `useShift` から削除関数を取得**

`ShiftAttendanceBoard` 冒頭の分割代入を変更：

```tsx
  const { confirmedShifts, confirmShift, removeConfirmedShift } = useShift();
```

- [ ] **Step 2: シフト保存/削除ハンドラを追加**

`setStatus` の `useCallback` 定義の直後に追記：

```tsx
  const saveShift = useCallback((castId: string, date: string, startTime: string, endTime: string) => {
    if (!canEdit) return;
    const existing = confirmedShifts.find(s => s.storeId === storeId && s.castId === castId && s.date === date);
    confirmShift({
      id: existing?.id ?? `cs_${castId}_${date}_${Date.now()}`,
      storeId, castId, date, startTime, endTime,
      published: existing?.published ?? true,
      updatedBy: currentUserId,
      updatedAt: new Date().toISOString(),
    });
  }, [canEdit, confirmedShifts, storeId, confirmShift, currentUserId]);

  const deleteShift = useCallback((castId: string, date: string) => {
    if (!canEdit) return;
    const existing = confirmedShifts.find(s => s.storeId === storeId && s.castId === castId && s.date === date);
    if (existing) removeConfirmedShift(existing.id);
  }, [canEdit, confirmedShifts, storeId, removeConfirmedShift]);
```

- [ ] **Step 3: 当日ビューの行にシフト編集を渡す**

当日ビューの `todaysShifts.map(...)` ブロックを次に置換：

```tsx
            {todaysShifts.map(s => (
              <AttendanceRow
                key={s.castId}
                name={castName.get(s.castId) ?? s.castId}
                startTime={s.startTime}
                endTime={s.endTime}
                status={statusOf(s.castId, today)}
                saving={saving === `${s.castId}__${today}`}
                canEdit={canEdit}
                onSelect={(st, dt) => setStatus(s.castId, today, st, dt)}
                onSaveTimes={(st2, et) => saveShift(s.castId, today, st2, et)}
                onDeleteShift={() => deleteShift(s.castId, today)}
              />
            ))}
            {canEdit && (
              <AddShiftControl
                casts={casts.filter(c => !todaysShifts.some(s => s.castId === c.id))}
                onAdd={(castId, st, et) => saveShift(castId, today, st, et)}
              />
            )}
```

- [ ] **Step 4: `AttendanceRow` を時刻編集対応に置換**

`AttendanceRow` 関数全体を次に置換：

```tsx
function AttendanceRow(props: {
  name: string; startTime: string; endTime: string; status: AttendanceStatus;
  saving: boolean; canEdit: boolean;
  onSelect: (status: Exclude<AttendanceStatus, 'unconfirmed'>, douhanTime?: string) => void;
  onSaveTimes: (startTime: string, endTime: string) => void;
  onDeleteShift: () => void;
}) {
  const { name, startTime, endTime, status, saving, canEdit, onSelect, onSaveTimes, onDeleteShift } = props;
  const [open, setOpen] = useState(false);
  const [douhanTime, setDouhanTime] = useState('19:00');
  const [st, setSt] = useState(startTime);
  const [et, setEt] = useState(endTime);

  return (
    <div className="glass rounded-xl p-3 shadow-soft">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-ink">{name}</p>
          <p className="text-xs text-ink-tertiary">{startTime}–{endTime}</p>
        </div>
        <button
          disabled={!canEdit || saving}
          onClick={() => setOpen(o => !o)}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold ${STATUS_CLASS[status]}`}
        >
          {saving ? '保存中…' : STATUS_LABEL[status]}
        </button>
      </div>
      {open && canEdit && (
        <div className="mt-3 space-y-3 border-t border-ink/10 pt-3">
          {/* 出欠区分 */}
          <div className="flex flex-wrap gap-1.5">
            {ATTENDANCE_STATUSES.map(s => (
              <button
                key={s}
                onClick={() => { onSelect(s, s === 'douhan' ? douhanTime : undefined); setOpen(false); }}
                className={`px-2.5 py-1 rounded-lg text-xs ${STATUS_CLASS[s]}`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            同伴時刻
            <input type="time" value={douhanTime} onChange={e => setDouhanTime(e.target.value)}
              className="glass rounded-md px-2 py-1 text-xs" />
          </label>
          {/* シフト時刻編集 */}
          <div className="flex items-center gap-2 text-xs text-ink-secondary">
            <input type="time" value={st} onChange={e => setSt(e.target.value)} className="glass rounded-md px-2 py-1 text-xs" />
            <span>–</span>
            <input type="time" value={et} onChange={e => setEt(e.target.value)} className="glass rounded-md px-2 py-1 text-xs" />
            <button onClick={() => onSaveTimes(st, et)} className="px-2.5 py-1 rounded-lg text-xs bg-brand text-white font-bold">時刻保存</button>
            <button onClick={onDeleteShift} className="px-2.5 py-1 rounded-lg text-xs bg-red-100 text-red-700">シフト削除</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `AddShiftControl` を追加**

`ShiftAttendanceBoard.tsx` の末尾に追記：

```tsx
// ── 当日シフト追加（未予定キャスト）─────────────────────────────────────────
function AddShiftControl(props: {
  casts: StoreCast[];
  onAdd: (castId: string, startTime: string, endTime: string) => void;
}) {
  const { casts, onAdd } = props;
  const [castId, setCastId] = useState('');
  const [st, setSt] = useState('20:00');
  const [et, setEt] = useState('01:00');
  if (casts.length === 0) return null;
  return (
    <div className="glass rounded-xl p-3 shadow-soft space-y-2">
      <p className="text-xs font-medium text-ink-secondary">当日シフトを追加</p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={castId} onChange={e => setCastId(e.target.value)} className="glass rounded-md px-2 py-1">
          <option value="">キャスト選択</option>
          {casts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="time" value={st} onChange={e => setSt(e.target.value)} className="glass rounded-md px-2 py-1" />
        <span>–</span>
        <input type="time" value={et} onChange={e => setEt(e.target.value)} className="glass rounded-md px-2 py-1" />
        <button
          disabled={!castId}
          onClick={() => { onAdd(castId, st, et); setCastId(''); }}
          className="px-2.5 py-1 rounded-lg bg-brand text-white font-bold disabled:opacity-40"
        >
          追加
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 型チェック（ビルド）で検証**

Run: `npm run build`
Expected: 成功（`AttendanceRow` の新 props、`AddShiftControl`、`saveShift`/`deleteShift` の型整合）。

- [ ] **Step 7: 手動確認（`npm run dev`）**

黒服の当日ビューで、行を開くと時刻編集＋シフト削除が可能。「当日シフトを追加」で未予定キャストを追加でき、追加後は行として出現し出欠記録も可能。

- [ ] **Step 8: コミット**

```bash
git add src/components/ShiftAttendanceBoard.tsx
git commit -m "feat: 黒服の当日シフト即時変更(時刻編集・追加・削除)"
```

---

## Self-Review メモ

- **Spec coverage:** 5区分(Task1) / 非破壊マージ(Task2) / 全店取得・upsert(Task3) / 監査項目(Task4) / 当日+月次UI(Task5) / 黒服全店・即時出欠(Task6) / 管理者統合(Task7) / RLS(Task8) / 統合検証(Task9) / **黒服のシフト即時変更＝時刻編集・追加・削除(Task10)** をカバー。出勤率(遅刻・同伴=出勤)は `countsAsAttended` で担保。
- **同伴時刻→実開始:** `daily_records.data.douhanTime` に保存（実働計算は既存給与エンジンが `hours`/`douhanTime` を参照する範囲で反映。給与ロジック自体は本計画では変更しない＝マスタ駆動を維持）。
- **型整合:** `AttendanceStatus` / `statusToFields` / `fieldsToStatus` / `mergeAttendanceData` / `fetchStoreCasts` / `fetchMonthAttendance` / `upsertAttendance` / `StoreCast` / `ConfirmedShift.updatedBy/updatedAt` を一貫使用。`AttendanceRow` は Task10 で props 拡張（`sub` を廃し `startTime`/`endTime` に置換）。
- **月次のシフト構成変更:** 月次グリッドは出欠記録＋当日シフト編集を優先。翌月以降のシフト構成（希望→確定→公開）は既存 `ShiftManagementPage`（管理者）で運用（YAGNI）。
