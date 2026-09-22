import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';

export interface PayrollSnapshot {
  id: string;
  castId: string;
  castName: string;
  storeId: string;
  month: string; // YYYY-MM
  confirmedAt: string; // ISO date
  confirmedBy: string; // admin
  // Full PayrollResult snapshot
  basePay: number;
  basePayDetail: string;
  commissionItems: { label: string; amount: number; detail?: string }[];
  commissionTotal: number;
  backItems: { label: string; amount: number; detail?: string }[];
  backTotal: number;
  grossPay: number;
  deductionItems: { label: string; amount: number }[];
  deductionTotal: number;
  netPay: number;
  // Settings snapshot for audit
  settingsSnapshot: string; // JSON.stringify of settings used
}

interface PayrollSnapshotContextType {
  snapshots: PayrollSnapshot[];
  loading: boolean;
  /**
   * 給与を確定する。Supabase への書込みを await し、成功してから in-memory に反映する。
   * 書込み失敗時は throw する（サイレント成功詐称を防ぎ、呼び出し側が握れるようにする）。
   */
  confirmPayroll: (snapshot: PayrollSnapshot) => Promise<void>;
  /** 確定済みを再確定（上書き）。confirmPayroll 同様に await + 失敗時 throw。 */
  reconfirmPayroll: (id: string, snapshot: PayrollSnapshot) => Promise<void>;
  getSnapshot: (castId: string, month: string) => PayrollSnapshot | undefined;
  getMonthSnapshots: (month: string) => PayrollSnapshot[];
  isConfirmed: (castId: string, month: string) => boolean;
}

const PayrollSnapshotContext = createContext<PayrollSnapshotContextType | null>(null);

// ---------------------------------------------------------------------------
// Supabase <-> PayrollSnapshot 変換
// ---------------------------------------------------------------------------

interface PayrollRow {
  id: string;
  store_id: string;
  cast_id: string;
  period: string;
  status: string;
  snapshot: Record<string, unknown>;
  confirmed_at: string | null;
}

function rowToSnapshot(row: PayrollRow): PayrollSnapshot {
  const s = row.snapshot;
  return {
    id: row.id,
    castId: row.cast_id,
    castName: (s.castName as string) ?? '',
    storeId: row.store_id,
    month: row.period,
    confirmedAt: row.confirmed_at ?? (s.confirmedAt as string) ?? new Date().toISOString(),
    confirmedBy: (s.confirmedBy as string) ?? '',
    basePay: (s.basePay as number) ?? 0,
    basePayDetail: (s.basePayDetail as string) ?? '',
    commissionItems: (s.commissionItems as PayrollSnapshot['commissionItems']) ?? [],
    commissionTotal: (s.commissionTotal as number) ?? 0,
    backItems: (s.backItems as PayrollSnapshot['backItems']) ?? [],
    backTotal: (s.backTotal as number) ?? 0,
    grossPay: (s.grossPay as number) ?? 0,
    deductionItems: (s.deductionItems as PayrollSnapshot['deductionItems']) ?? [],
    deductionTotal: (s.deductionTotal as number) ?? 0,
    netPay: (s.netPay as number) ?? 0,
    settingsSnapshot: (s.settingsSnapshot as string) ?? '',
  };
}

