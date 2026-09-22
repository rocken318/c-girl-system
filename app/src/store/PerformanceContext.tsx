import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import {
  initialDailyRecords,
  aggregateToMonthly,
  type DailyRecord,
  type Performance,
} from '../data/seed';
import { supabase } from '../lib/supabase';

interface PerformanceContextType {
  /** 全日別レコード */
  dailyRecords: DailyRecord[];
  loading: boolean;
  /** 月指定で集約した Performance 配列を返す */
  getMonthlyPerformances: (month: string) => Performance[];
  /** 日別レコード1件を追加または更新（id が既存なら上書き） */
  upsertDailyRecord: (record: DailyRecord) => void;
  /** 日別レコード1件を削除 */
  deleteDailyRecord: (id: string) => void;
  /** 月まとめ入力: キャスト×月の全レコードを洗い替え */
  replaceMonthlySummary: (castId: string, storeId: string, month: string, records: DailyRecord[]) => void;
}

const PerformanceContext = createContext<PerformanceContextType | null>(null);

// ---------------------------------------------------------------------------
// Supabase 取得ヘルパー
// ---------------------------------------------------------------------------

/**
 * Supabase の daily_records テーブルから DailyRecord[] を取得する。
 * store_id スコープ。認証済みユーザーの RLS が自動適用される。
 */
async function fetchDailyRecords(storeId: string): Promise<DailyRecord[]> {
  const { data, error } = await supabase
    .from('daily_records')
    .select('data')
    .eq('store_id', storeId);

  if (error) {
    console.error('[PerformanceContext] daily_records fetch error:', error);
    return [];
  }
  if (!data || data.length === 0) return [];
  return data.map((row: { data: DailyRecord }) => row.data as DailyRecord);
}

/** 'YYYY-MM' の翌月1日 'YYYY-MM-01' を返す（月末日が不定のため `.lt` 境界に使用）。 */
function nextMonthFirstDay(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function PerformanceProvider({ children }: { children: ReactNode }) {
  // 初期値は空配列。デモ（未認証）では load() がシードを設定し、
  // 認証済みでは Supabase の結果（またはシードフォールバック）を使う。
  const [dailyRecords, setDailyRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // deleteDailyRecord が最新の dailyRecords を updater 外で参照するための ref。
  // コールバックを安定（deps 空）に保ちつつ updater を純関数にする。
  const dailyRecordsRef = useRef(dailyRecords);
  useEffect(() => { dailyRecordsRef.current = dailyRecords; }, [dailyRecords]);

  // Supabase からロード（認証確立後）
  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          // 未認証（デモモード）: seed データを表示
          if (isMounted) setDailyRecords(initialDailyRecords);
          if (isMounted) setLoading(false);
          return;
        }

        // 認証済み: Supabase から取得。seed は一切使わない（split-brain 防止）
        const { data: profile } = await supabase
          .from('profiles')
          .select('store_id')
          .eq('id', session.user.id)
          .single();

        if (!profile?.store_id) {
          if (isMounted) setDailyRecords([]);
          if (isMounted) setLoading(false);
          return;
        }

        const records = await fetchDailyRecords(profile.store_id);
        // Supabase 結果をそのまま使う（空ならデモデータではなく空のまま）
        if (isMounted) setDailyRecords(records);
      } catch (e) {
        console.error('[PerformanceContext] load error:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') return; // mount時の load() と二重になるため無視
      if (isMounted) load();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 集約（インメモリ）
  // ---------------------------------------------------------------------------

  const getMonthlyPerformances = useCallback(
    (month: string) => aggregateToMonthly(dailyRecords, month),
    [dailyRecords]
  );

  // ---------------------------------------------------------------------------
  // 書込み（インメモリ更新 + Supabase upsert）
  // ---------------------------------------------------------------------------

  const upsertDailyRecord = useCallback((record: DailyRecord) => {
    setDailyRecords(prev => {
      const idx = prev.findIndex(r => r.id === record.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = record;
        return next;
      }
      return [...prev, record];
    });

    // Supabase へ永続化（fire-and-forget）
    supabase
      .from('daily_records')
      .upsert({
        store_id: record.storeId,
        cast_id: record.castId,
        date: record.date,
        data: record,
      }, { onConflict: 'cast_id,date' })
      .then(({ error }) => {
        if (error) console.error('[PerformanceContext] upsert error:', error);
      });
  }, []);

  const deleteDailyRecord = useCallback((id: string) => {
    // updater は純関数に保つため、対象の特定と Supabase 削除は updater の外で行う。
    const target = dailyRecordsRef.current.find(r => r.id === id);
    setDailyRecords(prev => prev.filter(r => r.id !== id));

    if (target) {
      supabase
        .from('daily_records')
        .delete()
        .eq('cast_id', target.castId)
        .eq('date', target.date)
        .then(({ error }) => {
          if (error) console.error('[PerformanceContext] delete error:', error);
        });
    }
  }, []);

  const replaceMonthlySummary = useCallback(
    (castId: string, storeId: string, month: string, records: DailyRecord[]) => {
      setDailyRecords(prev => [
        ...prev.filter(r => !(r.castId === castId && r.storeId === storeId && r.date.startsWith(month))),
        ...records,
      ]);
      // Supabase: 既存を削除して再 upsert（fire-and-forget）
      supabase
        .from('daily_records')
        .delete()
        .eq('cast_id', castId)
        .eq('store_id', storeId)
        .gte('date', `${month}-01`)
        .lt('date', nextMonthFirstDay(month))
        .then(({ error }) => {
          if (error) {
            console.error('[PerformanceContext] replaceMonthlySummary delete error:', error);
            return;
          }
          const rows = records.map(r => ({
            store_id: r.storeId,
            cast_id: r.castId,
            date: r.date,
            data: r,
          }));
          if (rows.length > 0) {
            supabase
              .from('daily_records')
              .upsert(rows, { onConflict: 'cast_id,date' })
              .then(({ error: e2 }) => {
                if (e2) console.error('[PerformanceContext] replaceMonthlySummary upsert error:', e2);
              });
          }
        });
    },
    []
  );

  // ---------------------------------------------------------------------------

  const value = useMemo(
    () => ({ dailyRecords, loading, getMonthlyPerformances, upsertDailyRecord, deleteDailyRecord, replaceMonthlySummary }),
    [dailyRecords, loading, getMonthlyPerformances, upsertDailyRecord, deleteDailyRecord, replaceMonthlySummary]
  );

  return (
    <PerformanceContext.Provider value={value}>
      {children}
    </PerformanceContext.Provider>
  );
}

export function usePerformance() {
  const ctx = useContext(PerformanceContext);
  if (!ctx) throw new Error('usePerformance must be used within PerformanceProvider');
  return ctx;
}
