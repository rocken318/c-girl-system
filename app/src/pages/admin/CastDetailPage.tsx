import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../store/AuthContext';
import { useSettings } from '../../store/SettingsContext';
import {
  fetchCastDailyRecords,
  fetchCastShifts,
  dailySales,
  sumSales,
  type CastDailyRecord,
  type CastShift,
} from '../../data/manager';
import { fetchCastTarget } from '../../data/targets';
import { calculatePayroll } from '../../lib/payroll';
import { recordsToPerformance } from '../../lib/castAggregate';
import { AttendanceCalendar } from '../../components/AttendanceCalendar';
import { periodKey, achievementRate } from '../../lib/targets';
import { SHOW_SALES_BACK, SHOW_COMMISSION } from '../../config/featureFlags';

// ─── helpers ──────────────────────────────────────────────────────────────

interface CastRow {
  id: string;
  source_name: string;
  rank: string | null;
  join_date: string | null;
  status: 'active' | 'inactive';
}

function formatYen(v: number): string {
  return '¥' + v.toLocaleString('ja-JP');
}

function compactYen(v: number): string {
  if (v === 0) return '—';
  return v >= 10000 ? `${Math.round(v / 10000)}万` : formatYen(v);
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${Number(m)}月`;
}

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function dayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
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

// ─── 小コンポーネント ─────────────────────────────────────────────────────

function Stat({ label, value, accent, size = 'md' }: { label: string; value: string; accent?: boolean; size?: 'md' | 'lg' }) {
  return (
    <div className="bg-surface-base border border-ink/10 rounded-xl px-2 py-3 md:py-4 text-center shadow-soft">
      <p className="text-xs md:text-sm text-ink-tertiary">{label}</p>
      <p className={`font-mincho font-bold mt-1 ${size === 'lg' ? 'text-2xl md:text-4xl' : 'text-xl md:text-2xl'} ${accent ? 'text-brand' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

function SectionCard({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="bg-surface-card rounded-2xl shadow-card p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mincho text-sm md:text-base font-bold text-ink">{title}</h3>
        {aside}
      </div>
      <div className="rule-gold" />
      {children}
    </div>
  );
}

function SalesSparkline({ records }: { records: CastDailyRecord[] }) {
  if (records.length === 0) return <p className="text-xs text-ink-tertiary italic">実績データなし</p>;
  const values = records.map(r => dailySales(r));
  const max = Math.max(...values, 1);
  // ラベルが詰まらないよう、日数が多いときは間引く
  const step = records.length > 18 ? Math.ceil(records.length / 10) : 1;
  return (
    <div>
      <div className="flex items-end gap-1 h-24 md:h-32">
        {values.map((v, i) => (
          <div
            key={i}
            title={`${shortDate(records[i].date)}: ${formatYen(v)}`}
            className="flex-1 h-full flex flex-col justify-end"
          >
            <div
              className="w-full rounded-t bg-brand/70 hover:bg-brand transition-colors"
              style={{ height: `${Math.max(3, Math.round((v / max) * 100))}%` }}
            />
          </div>
        ))}
      </div>
      {/* 日付軸 */}
      <div className="flex gap-1 mt-1.5 border-t border-ink/10 pt-1.5">
        {records.map((r, i) => (
          <div key={i} className="flex-1 text-center text-[9px] md:text-[11px] text-ink-tertiary whitespace-nowrap">
            {i % step === 0 ? shortDate(r.date) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── キャスト詳細本体 ──────────────────────────────────────────────────────

function CastDetail({ cast, storeId }: { cast: CastRow; storeId: string }) {
  const { settings } = useSettings();
  const month = periodKey(new Date(), 'month');
  const last = prevMonth(month);

  const [thisRecords, setThisRecords] = useState<CastDailyRecord[]>([]);
  const [lastRecords, setLastRecords] = useState<CastDailyRecord[]>([]);
  const [shifts, setShifts] = useState<CastShift[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 非同期フェッチ前後の setState は意図通り（読み込み表示のため）
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    Promise.all([
      fetchCastDailyRecords(cast.id, month),
      fetchCastDailyRecords(cast.id, last),
      fetchCastShifts(cast.id, month),
      fetchCastTarget(storeId, cast.id, 'month', month).catch(() => null),
    ])
      .then(([tr, lr, sh, tg]) => {
        if (cancelled) return;
        setThisRecords(tr);
        setLastRecords(lr);
        setShifts(sh);
        setTarget(tg);
      })
      .catch(() => { if (!cancelled) setError('データの取得に失敗しました'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cast.id, storeId, month, last]);

  const thisSales = useMemo(() => sumSales(thisRecords), [thisRecords]);
  const lastSales = useMemo(() => sumSales(lastRecords), [lastRecords]);
  const workDays = useMemo(() => thisRecords.filter(r => r.attended && !r.isAbsent).length, [thisRecords]);
  const scheduledDays = shifts.filter(s => s.status === 'approved' || s.status === 'published').length;
  const attRate = scheduledDays > 0 ? Math.round((workDays / scheduledDays) * 1000) / 10 : null;

  const attCounts = useMemo(() => ({
    present: thisRecords.filter(r => r.attended && !r.isAbsent).length,
    late: thisRecords.filter(r => r.isLate).length,
    douhan: thisRecords.filter(r => r.douhan > 0).length,
    absent: thisRecords.filter(r => r.isAbsent).length,
  }), [thisRecords]);

  const payroll = useMemo(
    () => calculatePayroll(recordsToPerformance(thisRecords, cast.id, storeId, month), settings),
    [thisRecords, cast.id, storeId, month, settings],
  );
  const hourlyRate = settings.hourlyRates.find(r => r.castId === cast.id)?.hourlyRate ?? 0;
  const achieve = target ? achievementRate(thisSales, target) : null;

  if (loading) return <div className="bg-surface-card rounded-2xl shadow-card p-10 text-center text-ink-tertiary text-sm animate-pulse">読み込み中…</div>;
  if (error) return <div className="bg-surface-card rounded-2xl shadow-card p-10 text-center text-danger text-sm">{error}</div>;

  return (
    <div className="space-y-4 md:space-y-5 animate-fade-in-up">
      {/* サマリ */}
      <SectionCard title={`${monthLabel(month)}のサマリ`} aside={
        <span className="text-xs text-ink-tertiary">ランク <span className="font-bold text-brand">{cast.rank ?? '-'}</span></span>
      }>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-4">
          <Stat label="出勤日数" value={`${workDays}日`} size="lg" />
          <Stat label="当月売上" value={compactYen(thisSales)} accent size="lg" />
          <Stat label="前月売上" value={compactYen(lastSales)} size="lg" />
          <Stat label="出勤率" value={attRate !== null ? `${attRate}%` : '—'} size="lg" />
        </div>
        <div className="bg-surface-base/60 border border-ink/10 rounded-xl p-3 md:p-4 mt-1">
          <p className="text-xs md:text-sm text-ink-tertiary font-medium mb-2.5">売上推移（日別）</p>
          <SalesSparkline records={thisRecords} />
        </div>
      </SectionCard>

      {/* 目標 */}
      <SectionCard title="当月目標 / 達成率">
        {target ? (
          <div className="space-y-2">
            <div className="flex items-end justify-between">
              <span className="text-sm text-ink-secondary">
                {compactYen(thisSales)} <span className="text-ink-tertiary">/ {compactYen(target)}</span>
              </span>
              <span className={`font-mincho font-bold text-lg ${achieve !== null && achieve >= 100 ? 'text-emerald-600' : 'text-brand'}`}>
                {achieve}%
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-ink/5 overflow-hidden">
              <div
                className={`h-full rounded-full ${achieve !== null && achieve >= 100 ? 'bg-emerald-500' : 'bg-brand-gradient'}`}
                style={{ width: `${Math.min(100, achieve ?? 0)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-tertiary">当月の個人目標は未設定です（売上目標画面で設定できます）。</p>
        )}
      </SectionCard>

      {/* 給与（当月見込） */}
      <SectionCard title={`給与（${monthLabel(month)}見込）`} aside={
        <span className="text-xs text-ink-tertiary">時給 <span className="font-bold text-ink">{formatYen(hourlyRate)}</span></span>
      }>
        <div className="space-y-1.5 text-sm">
          <PayRow label="基本給" detail={payroll.basePayDetail} amount={payroll.basePay} />
          {SHOW_COMMISSION && payroll.commissionItems.map((it, i) => (
            <PayRow key={`c${i}`} label={it.label} detail={it.detail} amount={it.amount} />
          ))}
          {SHOW_SALES_BACK && payroll.backItems.map((it, i) => (
            <PayRow key={`b${i}`} label={it.label} detail={it.detail} amount={it.amount} />
          ))}
          <div className="flex justify-between pt-1.5 border-t border-ink/5">
            <span className="text-ink-secondary">総支給</span>
            <span className="font-medium text-ink">{formatYen(payroll.grossPay)}</span>
          </div>
          {payroll.deductionItems.map((it, i) => (
            <PayRow key={`d${i}`} label={it.label} amount={-it.amount} />
          ))}
          <div className="flex justify-between pt-2 mt-1 border-t border-ink/10">
            <span className="font-bold text-ink">差引支給</span>
            <span className="font-mincho font-bold text-brand text-lg">{formatYen(payroll.netPay)}</span>
          </div>
        </div>
        <p className="text-[11px] text-ink-tertiary">
          ※当月の日別実績から算出した参考値です。確定額は給与確定画面で確定します。
        </p>
      </SectionCard>

      {/* バック単価表 */}
      {SHOW_SALES_BACK && (
        <SectionCard title="バック単価（店舗共通）">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {settings.backPrices.map(bp => (
              <div key={bp.id} className="flex items-center justify-between bg-white/60 rounded-lg px-3 py-2">
                <span className="text-xs text-ink-secondary truncate">{bp.name}</span>
                <span className="text-sm font-medium text-ink whitespace-nowrap">{bp.price.toLocaleString()}<span className="text-[10px] text-ink-tertiary ml-0.5">{bp.unit}</span></span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 出欠カレンダー */}
      <SectionCard
        title={`出欠（${monthLabel(month)}）`}
        aside={
          <span className="text-xs text-ink-tertiary">
            出勤<b className="text-ink mx-0.5">{attCounts.present}</b>
            ・同伴<b className="text-ink mx-0.5">{attCounts.douhan}</b>
            ・遅刻<b className="text-ink mx-0.5">{attCounts.late}</b>
            ・欠勤<b className="text-ink mx-0.5">{attCounts.absent}</b>
          </span>
        }
      >
        <AttendanceCalendar month={month} records={thisRecords} />
      </SectionCard>

      {/* シフト一覧 */}
      <SectionCard title="シフト" aside={<span className="text-xs text-ink-tertiary">{shifts.length}日</span>}>
        {shifts.length === 0 ? (
          <p className="text-xs text-ink-tertiary italic">シフトデータなし</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {shifts.map(s => {
              const { text, className } = shiftStatusLabel(s.status);
              const dw = dayOfWeek(s.date);
              return (
                <div key={s.id} className="flex items-center gap-1 bg-white/60 rounded-lg px-2 py-1" title={`${s.date} ${s.startTime}〜${s.endTime}`}>
                  <span className="text-xs font-medium text-ink">{shortDate(s.date)}</span>
                  <span className={`text-xs ${dw === '日' ? 'text-red-400' : dw === '土' ? 'text-blue-400' : 'text-ink-tertiary'}`}>({dw})</span>
                  <span className={`text-xs px-1 rounded font-medium ${className}`}>{text}</span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function PayRow({ label, detail, amount }: { label: string; detail?: string; amount: number }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-ink-secondary">
        {label}
        {detail && <span className="text-[11px] text-ink-tertiary ml-1.5">{detail}</span>}
      </span>
      <span className={amount < 0 ? 'text-danger' : 'text-ink'}>
        {amount < 0 ? '-' : ''}{formatYen(Math.abs(amount))}
      </span>
    </div>
  );
}

// ─── ページ本体 ────────────────────────────────────────────────────────────

export function CastDetailPage() {
  const { user } = useAuth();
  const storeId = user?.activeStoreId ?? '';
  const [searchParams, setSearchParams] = useSearchParams();

  const [casts, setCasts] = useState<CastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const selectedId = searchParams.get('cast');

  const load = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('casts')
      .select('id, source_name, rank, join_date, status')
      .eq('store_id', storeId)
      .order('status')
      .order('source_name');
    if (error) { setError(error.message); setCasts([]); }
    else setCasts((data ?? []) as CastRow[]);
    setLoading(false);
  }, [storeId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // 未選択 or 存在しないID → 先頭キャストを選択
  useEffect(() => {
    if (casts.length === 0) return;
    if (!selectedId || !casts.some(c => c.id === selectedId)) {
      setSearchParams({ cast: casts[0].id }, { replace: true });
    }
  }, [casts, selectedId, setSearchParams]);

  const selected = casts.find(c => c.id === selectedId) ?? null;

  const selectCast = (id: string) => setSearchParams({ cast: id }, { replace: true });

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div>
        <h1 className="font-mincho text-xl md:text-2xl font-bold text-ink">キャスト別ビュー</h1>
        <p className="text-xs text-ink-tertiary mt-0.5">キャストを選ぶと給与・シフト・売上・目標・出欠をまとめて確認できます</p>
      </div>

      {!storeId ? (
        <div className="bg-surface-card rounded-2xl shadow-card p-12 text-center text-ink-tertiary text-sm">店舗を選択してください</div>
      ) : loading ? (
        <div className="bg-surface-card rounded-2xl shadow-card p-12 text-center text-ink-tertiary text-sm animate-pulse">読み込み中…</div>
      ) : error ? (
        <div className="bg-surface-card rounded-2xl shadow-card p-10 text-center space-y-2">
          <p className="text-danger text-sm">名簿の取得に失敗しました</p>
          <button onClick={() => void load()} className="text-xs text-gold underline underline-offset-2">再試行</button>
        </div>
      ) : casts.length === 0 ? (
        <div className="bg-surface-card rounded-2xl shadow-card p-12 text-center text-ink-tertiary text-sm">この店舗の名簿はまだありません</div>
      ) : (
        <>
          {/* キャスト切替タブ */}
          <div ref={tabsRef} className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sticky top-0 z-20 bg-surface-base/80 backdrop-blur-sm">
            {casts.map(c => {
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => selectCast(c.id)}
                  className={`flex items-center gap-2 shrink-0 rounded-xl pl-2 pr-3.5 py-2 text-sm transition-all ${
                    active ? 'bg-brand text-white font-bold shadow-soft' : 'glass text-ink-secondary hover:text-ink'
                  }`}
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${active ? 'bg-white/20' : 'bg-brand-gradient text-white'}`}>
                    {c.source_name.charAt(0)}
                  </span>
                  <span className="whitespace-nowrap">{c.source_name}</span>
                  {c.status === 'inactive' && <span className={`text-[10px] px-1 rounded ${active ? 'bg-white/20' : 'bg-ink/10 text-ink-tertiary'}`}>退</span>}
                </button>
              );
            })}
          </div>

          {selected && <CastDetail cast={selected} storeId={storeId} />}
        </>
      )}
    </div>
  );
}
