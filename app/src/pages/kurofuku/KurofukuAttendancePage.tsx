import { useEffect, useState } from 'react';
import { fetchMyTimeRecords, formatWorked, toJstHHmm, type TimeRecord } from '../../data/timeRecords';

// 今月を動的に取得（YYYY-MM）
function currentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function KurofukuAttendancePage() {
  const [month] = useState(currentMonth);
  const [timeRecords, setTimeRecords] = useState<TimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchMyTimeRecords(month)
      .then(setTimeRecords)
      .catch(() => setError('勤怠データの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [month]);

  const [y, m] = month.split('-');
  const monthLabel = `${y}年${Number(m)}月`;

  const totalMinutes = timeRecords.reduce((acc, r) => acc + (r.worked_minutes ?? 0), 0);
  const workDays = timeRecords.filter(r => r.worked_minutes !== null).length;

  return (
    <div className="p-4 space-y-4 animate-fade-in-up">
      <div>
        <h2 className="font-mincho text-xl font-bold text-ink">自分の勤怠</h2>
        <p className="text-xs text-ink-tertiary mt-0.5">{monthLabel}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-xl p-3 shadow-soft text-center">
          <p className="text-xs text-ink-tertiary">出勤日数</p>
          <p className="font-mincho text-lg font-bold text-ink mt-0.5">
            {workDays}<span className="text-xs font-normal text-ink-tertiary ml-0.5">日</span>
          </p>
        </div>
        <div className="glass rounded-xl p-3 shadow-soft text-center">
          <p className="text-xs text-ink-tertiary">累計勤務</p>
          <p className="font-mincho text-lg font-bold text-ink mt-0.5">
            {Math.floor(totalMinutes / 60)}<span className="text-xs font-normal text-ink-tertiary ml-0.5">時間</span>
            {totalMinutes % 60}<span className="text-xs font-normal text-ink-tertiary ml-0.5">分</span>
          </p>
        </div>
      </div>

      {/* Time records table */}
      <div className="space-y-2">
        <h3 className="font-mincho text-base font-bold text-ink">打刻履歴</h3>
        {loading ? (
          <p className="text-sm text-ink-tertiary">読み込み中…</p>
        ) : error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : timeRecords.length === 0 ? (
          <div className="glass rounded-xl p-6 shadow-soft text-center">
            <p className="text-sm text-ink-tertiary">今月の打刻記録がありません</p>
          </div>
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
                  const mo = d.getUTCMonth() + 1;
                  const day = d.getUTCDate();
                  const dow = ['日','月','火','水','木','金','土'][d.getUTCDay()];
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-black/5 last:border-0 ${i % 2 !== 0 ? 'bg-white/40' : ''}`}
                    >
                      <td className="px-3 py-2 text-ink">
                        {mo}/{day}
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

      {/* P4 note */}
      <div className="glass rounded-xl p-4 shadow-soft border border-gold/20">
        <p className="text-xs text-ink-tertiary leading-relaxed">
          ※ 担当キャストの出勤率・売上・給与の閲覧は今後（P4）対応予定です。
        </p>
      </div>
    </div>
  );
}
