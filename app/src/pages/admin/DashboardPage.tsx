import { useState, useEffect } from 'react';
import { useAuth } from '../../store/AuthContext';
import {
  periodKey,
  periodRange,
  prevYearPeriodKey,
  sumSales,
  achievementRate,
  yoyDelta,
  type PeriodType,
} from '../../lib/targets';
import { projectLanding, monthProgress } from '../../lib/forecast';
import {
  fetchStoreDaily,
  fetchStoreTarget,
  fetchCastTarget,
  type StoreDaily,
} from '../../data/targets';
import { fetchAccessibleStores } from '../../data/stores';
import { SalesTrendChart, type TrendPoint } from '../../components/SalesTrendChart';
import { SalesCompareChart } from '../../components/SalesCompareChart';
import { supabase } from '../../lib/supabase';
import {
  fetchCastAttendance,
  fetchKurofukuKpis,
  type KurofukuKpi,
} from '../../data/attendance';
import { fetchChurnRisks, type ChurnRiskItem } from '../../data/churn';

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

interface StoreKPI {
  storeId: string;
  storeName: string;
  current: number;
  target: number | null;
  rate: number;         // 達成率（%）
  yoyDiff: number;
  yoyRate: number | null;
  /** 当期が進行中で、前年比を「前年同期の同じ日数まで」で公平比較したか */
  yoyPartial: boolean;
  /** 月次のみ: ラン率ベースの月末着地見込額（当月のみ意味を持つ。過去月は null） */
  projection: number | null;
  /** 月次・目標あり・当月のみ: 見込達成率（%） */
  projRate: number | null;
}

interface CastRank {
  castId: string;
  name: string;
  total: number;
  target: number | null;
  rate: number;
  attendanceRate: number | null; // P2: 当月出勤率（month期間のみ）
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const PERIOD_LABELS: { type: PeriodType; label: string }[] = [
  { type: 'day',     label: '日' },
  { type: 'month',   label: '月' },
  { type: 'quarter', label: '四半期' },
  { type: 'half',    label: '半期' },
  { type: 'year',    label: '年' },
];

const WD_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

/** periodType と offset(0=当期, -1=前期…) から基準日を返す。 */
function periodReferenceDate(type: PeriodType, offset: number): Date {
  const d = new Date();
  switch (type) {
    case 'day':     d.setDate(d.getDate() + offset); break;
    case 'month':   d.setMonth(d.getMonth() + offset); break;
    case 'quarter': d.setMonth(d.getMonth() + offset * 3); break;
    case 'half':    d.setMonth(d.getMonth() + offset * 6); break;
    case 'year':    d.setFullYear(d.getFullYear() + offset); break;
  }
  return d;
}

/** period_key を日本語表示に整形。 */
function formatPeriodKey(key: string, type: PeriodType): string {
  if (type === 'day') {
    const [y, m, d] = key.split('-');
    return `${y}年${Number(m)}月${Number(d)}日`;
  }
  if (type === 'month') {
    const [y, m] = key.split('-');
    return `${y}年${Number(m)}月`;
  }
  if (type === 'quarter') {
    const [y, q] = key.split('-Q');
    return `${y}年 第${q}四半期`;
  }
  if (type === 'half') {
    const [y, h] = key.split('-H');
    return `${y}年 ${h === '1' ? '上期' : '下期'}`;
  }
  return `${key}年`;
}

/** 曜日別の売上合計・稼働日数を集計（index 0=日〜6=土）。 */
function weekdayAgg(rows: StoreDaily[]): { sum: number[]; days: number[] } {
  const sum = Array(7).fill(0);
  const dates: Set<string>[] = Array.from({ length: 7 }, () => new Set<string>());
  for (const r of rows) {
    const wd = new Date(r.date + 'T00:00:00Z').getUTCDay();
    sum[wd] += (r.nominatedSales || 0) + (r.freeSales || 0);
    dates[wd].add(r.date);
  }
  return { sum, days: dates.map(s => s.size) };
}

export interface WeekdayCompare {
  type: PeriodType;
  cur: { sum: number[]; days: number[] };
  prev: { sum: number[]; days: number[] };
  lastYear: { sum: number[]; days: number[] };
}

/** YYYY-MM を delta ヶ月ずらす。 */
function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** startYm〜endYm（両端含む）の月次売上系列（今年/前年）を作る。 */
function buildMonthlyRange(
  curRows: StoreDaily[], lyRows: StoreDaily[], startYm: string, endYm: string,
): TrendPoint[] {
  const points: TrendPoint[] = [];
  let ym = startYm;
  while (ym <= endYm) {
    const [y, m] = ym.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lyLastDay = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
    const ms = String(m).padStart(2, '0');
    points.push({
      label: `${y}/${m}`,
      current: sumSales(curRows, `${ym}-01`, `${ym}-${String(lastDay).padStart(2, '0')}`),
      lastYear: sumSales(lyRows, `${y - 1}-${ms}-01`, `${y - 1}-${ms}-${String(lyLastDay).padStart(2, '0')}`),
    });
    ym = shiftYm(ym, 1);
  }
  return points;
}

// ---------------------------------------------------------------------------
// ユーティリティ：トレンドポイント生成
// ---------------------------------------------------------------------------

function buildTrendPoints(
  currentRows: StoreDaily[],
  lastRows: StoreDaily[],
  periodType: PeriodType,
  key: string,
): TrendPoint[] {
  const { start, end } = periodRange(key, periodType);
  const pk2 = prevYearPeriodKey(key, periodType);
  const r2 = periodRange(pk2, periodType);

  if (periodType === 'day') {
    // 当日1点
    const cur = sumSales(currentRows, start, end);
    const ly  = sumSales(lastRows, r2.start, r2.end);
    return [{ label: start.slice(8), current: cur, lastYear: ly }];
  }

  if (periodType === 'month') {
    // 日別（1〜末日）
    const startDate = new Date(start + 'T00:00:00Z');
    const endDate   = new Date(end   + 'T00:00:00Z');
    const points: TrendPoint[] = [];
    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      const yy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const dateStr = `${yy}-${mm}-${dd}`;
      const lyDateStr = `${yy - 1}-${mm}-${dd}`;
      const cur = sumSales(currentRows, dateStr, dateStr);
      const ly  = sumSales(lastRows, lyDateStr, lyDateStr);
      points.push({ label: `${d.getUTCDate()}日`, current: cur, lastYear: ly });
    }
    return points;
  }

