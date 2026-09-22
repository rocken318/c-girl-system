import { useMemo } from 'react';
import { fieldsToStatus, type AttendanceStatus } from '../lib/attendanceStatus';

/** カレンダー入力に必要な最小フィールド（daily_records 由来） */
export interface AttendanceCalendarRecord {
  date: string;
  attended?: boolean;
  isLate?: boolean;
  isAbsent?: boolean;
  attendanceType?: string;
}

const ATT_ABBR: Record<AttendanceStatus, string> = {
  unconfirmed: '', present: '出', douhan: '同', late: '遅', absent: '欠', same_day_absence: '当',
};
const ATT_FULL: Record<AttendanceStatus, string> = {
  unconfirmed: '未記録', present: '出勤', douhan: '同伴', late: '遅刻', absent: '欠勤', same_day_absence: '当欠',
};
const ATT_CELL: Record<AttendanceStatus, string> = {
  unconfirmed: 'bg-surface-base border border-ink/5 text-ink-tertiary/50',
  present: 'bg-emerald-100 text-emerald-700',
  douhan: 'bg-brand/10 text-brand',
  late: 'bg-amber-100 text-amber-700',
  absent: 'bg-red-100 text-red-700',
  same_day_absence: 'bg-red-200 text-red-800',
};
const LEGEND: AttendanceStatus[] = ['present', 'douhan', 'late', 'absent', 'same_day_absence'];

/** 月次の出欠カレンダー。日別区分を色分けして表示。 */
export function AttendanceCalendar({
  month,
  records,
  showLegend = true,
}: {
  month: string; // YYYY-MM
  records: AttendanceCalendarRecord[];
  showLegend?: boolean;
}) {
  const statusByDate = useMemo(() => {
    const m = new Map<string, AttendanceStatus>();
    for (const r of records) m.set(r.date, fieldsToStatus(r));
    return m;
  }, [records]);

  const [y, mo] = month.split('-').map(Number);
  const firstDow = new Date(y, mo - 1, 1).getDay();
  const totalDays = new Date(y, mo, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1 md:gap-1.5">
        {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
          <div key={d} className={`text-center text-[11px] md:text-xs font-medium ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-ink-tertiary'}`}>
            {d}
          </div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) return <div key={`b${idx}`} />;
          const date = `${month}-${String(day).padStart(2, '0')}`;
          const st = statusByDate.get(date) ?? 'unconfirmed';
          const has = st !== 'unconfirmed';
          return (
            <div
              key={date}
              title={has ? `${date} ${ATT_FULL[st]}` : date}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center ${ATT_CELL[st]}`}
            >
              <span className="text-[11px] md:text-sm font-bold leading-none">{day}</span>
              {has && <span className="text-[9px] md:text-[11px] mt-0.5 leading-none">{ATT_ABBR[st]}</span>}
            </div>
          );
        })}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {LEGEND.map(st => (
            <span key={st} className={`px-2 py-0.5 rounded text-[10px] md:text-xs ${ATT_CELL[st]}`}>{ATT_FULL[st]}</span>
          ))}
        </div>
      )}
    </div>
  );
}
