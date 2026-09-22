import { useState, useMemo } from 'react';
import { useAuth } from '../../store/AuthContext';
import { useSettings } from '../../store/SettingsContext';
import { useShift, type ShiftDayRequest, type ShiftPreference, type ShiftRequest } from '../../store/ShiftContext';

// ---------------------------------------------------------------------------
// 定数・ルール
// ---------------------------------------------------------------------------
const OPEN_TIME = '20:00';   // オープン（デフォルト出勤）
const LAST_TIME = '25:00';   // ラスト（退勤固定）

/** 出勤時刻の選択肢: 20:00〜24:00（30分刻み）。退勤は常に25:00固定 */
const START_TIME_OPTIONS: string[] = [];
for (let h = 20; h <= 24; h++) {
  START_TIME_OPTIONS.push(`${h}:00`);
  if (h < 24) START_TIME_OPTIONS.push(`${h}:30`);
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------
function getTargetMonth(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getDaysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function getFirstDayOfWeek(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).getDay(); // 0=Sun
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${Number(m)}月`;
}

// ---------------------------------------------------------------------------
// スタイル定数
// ---------------------------------------------------------------------------
const prefColor: Record<ShiftPreference, string> = {
  work: 'bg-emerald-100 border-emerald-400 text-emerald-800',
  off: 'bg-rose-100 border-rose-400 text-rose-800',
  undecided: 'bg-gray-100 border-gray-300 text-gray-500',
};

const prefLabel: Record<ShiftPreference, string> = {
  work: '出勤',
  off: '休み',
  undecided: '未定',
};

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------
export function ShiftSubmitPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { getMyRequest, submitRequest, reopenRequest } = useShift();

  const castId = user?.castData?.id ?? '';
  const storeId = user?.castData?.storeId ?? '';

  const targetMonth = getTargetMonth(settings.shiftTargetMonthOffset);

  const today = new Date();
  const deadlinePassed = useMemo(() => {
    const [ty, tm] = targetMonth.split('-').map(Number);
    const deadlineMonth = new Date(ty, tm - 2, settings.shiftDeadlineDay);
    return today > deadlineMonth;
  }, [targetMonth, settings.shiftDeadlineDay, today]);

  const existingReq = getMyRequest(castId, targetMonth);

  const daysInMonth = getDaysInMonth(targetMonth);
  const firstDow = getFirstDayOfWeek(targetMonth);

  // Build initial days from existing request or defaults
  const buildInitialDays = (): ShiftDayRequest[] => {
    if (existingReq) return [...existingReq.days];
    const days: ShiftDayRequest[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${targetMonth}-${String(d).padStart(2, '0')}`;
      days.push({
        date,
        preference: 'undecided',
        startTime: OPEN_TIME,
        endTime: LAST_TIME,
      });
    }
    return days;
  };

  const [days, setDays] = useState<ShiftDayRequest[]>(buildInitialDays);

  // 選択中の日付セット（一括操作用）
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  // 個別編集パネルを開いている日付
  const [editingDate, setEditingDate] = useState<string | null>(null);

  const isLocked = (existingReq?.submitted && deadlinePassed) || false;
  const isSubmitted = existingReq?.submitted ?? false;
  const isReopened = existingReq && !existingReq.submitted;
  const canEdit = !isLocked && (isReopened || !isSubmitted);

  const dayMap = useMemo(() => {
    const m: Record<string, ShiftDayRequest> = {};
    for (const d of days) m[d.date] = d;
    return m;
  }, [days]);

  const handleLongPress = (date: string) => {
    if (!canEdit) return;
    // 長押しで一括選択モード開始
    setEditingDate(null);
    setSelectedDates(prev => {
      const next = new Set(prev);
      next.add(date);
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // 一括操作
  // ---------------------------------------------------------------------------
  const bulkSetPreference = (pref: ShiftPreference) => {
    setDays(prev =>
      prev.map(d => {
        if (!selectedDates.has(d.date)) return d;
        if (pref === 'work') {
          return { ...d, preference: 'work', startTime: OPEN_TIME, endTime: LAST_TIME };
        }
        if (pref === 'off') {
          return { ...d, preference: 'off', startTime: OPEN_TIME, endTime: LAST_TIME };
        }
        // undecided = クリア
        return { ...d, preference: 'undecided', startTime: OPEN_TIME, endTime: LAST_TIME };
      }),
    );
    setSelectedDates(new Set());
  };

  // ---------------------------------------------------------------------------
  // 個別更新
  // ---------------------------------------------------------------------------
  const updateDayField = (date: string, updates: Partial<ShiftDayRequest>) => {
    setDays(prev =>
      prev.map(d => (d.date === date ? { ...d, ...updates } : d)),
    );
  };

  // ---------------------------------------------------------------------------
  // 提出 / 再提出
  // ---------------------------------------------------------------------------
  const handleSubmit = () => {
    const req: ShiftRequest = {
      id: existingReq?.id ?? `sr_${castId}_${targetMonth}`,
      storeId,
      castId,
      month: targetMonth,
      days,
      submitted: true,
      submittedAt: new Date().toISOString(),
    };
    submitRequest(req);
  };

  const handleReopen = () => {
    reopenRequest(castId, targetMonth);
    setDays(buildInitialDays());
  };

  // ---------------------------------------------------------------------------
  // カレンダーグリッド
  // ---------------------------------------------------------------------------
  const gridCells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // 個別編集パネル用 - 現在値
  const editingDay = editingDate ? (dayMap[editingDate] ?? null) : null;
  const [editStartTime, setEditStartTime] = useState<string>(OPEN_TIME);
  const [editDouhanTime, setEditDouhanTime] = useState<string>('');
  const [editDouhanMemo, setEditDouhanMemo] = useState<string>('');

  // 編集パネルを開いたとき初期値を同期
  const openEditPanel = (date: string) => {
    const d = dayMap[date];
    setEditStartTime(d?.startTime && START_TIME_OPTIONS.includes(d.startTime) ? d.startTime : OPEN_TIME);
    setEditDouhanTime(d?.douhanTime ?? '');
    setEditDouhanMemo(d?.douhanMemo ?? '');
    setEditingDate(date);
  };

  const handleCellTapWithPanel = (date: string) => {
    if (!canEdit) return;
    if (selectedDates.size > 0) {
      setSelectedDates(prev => {
        const next = new Set(prev);
        if (next.has(date)) next.delete(date);
        else next.add(date);
        return next;
      });
      return;
    }
    if (editingDate === date) {
      setEditingDate(null);
    } else {
      openEditPanel(date);
    }
  };

  // ---------------------------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------------------------
  const isBulkMode = selectedDates.size > 0;

  return (
    <div className="p-4 space-y-4 pb-28">
      {/* ヘッダー */}
      <div className="bg-brand-gradient rounded-2xl p-5 shadow-glow animate-fade-in-up">
        <p className="text-sm text-white/70 font-medium mb-1">シフト提出</p>
        <h1 className="font-mincho text-xl font-bold text-white">{formatMonth(targetMonth)}</h1>
        <p className="text-xs text-white/50 mt-1">
          営業時間 20:00〜ラスト(25:00) / 提出期限: 毎月{settings.shiftDeadlineDay}日まで
        </p>
        <div className="mt-3 flex gap-2 flex-wrap">
          {isSubmitted && !isReopened && (
            <span className="text-xs bg-white/20 text-white px-3 py-1 rounded-full font-medium">
              提出済み
            </span>
          )}
          {isReopened && (
            <span className="text-xs bg-amber-400/80 text-white px-3 py-1 rounded-full font-medium">
              再提出受付中
            </span>
          )}
          {isLocked && (
            <span className="text-xs bg-red-400/80 text-white px-3 py-1 rounded-full font-medium">
              締切済み
            </span>
          )}
        </div>
      </div>

      {/* 締切済みメッセージ */}
      {isLocked && (
        <div className="glass rounded-xl p-4 border border-rose-200">
          <p className="text-sm text-rose-600 font-medium">
            提出期限（{settings.shiftDeadlineDay}日）を過ぎているため、編集できません。
          </p>
        </div>
      )}

      {/* 操作説明 */}
      {canEdit && (
        <div className="glass rounded-xl p-3 text-xs text-ink-secondary space-y-0.5">
          <p>・日付をタップ → 個別編集（出勤時刻・同伴予定）</p>
          <p>・日付を長押し → 複数選択モード（一括操作）</p>
        </div>
      )}

      {/* 凡例 */}
      <div className="glass rounded-xl p-3 shadow-card flex gap-4 flex-wrap items-center">
        {(['work', 'off', 'undecided'] as ShiftPreference[]).map(p => (
          <div key={p} className="flex items-center gap-1.5">
            <span className={`w-4 h-4 rounded border ${prefColor[p].split(' ').slice(0, 2).join(' ')}`} />
            <span className="text-xs text-ink-secondary">{prefLabel[p]}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2">
          <span className="text-[10px] text-amber-600 font-bold">◎</span>
          <span className="text-xs text-ink-secondary">同伴予定</span>
        </div>
      </div>

      {/* 一括選択ツールバー */}
      {isBulkMode && (
        <div className="glass rounded-xl shadow-card p-3 animate-fade-in-up border border-amber-300">
          <p className="text-xs font-medium text-amber-700 mb-2">
            {selectedDates.size}日を選択中
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => bulkSetPreference('work')}
              className="flex-1 min-w-0 bg-emerald-500 text-white text-xs py-2 px-3 rounded-lg font-medium active:scale-95 transition-all"
            >
              出勤(オープンラスト)
            </button>
            <button
              onClick={() => bulkSetPreference('off')}
              className="flex-1 min-w-0 bg-rose-500 text-white text-xs py-2 px-3 rounded-lg font-medium active:scale-95 transition-all"
            >
              休み
            </button>
            <button
              onClick={() => bulkSetPreference('undecided')}
              className="flex-1 min-w-0 bg-gray-400 text-white text-xs py-2 px-3 rounded-lg font-medium active:scale-95 transition-all"
            >
              クリア
            </button>
            <button
              onClick={() => setSelectedDates(new Set())}
              className="text-xs text-ink-tertiary py-2 px-3 rounded-lg border border-ink/10 active:scale-95 transition-all"
            >
              選択解除
            </button>
          </div>
        </div>
      )}

      {/* カレンダー */}
      <div className="glass rounded-xl shadow-card p-3">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 mb-1">
          {DOW.map((d, i) => (
            <div
              key={d}
              className={`text-center text-xs font-medium py-1 ${
                i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-ink-secondary'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* セル */}
        <div className="grid grid-cols-7 gap-1">
          {gridCells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} />;
            }
            const date = `${targetMonth}-${String(day).padStart(2, '0')}`;
            const dayData = dayMap[date];
            const pref = dayData?.preference ?? 'undecided';
            const dow = (firstDow + day - 1) % 7;
            const isSelected = selectedDates.has(date);
            const isEditing = editingDate === date;
            const hasDouhan = !!(dayData?.douhanTime || dayData?.douhanMemo);

            return (
              <div key={date} className="col-span-1">
                <button
                  onClick={() => handleCellTapWithPanel(date)}
                  onContextMenu={(e) => { e.preventDefault(); handleLongPress(date); }}
                  // モバイル長押し: touchstart + timer
                  onTouchStart={() => {
                    const timer = setTimeout(() => handleLongPress(date), 500);
                    (window as Window & { _longPressTimer?: ReturnType<typeof setTimeout> })._longPressTimer = timer;
                  }}
                  onTouchEnd={() => {
                    const w = window as Window & { _longPressTimer?: ReturnType<typeof setTimeout> };
                    if (w._longPressTimer) { clearTimeout(w._longPressTimer); w._longPressTimer = undefined; }
                  }}
                  disabled={isLocked}
                  className={`w-full border-2 rounded-lg p-1 text-center transition-all relative ${
                    isSelected
                      ? 'border-amber-400 bg-amber-100 ring-2 ring-amber-300'
                      : isEditing
                        ? `border-gold bg-gold/10 ring-2 ring-gold/40 ${prefColor[pref]}`
                        : prefColor[pref]
                  } ${canEdit && !isLocked ? 'active:scale-95 cursor-pointer' : 'cursor-default'}`}
                >
                  <span
                    className={`text-xs font-bold block ${
                      dow === 0 ? 'text-rose-600' : dow === 6 ? 'text-blue-600' : ''
                    }`}
                  >
                    {day}
                  </span>
                  <span className="text-[10px] leading-tight block">{prefLabel[pref]}</span>
                  {hasDouhan && (
                    <span className="absolute top-0 right-0.5 text-[8px] text-amber-600 font-bold leading-none">◎</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 個別編集パネル */}
      {editingDate && editingDay !== null && canEdit && (
        <div className="glass rounded-xl shadow-card p-4 space-y-4 animate-fade-in-up border border-gold/30">
          <div className="flex items-center justify-between">
            <p className="text-sm font-mincho font-bold text-ink">
              {Number(editingDate.split('-')[2])}日（{DOW[(firstDow + Number(editingDate.split('-')[2]) - 1) % 7]}）の編集
            </p>
            <button
              onClick={() => setEditingDate(null)}
              className="text-xs text-ink-tertiary hover:text-ink px-2 py-1"
            >
              閉じる
            </button>
          </div>
          <div className="rule-gold" />

          {/* 勤務時間 */}
          <div>
            <p className="text-xs font-medium text-ink-secondary mb-2">勤務時間</p>
            <div className="flex items-center gap-3">
              <div className="space-y-1">
                <label className="text-xs text-ink-secondary">出勤時刻</label>
                <select
                  value={editStartTime}
                  onChange={e => setEditStartTime(e.target.value)}
                  className="border border-ink/10 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
                >
                  {START_TIME_OPTIONS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <span className="text-ink-tertiary mt-4">〜</span>
              <div className="space-y-1">
                <label className="text-xs text-ink-secondary">退勤</label>
                <div className="border border-ink/10 rounded-xl px-3 py-2 text-sm bg-gray-50 text-ink-secondary min-w-[80px]">
                  ラスト(25:00)
                </div>
              </div>
            </div>
            <p className="text-[10px] text-ink-tertiary mt-1">
              最大5時間勤務。退勤はラスト(25:00)固定。
            </p>
          </div>

          {/* 同伴予定 */}
          <div>
            <p className="text-xs font-medium text-ink-secondary mb-2">同伴予定（任意）</p>
            <div className="flex gap-3 items-start">
              <div className="space-y-1">
                <label className="text-xs text-ink-secondary">時刻</label>
                <input
                  type="time"
                  value={editDouhanTime}
                  onChange={e => setEditDouhanTime(e.target.value)}
                  placeholder="例: 19:00"
                  className="border border-ink/10 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20 w-28"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs text-ink-secondary">メモ（客名など）</label>
                <input
                  type="text"
                  value={editDouhanMemo}
                  onChange={e => setEditDouhanMemo(e.target.value)}
                  placeholder="例: 田中様"
                  maxLength={50}
                  className="w-full border border-ink/10 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
                />
              </div>
            </div>
          </div>

          {/* 保存ボタン */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                updateDayField(editingDate, {
                  preference: 'work',
                  startTime: editStartTime,
                  endTime: LAST_TIME,
                  douhanTime: editDouhanTime || undefined,
                  douhanMemo: editDouhanMemo || undefined,
                });
                setEditingDate(null);
              }}
              className="flex-1 bg-brand-gradient text-white py-2 rounded-xl text-sm font-bold shadow-glow active:scale-98 transition-all"
            >
              この日を出勤で保存
            </button>
            <button
              onClick={() => {
                updateDayField(editingDate, {
                  preference: 'off',
                  startTime: OPEN_TIME,
                  endTime: LAST_TIME,
                  douhanTime: undefined,
                  douhanMemo: undefined,
                });
                setEditingDate(null);
              }}
              className="px-4 bg-rose-100 text-rose-700 border border-rose-300 py-2 rounded-xl text-sm font-medium active:scale-98 transition-all"
            >
              休み
            </button>
          </div>
        </div>
      )}

      {/* 出勤希望日一覧 */}
      {days.filter(d => d.preference === 'work').length > 0 && (
        <div className="glass rounded-xl shadow-card p-4">
          <p className="font-mincho text-sm font-bold text-ink mb-2">出勤希望日一覧</p>
          <div className="rule-gold mb-3" />
          <div className="space-y-2">
            {days
              .filter(d => d.preference === 'work')
              .map(d => {
                const dayNum = Number(d.date.split('-')[2]);
                const dow = (firstDow + dayNum - 1) % 7;
                const hasDouhan = !!(d.douhanTime || d.douhanMemo);
                return (
                  <div key={d.date} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <button
                        className={`text-sm font-medium text-left hover:underline ${
                          dow === 0 ? 'text-rose-600' : dow === 6 ? 'text-blue-600' : 'text-ink'
                        }`}
                        onClick={() => canEdit && openEditPanel(d.date)}
                      >
                        {dayNum}日（{DOW[dow]}）
                        {hasDouhan && <span className="ml-1 text-amber-600 text-xs">◎</span>}
                      </button>
                      <span className="text-xs text-ink-secondary font-mono">
                        {d.startTime}〜{LAST_TIME}
                      </span>
                    </div>
                    {hasDouhan && (
                      <p className="text-[11px] text-amber-700 pl-1">
                        同伴: {d.douhanTime && `${d.douhanTime} `}{d.douhanMemo}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* アクションボタン（固定フッター） */}
      <div className="fixed bottom-20 left-0 right-0 px-4 space-y-2">
        {isSubmitted && !isReopened && !isLocked && (
          <button
            onClick={handleReopen}
            className="w-full py-3 rounded-xl border border-brand text-brand font-medium text-sm hover:bg-brand/5 transition-all"
          >
            提出内容を修正する
          </button>
        )}
        {canEdit && (
          <button
            onClick={handleSubmit}
            className="w-full bg-brand-gradient text-white py-3 rounded-xl font-bold text-sm shadow-glow hover:shadow-glow-lg transition-all active:scale-98"
          >
            提出する
          </button>
        )}
      </div>
    </div>
  );
}
