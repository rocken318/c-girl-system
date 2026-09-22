import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';

export type ShiftPreference = 'work' | 'off' | 'undecided';

export interface ShiftDayRequest {
  date: string;          // YYYY-MM-DD
  preference: ShiftPreference;
  startTime: string;
  endTime: string;
  douhanTime?: string;   // 同伴予定時刻（任意, 例 "19:00"）
  douhanMemo?: string;   // 同伴予定メモ＝客名（任意）
}

export interface ShiftRequest {
  id: string;
  storeId: string;
  castId: string;
  month: string;         // YYYY-MM
  days: ShiftDayRequest[];
  submitted: boolean;
  submittedAt: string | null;
}

export interface ConfirmedShift {
  id: string;
  storeId: string;
  castId: string;
  date: string;          // YYYY-MM-DD
  startTime: string;
  endTime: string;
  published: boolean;
  hairMakeTime?: string;   // ヘアメ時間（任意, 例 "18:00"）
  douhanPlanTime?: string; // 同伴予定時刻（任意, 例 "19:00"）
  updatedBy?: string;    // 変更者 profile_id（黒服の即時変更を監査）
  updatedAt?: string;    // 変更時刻 ISO
}

interface ShiftContextType {
  shiftRequests: ShiftRequest[];
  confirmedShifts: ConfirmedShift[];
  loading: boolean;
  getMyRequest: (castId: string, month: string) => ShiftRequest | undefined;
  submitRequest: (req: ShiftRequest) => void;
  reopenRequest: (castId: string, month: string) => void;
  confirmShift: (shift: ConfirmedShift) => void;
  removeConfirmedShift: (id: string) => void;
  publishMonth: (month: string) => void;
  getConfirmedForCast: (castId: string, month: string) => ConfirmedShift[];
  getConfirmedForMonth: (month: string) => ConfirmedShift[];
}

const ShiftContext = createContext<ShiftContextType | null>(null);

