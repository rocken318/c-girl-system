import { useEffect, useState } from 'react';
import { useAuth } from '../../store/AuthContext';
import {
  fetchManagedCasts,
  fetchCastDailyRecords,
  fetchCastShifts,
  dailySales,
  sumSales,
  avgSales,
  type ManagedCast,
  type CastDailyRecord,
  type CastShift,
} from '../../data/manager';
import {
  fetchCastAttendance,
  fetchKurofukuKpis,
  type CastAttendance,
  type KurofukuKpi,
} from '../../data/attendance';
import { periodKey } from '../../lib/targets';

// 対象月：当月に統一（KPI・出勤率・売上/シフト表示すべて当月）
// 2026年の実績データは通年で投入済みのため当月基準で一貫表示する。
const DEMO_MONTH = periodKey(new Date(), 'month');

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function formatYen(v: number): string {
  return v.toLocaleString('ja-JP') + '円';
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${Number(m)}月`;
}

function shiftStatusLabel(status: string): { text: string; className: string } {
  switch (status) {
    case 'published': return { text: '公開', className: 'bg-emerald-100 text-emerald-700' };
    case 'approved':  return { text: '承認済', className: 'bg-blue-100 text-blue-700' };
    case 'submitted': return { text: '提出済', className: 'bg-amber-100 text-amber-700' };
    case 'rejected':  return { text: '否認', className: 'bg-red-100 text-red-700' };
    default:          return { text: status, className: 'bg-gray-100 text-gray-600' };
  }
}

function dayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// スパークライン（CSS バー）
// ---------------------------------------------------------------------------

function SalesSparkline({ records }: { records: CastDailyRecord[] }) {
  if (records.length === 0) return null;
  const values = records.map(r => dailySales(r));
  const max = Math.max(...values, 1);

  return (
    <div className="space-y-0.5">
      <div className="flex items-end gap-0.5 h-12">
        {values.map((v, i) => {
          const heightPct = Math.max(4, Math.round((v / max) * 100));
          return (
            <div
              key={i}
              title={`${shortDate(records[i].date)}: ${formatYen(v)}`}
              className="flex-1 rounded-sm bg-brand/70 hover:bg-brand transition-colors cursor-default"
              style={{ height: `${heightPct}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// キャストカード
// ---------------------------------------------------------------------------

interface CastCardProps {
  cast: ManagedCast;
  month: string;
  attendance: CastAttendance | null;
}

function CastCard({ cast, month, attendance }: CastCardProps) {
  const [records, setRecords] = useState<CastDailyRecord[]>([]);
  const [shifts, setShifts] = useState<CastShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchCastDailyRecords(cast.id, month),
      fetchCastShifts(cast.id, month),
    ])
      .then(([recs, shfs]) => {
        if (cancelled) return;
        setRecords(recs);
        setShifts(shfs);
      })
      .catch(() => {
        if (!cancelled) setError('データ取得エラー');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [cast.id, month]);

  const total = sumSales(records);
  const avg = avgSales(records);
  const workDays = records.filter(r => r.attended).length;

  // 出勤率テキスト（当月）
  let attendanceText: string | null = null;
  if (attendance !== null) {
    if (attendance.rate !== null) {
      attendanceText = `出勤率 ${attendance.rate}%（${attendance.attendedDays}/${attendance.scheduledDays}日）`;
    } else {
      attendanceText = `${attendance.attendedDays}日出勤（予定未設定）`;
    }
  }

  return (
    <div className="glass rounded-2xl shadow-soft overflow-hidden">
      {/* カードヘッダー */}
      <div className="h-0.5 bg-brand-gradient" />
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div>
          <p className="font-mincho font-bold text-ink text-lg leading-tight">{cast.source_name}</p>
          <p className="text-xs text-ink-tertiary mt-0.5">
            ランク <span className="font-bold text-brand">{cast.rank}</span>
            <span className="mx-1.5 text-ink-tertiary/40">|</span>
            {monthLabel(month)}
          </p>
        </div>
        <div className="w-10 h-10 rounded-full bg-brand-gradient/20 border-2 border-brand/20 flex items-center justify-center">
          <span className="font-mincho font-bold text-brand text-lg">{cast.source_name.charAt(0)}</span>
        </div>
      </div>

      {loading ? (
        <div className="px-4 pb-4">
          <p className="text-sm text-ink-tertiary">読み込み中…</p>
        </div>
      ) : error ? (
        <div className="px-4 pb-4">
          <p className="text-sm text-danger">{error}</p>
        </div>
      ) : (
        <div className="px-4 pb-4 space-y-4">

          {/* サマリ */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/40 rounded-xl p-2 text-center">
              <p className="text-xs text-ink-tertiary">出勤日数</p>
              <p className="font-mincho font-bold text-ink text-base mt-0.5">
                {workDays}<span className="text-xs font-normal text-ink-tertiary ml-0.5">日</span>
              </p>
            </div>
            <div className="bg-white/40 rounded-xl p-2 text-center">
              <p className="text-xs text-ink-tertiary">月計売上</p>
              <p className="font-mincho font-bold text-brand text-base mt-0.5">
                {total === 0 ? '—' : (total >= 10000 ? `${Math.round(total / 10000)}万` : formatYen(total))}
              </p>
            </div>
            <div className="bg-white/40 rounded-xl p-2 text-center">
              <p className="text-xs text-ink-tertiary">日平均</p>
              <p className="font-mincho font-bold text-ink text-base mt-0.5">
                {avg === 0 ? '—' : (avg >= 10000 ? `${Math.round(avg / 10000)}万` : formatYen(avg))}
              </p>
            </div>
          </div>

          {/* 当月出勤率（P2追加） */}
          {attendanceText !== null && (
            <div className="bg-white/40 rounded-xl px-3 py-2 flex items-center justify-between">
              <p className="text-xs text-ink-tertiary font-medium">当月出勤率</p>
              <p className="text-xs font-bold text-ink">{attendanceText}</p>
            </div>
          )}

          {/* 売上推移スパークライン */}
          <div>
            <p className="text-xs text-ink-tertiary font-medium mb-1.5">売上推移（日別）</p>
            {records.length === 0 ? (
              <p className="text-xs text-ink-tertiary italic">実績データなし</p>
            ) : (
              <SalesSparkline records={records} />
            )}
          </div>

          {/* シフト一覧 */}
          <div>
            <p className="text-xs text-ink-tertiary font-medium mb-1.5">
              シフト<span className="ml-1 text-ink-tertiary/60">（{shifts.length}日）</span>
            </p>
            {shifts.length === 0 ? (
              <p className="text-xs text-ink-tertiary italic">シフトデータなし</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {shifts.map(s => {
                  const { text, className } = shiftStatusLabel(s.status);
                  const dow = dayOfWeek(s.date);
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-1 bg-white/50 rounded-lg px-2 py-1"
                      title={`${s.date} ${s.startTime}〜${s.endTime}`}
                    >
                      <span className="text-xs font-medium text-ink">{shortDate(s.date)}</span>
                      <span className={`text-xs ${dow === '日' ? 'text-red-400' : dow === '土' ? 'text-blue-400' : 'text-ink-tertiary'}`}>
                        ({dow})
                      </span>
                      <span className={`text-xs px-1 rounded font-medium ${className}`}>{text}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 自分のKPIヘッダカード（P2追加）
// ---------------------------------------------------------------------------

function MyKpiCard({ kpi, month }: { kpi: KurofukuKpi; month: string }) {
  return (
    <div className="glass rounded-2xl shadow-soft overflow-hidden">
      <div className="h-0.5 bg-brand-gradient" />
      <div className="px-4 pt-3 pb-1">
        <p className="font-mincho font-bold text-ink text-sm">
          {monthLabel(month)}の担当KPI
        </p>
      </div>
      <div className="px-4 pb-4 grid grid-cols-3 gap-2 mt-2">
        <div className="bg-white/40 rounded-xl p-2 text-center">
          <p className="text-xs text-ink-tertiary">担当人数</p>
          <p className="font-mincho font-bold text-ink text-xl mt-0.5">
            {kpi.castCount}<span className="text-xs font-normal text-ink-tertiary ml-0.5">人</span>
          </p>
        </div>
        <div className="bg-white/40 rounded-xl p-2 text-center">
          <p className="text-xs text-ink-tertiary">担当合計売上</p>
          <p className="font-mincho font-bold text-brand text-base mt-0.5">
            {kpi.totalSales === 0
              ? '—'
              : kpi.totalSales >= 10000
              ? `${Math.round(kpi.totalSales / 10000)}万`
              : formatYen(kpi.totalSales)}
          </p>
        </div>
        <div className="bg-white/40 rounded-xl p-2 text-center">
          <p className="text-xs text-ink-tertiary">平均出勤率</p>
          <p className="font-mincho font-bold text-ink text-xl mt-0.5">
            {kpi.avgRate !== null ? `${kpi.avgRate}%` : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ページ本体
// ---------------------------------------------------------------------------

export function KurofukuCastsPage() {
  const { user } = useAuth();
  const [casts, setCasts] = useState<ManagedCast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // P2: 当月KPI（黒服自分）
  const [myKpi, setMyKpi] = useState<KurofukuKpi | null>(null);
  // P2: キャスト別出勤率（当月）
  const [attendanceMap, setAttendanceMap] = useState<Map<string, CastAttendance>>(new Map());

  const activeStoreId = user?.activeStoreId ?? '';
  const currentMonth = periodKey(new Date(), 'month');

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchManagedCasts()
      .then(setCasts)
      .catch(() => setError('キャストデータの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, []);

  // P2: 当月KPI・出勤率を取得
  useEffect(() => {
    if (!activeStoreId || !user?.id) return;
    let isMounted = true;

    Promise.all([
      fetchKurofukuKpis(activeStoreId, currentMonth),
      fetchCastAttendance(activeStoreId, currentMonth),
    ])
      .then(([kpis, att]) => {
        if (!isMounted) return;
        // 自分のKPIを絞り込み（RLSで担当のみ返るが念のため）
        const mine = kpis.find(k => k.managerId === user.id) ?? null;
        setMyKpi(mine);
        const m = new Map<string, CastAttendance>();
        for (const a of att) m.set(a.castId, a);
        setAttendanceMap(m);
      })
      .catch((err) => {
        console.warn('[KurofukuCastsPage] KPI/attendance fetch error (non-fatal):', err);
      });

    return () => { isMounted = false; };
  }, [activeStoreId, user?.id, currentMonth]);

  return (
    <div className="p-4 space-y-4 animate-fade-in-up">
      <div>
        <h2 className="font-mincho text-xl font-bold text-ink">担当キャスト</h2>
        <p className="text-xs text-ink-tertiary mt-0.5">{monthLabel(DEMO_MONTH)}のシフトと売上推移</p>
      </div>

      {/* P2: 当月KPIヘッダカード */}
      {myKpi && (
        <MyKpiCard kpi={myKpi} month={currentMonth} />
      )}

      {loading ? (
        <div className="glass rounded-xl p-6 shadow-soft text-center">
          <p className="text-sm text-ink-tertiary">読み込み中…</p>
        </div>
      ) : error ? (
        <div className="glass rounded-xl p-6 shadow-soft text-center">
          <p className="text-sm text-danger">{error}</p>
        </div>
      ) : casts.length === 0 ? (
        <div className="glass rounded-xl p-6 shadow-soft text-center">
          <p className="text-sm text-ink-tertiary">担当キャストがいません</p>
        </div>
      ) : (
        <div className="space-y-4">
          {casts.map(cast => (
            <CastCard
              key={cast.id}
              cast={cast}
              month={DEMO_MONTH}
              attendance={attendanceMap.get(cast.id) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
