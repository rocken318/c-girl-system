/**
 * data/dsystemImport.ts
 * Dシステム取込 — キャスト突合 & Supabase daily_records upsert
 */
import { supabase } from '../lib/supabase';
import type { MappedRow } from '../lib/dsystemImport';

// ---------------------------------------------------------------------------
// fetchCastMap
// ---------------------------------------------------------------------------

/**
 * アクティブ店舗の casts を取得し、
 * `source_name（正規化: trim+小文字）→ cast_id` の Map を返す。
 */
export async function fetchCastMap(storeId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('casts')
    .select('id, source_name')
    .eq('store_id', storeId)
    .eq('status', 'active');

  if (error) throw new Error(`fetchCastMap エラー: ${error.message}`);

  const map = new Map<string, string>();
  for (const cast of data ?? []) {
    if (cast.source_name) {
      map.set(cast.source_name.trim().toLowerCase(), cast.id);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// 売上・本数フィールドのみ（hours/attendance 系を壊さない）
// ---------------------------------------------------------------------------

type SalesFields = {
  nominatedSales: number;
  freeSales: number;
  honShimei: number;
  banaiShimei: number;
  douhan: number;
  drinks: number;
  bottles: number;
  extensions: number;
};

function extractSalesFields(row: MappedRow): SalesFields {
  return {
    nominatedSales: row.nominatedSales,
    freeSales: row.freeSales,
    honShimei: row.honShimei,
    banaiShimei: row.banaiShimei,
    douhan: row.douhan,
    drinks: row.drinks,
    bottles: row.bottles,
    extensions: row.extensions,
  };
}

// ---------------------------------------------------------------------------
// importDailyFromMapped
// ---------------------------------------------------------------------------

export type ImportResult = {
  ok: number;
  unmatched: string[];
  errors: string[];
};

/**
 * MappedRow[] を daily_records に取込む。
 * - cast_id 解決: castMap（source_name 正規化済み）で突合。
 *   未一致の sourceName は unmatched に積みスキップ。
 * - upsert: (cast_id, date) で既存を検索し、
 *   存在する場合は売上/本数フィールドのみ上書き（attendance 系は保持）。
 *   存在しない場合は insert（attended:true, isAbsent:false, hours:0, ... の初期値付き）。
 */
export async function importDailyFromMapped(
  storeId: string,
  mapped: MappedRow[],
  castMap: Map<string, string>
): Promise<ImportResult> {
  let ok = 0;
  const unmatched: string[] = [];
  const errors: string[] = [];

  for (const row of mapped) {
    // キャスト突合
    const normalizedName = row.sourceName.trim().toLowerCase();
    const castId = castMap.get(normalizedName);
    if (!castId) {
      if (!unmatched.includes(row.sourceName)) {
        unmatched.push(row.sourceName);
      }
      continue;
    }

    const salesFields = extractSalesFields(row);

    try {
      // 既存レコードを検索
      const { data: existing, error: selectErr } = await supabase
        .from('daily_records')
        .select('id, data')
        .eq('cast_id', castId)
        .eq('date', row.date)
        .eq('store_id', storeId)
        .maybeSingle();

      if (selectErr) {
        errors.push(`${row.sourceName} ${row.date}: 検索エラー — ${selectErr.message}`);
        continue;
      }

      if (existing) {
        // 既存あり: 売上/本数フィールドのみマージ（attendance 系保持）
        const existingData = existing.data ?? {};
        const mergedData = {
          ...existingData,
          ...salesFields,
          // douhan は本数フィールドとして上書きするが attendanceType は保持
        };
        const { error: updateErr } = await supabase
          .from('daily_records')
          .update({ data: mergedData })
          .eq('id', existing.id);

        if (updateErr) {
          errors.push(`${row.sourceName} ${row.date}: 更新エラー — ${updateErr.message}`);
          continue;
        }
      } else {
        // 新規 insert
        const newData = {
          date: row.date,
          castId,
          storeId,
          attended: true,
          attendanceType: 'normal' as const,
          hours: 0,
          isLate: false,
          isAbsent: false,
          advancePay: 0,
          ...salesFields,
        };
        const { error: insertErr } = await supabase
          .from('daily_records')
          .insert({
            id: crypto.randomUUID(),
            cast_id: castId,
            store_id: storeId,
            date: row.date,
            data: newData,
          });

        if (insertErr) {
          errors.push(`${row.sourceName} ${row.date}: 挿入エラー — ${insertErr.message}`);
          continue;
        }
      }

      ok++;
    } catch (e) {
      errors.push(`${row.sourceName} ${row.date}: 予期せぬエラー — ${String(e)}`);
    }
  }

  return { ok, unmatched, errors };
}
