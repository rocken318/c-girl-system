import { useEffect, useState } from 'react';
import { useAuth } from '../../store/AuthContext';
import { usePerformance } from '../../store/PerformanceContext';
import { fetchMyTimeRecords, formatWorked, toJstHHmm, currentMonthJst, type TimeRecord } from '../../data/timeRecords';

// 売上履歴セクションは seed データ（2026-06 固定）を表示するため、別定数を使用
const SALES_HISTORY_MONTH = '2026-06';
// 打刻履歴は当月（JST）を動的に取得
const TIME_RECORDS_MONTH = currentMonthJst();

export function AttendancePage() {
  const { user } = useAuth();
  const { dailyRecords, getMonthlyPerformances } = usePerformance();
  const castId = user?.castData?.id ?? '';
  const performances = getMonthlyPerformances(SALES_HISTORY_MONTH);
  const perf = performances.find(p => p.castId === castId);

  const myDailyRecords = dailyRecords
    .filter(r => r.castId === castId && r.date.startsWith(SALES_HISTORY_MONTH))
    .sort((a, b) => a.date.localeCompare(b.date));

  const days = myDailyRecords.map(r => {
    const d = new Date(r.date);
    return {
      date: `6/${d.getDate()}`,
      dayOfWeek: ['日','月','火','水','木','金','土'][d.getDay()],
      hours: r.hours,
      shimei: r.honShimei,
      drinks: r.drinks,
      douhan: r.douhan,
      attended: r.attended,
      isLate: r.isLate,
      isAbsent: r.isAbsent,
    };
  });

  // 打刻履歴
  const [timeRecords, setTimeRecords] = useState<TimeRecord[]>([]);
  const [loadingTime, setLoadingTime] = useState(true);

  useEffect(() => {
    setLoadingTime(true);
    fetchMyTimeRecords(TIME_RECORDS_MONTH)
      .then(setTimeRecords)
      .catch(console.error)
      .finally(() => setLoadingTime(false));
  }, []);

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-mincho text-xl font-bold text-ink">出勤・売上履歴</h2>
      <p className="text-sm text-ink-tertiary">2026年6月</p>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '出勤', value: perf?.workDays ?? 0, unit: '日' },
          { label: '本指名', value: perf?.honShimei ?? 0, unit: '本' },
          { label: '同伴', value: perf?.douhan ?? 0, unit: '回' },
        ].map(stat => (
          <div key={stat.label} className="glass rounded-xl p-3 shadow-soft text-center">
            <p className="text-xs text-ink-tertiary">{stat.label}</p>
            <p className="font-mincho text-lg font-bold text-ink mt-0.5">
              {stat.value}<span className="text-xs font-normal text-ink-tertiary ml-0.5">{stat.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Daily sales list */}
      <div className="space-y-2">
        {days.map((d, i) => (
          <div key={i} className={`glass rounded-xl p-3 shadow-soft flex items-center justify-between ${
            i % 2 === 0 ? '' : 'bg-white/50'
          }`}>
            <div>
              <span className="font-medium text-ink">{d.date}</span>
              <span className="text-xs text-ink-tertiary ml-1">({d.dayOfWeek})</span>
            </div>
            <div className="flex gap-2 text-xs">
              {d.attended ? (
                <>
                  <span className="text-ink-secondary">{d.hours}h</span>
                  <span className="text-ink-secondary">指名{d.shimei}</span>
                  <span className="text-ink-secondary">D{d.drinks}</span>
                  {d.douhan > 0 && (
                    <span className="bg-brand/10 text-brand font-bold px-1.5 py-0.5 rounded-full">同伴</span>
                  )}
                  {d.isLate && (
                    <span className="bg-warn-bg text-warn font-medium px-1.5 py-0.5 rounded-full">遅刻</span>
                  )}
                </>
              ) : (
                <span className={`px-2 py-0.5 rounded-full font-medium ${
                  d.isAbsent ? 'bg-danger-bg text-danger' : 'text-ink-tertiary'
                }`}>
                  {d.isAbsent ? '欠勤' : '休み'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 打刻履歴セクション */}
      <div className="space-y-2">
        <h3 className="font-mincho text-base font-bold text-ink">打刻履歴</h3>
        {loadingTime ? (
          <p className="text-sm text-ink-tertiary">読み込み中…</p>
        ) : timeRecords.length === 0 ? (
          <p className="text-sm text-ink-tertiary">打刻記録なし</p>
        ) : (
          <div className="glass rounded-xl shadow-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5">
                  <th className="text-left px-3 py-2 text-xs text-ink-tertiary font-medium">日付</th>
                  <th className="text-center px-3 py-2 text-xs text-ink-tertiary font-medium">出勤</th>
                  <th className="text-center px-3 py-2 text-xs text-ink-tertiary font-medium">退勤</th>
                  <th className="text-right px-3 py-2 text-xs text-ink-tertiary font-medium">勤務時間</th>
                </tr>
              </thead>
              <tbody>
                {timeRecords.map((r, i) => {
                  const d = new Date(r.business_date);
                  const month = d.getUTCMonth() + 1;
                  const day = d.getUTCDate();
                  const dow = ['日','月','火','水','木','金','土'][d.getUTCDay()];
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-black/5 last:border-0 ${i % 2 !== 0 ? 'bg-white/40' : ''}`}
                    >
                      <td className="px-3 py-2 text-ink">
                        {month}/{day}
                        <span className="text-xs text-ink-tertiary ml-1">({dow})</span>
                      </td>
                      <td className="px-3 py-2 text-center text-ink-secondary">
                        {toJstHHmm(r.clock_in_at)}
                      </td>
                      <td className="px-3 py-2 text-center text-ink-secondary">
                        {r.clock_out_at ? toJstHHmm(r.clock_out_at) : (
                          <span className="text-brand font-medium">勤務中</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-ink-secondary">
                        {formatWorked(r.worked_minutes)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
