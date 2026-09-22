import { supabase } from '../lib/supabase';

export interface TimeRecord {
  id: string;
  business_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  worked_minutes: number | null;
}

export interface StoreTimeRecord {
  id: string;
  store_id: string;
  person_id: string;
  business_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  worked_minutes: number | null;
  source: string;
  profiles: { display_name: string } | null;
}

/** admin: 店内全件の勤怠を月で取得（RLS time_records_admin_write で全件可） */
export async function fetchStoreTimeRecords(month: string): Promise<StoreTimeRecord[]> {
  const { data, error } = await supabase
    .from('time_records')
    .select('id,store_id,person_id,business_date,clock_in_at,clock_out_at,worked_minutes,source,profiles(display_name)')
    .gte('business_date', `${month}-01`)
    .lt('business_date', nextMonth(month))
    .order('business_date')
    .order('clock_in_at');
  if (error) throw error;
  // Supabase join は配列で返るので先頭要素に正規化
  return ((data ?? []) as unknown[]).map((row: unknown) => {
    const r = row as Record<string, unknown>;
    const profilesRaw = r['profiles'];
    const profiles = Array.isArray(profilesRaw)
      ? (profilesRaw[0] as { display_name: string } | undefined) ?? null
      : (profilesRaw as { display_name: string } | null);
    return { ...r, profiles } as StoreTimeRecord;
  });
}

/** 自分（RLSで自動スコープ）の勤怠を月で取得 */
export async function fetchMyTimeRecords(month: string): Promise<TimeRecord[]> {
  const { data, error } = await supabase
    .from('time_records')
    .select('id,business_date,clock_in_at,clock_out_at,worked_minutes')
    .gte('business_date', `${month}-01`)
    .lt('business_date', nextMonth(month))
    .order('business_date');
  if (error) throw error;
  return data ?? [];
}

/** 現在の月を JST で YYYY-MM 形式で返す */
export function currentMonthJst(): string {
  // JST = UTC+9
  const now = new Date(Date.now() + 9 * 3600_000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** YYYY-MM → 翌月の YYYY-MM-01 */
function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return `${next}-01`;
}

export function formatWorked(minutes: number | null): string {
  if (minutes === null) return '勤務中';
  return `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}

/** UTC timestamptz 文字列 → JST の HH:mm */
export function toJstHHmm(utc: string): string {
  const d = new Date(utc);
  const jstMs = d.getTime() + 9 * 3600_000;
  const jst = new Date(jstMs);
  const h = String(jst.getUTCHours()).padStart(2, '0');
  const min = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}
