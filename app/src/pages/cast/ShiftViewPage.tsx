import { useState } from 'react';
import { useAuth } from '../../store/AuthContext';
import { useSettings } from '../../store/SettingsContext';
import { useShift } from '../../store/ShiftContext';

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
  return new Date(y, m - 1, 1).getDay();
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${Number(m)}月`;
}

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

export function ShiftViewPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { getConfirmedForCast } = useShift();

  const castId = user?.castData?.id ?? '';

  const defaultMonth = getTargetMonth(settings.shiftTargetMonthOffset);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);

  const confirmedShifts = getConfirmedForCast(castId, selectedMonth);
  const isPublished = confirmedShifts.length > 0 && confirmedShifts.every(s => s.published);
  const hasAnyPublished = confirmedShifts.some(s => s.published);

  const daysInMonth = getDaysInMonth(selectedMonth);
  const firstDow = getFirstDayOfWeek(selectedMonth);

  const shiftMap: Record<string, { startTime: string; endTime: string }> = {};
  for (const s of confirmedShifts) {
    if (s.published) {
      shiftMap[s.date] = { startTime: s.startTime, endTime: s.endTime };
    }
  }

  const gridCells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Month options: current month and next 2
  const monthOptions = [0, 1, 2].map(o => getTargetMonth(o));

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div className="bg-brand-gradient rounded-2xl p-5 shadow-glow animate-fade-in-up">
        <p className="text-sm text-white/70 font-medium mb-1">確定シフト</p>
        <h1 className="font-mincho text-xl font-bold text-white">{formatMonth(selectedMonth)}</h1>
        {isPublished && (
          <span className="mt-2 inline-block text-xs bg-white/20 text-white px-3 py-1 rounded-full font-medium">
            公開済み
          </span>
        )}
      </div>

      {/* Month selector */}
      <div className="glass rounded-xl p-3 shadow-card flex gap-2 overflow-x-auto">
        {monthOptions.map(m => (
          <button
            key={m}
            onClick={() => setSelectedMonth(m)}
            className={`px-4 py-2 text-sm rounded-lg whitespace-nowrap transition-all ${
              selectedMonth === m
                ? 'bg-brand-gradient text-white font-bold shadow-soft'
                : 'text-ink-tertiary hover:text-ink-secondary'
            }`}
          >
            {formatMonth(m)}
          </button>
        ))}
      </div>

      {/* Not published message */}
      {!hasAnyPublished && (
        <div className="glass rounded-xl p-6 shadow-card text-center">
          <p className="text-ink-secondary text-sm">確定シフトはまだ公開されていません</p>
          <p className="text-xs text-ink-tertiary mt-1">管理者がシフトを公開するまでお待ちください</p>
        </div>
      )}

      {/* Calendar */}
      {hasAnyPublished && (
        <div className="glass rounded-xl shadow-card p-3">
          {/* DOW headers */}
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

          {/* Cells */}
          <div className="grid grid-cols-7 gap-1">
            {gridCells.map((day, idx) => {
              if (day === null) return <div key={`empty-${idx}`} />;
              const date = `${selectedMonth}-${String(day).padStart(2, '0')}`;
              const shift = shiftMap[date];
              const dow = (firstDow + day - 1) % 7;

              return (
                <div
                  key={date}
                  className={`border rounded-lg p-1 text-center min-h-14 ${
                    shift
                      ? 'bg-emerald-50 border-emerald-300'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <span
                    className={`text-xs font-bold block ${
                      dow === 0 ? 'text-rose-600' : dow === 6 ? 'text-blue-600' : 'text-ink'
                    }`}
                  >
                    {day}
                  </span>
                  {shift ? (
                    <div>
                      <span className="text-[9px] text-emerald-700 block leading-tight">{shift.startTime}</span>
                      <span className="text-[9px] text-emerald-700 block leading-tight">{shift.endTime}</span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-gray-400">-</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Shift list */}
      {hasAnyPublished && (
        <div className="glass rounded-xl shadow-card p-4">
          <p className="font-mincho text-sm font-bold text-ink mb-2">確定出勤日</p>
          <div className="rule-gold mb-3" />
          {Object.entries(shiftMap).length === 0 ? (
            <p className="text-sm text-ink-tertiary">出勤予定なし</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(shiftMap)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, shift]) => {
                  const dayNum = Number(date.split('-')[2]);
                  const dow = (firstDow + dayNum - 1) % 7;
                  return (
                    <div key={date} className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${dow === 0 ? 'text-rose-600' : dow === 6 ? 'text-blue-600' : 'text-ink'}`}>
                        {dayNum}日（{DOW[dow]}）
                      </span>
                      <span className="text-sm text-ink-secondary">
                        {shift.startTime} 〜 {shift.endTime}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