  // quarter / half / year → 月別
  const startYear  = Number(start.slice(0, 4));
  const startMonth = Number(start.slice(5, 7));
  const endYear    = Number(end.slice(0, 4));
  const endMonth   = Number(end.slice(5, 7));
  const points: TrendPoint[] = [];

  for (let y = startYear, m = startMonth; y < endYear || (y === endYear && m <= endMonth);) {
    const ms = String(m).padStart(2, '0');
    const lastDayNum   = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lyLastDayNum = new Date(Date.UTC(y - 1, m, 0)).getUTCDate(); // 前年基準（閏年対応）
    const mStart = `${y}-${ms}-01`;
    const mEnd   = `${y}-${ms}-${String(lastDayNum).padStart(2, '0')}`;
    const lyMStart = `${y - 1}-${ms}-01`;
    const lyMEnd   = `${y - 1}-${ms}-${String(lyLastDayNum).padStart(2, '0')}`;

    const cur = sumSales(currentRows, mStart, mEnd);
    const ly  = sumSales(lastRows, lyMStart, lyMEnd);
    points.push({ label: `${m}月`, current: cur, lastYear: ly });

    m++;
    if (m > 12) { m = 1; y++; }
  }
  return points;
}

/** dateStr(YYYY-MM-DD) に n 日加算した文字列を返す。 */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** dateStr の年を n だけずらす（前年比較用）。 */
function shiftYear(dateStr: string, n: number): string {
  return String(Number(dateStr.slice(0, 4)) + n) + dateStr.slice(4);
}
/** 指定範囲 [startStr, endStr] の日次系列を作る（「日」表示の直近N日推移用）。 */
function buildDailySeries(
  curRows: StoreDaily[], lastRows: StoreDaily[], startStr: string, endStr: string,
): TrendPoint[] {
  const points: TrendPoint[] = [];
  const endD = new Date(endStr + 'T00:00:00Z');
  for (let d = new Date(startStr + 'T00:00:00Z'); d <= endD; d.setUTCDate(d.getUTCDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    points.push({
      label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
      current: sumSales(curRows, ds, ds),
      lastYear: sumSales(lastRows, shiftYear(ds, -1), shiftYear(ds, -1)),
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// キャスト名解決
// ---------------------------------------------------------------------------

async function fetchCastNames(storeId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('casts')
    .select('id, source_name')
    .eq('store_id', storeId);
  if (error) {
    console.error('[DashboardPage] casts fetch error:', error);
    return new Map();
  }
  const m = new Map<string, string>();
  for (const r of data ?? []) {
    m.set(r.id as string, r.source_name as string);
  }
  return m;
}

// ---------------------------------------------------------------------------
// サブコンポーネント：店舗KPIカード
// ---------------------------------------------------------------------------

function StoreKPICard({ kpi, isActive }: { kpi: StoreKPI; isActive?: boolean }) {
  const barWidth = Math.min(100, kpi.rate);
  const barColor = kpi.rate >= 100 ? 'bg-success' : kpi.rate >= 80 ? 'bg-brand' : 'bg-amber-400';

  return (
    <div className={`bg-surface-card rounded-2xl shadow-card p-5 space-y-3 ${isActive ? 'ring-2 ring-brand/40' : ''}`}>
      <div className="flex items-center justify-between">
        <p className="font-mincho font-bold text-ink text-sm">{kpi.storeName}</p>
        {isActive && <span className="text-xs text-brand font-medium bg-brand/10 px-2 py-0.5 rounded-full">選択中</span>}
      </div>

      {/* 総売上 */}
      <div>
        <p className="text-xs text-ink-secondary">総売上</p>
        <p className="text-3xl font-bold font-mincho text-brand tracking-tight">¥{kpi.current.toLocaleString()}</p>
      </div>

      {/* 目標・達成率 */}
      {kpi.target !== null ? (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-ink-secondary">
            <span>目標 ¥{kpi.target.toLocaleString()}</span>
            <span className="font-bold text-ink">{kpi.rate.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-ink/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-tertiary">目標未設定</p>
      )}

      {/* 月次・当月のみ: 着地見込（過去月は確定済みのため非表示） */}
      {kpi.projection !== null && (
        <p className="text-xs text-ink-secondary">
          着地見込 ¥{kpi.projection.toLocaleString()}
          {kpi.projRate !== null && (
            <span className={`ml-1 font-bold ${kpi.projRate >= 100 ? 'text-success' : 'text-amber-500'}`}>
              （見込達成率 {kpi.projRate.toFixed(1)}%）
            </span>
          )}
        </p>
      )}

      {/* 前年比（進行中の期間は「同日まで」で公平比較） */}
      <p className="text-xs">
        {kpi.yoyRate !== null ? (
          <span className={kpi.yoyDiff >= 0 ? 'text-success' : 'text-red-500'}>
            {kpi.yoyPartial ? '前年比(同日まで)' : '前年比'} {kpi.yoyDiff >= 0 ? '+' : ''}{kpi.yoyRate.toFixed(1)}%
            （{kpi.yoyDiff >= 0 ? '+' : ''}¥{kpi.yoyDiff.toLocaleString()}）
          </span>
        ) : (
          <span className="text-ink-tertiary">前年データなし</span>
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインページ
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const { user } = useAuth();

  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [periodOffset, setPeriodOffset] = useState(0); // 0=当期, -1=前期…
  const [compareMode, setCompareMode] = useState<'fit' | 'scroll'>('fit'); // 前年比較の表示
  const [trendMode, setTrendMode] = useState<'fit' | 'scroll'>('fit'); // 売上推移の表示
  const [trendLookback, setTrendLookback] = useState(12); // 四半期以降の月次推移: 遡る月数
  const [periodLabel, setPeriodLabel] = useState('');
  const [weekday, setWeekday] = useState<WeekdayCompare | null>(null);
  const [storeKPIs, setStoreKPIs]   = useState<StoreKPI[]>([]);
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([]);
  const [castRanks, setCastRanks]   = useState<CastRank[]>([]);
  const [kurofukuKpis, setKurofukuKpis] = useState<KurofukuKpi[]>([]); // P2
  const [churnRisks, setChurnRisks] = useState<ChurnRiskItem[]>([]); // P5
  // P5: AI対策コメント（castId → comment文字列 or null）
  const [churnAdvice, setChurnAdvice] = useState<Record<string, string | null>>({});
  // P5: 取得中の castId セット（連打防止）
  const [churnAdviceLoading, setChurnAdviceLoading] = useState<Set<string>>(new Set());
  // P5: 今月の要点（経営サマリAI）
  const [execSummary, setExecSummary] = useState<string | null>(null);
  const [execSummaryLoading, setExecSummaryLoading] = useState(false);
  const [execSummaryFetched, setExecSummaryFetched] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const activeStoreId = user?.activeStoreId ?? '';
  const isIntegratedViewer = user?.isIntegratedViewer ?? false;
  // memberships は配列参照が毎レンダー変わりうるため、安定した派生文字列を依存に使う
  const membershipKey = user?.memberships?.map(m => m.storeId).join(',') ?? '';

  useEffect(() => {
    if (!activeStoreId) return;

    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const realNow = new Date();
        const now = periodReferenceDate(periodType, periodOffset); // 選択期間の基準日
        const key  = periodKey(now, periodType);
        const { start, end } = periodRange(key, periodType);
        const pk2  = prevYearPeriodKey(key, periodType);
        const r2   = periodRange(pk2, periodType);
        // 前期（前月/前四半期…）の範囲
        const prevKey = periodKey(periodReferenceDate(periodType, periodOffset - 1), periodType);
        const prevRange = periodRange(prevKey, periodType);
        if (isMounted) setPeriodLabel(formatPeriodKey(key, periodType));

        // 進行中の期間は「前年同期の同じ日数まで」で公平に前年比を出す
        // （月途中に部分実績を前年の満期間と比べて『減少』と誤認させないため）
        const todayStr = periodKey(realNow, 'day');
        const elapsedEnd = todayStr < end ? todayStr : end; // 当期は今日まで、過去期間は期末まで
        const isPartial = elapsedEnd < end;
        const lyComparableEnd = shiftYear(elapsedEnd, -1);

        // 対象店舗一覧
        let stores: { id: string; name: string }[];
        if (isIntegratedViewer) {
          stores = await fetchAccessibleStores();
        } else {
          // 非統合：アクティブ店舗のみ（storeName は装飾用途）
          const m = user?.memberships.find(m => m.storeId === activeStoreId);
          stores = [{ id: activeStoreId, name: m?.storeName ?? activeStoreId }];
        }

        // 店舗ごとの daily rows を保持（アクティブ店のグラフ/キャスト集計で再利用し二重フェッチを避ける）
        const rowsByStore = new Map<string, { cur: StoreDaily[]; ly: StoreDaily[] }>();

        // 月次着地予測用：当月（当期）のみ経過日数・日数を計算（過去月は確定済み）
        const forecastProgress = periodType === 'month' && periodOffset === 0
          ? monthProgress(key, realNow)
          : null;

        // 店舗ごとにKPI集計
        const kpis: StoreKPI[] = await Promise.all(
          stores.map(async (s) => {
            const [curRows, lyRows, target] = await Promise.all([
              fetchStoreDaily(s.id, start, end),
              fetchStoreDaily(s.id, r2.start, r2.end),
              fetchStoreTarget(s.id, periodType, key),
            ]);
            rowsByStore.set(s.id, { cur: curRows, ly: lyRows });
            const current = sumSales(curRows, start, elapsedEnd);
            // 前年は「同じ日数まで」で比較（進行中の期間のみ効く。過去期間は満期間同士）
            const lastYear = sumSales(lyRows, r2.start, lyComparableEnd);
            const { diff, rate: yoyRate } = yoyDelta(current, lastYear);
            const rate = target ? achievementRate(current, target) : 0;

            // 月次・当月のみ着地見込を算出（過去月は確定済みなので非表示）
            let projection: number | null = null;
            let projRate: number | null = null;
            if (forecastProgress && forecastProgress.daysElapsed < forecastProgress.daysInPeriod) {
              projection = projectLanding(current, forecastProgress.daysElapsed, forecastProgress.daysInPeriod);
              if (target) {
                projRate = achievementRate(projection, target);
              }
            }

            return {
              storeId: s.id,
              storeName: s.name,
              current,
              target,
              rate,
              yoyDiff: diff,
              yoyRate,
              yoyPartial: isPartial,
              projection,
              projRate,
            };
          })
        );

        // トレンドグラフ：アクティブ店基準
        // （統合時は店間KPIカード並列表示、グラフはアクティブ店舗基準に割り切る）
        // アクティブ店が対象一覧に含まれていればKPIループで取得済みの rows を再利用、
        // 含まれない場合のみ追加フェッチ。
        let activeRows = rowsByStore.get(activeStoreId);
        if (!activeRows) {
          const [curRowsActive, lyRowsActive] = await Promise.all([
            fetchStoreDaily(activeStoreId, start, end),
            fetchStoreDaily(activeStoreId, r2.start, r2.end),
          ]);
          activeRows = { cur: curRowsActive, ly: lyRowsActive };
        }
        const curRowsActive = activeRows.cur;

        // 曜日別比較用：前期の日次を取得し、当期/前期/前年で曜日集計
        const prevRowsActive = await fetchStoreDaily(activeStoreId, prevRange.start, prevRange.end);
        const weekdayData: WeekdayCompare = {
          type: periodType,
          cur: weekdayAgg(activeRows.cur),
          prev: weekdayAgg(prevRowsActive),
          lastYear: weekdayAgg(activeRows.ly),
        };

        let trend = buildTrendPoints(activeRows.cur, activeRows.ly, periodType, key);
        // 「日」表示は当日1点だと寂しいので、直近14日の日次推移を表示する
        if (periodType === 'day') {
          const startStr = addDays(end, -13);
          const [dCur, dLy] = await Promise.all([
            fetchStoreDaily(activeStoreId, startStr, end),
            fetchStoreDaily(activeStoreId, shiftYear(startStr, -1), shiftYear(end, -1)),
          ]);
          trend = buildDailySeries(dCur, dLy, startStr, end);
        } else if (periodType !== 'month') {
          // 四半期/半期/年: 直近 trendLookback ヶ月の月次推移（横スクロールで過去まで追える）
          const endYm = end.slice(0, 7);
          const startYm = shiftYm(endYm, -(trendLookback - 1));
          const rStart = `${startYm}-01`;
          const [tCur, tLy] = await Promise.all([
            fetchStoreDaily(activeStoreId, rStart, end),
            fetchStoreDaily(activeStoreId, shiftYear(rStart, -1), shiftYear(end, -1)),
          ]);
          trend = buildMonthlyRange(tCur, tLy, startYm, endYm);
        }

        // キャスト別ランキング（アクティブ店）
        const nameMap = await fetchCastNames(activeStoreId);
        const castMap = new Map<string, number>();
        for (const row of curRowsActive) {
          castMap.set(row.castId, (castMap.get(row.castId) ?? 0) + row.nominatedSales + row.freeSales);
        }
        const sortedCasts = [...castMap.entries()].sort((a, b) => b[1] - a[1]);

        // P2: 月次のみ出勤率・黒服KPIを取得（activeStore基準）
        // 統合ビュアーでも activeStore 基準で取得（注：マルチ店舗は store 切替で対応）
        let castRankList: CastRank[];
        if (periodType === 'month') {
          const monthKey = key; // 選択中の月
          // 出勤率・黒服KPIを並列取得
          const [attList, kpiList] = await Promise.all([
            fetchCastAttendance(activeStoreId, monthKey),
            fetchKurofukuKpis(activeStoreId, monthKey),
          ]);
          const attMap = new Map(attList.map(a => [a.castId, a.rate] as const));

          // 月次のみキャスト目標あり
          castRankList = await Promise.all(
            sortedCasts.map(async ([castId, total]) => {
              const castTarget = await fetchCastTarget(activeStoreId, castId, periodType, key);
              const cRate = castTarget ? achievementRate(total, castTarget) : 0;
              return {
                castId,
                name: nameMap.get(castId) ?? castId,
                total,
                target: castTarget,
                rate: cRate,
                attendanceRate: attMap.get(castId) ?? null,
              };
            })
          );

          if (!isMounted) return;
          setKurofukuKpis(kpiList);
        } else {
          castRankList = sortedCasts.map(([castId, total]) => ({
            castId, name: nameMap.get(castId) ?? castId, total, target: null, rate: 0,
            attendanceRate: null,
          }));

          if (!isMounted) return;
          setKurofukuKpis([]);
        }

        if (!isMounted) return;
        setStoreKPIs(kpis);
        setTrendPoints(trend);
        setCastRanks(castRankList);
        setWeekday(periodType === 'day' ? null : weekdayData);
      } catch (e) {
        console.error('[DashboardPage] fetch error:', e);
        if (isMounted) setError('データ取得に失敗しました。コンソールを確認してください。');
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodType, periodOffset, trendLookback, activeStoreId, isIntegratedViewer, membershipKey]);

  // P5: 離脱リスク判定（当月固定・期間トグルとは独立）
  useEffect(() => {
    if (!activeStoreId) return;
    let isMounted = true;
    (async () => {
      try {
        const risks = await fetchChurnRisks(activeStoreId);
        if (isMounted) setChurnRisks(risks);
      } catch (e) {
        console.error('[DashboardPage] churnRisks fetch error:', e);
      }
    })();
    return () => { isMounted = false; };
  }, [activeStoreId]);

  // P5: AI対策コメント取得（1項目1回・キャッシュあり・連打防止）
  async function fetchChurnAdvice(r: ChurnRiskItem, storeName: string) {
    if (churnAdviceLoading.has(r.castId) || r.castId in churnAdvice) return;

    setChurnAdviceLoading(prev => new Set(prev).add(r.castId));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setChurnAdvice(prev => ({ ...prev, [r.castId]: null }));
        return;
      }
      const res = await fetch('/api/ai/churn-comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          sourceName: r.sourceName,
          level: r.level,
          reasons: r.reasons,
          storeName,
        }),
      });
      if (!res.ok) {
        setChurnAdvice(prev => ({ ...prev, [r.castId]: null }));
        return;
      }
      const data = await res.json();
      setChurnAdvice(prev => ({ ...prev, [r.castId]: data.comment ?? null }));
    } catch (e) {
      console.error('[DashboardPage] churnAdvice fetch error:', e);
      setChurnAdvice(prev => ({ ...prev, [r.castId]: null }));
    } finally {
      setChurnAdviceLoading(prev => {
        const s = new Set(prev);
        s.delete(r.castId);
        return s;
      });
    }
  }

  // P5: 今月の要点（経営サマリAI）取得（1回キャッシュ・連打防止）
  async function fetchExecSummary() {
    if (execSummaryLoading || execSummaryFetched) return;

    const activeKpi = storeKPIs.find(k => k.storeId === activeStoreId);
    if (!activeKpi) return;

    setExecSummaryLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setExecSummary(null);
        setExecSummaryFetched(true);
        return;
      }

      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const res = await fetch('/api/ai/exec-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          storeName: activeKpi.storeName,
          month,
          sales: activeKpi.current,
          target: activeKpi.target,
          achievement: activeKpi.target ? Math.round(activeKpi.rate * 10) / 10 : null,
          yoyRate: activeKpi.yoyRate !== null ? Math.round(activeKpi.yoyRate * 10) / 10 : null,
          projection: activeKpi.projection,
          atRiskCount: churnRisks.length,
          // 月途中は前年比を「同日まで」で算出済み。AIに単純比較で減少と言わせない
          isPartial: activeKpi.yoyPartial,
          asOf: activeKpi.yoyPartial ? `${now.getDate()}日` : null,
        }),
      });
      if (!res.ok) {
        setExecSummary(null);
        setExecSummaryFetched(true);
        return;
      }
      const data = await res.json();
      setExecSummary(data.summary ?? null);
      setExecSummaryFetched(true);
    } catch (e) {
      console.error('[DashboardPage] execSummary fetch error:', e);
      setExecSummary(null);
      setExecSummaryFetched(true);
    } finally {
      setExecSummaryLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // ガード
  // ---------------------------------------------------------------------------

  if (!user) return null;
  if (!activeStoreId) {
    return (
      <div className="p-6 text-ink-secondary">店舗を選択してください。</div>
    );
  }

  // ---------------------------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------------------------

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-mincho text-xl md:text-2xl font-bold text-ink">売上コックピット</h1>

        {/* 期間トグル */}
        <div className="flex gap-1 bg-ink/5 rounded-xl p-1 w-full sm:w-auto overflow-x-auto">
          {PERIOD_LABELS.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => { setPeriodType(type); setPeriodOffset(0); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap flex-1 sm:flex-none transition-colors ${
                periodType === type
                  ? 'bg-surface-card shadow-card text-brand'
                  : 'text-ink-secondary hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 期間ナビ（前月/前日…へ移動） */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => setPeriodOffset(o => o - 1)}
          className="w-9 h-9 rounded-xl glass flex items-center justify-center text-ink-secondary hover:text-brand transition-colors"
          aria-label="前の期間"
        >
          ‹
        </button>
        <div className="text-center min-w-[9rem]">
          <p className="font-mincho font-bold text-ink">{periodLabel || '—'}</p>
          {periodOffset !== 0 && (
            <button onClick={() => setPeriodOffset(0)} className="text-xs text-brand hover:underline">当期に戻る</button>
          )}
        </div>
        <button
          onClick={() => setPeriodOffset(o => Math.min(0, o + 1))}
          disabled={periodOffset >= 0}
          className="w-9 h-9 rounded-xl glass flex items-center justify-center text-ink-secondary hover:text-brand transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="次の期間"
        >
          ›
        </button>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div className="text-center py-12 text-ink-secondary text-sm">
          <div className="inline-block w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin mb-2" />
          <p>読み込み中…</p>
        </div>
      )}

      {!loading && (
        <>
          {/* P5: 今月の要点（経営サマリAI）月次・アクティブ店のみ */}
          {periodType === 'month' && storeKPIs.some(k => k.storeId === activeStoreId) && (
            <div className="bg-surface-card rounded-2xl shadow-card p-5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-mincho font-bold text-ink flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-brand" />
                  今月の要点（AI）
                </h2>
                {!execSummaryFetched && (
                  <button
                    onClick={fetchExecSummary}
                    disabled={execSummaryLoading}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-brand/10 text-brand hover:bg-brand/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {execSummaryLoading ? (
                      <>
                        <span className="inline-block w-3 h-3 border border-brand border-t-transparent rounded-full animate-spin" />
                        生成中…
                      </>
                    ) : (
                      '要点を生成'
                    )}
                  </button>
                )}
              </div>
              {execSummaryFetched && (
                <div className="bg-brand/5 border border-brand/15 rounded-xl px-4 py-3">
                  <p className="text-sm text-ink leading-relaxed">
                    {execSummary ?? 'AI要約を取得できませんでした'}
                  </p>
                </div>
              )}
              {!execSummaryFetched && !execSummaryLoading && (
                <p className="text-xs text-ink-tertiary">ボタンを押すと当月の経営サマリをAIが生成します。</p>
              )}
            </div>
          )}

          {/* 店舗KPIカード（並列） */}
          <div className={`grid gap-4 ${storeKPIs.length > 1 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-1'}`}>
            {storeKPIs.map(kpi => (
              <StoreKPICard
                key={kpi.storeId}
                kpi={kpi}
                isActive={kpi.storeId === activeStoreId}
              />
            ))}
          </div>

          {/* 売上推移グラフ（アクティブ店基準・今年のみ） */}
          <div className="bg-surface-card rounded-2xl shadow-card p-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <h2 className="font-mincho font-bold text-ink">
                {periodType === 'day' ? '日次売上推移（直近14日）'
                  : periodType === 'month' ? '日次売上推移（当月）'
                  : `月次売上推移（直近${trendLookback}ヶ月）`}
                {user.isIntegratedViewer && (
                  <span className="text-xs text-ink-tertiary font-normal ml-2">（グラフは選択中店舗のみ）</span>
                )}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                {/* 四半期以降: 遡る月数を指定 */}
                {periodType !== 'day' && periodType !== 'month' && (
                  <div className="flex gap-1 bg-ink/5 rounded-lg p-0.5">
                    {[12, 24, 36].map(n => (
                      <button
                        key={n}
                        onClick={() => setTrendLookback(n)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          trendLookback === n ? 'bg-surface-card shadow-soft text-brand' : 'text-ink-secondary hover:text-ink'
                        }`}
                      >
                        {n}ヶ月
                      </button>
                    ))}
                  </div>
                )}
                {/* 表示切替 */}
                <div className="flex gap-1 bg-ink/5 rounded-lg p-0.5">
                  {([['fit', '幅に収める'], ['scroll', '横スクロール']] as const).map(([m, label]) => (
                    <button
                      key={m}
                      onClick={() => setTrendMode(m)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        trendMode === m ? 'bg-surface-card shadow-soft text-brand' : 'text-ink-secondary hover:text-ink'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <SalesTrendChart data={trendPoints} mode={trendMode} />
          </div>

          {/* 前年比較グラフ（今年 vs 前年・grouped bar） */}
          <div className="bg-surface-card rounded-2xl shadow-card p-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <h2 className="font-mincho font-bold text-ink">
                前年比較
                {user.isIntegratedViewer && (
                  <span className="text-xs text-ink-tertiary font-normal ml-2">（グラフは選択中店舗のみ）</span>
                )}
              </h2>
              {/* 表示切替：全幅に収める / 横スクロール */}
              <div className="flex gap-1 bg-ink/5 rounded-lg p-0.5">
                {([['fit', '幅に収める'], ['scroll', '横スクロール']] as const).map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => setCompareMode(m)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      compareMode === m ? 'bg-surface-card shadow-soft text-brand' : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <SalesCompareChart data={trendPoints} mode={compareMode} />
          </div>

          {/* 曜日別売上比較 */}
          {weekday && (
            <div className="bg-surface-card rounded-2xl shadow-card p-5">
              <h2 className="font-mincho font-bold text-ink mb-1">曜日別売上</h2>
              <p className="text-xs text-ink-tertiary mb-4">
                {periodType === 'year'
                  ? '今年の曜日平均 vs 前年の曜日平均'
                  : '当期の曜日別売上 ＋ 前期・前年同期との比較'}
              </p>
              <WeekdaySalesTable data={weekday} />
            </div>
          )}

          {/* キャスト別ランキング */}
          <div className="bg-surface-card rounded-2xl shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-ink/5">
              <h2 className="font-mincho font-bold text-ink">
                キャスト別売上ランキング
                <span className="text-xs text-ink-tertiary font-normal ml-2">（選択中店舗・当期）</span>
              </h2>
            </div>

            {castRanks.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-tertiary">データなし</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/5">
                      <th className="text-left px-5 py-3 font-medium text-gold text-xs tracking-wide">順位</th>
                      <th className="text-left px-5 py-3 font-medium text-gold text-xs tracking-wide">名前</th>
                      <th className="text-right px-5 py-3 font-medium text-gold text-xs tracking-wide">売上</th>
                      {periodType === 'month' && (
                        <>
                          <th className="text-right px-5 py-3 font-medium text-gold text-xs tracking-wide">目標</th>
                          <th className="text-right px-5 py-3 font-medium text-gold text-xs tracking-wide">達成率</th>
                          <th className="text-right px-5 py-3 font-medium text-gold text-xs tracking-wide">出勤率</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {castRanks.map((c, i) => (
                      <tr key={c.castId} className="border-t border-ink/3 hover:bg-brand/3 transition-colors">
                        <td className="px-5 py-3 text-ink-secondary font-bold">
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-brand-gradient text-white flex items-center justify-center text-xs font-bold">
                              {(c.name ?? '?').charAt(0)}
                            </div>
                            <span className="font-medium text-ink">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-ink">¥{c.total.toLocaleString()}</td>
                        {periodType === 'month' && (
                          <>
                            <td className="px-5 py-3 text-right text-ink-secondary">
                              {c.target !== null ? `¥${c.target.toLocaleString()}` : '—'}
                            </td>
                            <td className="px-5 py-3 text-right">
                              {c.target !== null ? (
                                <span className={c.rate >= 100 ? 'text-success font-bold' : 'text-ink-secondary'}>
                                  {c.rate.toFixed(1)}%
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-5 py-3 text-right text-ink-secondary">
                              {c.attendanceRate !== null ? `${c.attendanceRate}%` : '—'}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* P5: 離脱リスク アラート（当月固定・期間トグルとは独立） */}
          <div className="bg-surface-card rounded-2xl shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-ink/5 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              <h2 className="font-mincho font-bold text-ink">
                離脱リスク アラート
              </h2>
              <span className="text-xs text-ink-tertiary font-normal ml-1">（選択中店舗・当月 vs 前月）</span>
            </div>
            {churnRisks.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-tertiary">離脱リスクの兆候はありません</p>
            ) : (
              <ul className="divide-y divide-ink/5">
                {churnRisks.map((r) => {
                  const activeStoreName = storeKPIs.find(k => k.storeId === activeStoreId)?.storeName ?? activeStoreId;
                  const isAdviceLoading = churnAdviceLoading.has(r.castId);
                  const hasAdvice = r.castId in churnAdvice;
                  const advice = churnAdvice[r.castId];
                  return (
                    <li key={r.castId} className="px-5 py-4 flex items-start gap-3">
                      <span
                        className={`mt-0.5 shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                          r.level === 'high'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {r.level === 'high' ? '高' : '中'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-ink text-sm">{r.sourceName}</p>
                        <ul className="mt-1 space-y-0.5">
                          {r.reasons.map((reason, idx) => (
                            <li key={idx} className="text-xs text-ink-secondary">・{reason}</li>
                          ))}
                        </ul>
                        {/* AI対策ボタン */}
                        {!hasAdvice && (
                          <button
                            onClick={() => fetchChurnAdvice(r, activeStoreName)}
                            disabled={isAdviceLoading}
                            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-brand/10 text-brand hover:bg-brand/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isAdviceLoading ? (
                              <>
                                <span className="inline-block w-3 h-3 border border-brand border-t-transparent rounded-full animate-spin" />
                                取得中…
                              </>
                            ) : (
                              'AI対策を見る'
                            )}
                          </button>
                        )}
                        {/* AI対策結果 */}
                        {hasAdvice && (
                          <div className="mt-2 bg-brand/5 border border-brand/15 rounded-lg px-3 py-2">
                            <p className="text-xs text-ink-secondary mb-0.5 font-medium">AI提案</p>
                            <p className="text-xs text-ink">
                              {advice ?? 'AI提案を取得できませんでした'}
                            </p>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* P2: 黒服別KPIカード（月次のみ・activeStore基準） */}
          {periodType === 'month' && kurofukuKpis.length > 0 && (
            <div className="bg-surface-card rounded-2xl shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-ink/5">
                <h2 className="font-mincho font-bold text-ink">
                  黒服別KPI
                  <span className="text-xs text-ink-tertiary font-normal ml-2">（選択中店舗・当月）</span>
                </h2>
              </div>
              <div className="p-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {kurofukuKpis.map(k => (
                  <div key={k.managerId} className="bg-ink/3 rounded-xl p-4 space-y-3">
                    <p className="font-mincho font-bold text-ink text-sm">{k.name}</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-xs text-ink-tertiary">担当人数</p>
                        <p className="font-bold text-ink text-lg">{k.castCount}<span className="text-xs font-normal text-ink-tertiary ml-0.5">人</span></p>
                      </div>
                      <div>
                        <p className="text-xs text-ink-tertiary">合計売上</p>
                        <p className="font-bold text-brand text-base">
                          {k.totalSales === 0 ? '—' : k.totalSales >= 10000 ? `${Math.round(k.totalSales / 10000)}万` : `¥${k.totalSales.toLocaleString()}`}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-ink-tertiary">平均出勤率</p>
                        <p className="font-bold text-ink text-lg">{k.avgRate !== null ? `${k.avgRate}%` : '—'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 曜日別売上比較テーブル
// ---------------------------------------------------------------------------

function man(v: number): string {
  if (!v) return '—';
  return v >= 10000 ? `${Math.round(v / 10000)}万` : `¥${v.toLocaleString()}`;
}
function pct(cur: number, base: number): { text: string; up: boolean } | null {
  if (!base) return null;
  const r = Math.round(((cur - base) / base) * 1000) / 10;
  return { text: `${r >= 0 ? '+' : ''}${r}%`, up: r >= 0 };
}

function WeekdaySalesTable({ data }: { data: WeekdayCompare }) {
  const isYear = data.type === 'year';
  // 年次は「曜日平均」、それ以外は「曜日合計」で比較
  const curVals = isYear
    ? data.cur.sum.map((s, i) => (data.cur.days[i] ? Math.round(s / data.cur.days[i]) : 0))
    : data.cur.sum;
  const lyVals = isYear
    ? data.lastYear.sum.map((s, i) => (data.lastYear.days[i] ? Math.round(s / data.lastYear.days[i]) : 0))
    : data.lastYear.sum;
  const prevVals = data.prev.sum;

  const prevLabel = data.type === 'month' ? '前月'
    : data.type === 'quarter' ? '前四半期'
    : data.type === 'half' ? '前期'
    : '前年';
  const curLabel = isYear ? '今年(平均)' : '当期';
  const lyLabel = isYear ? '前年(平均)' : '前年同期';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[420px]">
        <thead>
          <tr className="border-b border-ink/5 text-xs text-gold tracking-wide">
            <th className="text-left px-3 py-2 font-medium">曜日</th>
            <th className="text-right px-3 py-2 font-medium">{curLabel}</th>
            {!isYear && <th className="text-right px-3 py-2 font-medium">{prevLabel}</th>}
            {!isYear && <th className="text-right px-3 py-2 font-medium">前月比</th>}
            <th className="text-right px-3 py-2 font-medium">{lyLabel}</th>
            <th className="text-right px-3 py-2 font-medium">前年比</th>
          </tr>
        </thead>
        <tbody>
          {WD_LABELS.map((wd, i) => {
            const vsPrev = pct(curVals[i], prevVals[i]);
            const vsLy = pct(curVals[i], lyVals[i]);
            return (
              <tr key={wd} className="border-t border-ink/3">
                <td className={`px-3 py-2 font-bold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-ink'}`}>{wd}</td>
                <td className="px-3 py-2 text-right font-bold text-ink">{man(curVals[i])}</td>
                {!isYear && <td className="px-3 py-2 text-right text-ink-secondary">{man(prevVals[i])}</td>}
                {!isYear && (
                  <td className="px-3 py-2 text-right">
                    {vsPrev ? <span className={vsPrev.up ? 'text-success' : 'text-red-500'}>{vsPrev.text}</span> : <span className="text-ink-tertiary">—</span>}
                  </td>
                )}
                <td className="px-3 py-2 text-right text-ink-secondary">{man(lyVals[i])}</td>
                <td className="px-3 py-2 text-right">
                  {vsLy ? <span className={vsLy.up ? 'text-success' : 'text-red-500'}>{vsLy.text}</span> : <span className="text-ink-tertiary">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