/** 'YYYY-MM' の翌月1日 'YYYY-MM-01' を返す（月末日が不定のため `.lt` 境界に使用）。 */
function nextMonthFirstDay(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

// ---------------------------------------------------------------------------
// Seed data（Supabase 未接続時の fallback）
// ---------------------------------------------------------------------------

function generateSeedRequests(): ShiftRequest[] {
  const month = '2026-07';
  const storeId = 'store_1';

  function buildDays(
    _castId: string,
    workDayNums: number[],
    offDayNums: number[],
    startTime: string,
    endTime: string,
  ): ShiftDayRequest[] {
    const daysInMonth = 31;
    const days: ShiftDayRequest[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      let preference: ShiftPreference = 'undecided';
      if (workDayNums.includes(d)) preference = 'work';
      else if (offDayNums.includes(d)) preference = 'off';
      days.push({ date, preference, startTime, endTime });
    }
    return days;
  }

  return [
    {
      id: 'sr_1', storeId, castId: 'cast_1', month,
      days: buildDays('cast_1',
        [1,2,3,5,7,8,9,10,12,14,15,16,18,21],
        [4,6,11,13,17,19,20,22,23,24,25,26,27,28,29,30,31],
        '20:00', '01:00'),
      submitted: true, submittedAt: '2026-06-19T10:00:00.000Z',
    },
    {
      id: 'sr_2', storeId, castId: 'cast_2', month,
      days: buildDays('cast_2',
        [2,3,4,7,9,10,11,14,16,17,18,21,23,24],
        [1,5,6,8,12,13,15,19,20,22,25,26,27,28,29,30,31],
        '20:00', '01:00'),
      submitted: true, submittedAt: '2026-06-20T11:30:00.000Z',
    },
    {
      id: 'sr_3', storeId, castId: 'cast_3', month,
      days: buildDays('cast_3',
        [1,3,5,8,10,12,15,17,19,22],
        [2,4,6,7,9,11,13,14,16,18,20,21,23,24,25,26,27,28,29,30,31],
        '21:00', '02:00'),
      submitted: true, submittedAt: '2026-06-21T09:45:00.000Z',
    },
    {
      id: 'sr_4', storeId, castId: 'cast_4', month,
      days: buildDays('cast_4',
        [4,5,7,11,12,14,18,19,21,25,26,28],
        [1,2,3,6,8,9,10,13,15,16,17,20,22,23,24,27,29,30,31],
        '20:00', '01:00'),
      submitted: true, submittedAt: '2026-06-22T14:00:00.000Z',
    },
    {
      id: 'sr_5', storeId, castId: 'cast_5', month,
      days: buildDays('cast_5',
        [3,7,10,14,17,21],
        [1,2,4,5,6,8,9,11,12,13,15,16,18,19,20,22,23,24,25,26,27,28,29,30,31],
        '20:00', '01:00'),
      submitted: true, submittedAt: '2026-06-23T16:20:00.000Z',
    },
  ];
}

function generateSeedConfirmed(): ConfirmedShift[] {
  const storeId = 'store_1';
  const shifts: ConfirmedShift[] = [];

  const sakuraDays = [1, 2, 3, 5, 7, 8, 9, 10, 12, 14, 15];
  for (const d of sakuraDays) {
    shifts.push({
      id: `cs_cast1_${d}`, storeId, castId: 'cast_1',
      date: `2026-07-${String(d).padStart(2, '0')}`,
      startTime: '20:00', endTime: '01:00', published: false,
    });
  }

  const rinDays = [2, 3, 4, 7, 9, 10, 11, 14, 16];
  for (const d of rinDays) {
    shifts.push({
      id: `cs_cast2_${d}`, storeId, castId: 'cast_2',
      date: `2026-07-${String(d).padStart(2, '0')}`,
      startTime: '20:00', endTime: '01:00', published: false,
    });
  }

  return shifts;
}

// ---------------------------------------------------------------------------
// Supabase <-> 型 変換
// ---------------------------------------------------------------------------

interface ShiftRow {
  id: string;
  store_id: string;
  cast_id: string;
  date: string;
  status: string;
  data: Record<string, unknown>;
}

function rowToShiftRequest(row: ShiftRow): ShiftRequest | null {
  const d = row.data;
  if (d?.type !== 'request') return null;
  return {
    id: row.id,
    storeId: row.store_id,
    castId: row.cast_id,
    month: (d.month as string) ?? '',
    days: (d.days as ShiftDayRequest[]) ?? [],
    submitted: row.status === 'submitted' || row.status === 'approved',
    submittedAt: (d.submittedAt as string | null) ?? null,
  };
}

function rowToConfirmedShift(row: ShiftRow): ConfirmedShift | null {
  if (row.status !== 'approved' && row.status !== 'published') return null;
  const d = row.data;
  return {
    id: row.id,
    storeId: row.store_id,
    castId: row.cast_id,
    date: row.date,
    startTime: (d?.startTime as string) ?? '20:00',
    endTime: (d?.endTime as string) ?? '01:00',
    published: row.status === 'published',
    ...(d?.hairMakeTime ? { hairMakeTime: d.hairMakeTime as string } : {}),
    ...(d?.douhanPlanTime ? { douhanPlanTime: d.douhanPlanTime as string } : {}),
    ...(d?.updatedBy ? { updatedBy: d.updatedBy as string } : {}),
    ...(d?.updatedAt ? { updatedAt: d.updatedAt as string } : {}),
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ShiftProvider({ children }: { children: ReactNode }) {
  const [shiftRequests, setShiftRequests] = useState<ShiftRequest[]>(generateSeedRequests());
  const [confirmedShifts, setConfirmedShifts] = useState<ConfirmedShift[]>(generateSeedConfirmed());
  const [loading, setLoading] = useState(false);

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
          .select('active_store_id, store_id')
          .eq('id', session.user.id)
          .single();

        const activeStoreId = profile?.active_store_id ?? profile?.store_id;

        if (!activeStoreId) {
          if (isMounted) setLoading(false);
          return;
        }

        const { data: rows, error } = await supabase
          .from('shifts')
          .select('id, store_id, cast_id, date, status, data')
          .eq('store_id', activeStoreId);

        if (error) {
          console.error('[ShiftContext] fetch error:', error);
          if (isMounted) setLoading(false);
          return;
        }

        if (!rows || rows.length === 0) {
          if (isMounted) setLoading(false);
          return;
        }

        // 1申請は日数分の行に分割して保存される（各行は同一の days 配列を持つ）。
        // 読取り時は castId+month 単位で de-dup して ShiftRequest を1個だけ構築する。
        const requestMap = new Map<string, ShiftRequest>();
        const confirmed: ConfirmedShift[] = [];

        for (const row of rows as ShiftRow[]) {
          const d = row.data;
          if (d?.type === 'request') {
            const req = rowToShiftRequest(row);
            if (req) {
              const key = `${req.castId}__${req.month}`;
              if (!requestMap.has(key)) requestMap.set(key, req);
            }
          } else {
            const conf = rowToConfirmedShift(row);
            if (conf) confirmed.push(conf);
          }
        }

        const requests = Array.from(requestMap.values());

        if (isMounted) {
          if (requests.length > 0) setShiftRequests(requests);
          if (confirmed.length > 0) setConfirmedShifts(confirmed);
        }
      } catch (e) {
        console.error('[ShiftContext] load error:', e);
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
  // Mutations（インメモリ更新 + Supabase fire-and-forget）
  // ---------------------------------------------------------------------------

  const getMyRequest = useCallback(
    (castId: string, month: string) =>
      shiftRequests.find(r => r.castId === castId && r.month === month),
    [shiftRequests],
  );

  const submitRequest = useCallback((req: ShiftRequest) => {
    setShiftRequests(prev => {
      const idx = prev.findIndex(r => r.castId === req.castId && r.month === req.month);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = req;
        return next;
      }
      return [...prev, req];
    });

    // Supabase upsert（シフト月内の各日を1行ずつ）
    const rows = req.days.map(day => ({
      id: `req_${req.castId}_${day.date}`,
      store_id: req.storeId,
      cast_id: req.castId,
      date: day.date,
      status: req.submitted ? 'submitted' : 'draft',
      data: {
        type: 'request',
        month: req.month,
        days: req.days,
        submittedAt: req.submittedAt,
        preference: day.preference,
        startTime: day.startTime,
        endTime: day.endTime,
      },
    }));

    supabase
      .from('shifts')
      .upsert(rows, { onConflict: 'cast_id,date' })
      .then(({ error }) => {
        if (error) console.error('[ShiftContext] submitRequest upsert error:', error);
      });
  }, []);

  const reopenRequest = useCallback((castId: string, month: string) => {
    setShiftRequests(prev =>
      prev.map(r =>
        r.castId === castId && r.month === month
          ? { ...r, submitted: false, submittedAt: null }
          : r,
      ),
    );
  }, []);

  const confirmShift = useCallback((shift: ConfirmedShift) => {
    setConfirmedShifts(prev => {
      const idx = prev.findIndex(s => s.id === shift.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = shift;
        return next;
      }
      return [...prev, shift];
    });

    supabase
      .from('shifts')
      .upsert({
        id: shift.id,
        store_id: shift.storeId,
        cast_id: shift.castId,
        date: shift.date,
        status: shift.published ? 'published' : 'approved',
        data: {
          startTime: shift.startTime,
          endTime: shift.endTime,
          ...(shift.hairMakeTime ? { hairMakeTime: shift.hairMakeTime } : {}),
          ...(shift.douhanPlanTime ? { douhanPlanTime: shift.douhanPlanTime } : {}),
          ...(shift.updatedBy ? { updatedBy: shift.updatedBy } : {}),
          ...(shift.updatedAt ? { updatedAt: shift.updatedAt } : {}),
        },
      }, { onConflict: 'cast_id,date' })
      .then(({ error }) => {
        if (error) console.error('[ShiftContext] confirmShift upsert error:', error);
      });
  }, []);

  const removeConfirmedShift = useCallback((id: string) => {
    setConfirmedShifts(prev => prev.filter(s => s.id !== id));
    supabase
      .from('shifts')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('[ShiftContext] removeConfirmedShift error:', error);
      });
  }, []);

  const publishMonth = useCallback((month: string) => {
    setConfirmedShifts(prev =>
      prev.map(s =>
        s.date.startsWith(month) ? { ...s, published: true } : s,
      ),
    );
    // Supabase: status を 'published' に一括更新
    supabase
      .from('shifts')
      .update({ status: 'published' })
      .gte('date', `${month}-01`)
      .lt('date', nextMonthFirstDay(month))
      .eq('status', 'approved')
      .then(({ error }) => {
        if (error) console.error('[ShiftContext] publishMonth error:', error);
      });
  }, []);

  const getConfirmedForCast = useCallback(
    (castId: string, month: string) =>
      confirmedShifts.filter(s => s.castId === castId && s.date.startsWith(month)),
    [confirmedShifts],
  );

  const getConfirmedForMonth = useCallback(
    (month: string) => confirmedShifts.filter(s => s.date.startsWith(month)),
    [confirmedShifts],
  );

  const value = useMemo(
    () => ({
      shiftRequests,
      confirmedShifts,
      loading,
      getMyRequest,
      submitRequest,
      reopenRequest,
      confirmShift,
      removeConfirmedShift,
      publishMonth,
      getConfirmedForCast,
      getConfirmedForMonth,
    }),
    [
      shiftRequests,
      confirmedShifts,
      loading,
      getMyRequest,
      submitRequest,
      reopenRequest,
      confirmShift,
      removeConfirmedShift,
      publishMonth,
      getConfirmedForCast,
      getConfirmedForMonth,
    ],
  );

  return <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>;
}

export function useShift() {
  const ctx = useContext(ShiftContext);
  if (!ctx) throw new Error('useShift must be used within ShiftProvider');
  return ctx;
}