function snapshotToRow(snap: PayrollSnapshot, status = 'confirmed') {
  return {
    id: snap.id,
    store_id: snap.storeId,
    cast_id: snap.castId,
    period: snap.month,
    status,
    snapshot: {
      castName: snap.castName,
      confirmedAt: snap.confirmedAt,
      confirmedBy: snap.confirmedBy,
      basePay: snap.basePay,
      basePayDetail: snap.basePayDetail,
      commissionItems: snap.commissionItems,
      commissionTotal: snap.commissionTotal,
      backItems: snap.backItems,
      backTotal: snap.backTotal,
      grossPay: snap.grossPay,
      deductionItems: snap.deductionItems,
      deductionTotal: snap.deductionTotal,
      netPay: snap.netPay,
      settingsSnapshot: snap.settingsSnapshot,
    },
    confirmed_at: snap.confirmedAt,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function PayrollSnapshotProvider({ children }: { children: ReactNode }) {
  const [snapshots, setSnapshots] = useState<PayrollSnapshot[]>([]);
  const [loading, setLoading] = useState(false);

  // mutation が最新 snapshots を updater 外で参照するための ref（重複チェック用）。
  const snapshotsRef = useRef(snapshots);
  useEffect(() => { snapshotsRef.current = snapshots; }, [snapshots]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          if (isMounted) setLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('store_id')
          .eq('id', session.user.id)
          .single();

        if (!profile?.store_id) {
          if (isMounted) setLoading(false);
          return;
        }

        const { data: rows, error } = await supabase
          .from('payrolls')
          .select('id, store_id, cast_id, period, status, snapshot, confirmed_at')
          .eq('store_id', profile.store_id)
          .eq('status', 'confirmed');

        if (error) {
          console.error('[PayrollSnapshotContext] fetch error:', error);
          if (isMounted) setLoading(false);
          return;
        }

        if (isMounted && rows && rows.length > 0) {
          setSnapshots((rows as PayrollRow[]).map(rowToSnapshot));
        }
      } catch (e) {
        console.error('[PayrollSnapshotContext] load error:', e);
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
  // Mutations
  // ---------------------------------------------------------------------------

  const confirmPayroll = useCallback(async (snapshot: PayrollSnapshot): Promise<void> => {
    // 同一 cast+month の確定が既にあれば何もしない（冪等・不変原則）。
    const exists = snapshotsRef.current.find(
      s => s.castId === snapshot.castId && s.month === snapshot.month
    );
    if (exists) return;

    // 確定は不変のスナップショット。Supabase への書込みを await し、成功してから
    // in-memory に反映する。失敗時は throw して呼び出し側に伝える（サイレント成功詐称を防ぐ）。
    const { error } = await supabase
      .from('payrolls')
      .upsert(snapshotToRow(snapshot, 'confirmed'), { onConflict: 'cast_id,period' });

    if (error) {
      console.error('[PayrollSnapshotContext] confirmPayroll error:', error);
      throw new Error(`給与確定の保存に失敗しました: ${error.message}`);
    }

    setSnapshots(prev => {
      const dup = prev.find(s => s.castId === snapshot.castId && s.month === snapshot.month);
      if (dup) return prev;
      return [...prev, snapshot];
    });
  }, []);

  const reconfirmPayroll = useCallback(async (id: string, snapshot: PayrollSnapshot): Promise<void> => {
    const { error } = await supabase
      .from('payrolls')
      .upsert(snapshotToRow({ ...snapshot, id }, 'confirmed'), { onConflict: 'cast_id,period' });

    if (error) {
      console.error('[PayrollSnapshotContext] reconfirmPayroll error:', error);
      throw new Error(`給与再確定の保存に失敗しました: ${error.message}`);
    }

    setSnapshots(prev =>
      prev.map(s => (s.id === id ? { ...snapshot, id } : s))
    );
  }, []);

  const getSnapshot = useCallback(
    (castId: string, month: string) =>
      snapshots.find(s => s.castId === castId && s.month === month),
    [snapshots]
  );

  const getMonthSnapshots = useCallback(
    (month: string) => snapshots.filter(s => s.month === month),
    [snapshots]
  );

  const isConfirmed = useCallback(
    (castId: string, month: string) =>
      snapshots.some(s => s.castId === castId && s.month === month),
    [snapshots]
  );

  const value = useMemo(
    () => ({ snapshots, loading, confirmPayroll, reconfirmPayroll, getSnapshot, getMonthSnapshots, isConfirmed }),
    [snapshots, loading, confirmPayroll, reconfirmPayroll, getSnapshot, getMonthSnapshots, isConfirmed]
  );

  return (
    <PayrollSnapshotContext.Provider value={value}>
      {children}
    </PayrollSnapshotContext.Provider>
  );
}

export function usePayrollSnapshot() {
  const ctx = useContext(PayrollSnapshotContext);
  if (!ctx) throw new Error('usePayrollSnapshot must be used within PayrollSnapshotProvider');
  return ctx;
}
