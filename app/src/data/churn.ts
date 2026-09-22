import { supabase } from '../lib/supabase';
import { periodKey, periodRange } from '../lib/targets';
import { assessChurnRisk, type ChurnLevel } from '../lib/churnRisk';

export interface ChurnRiskItem {
  castId: string;
  sourceName: string;
  level: ChurnLevel;
  reasons: string[];
}

/**
 * 当月と前月の per-cast 売上/出勤日数を集計し、離脱リスクを判定して返す。
 * level が 'none' のキャストは除外。high → medium の順にソートして返す。
 * 当月固定で判定（ダッシュボードの期間トグルとは独立）。
 */
export async function fetchChurnRisks(storeId: string): Promise<ChurnRiskItem[]> {
  const now = new Date();
  // 当月キー（JST）
  const curKey = periodKey(now, 'month');
  const { start: curStart, end: curEnd } = periodRange(curKey, 'month');

  // 前月キー（JST）
  const jst = new Date(now.getTime() + 9 * 3600_000);
  const curYear = jst.getUTCFullYear();
  const curMonth = jst.getUTCMonth() + 1; // 1-based
  const prevYear = curMonth === 1 ? curYear - 1 : curYear;
  const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
  const prevKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  const { start: prevStart, end: prevEnd } = periodRange(prevKey, 'month');

  // 並列取得: 当月daily・前月daily・キャスト名
  const [{ data: curDr, error: e1 }, { data: prevDr, error: e2 }, { data: casts, error: e3 }] =
    await Promise.all([
      supabase.from('daily_records').select('date, data').eq('store_id', storeId)
        .gte('date', curStart).lte('date', curEnd),
      supabase.from('daily_records').select('date, data').eq('store_id', storeId)
        .gte('date', prevStart).lte('date', prevEnd),
      supabase.from('casts').select('id, source_name').eq('store_id', storeId),
    ]);

  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;

  const nameMap = new Map<string, string>();
  for (const c of casts ?? []) {
    nameMap.set(c.id as string, c.source_name as string);
  }

  // 当月: cast別売上合算・出勤日数カウント
  const curSales = new Map<string, number>();
  const curAttended = new Map<string, number>();
  for (const r of curDr ?? []) {
    const d = (r.data ?? {}) as Record<string, unknown>;
    const cid = d.castId as string;
    if (!cid) continue;
    curSales.set(cid, (curSales.get(cid) ?? 0) + (Number(d.nominatedSales) || 0) + (Number(d.freeSales) || 0));
    if (d.attended === true && d.isAbsent !== true) {
      curAttended.set(cid, (curAttended.get(cid) ?? 0) + 1);
    }
  }

  // 前月: cast別売上合算・出勤日数カウント
  const prevSales = new Map<string, number>();
  const prevAttended = new Map<string, number>();
  for (const r of prevDr ?? []) {
    const d = (r.data ?? {}) as Record<string, unknown>;
    const cid = d.castId as string;
    if (!cid) continue;
    prevSales.set(cid, (prevSales.get(cid) ?? 0) + (Number(d.nominatedSales) || 0) + (Number(d.freeSales) || 0));
    if (d.attended === true && d.isAbsent !== true) {
      prevAttended.set(cid, (prevAttended.get(cid) ?? 0) + 1);
    }
  }

  // 前月に出勤実績があるキャストを対象とする（前月データ無しは判定不能）
  const castIds = new Set<string>([...prevAttended.keys(), ...prevSales.keys()]);

  const results: ChurnRiskItem[] = [];
  for (const castId of castIds) {
    const { level, reasons } = assessChurnRisk({
      salesCur: curSales.get(castId) ?? 0,
      salesPrev: prevSales.get(castId) ?? 0,
      attendedCur: curAttended.get(castId) ?? 0,
      attendedPrev: prevAttended.get(castId) ?? 0,
    });
    if (level !== 'none') {
      results.push({
        castId,
        sourceName: nameMap.get(castId) ?? castId,
        level,
        reasons,
      });
    }
  }

  // high → medium の順でソート
  const order: Record<ChurnLevel, number> = { high: 0, medium: 1, none: 2 };
  results.sort((a, b) => order[a.level] - order[b.level]);

  return results;
}
