/**
 * manager.ts — 黒服（kurofuku）が担当するキャストのデータ取得
 * RLS により manager_id = auth.uid() のキャストのみ返る。
 */

import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface ManagedCast {
  id: string;
  source_name: string;
  rank: string;
  join_date: string;
  status: string;
}

export interface CastDailyRecord {
  date: string;
  nominatedSales: number;
  freeSales: number;
  honShimei: number;
  banaiShimei: number;
  douhan: number;
  drinks: number;
  bottles: number;
  extensions: number;
  hours: number;
  isLate: boolean;
  isAbsent: boolean;
  attended: boolean;
  attendanceType: string;
  advancePay: number;
}

export interface CastShift {
  id: string;
  cast_id: string;
  date: string;
  status: string;
  startTime: string;
  endTime: string;
}

// ---------------------------------------------------------------------------
// 純関数（売上集計）
// ---------------------------------------------------------------------------

/** 1日の売上 = 本指名売上 + フリー売上 */
export function dailySales(rec: Pick<CastDailyRecord, 'nominatedSales' | 'freeSales'>): number {
  return (rec.nominatedSales ?? 0) + (rec.freeSales ?? 0);
}

/** 複数日の売上合計 */
export function sumSales(records: Pick<CastDailyRecord, 'nominatedSales' | 'freeSales'>[]): number {
  return records.reduce((acc, r) => acc + dailySales(r), 0);
}

/** 複数日の売上平均（0件なら0） */
export function avgSales(records: Pick<CastDailyRecord, 'nominatedSales' | 'freeSales'>[]): number {
  if (records.length === 0) return 0;
  return Math.round(sumSales(records) / records.length);
}

// ---------------------------------------------------------------------------
// データ取得
// ---------------------------------------------------------------------------

/** 翌月1日の YYYY-MM-DD を返す（月フィルタ上限に使用） */
function nextMonthFirstDay(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

/** 自分（kurofuku）が担当するキャスト一覧を取得（RLSで自動スコープ） */
export async function fetchManagedCasts(): Promise<ManagedCast[]> {
  const { data, error } = await supabase
    .from('casts')
    .select('id, source_name, rank, join_date, status')
    .order('source_name');
  if (error) throw error;
  return (data ?? []) as ManagedCast[];
}

/** 指定キャストの月別 daily_records を取得 */
export async function fetchCastDailyRecords(
  castId: string,
  month: string,
): Promise<CastDailyRecord[]> {
  const { data, error } = await supabase
    .from('daily_records')
    .select('date, data')
    .eq('cast_id', castId)
    .gte('date', `${month}-01`)
    .lt('date', nextMonthFirstDay(month))
    .order('date');
  if (error) throw error;

  return (data ?? []).map((row: { date: string; data: Record<string, unknown> }) => {
    const d = row.data;
    return {
      date: row.date,
      nominatedSales: (d.nominatedSales as number) ?? 0,
      freeSales: (d.freeSales as number) ?? 0,
      honShimei: (d.honShimei as number) ?? 0,
      banaiShimei: (d.banaiShimei as number) ?? 0,
      douhan: (d.douhan as number) ?? 0,
      drinks: (d.drinks as number) ?? 0,
      bottles: (d.bottles as number) ?? 0,
      extensions: (d.extensions as number) ?? 0,
      hours: (d.hours as number) ?? 0,
      isLate: (d.isLate as boolean) ?? false,
      isAbsent: (d.isAbsent as boolean) ?? false,
      attended: (d.attended as boolean) ?? false,
      attendanceType: (d.attendanceType as string) ?? 'normal',
      advancePay: (d.advancePay as number) ?? 0,
    } satisfies CastDailyRecord;
  });
}

/** 指定キャストの月別 shifts を取得 */
export async function fetchCastShifts(
  castId: string,
  month: string,
): Promise<CastShift[]> {
  const { data, error } = await supabase
    .from('shifts')
    .select('id, cast_id, date, status, data')
    .eq('cast_id', castId)
    .gte('date', `${month}-01`)
    .lt('date', nextMonthFirstDay(month))
    .order('date');
  if (error) throw error;

  return (data ?? []).map((row: { id: string; cast_id: string; date: string; status: string; data: Record<string, unknown> }) => {
    const d = row.data ?? {};
    return {
      id: row.id,
      cast_id: row.cast_id,
      date: row.date,
      status: row.status,
      startTime: (d.startTime as string) ?? '20:00',
      endTime: (d.endTime as string) ?? '01:00',
    } satisfies CastShift;
  });
}
