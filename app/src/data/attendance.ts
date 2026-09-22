import { supabase } from '../lib/supabase';
import { periodRange } from '../lib/targets';
import { attendanceRate } from '../lib/attendance';
import { mergeAttendanceData } from '../lib/attendanceStatus';
import type { AttendanceStatus } from '../lib/attendanceStatus';

export interface CastAttendance { castId: string; attendedDays: number; scheduledDays: number; rate: number | null }

/** 対象店・対象月(YYYY-MM)の cast別 出勤日数/予定日数 */
export async function fetchCastAttendance(storeId: string, month: string): Promise<CastAttendance[]> {
  const { start, end } = periodRange(month, 'month');
  // 実出勤: daily_records attended=true
  const { data: dr, error: e1 } = await supabase
    .from('daily_records').select('date, data').eq('store_id', storeId).gte('date', start).lte('date', end);
  if (e1) throw e1;
  // 予定: shifts status in approved/published
  const { data: sh, error: e2 } = await supabase
    .from('shifts').select('cast_id, date, status').eq('store_id', storeId).gte('date', start).lte('date', end)
    .in('status', ['approved', 'published']);
  if (e2) throw e2;

  const attended = new Map<string, number>();
  for (const r of dr ?? []) {
    const d = (r.data ?? {}) as Record<string, unknown>;
    if (d.attended === true && d.isAbsent !== true) {
      const cid = d.castId as string;
      attended.set(cid, (attended.get(cid) ?? 0) + 1);
    }
  }
  const scheduled = new Map<string, number>();
  for (const s of sh ?? []) {
    const cid = s.cast_id as string;
    scheduled.set(cid, (scheduled.get(cid) ?? 0) + 1);
  }
  const castIds = new Set<string>([...attended.keys(), ...scheduled.keys()]);
  return [...castIds].map((castId) => {
    const a = attended.get(castId) ?? 0;
    const sc = scheduled.get(castId) ?? 0;
    return { castId, attendedDays: a, scheduledDays: sc, rate: attendanceRate(a, sc) };
  });
}

export interface KurofukuKpi { managerId: string; name: string; castCount: number; totalSales: number; avgRate: number | null }

/** admin/統合向け: 黒服別の担当人数/当月合計売上/平均出勤率 */
export async function fetchKurofukuKpis(storeId: string, month: string): Promise<KurofukuKpi[]> {
  const { start, end } = periodRange(month, 'month');
  // 担当関係: casts(manager_id) + 黒服名(profiles)
  const { data: casts, error: e1 } = await supabase
    .from('casts').select('id, manager_id').eq('store_id', storeId).not('manager_id', 'is', null);
  if (e1) throw e1;
  const { data: profs, error: e2 } = await supabase
    .from('profiles').select('id, display_name').eq('store_id', storeId).eq('role', 'kurofuku');
  if (e2) throw e2;
  const nameById = new Map((profs ?? []).map((p: Record<string, unknown>) => [p.id as string, p.display_name as string]));
  // cast別売上(当月)
  const att = await fetchCastAttendance(storeId, month);
  const rateByCast = new Map(att.map((a) => [a.castId, a.rate] as const));
  const { data: dr, error: e3 } = await supabase
    .from('daily_records').select('date, data').eq('store_id', storeId).gte('date', start).lte('date', end);
  if (e3) throw e3;
  const salesByCast = new Map<string, number>();
  for (const r of dr ?? []) {
    const d = (r.data ?? {}) as Record<string, unknown>;
    const cid = d.castId as string;
    salesByCast.set(cid, (salesByCast.get(cid) ?? 0) + (Number(d.nominatedSales) || 0) + (Number(d.freeSales) || 0));
  }
  // 黒服ごとに集計
  const byMgr = new Map<string, string[]>();
  for (const c of casts ?? []) {
    const mgr = c.manager_id as string;
    if (!byMgr.has(mgr)) byMgr.set(mgr, []);
    byMgr.get(mgr)!.push(c.id as string);
  }
  return [...byMgr.entries()].map(([managerId, castIds]) => {
    const totalSales = castIds.reduce((acc, id) => acc + (salesByCast.get(id) ?? 0), 0);
    const rates = castIds.map((id) => rateByCast.get(id)).filter((r): r is number => r !== null && r !== undefined);
    const avgRate = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null;
    return { managerId, name: nameById.get(managerId) ?? '黒服', castCount: castIds.length, totalSales, avgRate };
  });
}

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

/** キー: `${castId}__${date}`、値: 出欠フィールド(camelCase)。売上は含まない。 */
export async function fetchMonthAttendance(
  storeId: string,
  month: string,
): Promise<Map<string, Record<string, unknown>>> {
  const { start, end } = periodRange(month, 'month');
  const { data, error } = await supabase
    .from('attendance_board_view')
    .select('cast_id, date, attended, attendance_type, is_late, is_absent, douhan, douhan_time')
    .eq('store_id', storeId)
    .gte('date', start)
    .lte('date', end);
  if (error) throw error;
  const map = new Map<string, Record<string, unknown>>();
  for (const r of data ?? []) {
    const row = r as {
      cast_id: string; date: string; attended: boolean | null; attendance_type: string | null;
      is_late: boolean | null; is_absent: boolean | null; douhan: number | null; douhan_time: string | null;
    };
    map.set(`${row.cast_id}__${row.date}`, {
      attended: row.attended ?? false,
      isLate: row.is_late ?? false,
      isAbsent: row.is_absent ?? false,
      attendanceType: row.attendance_type ?? 'normal',
      douhan: row.douhan ?? 0,
      douhanTime: row.douhan_time ?? undefined,
    });
  }
  return map;
}

/**
 * 出欠を記録する。出欠専用ビューで現在値を読み、mergeAttendanceData で
 * 出欠フィールドを算出し、record_attendance RPC で更新（売上は RPC 側で保持）。
 */
export async function upsertAttendance(params: {
  storeId: string;
  castId: string;
  date: string;
  status: Exclude<AttendanceStatus, 'unconfirmed'>;
  douhanTime?: string;
}): Promise<void> {
  const { storeId, castId, date, status, douhanTime } = params;

  const { data: rows, error: selErr } = await supabase
    .from('attendance_board_view')
    .select('attended, attendance_type, is_late, is_absent, douhan, douhan_time')
    .eq('store_id', storeId)
    .eq('cast_id', castId)
    .eq('date', date)
    .limit(1);
  if (selErr) throw selErr;

  const r = rows?.[0] as {
    attended: boolean | null; attendance_type: string | null; is_late: boolean | null;
    is_absent: boolean | null; douhan: number | null; douhan_time: string | null;
  } | undefined;
  const existing: Record<string, unknown> = r ? {
    attended: r.attended ?? false,
    isLate: r.is_late ?? false,
    isAbsent: r.is_absent ?? false,
    attendanceType: r.attendance_type ?? 'normal',
    douhan: r.douhan ?? 0,
    douhanTime: r.douhan_time ?? undefined,
  } : {};

  const merged = mergeAttendanceData(existing, status, douhanTime);
  const { error: rpcErr } = await supabase.rpc('record_attendance', {
    p_cast_id: castId,
    p_date: date,
    p_attended: (merged.attended as boolean) ?? false,
    p_is_late: (merged.isLate as boolean) ?? false,
    p_is_absent: (merged.isAbsent as boolean) ?? false,
    p_attendance_type: (merged.attendanceType as string) ?? 'normal',
    p_douhan: (merged.douhan as number) ?? 0,
    p_douhan_time: (merged.douhanTime as string) ?? null,
  });
  if (rpcErr) throw rpcErr;
}
