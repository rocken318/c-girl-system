import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShift } from '../store/ShiftContext';
import { useSettings } from '../store/SettingsContext';
import { supabase } from '../lib/supabase';
import {
  fetchStoreCasts, fetchMonthAttendance, upsertAttendance,
  type StoreCast,
} from '../data/attendance';
import {
  fieldsToStatus, mergeAttendanceData, countsAsAttended, ATTENDANCE_STATUSES,
  type AttendanceStatus,
} from '../lib/attendanceStatus';
import { buildAttendanceConfirmMessage } from '../lib/attendanceConfirm';

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
  const { confirmedShifts, confirmShift, removeConfirmedShift } = useShift();
  const { settings } = useSettings();
  const attendanceTarget = settings.dailyAttendanceTarget ?? 0;
  const [view, setView] = useState<View>('day');
  const [month, setMonth] = useState<string>(currentMonth);
  const [casts, setCasts] = useState<StoreCast[]>([]);
  const [attendance, setAttendance] = useState<Map<string, Record<string, unknown>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // `${castId}__${date}`

  // 出欠確認LINE 一斉送信
  const [sendModal, setSendModal] = useState<
    null | { mode: 'demo' | 'real'; previews: { name: string; message: string }[] }
  >(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const castName = useMemo(() => new Map(casts.map(c => [c.id, c.name])), [casts]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchStoreCasts(storeId), fetchMonthAttendance(storeId, month)])
      .then(([cs, att]) => { setCasts(cs); setAttendance(att); })
      .catch(() => setError('データの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [storeId, month]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
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
      setError(null);
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

  const saveShift = useCallback((
    castId: string, date: string,
    patch: { startTime?: string; endTime?: string; hairMakeTime?: string; douhanPlanTime?: string },
  ) => {
    if (!canEdit) return;
    const existing = confirmedShifts.find(s => s.storeId === storeId && s.castId === castId && s.date === date);
    confirmShift({
      id: existing?.id ?? `cs_${castId}_${date}_${Date.now()}`,
      storeId, castId, date,
      startTime: patch.startTime ?? existing?.startTime ?? '20:00',
      endTime: patch.endTime ?? existing?.endTime ?? '01:00',
      hairMakeTime: patch.hairMakeTime !== undefined ? patch.hairMakeTime : existing?.hairMakeTime,
      douhanPlanTime: patch.douhanPlanTime !== undefined ? patch.douhanPlanTime : existing?.douhanPlanTime,
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

  // 当日シフト全員ぶんの個別文面プレビューを作成
  const buildPreviews = useCallback(() => {
    return todaysShifts.map(s => ({
      name: castName.get(s.castId) || s.castId,
      message: buildAttendanceConfirmMessage({
        sourceName: castName.get(s.castId) || s.castId,
        startTime: s.startTime,
        endTime: s.endTime,
        hairMakeTime: s.hairMakeTime,
        douhanTime: s.douhanPlanTime,
      }),
    }));
  }, [todaysShifts, castName]);

  // 送信ボタン押下 → セッション有無でデモ/本番を判定し確認モーダルを開く
  const openSendConfirm = useCallback(async () => {
    setSendResult(null);
    if (todaysShifts.length === 0) return;
    const previews = buildPreviews();
    const { data: { session } } = await supabase.auth.getSession();
    setSendModal({ mode: session?.access_token ? 'real' : 'demo', previews });
  }, [todaysShifts, buildPreviews]);

  // 実送信（本番のみ）
  const doSend = useCallback(async () => {
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setSendModal(null); return; }
      const res = await fetch('/api/line/attendance-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ storeId, date: today }),
      });
      if (!res.ok) {
        setSendResult('送信に失敗しました');
      } else {
        const data = await res.json();
        setSendResult(`送信 ${data.sent ?? 0}件 / 未連携 ${data.skipped ?? 0}件 / 失敗 ${data.failed ?? 0}件`);
      }
    } catch (e) {
      console.error('[ShiftAttendanceBoard] send error:', e);
      setSendResult('送信に失敗しました');
    } finally {
      setSending(false);
      setSendModal(null);
    }
  }, [storeId, today]);

  if (loading) return <div className="p-4 text-sm text-ink-tertiary">読み込み中…</div>;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5 animate-fade-in-up">
      {error && <div className="glass rounded-xl p-3 text-sm text-red-700 bg-red-50">{error}</div>}

      {/* View switch */}
      <div className="flex gap-2">
        {(['day', 'month'] as View[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 md:px-5 md:py-2.5 rounded-xl text-sm md:text-base transition-all ${
              view === v ? 'bg-brand text-white font-bold shadow-soft' : 'glass text-ink-secondary'
            }`}
          >
            {v === 'day' ? '当日' : '月次'}
          </button>
        ))}
      </div>

      {view === 'day' ? (
        <>
          <div className="grid grid-cols-4 gap-2 md:gap-3">
            {[
              ['予定', daySummary.total],
              ['出勤', daySummary.present],
              ['未確認', daySummary.unconfirmed],
              ['欠勤', daySummary.absent],
            ].map(([label, n]) => (
              <div key={label as string} className="glass rounded-xl p-2 md:p-4 text-center shadow-soft">
                <p className="text-[10px] md:text-xs text-ink-tertiary">{label}</p>
                <p className="font-mincho text-lg md:text-3xl font-bold text-ink">{n}</p>
              </div>
            ))}
          </div>
          {attendanceTarget > 0 && (
            <div className="glass rounded-xl px-4 py-2.5 flex items-center justify-between shadow-soft">
              <span className="text-xs md:text-sm text-ink-tertiary">本日の出勤目標</span>
              <span className="text-sm md:text-base">
                <span className={`font-mincho font-bold ${daySummary.present >= attendanceTarget ? 'text-emerald-600' : 'text-brand'}`}>
                  {daySummary.present}
                </span>
                <span className="text-ink-tertiary"> / {attendanceTarget} 人</span>
                {daySummary.present >= attendanceTarget && <span className="ml-2 text-emerald-600 font-bold">達成 ✓</span>}
              </span>
            </div>
          )}
          {/* 出欠確認LINE 一斉送信 */}
          {canEdit && todaysShifts.length > 0 && (
            <div className="space-y-1.5">
              <button
                onClick={openSendConfirm}
                className="w-full glass rounded-xl px-4 py-3 shadow-soft flex items-center justify-center gap-2 text-sm md:text-base font-bold text-brand hover:bg-brand/5 transition-colors"
              >
                📩 出欠確認を一斉送信（{todaysShifts.length}名）
              </button>
              {sendResult && <p className="text-xs text-center text-ink-secondary">{sendResult}</p>}
            </div>
          )}

          <div className="space-y-2">
            {todaysShifts.length === 0 && (
              <p className="text-sm text-ink-tertiary">本日の出勤予定はありません。</p>
            )}
            {todaysShifts.map(s => (
              <AttendanceRow
                key={s.id}
                name={castName.get(s.castId) || s.castId}
                startTime={s.startTime}
                endTime={s.endTime}
                hairMakeTime={s.hairMakeTime}
                douhanPlanTime={s.douhanPlanTime}
                status={statusOf(s.castId, today)}
                saving={saving === `${s.castId}__${today}`}
                canEdit={canEdit}
                onSelect={(st, dt) => setStatus(s.castId, today, st, dt)}
                onSave={patch => saveShift(s.castId, today, patch)}
                onDeleteShift={() => deleteShift(s.castId, today)}
              />
            ))}
            {canEdit && (
              <AddShiftControl
                casts={casts.filter(c => !todaysShifts.some(s => s.castId === c.id))}
                onAdd={(castId, st, et) => saveShift(castId, today, { startTime: st, endTime: et })}
              />
            )}
          </div>
        </>
      ) : (
        <MonthGrid
          month={month}
          onMonthChange={setMonth}
          casts={casts}
          statusOf={statusOf}
          canEdit={canEdit}
          attendanceTarget={attendanceTarget}
          onSelect={(castId, date, st, dt) => setStatus(castId, date, st, dt)}
        />
      )}

      {/* 出欠確認LINE 送信確認モーダル */}
      {sendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !sending && setSendModal(null)}>
          <div className="glass rounded-2xl shadow-elevated max-w-md w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-ink/10">
              <p className="font-mincho text-base font-bold text-ink">出欠確認LINE の送信</p>
              <p className="text-xs text-ink-tertiary mt-0.5">
                {sendModal.mode === 'demo'
                  ? 'デモモードのため実際には送信されません。以下の内容が送信されます。'
                  : `以下の内容で ${sendModal.previews.length}名 に送信します。（LINE未連携の方はスキップされます）`}
              </p>
            </div>
            <div className="p-4 space-y-2 overflow-auto">
              {sendModal.previews.map((p, i) => (
                <div key={i} className="rounded-lg bg-white/50 p-2.5">
                  <p className="text-xs font-bold text-ink mb-1">{p.name}</p>
                  <p className="text-xs text-ink-secondary whitespace-pre-wrap">{p.message}</p>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-ink/10 flex justify-end gap-2">
              <button
                onClick={() => setSendModal(null)}
                disabled={sending}
                className="px-4 py-2 rounded-xl text-sm glass text-ink-secondary"
              >
                {sendModal.mode === 'demo' ? '閉じる' : 'キャンセル'}
              </button>
              {sendModal.mode === 'real' && (
                <button
                  onClick={doSend}
                  disabled={sending}
                  className="px-4 py-2 rounded-xl text-sm bg-brand text-white font-bold disabled:opacity-50"
                >
                  {sending ? '送信中…' : '送信する'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 出欠1行（区分ピッカー付き）─────────────────────────────────────────────
function AttendanceRow(props: {
  name: string; startTime: string; endTime: string;
  hairMakeTime?: string; douhanPlanTime?: string;
  status: AttendanceStatus;
  saving: boolean; canEdit: boolean;
  onSelect: (status: Exclude<AttendanceStatus, 'unconfirmed'>, douhanTime?: string) => void;
  onSave: (patch: { startTime: string; endTime: string; hairMakeTime: string; douhanPlanTime: string }) => void;
  onDeleteShift: () => void;
}) {
  const { name, startTime, endTime, hairMakeTime, douhanPlanTime, status, saving, canEdit, onSelect, onSave, onDeleteShift } = props;
  const [open, setOpen] = useState(false);
  const [douhanTime, setDouhanTime] = useState('19:00');
  const [st, setSt] = useState(startTime);
  const [et, setEt] = useState(endTime);
  const [hair, setHair] = useState(hairMakeTime ?? '');
  const [douhanPlan, setDouhanPlan] = useState(douhanPlanTime ?? '');
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSt(startTime); }, [startTime]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setEt(endTime); }, [endTime]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setHair(hairMakeTime ?? ''); }, [hairMakeTime]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDouhanPlan(douhanPlanTime ?? ''); }, [douhanPlanTime]);

  // ヘアメ時間・同伴予定は入力と同時に保存（シフト時刻は現在値を維持）
  const handleHair = (v: string) => {
    setHair(v);
    onSave({ startTime: st, endTime: et, hairMakeTime: v, douhanPlanTime: douhanPlan });
  };
  const handleDouhanPlan = (v: string) => {
    setDouhanPlan(v);
    onSave({ startTime: st, endTime: et, hairMakeTime: hair, douhanPlanTime: v });
  };

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

      {/* ヘアメ時間・同伴予定（常時表示・出欠確認LINEに反映） */}
      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-secondary">
          <label className="flex items-center gap-1.5">
            ヘアメ時間
            <input type="time" value={hair} onChange={e => handleHair(e.target.value)}
              className="glass rounded-md px-2 py-1 text-xs" />
            {hair && (
              <button type="button" onClick={() => handleHair('')}
                className="px-1.5 py-0.5 rounded text-ink-tertiary hover:text-red-600" title="クリア">✕</button>
            )}
          </label>
          <label className="flex items-center gap-1.5">
            同伴予定
            <input type="time" value={douhanPlan} onChange={e => handleDouhanPlan(e.target.value)}
              className="glass rounded-md px-2 py-1 text-xs" />
            {douhanPlan && (
              <button type="button" onClick={() => handleDouhanPlan('')}
                className="px-1.5 py-0.5 rounded text-ink-tertiary hover:text-red-600" title="クリア">✕</button>
            )}
          </label>
        </div>
      )}

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
            <button
              onClick={() => onSave({ startTime: st, endTime: et, hairMakeTime: hair, douhanPlanTime: douhanPlan })}
              className="px-2.5 py-1 rounded-lg text-xs bg-brand text-white font-bold"
            >
              保存
            </button>
            <button onClick={() => { if (window.confirm('このシフトを削除しますか？')) onDeleteShift(); }} className="px-2.5 py-1 rounded-lg text-xs bg-red-100 text-red-700">シフト削除</button>
          </div>
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
  attendanceTarget: number;
  onSelect: (castId: string, date: string, status: Exclude<AttendanceStatus, 'unconfirmed'>, douhanTime?: string) => void;
}) {
  const { month, onMonthChange, casts, statusOf, canEdit, attendanceTarget, onSelect } = props;
  const [sel, setSel] = useState<{ castId: string; date: string } | null>(null);
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => {
    const d = String(i + 1).padStart(2, '0');
    return `${month}-${d}`;
  });

  const shiftMonth = (delta: number) => {
    setSel(null);
    const [y, m] = month.split('-').map(Number);
    const nd = new Date(y, m - 1 + delta, 1);
    onMonthChange(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`);
  };

  // 日別 出勤人数（出勤/同伴/遅刻を出勤とみなす）
  const countByDate = useMemo(
    () => new Map(days.map(d => [d, casts.reduce((acc, c) => acc + (countsAsAttended(statusOf(c.id, d)) ? 1 : 0), 0)])),
    [days, casts, statusOf],
  );

  // 土日は色を付けて視認性を上げる
  const dowClass = (d: string) => {
    const g = new Date(d + 'T00:00:00').getDay();
    return g === 0 ? 'text-red-500' : g === 6 ? 'text-blue-500' : 'text-ink-tertiary';
  };

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => shiftMonth(-1)} className="glass rounded-lg px-4 py-2 text-base">‹</button>
        <span className="font-mincho font-bold text-ink text-base md:text-xl">{formatMonth(month)}</span>
        <button onClick={() => shiftMonth(1)} className="glass rounded-lg px-4 py-2 text-base">›</button>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-2">
        {ATTENDANCE_STATUSES.map(st => (
          <span key={st} className={`px-2 py-0.5 rounded text-[11px] md:text-xs ${STATUS_CLASS[st]}`}>
            {STATUS_LABEL[st]}
          </span>
        ))}
      </div>

      <div className="overflow-auto rounded-xl border border-ink/5 -mx-1 md:mx-0">
        <table className="text-xs md:text-sm border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-2 py-2 md:px-3 md:py-2.5 text-left text-ink-secondary font-bold whitespace-nowrap">キャスト</th>
              {days.map(d => (
                <th key={d} className="px-1 py-1.5 w-8 md:w-11 text-center leading-tight">
                  <span className="text-ink font-bold text-[11px] md:text-sm">{Number(d.slice(-2))}</span>
                  <br /><span className={`text-[10px] md:text-xs ${dowClass(d)}`}>{dow(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* 出勤目標行（設定時のみ） */}
            {attendanceTarget > 0 && (
              <tr className="bg-gold/5">
                <td className="sticky left-0 z-10 bg-gold/10 px-2 py-1.5 md:px-3 md:py-2 font-bold whitespace-nowrap text-ink-secondary text-[11px] md:text-sm">
                  出勤目標
                </td>
                {days.map(d => (
                  <td key={d} className="px-1 py-1.5 md:py-2 text-center text-ink-tertiary text-[11px] md:text-sm">
                    {attendanceTarget}
                  </td>
                ))}
              </tr>
            )}
            {/* 日別 出勤人数（目標比で色分け） */}
            <tr className="bg-brand/5">
              <td className="sticky left-0 z-10 bg-brand/10 px-2 py-1.5 md:px-3 md:py-2 font-bold whitespace-nowrap text-ink text-[11px] md:text-sm">出勤人数</td>
              {days.map(d => {
                const n = countByDate.get(d) ?? 0;
                const met = attendanceTarget > 0 && n >= attendanceTarget;
                const miss = attendanceTarget > 0 && n > 0 && n < attendanceTarget;
                return (
                  <td
                    key={d}
                    className={`px-1 py-1.5 md:py-2 text-center font-bold text-sm md:text-base ${
                      met ? 'text-emerald-600 bg-emerald-50' : miss ? 'text-amber-600 bg-amber-50' : 'text-brand'
                    }`}
                  >
                    {n > 0 ? n : ''}
                  </td>
                );
              })}
            </tr>
            {casts.map(c => (
              <tr key={c.id} className="hover:bg-brand/3 transition-colors">
                <td className="sticky left-0 z-10 bg-white px-2 py-1 md:px-3 md:py-1.5 whitespace-nowrap text-ink text-[11px] md:text-sm font-medium">{c.name}</td>
                {days.map(d => {
                  const st = statusOf(c.id, d);
                  return (
                    <td key={d} className="p-0.5 md:p-1 text-center">
                      <button
                        disabled={!canEdit}
                        onClick={() => setSel({ castId: c.id, date: d })}
                        className={`w-7 h-7 md:w-9 md:h-9 rounded-md md:rounded-lg text-[11px] md:text-sm font-bold ${STATUS_CLASS[st]} ${canEdit ? 'hover:ring-2 hover:ring-brand/30 transition-all' : ''}`}
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
        <div className="glass rounded-xl p-4 shadow-elevated space-y-3">
          <p className="text-sm md:text-base font-medium text-ink">
            {casts.find(c => c.id === sel.castId)?.name} / {sel.date}（{dow(sel.date)}）
          </p>
          <div className="flex flex-wrap gap-2">
            {ATTENDANCE_STATUSES.map(st => (
              <button
                key={st}
                onClick={() => {
                  onSelect(sel.castId, sel.date, st, st === 'douhan' ? '19:00' : undefined);
                  setSel(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs md:text-sm ${STATUS_CLASS[st]}`}
              >
                {STATUS_LABEL[st]}
              </button>
            ))}
            <button onClick={() => setSel(null)} className="px-3 py-1.5 rounded-lg text-xs md:text-sm glass text-ink-secondary">閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}

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
