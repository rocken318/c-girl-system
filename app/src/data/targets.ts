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

export interface StoreDaily extends DailyLike { castId: string }
/** 店舗の daily_records を範囲で取得（date/castId/nominatedSales/freeSales） */
export async function fetchStoreDaily(storeId: string, start: string, end: string): Promise<StoreDaily[]> {
  const { data, error } = await supabase.from('daily_records')
    .select('date, data')
    .eq('store_id', storeId).gte('date', start).lte('date', end);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => {
    const d = (r.data ?? {}) as Record<string, unknown>;
    return {
      date: r.date as string,
      castId: d.castId as string,
      nominatedSales: Number(d.nominatedSales) || 0,
      freeSales: Number(d.freeSales) || 0,
    };
  });
}

/** 目標 upsert（自店adminのみ・RLS担保）。scope='store'はcast_id渡さない */
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
