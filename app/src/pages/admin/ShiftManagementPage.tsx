import { useState, useMemo } from 'react';
import { useSettings } from '../../store/SettingsContext';
import { useShift, type ConfirmedShift } from '../../store/ShiftContext';
import { casts } from '../../data/seed';

function getDaysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function getFirstDayOfWeek(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).getDay();
}

function getTargetMonth(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${Number(m)}月`;
}

const DOW_SHORT = ['日', '月', '火', '水', '木', '金', '土'];

type Section = 'submission' | 'confirmation';

export function ShiftManagementPage() {
  const { settings } = useSettings();
  const { shiftRequests, reopenRequest, confirmShift, removeConfirmedShift, publishMonth, getConfirmedForMonth } = useShift();

  const storeId = settings.storeId;

  const defaultMonth = getTargetMonth(settings.shiftTargetMonthOffset);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [activeSection, setActiveSection] = useState<Section>('submission');

  const monthOptions = [0, 1, 2].map(o => getTargetMonth(o));

  const storeCasts = casts.filter(c => c.storeId === storeId);

  // Submission status
  const requestsForMonth = shiftRequests.filter(r => r.storeId === storeId && r.month === selectedMonth);

  // Confirmation grid
  const daysInMonth = getDaysInMonth(selectedMonth);
  const firstDow = getFirstDayOfWeek(selectedMonth);
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const confirmedForMonth = getConfirmedForMonth(selectedMonth).filter(s => s.storeId === storeId);
  const isMonthPublished = confirmedForMonth.length > 0 && confirmedForMonth.every(s => s.published);

  // Build confirmed shift map: castId -> date -> ConfirmedShift
  const confirmedMap = useMemo(() => {
    const m: Record<string, Record<string, ConfirmedShift>> = {};
    for (const s of confirmedForMonth) {
      if (!m[s.castId]) m[s.castId] = {};
      m[s.castId][s.date] = s;
    }
    return m;
  }, [confirmedForMonth]);

  // Build request preference map: castId -> date -> preference
  const requestPrefMap = useMemo(() => {
    const m: Record<string, Record<string, string>> = {};
    for (const req of requestsForMonth) {
      m[req.castId] = {};
      for (const d of req.days) {
        m[req.castId][d.date] = d.preference;
      }
    }
    return m;
  }, [requestsForMonth]);

  // Build request time map: castId -> date -> {startTime, endTime}
  const requestTimeMap = useMemo(() => {
    const m: Record<string, Record<string, { startTime: string; endTime: string }>> = {};
    for (const req of requestsForMonth) {
      m[req.castId] = {};
      for (const d of req.days) {
        m[req.castId][d.date] = { startTime: d.startTime, endTime: d.endTime };
      }
    }
    return m;
  }, [requestsForMonth]);

  const toggleConfirmed = (castId: string, day: number) => {
    const date = `${selectedMonth}-${String(day).padStart(2, '0')}`;
    const existing = confirmedMap[castId]?.[date];

    if (existing) {
      removeConfirmedShift(existing.id);
    } else {
      const reqTimes = requestTimeMap[castId]?.[date];
      const newShift: ConfirmedShift = {
        id: `cs_${castId}_${date}_${Date.now()}`,
        storeId,
        castId,
        date,
        startTime: reqTimes?.startTime ?? settings.shiftDefaultStartTime,
        endTime: reqTimes?.endTime ?? settings.shiftDefaultEndTime,
        published: false,
      };
      confirmShift(newShift);
    }
  };

  const prefBg: Record<string, string> = {
    work: 'bg-emerald-100',
    off: 'bg-rose-50',
    undecided: 'bg-gray-50',
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="font-mincho text-xl md:text-2xl font-bold text-ink">シフト管理</h1>
      </div>

      {/* Month selector */}
      <div className="flex gap-1 bg-ink/5 p-1 rounded-xl overflow-x-auto">
        {monthOptions.map(m => (
          <button
            key={m}
            onClick={() => setSelectedMonth(m)}
            className={`px-4 py-2 text-sm rounded-lg whitespace-nowrap transition-all ${
              selectedMonth === m
                ? 'bg-surface-card text-brand font-bold shadow-soft'
                : 'text-ink-tertiary hover:text-ink-secondary'
            }`}
          >
            {formatMonth(m)}
          </button>
        ))}
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 bg-ink/5 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveSection('submission')}
          className={`px-4 py-2 text-sm rounded-lg transition-all ${
            activeSection === 'submission'
              ? 'bg-surface-card text-brand font-bold shadow-soft'
              : 'text-ink-tertiary hover:text-ink-secondary'
          }`}
        >
          提出状況
        </button>
        <button
          onClick={() => setActiveSection('confirmation')}
          className={`px-4 py-2 text-sm rounded-lg transition-all ${
            activeSection === 'confirmation'
              ? 'bg-surface-card text-brand font-bold shadow-soft'
              : 'text-ink-tertiary hover:text-ink-secondary'
          }`}
        >
          シフト確定
        </button>
      </div>

      {/* Section 1: 提出状況 */}
      {activeSection === 'submission' && (
        <div className="bg-surface-card rounded-2xl shadow-card p-6">
          <p className="font-mincho text-sm font-bold text-ink mb-3">提出状況</p>
          <div className="rule-gold mb-4" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="pb-3 text-ink-secondary font-medium pr-4">キャスト</th>
                  <th className="pb-3 text-ink-secondary font-medium pr-4">状態</th>
                  <th className="pb-3 text-ink-secondary font-medium pr-4">提出日時</th>
                  <th className="pb-3 text-ink-secondary font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {storeCasts.map(cast => {
                  const req = requestsForMonth.find(r => r.castId === cast.id);
                  const submitted = req?.submitted ?? false;
                  const submittedAt = req?.submittedAt ?? null;
                  return (
                    <tr key={cast.id}>
                      <td className="py-3 pr-4 font-medium text-ink">{cast.name}</td>
                      <td className="py-3 pr-4">
                        {submitted ? (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                            提出済
                          </span>
                        ) : (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                            未提出
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-ink-secondary text-xs">
                        {submittedAt
                          ? new Date(submittedAt).toLocaleString('ja-JP', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '-'}
                      </td>
                      <td className="py-3">
                        {submitted && (
                          <button
                            onClick={() => reopenRequest(cast.id, selectedMonth)}
                            className="text-xs text-brand hover:text-brand-dark transition-colors border border-brand/30 px-2 py-0.5 rounded-lg"
                          >
                            希望再開
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 2: シフト確定 */}
      {activeSection === 'confirmation' && (
        <div className="bg-surface-card rounded-2xl shadow-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mincho text-sm font-bold text-ink">シフト確定グリッド</p>
              <p className="text-xs text-ink-tertiary mt-0.5">セルをクリックして確定/取消</p>
            </div>
            <div className="flex items-center gap-3">
              {isMonthPublished && (
                <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-medium">
                  公開済み
                </span>
              )}
              <button
                onClick={() => publishMonth(selectedMonth)}
                disabled={isMonthPublished || confirmedForMonth.length === 0}
                className="bg-brand-gradient text-white px-4 py-2 rounded-xl text-sm font-medium hover:shadow-glow transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                一括公開
              </button>
            </div>
          </div>
          <div className="rule-gold" />

          {/* Legend */}
          <div className="flex gap-4 flex-wrap text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded border bg-emerald-100 border-emerald-300" />
              <span className="text-ink-secondary">出勤希望</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded border bg-rose-50 border-rose-200" />
              <span className="text-ink-secondary">休み希望</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded border bg-gray-50 border-gray-200" />
              <span className="text-ink-secondary">未定</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded border bg-brand/20 border-brand/60" />
              <span className="text-ink-secondary">確定済</span>
            </div>
          </div>

          {/* Grid */}
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse min-w-max">
              <thead>
                <tr>
                  <th className="w-20 text-left py-1 pr-2 text-ink-secondary font-medium sticky left-0 bg-surface-card">
                    キャスト
                  </th>
                  {dayNumbers.map(d => {
                    const dow = (firstDow + d - 1) % 7;
                    return (
                      <th
                        key={d}
                        className={`w-8 text-center py-1 px-0.5 font-medium ${
                          dow === 0 ? 'text-rose-500' : dow === 6 ? 'text-blue-500' : 'text-ink-secondary'
                        }`}
                      >
                        <div>{d}</div>
                        <div className="text-[9px] font-normal">{DOW_SHORT[dow]}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {storeCasts.map(cast => (
                  <tr key={cast.id}>
                    <td className="py-1 pr-2 font-medium text-ink sticky left-0 bg-surface-card whitespace-nowrap">
                      {cast.name}
                    </td>
                    {dayNumbers.map(d => {
                      const date = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                      const pref = requestPrefMap[cast.id]?.[date] ?? 'undecided';
                      const confirmed = confirmedMap[cast.id]?.[date];
                      const bgClass = confirmed ? 'bg-brand/20 border-brand/60' : prefBg[pref] + ' border-gray-200';

                      return (
                        <td key={d} className="p-0.5">
                          <button
                            onClick={() => toggleConfirmed(cast.id, d)}
                            className={`w-7 h-7 rounded border text-center transition-all hover:opacity-80 active:scale-90 ${bgClass}`}
                            title={`${cast.name} ${d}日 - ${pref}${confirmed ? ' (確定)' : ''}`}
                          >
                            {confirmed && (
                              <span className="text-brand text-[10px] font-bold">✓</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Confirmed count */}
          <p className="text-xs text-ink-tertiary">
            確定済み: {confirmedForMonth.length}件
          </p>
        </div>
      )}
    </div>
  );
}
