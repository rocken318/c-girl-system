import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../store/AuthContext';
import { useSettings } from '../../store/SettingsContext';
import { supabase } from '../../lib/supabase';
import { calculatePayroll } from '../../lib/payroll';
import { recordsToPerformance } from '../../lib/castAggregate';
import {
  fetchCastDailyRecords,
  sumSales,
  type CastDailyRecord,
} from '../../data/manager';
import { periodKey } from '../../lib/targets';
import { useCountUp } from '../../hooks/useAnimations';
import {
  payrollToPrintHtml,
  payrollToCsv,
  openPrintWindow,
  downloadCsv,
} from '../../lib/exportPayroll';
import { SHOW_SALES_BACK, SHOW_COMMISSION } from '../../config/featureFlags';

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}年${Number(m)}月`;
}

export function PayrollPage() {
  const { user } = useAuth();
  const { settings } = useSettings();

  const castId = user?.castData?.id ?? '';
  const storeId = user?.castData?.storeId ?? '';
  const castName = user?.castData?.name ?? user?.name ?? '';
  const storeName = settings.storeName;
  const thisMonth = periodKey(new Date(), 'month');

  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState<string>(thisMonth);
  const [records, setRecords] = useState<CastDailyRecord[]>([]);
  const [loadingMonths, setLoadingMonths] = useState(true);
  const [loading, setLoading] = useState(true);

  // データのある月の一覧を取得（新しい順）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!castId) { setLoadingMonths(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('daily_records')
        .select('date')
        .eq('cast_id', castId)
        .order('date', { ascending: false });
      if (cancelled) return;
      const uniq = Array.from(new Set((data ?? []).map((r: { date: string }) => r.date.slice(0, 7))));
      // 当月は必ず選べるように含める
      if (!uniq.includes(thisMonth)) uniq.unshift(thisMonth);
      setMonths(uniq);
      setMonth(prev => (uniq.includes(prev) ? prev : uniq[0] ?? thisMonth));
      setLoadingMonths(false);
    })();
    return () => { cancelled = true; };
  }, [castId, thisMonth]);

  // 選択月の日次実績を取得
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!castId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchCastDailyRecords(castId, month)
      .then(recs => { if (!cancelled) setRecords(recs); })
      .catch(() => { if (!cancelled) setRecords([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [castId, month]);

  const payroll = useMemo(
    () => (castId ? calculatePayroll(recordsToPerformance(records, castId, storeId, month), settings) : null),
    [records, castId, storeId, month, settings],
  );

  const stats = useMemo(() => ({
    sales: sumSales(records),
    workDays: records.filter(r => r.attended && !r.isAbsent).length,
    honShimei: records.reduce((a, r) => a + (r.honShimei || 0), 0),
    douhan: records.reduce((a, r) => a + (r.douhan || 0), 0),
  }), [records]);

  const animatedNet = useCountUp(payroll?.netPay ?? 0);

  function handlePrint() {
    if (!payroll) return;
    openPrintWindow(payrollToPrintHtml(payroll, castName, storeName, monthLabel(month)));
  }
  function handleCsvDownload() {
    if (!payroll) return;
    downloadCsv(payrollToCsv([payroll], storeName), `給与明細_${castName}_${month}.csv`);
  }

  const hasData = records.length > 0;

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-baseline justify-between">
        <h2 className="font-mincho text-xl font-bold text-ink">給与・成績</h2>
        <p className="text-sm text-ink-tertiary">{monthLabel(month)}分</p>
      </div>

      {/* 月セレクタ */}
      {loadingMonths ? (
        <p className="text-xs text-ink-tertiary">読み込み中…</p>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {months.map(m => (
            <button
              key={m}
              onClick={() => setMonth(m)}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-sm transition-all ${
                m === month ? 'bg-brand text-white font-bold shadow-soft' : 'glass text-ink-secondary hover:text-ink'
              }`}
            >
              {monthLabel(m)}
            </button>
          ))}
        </div>
      )}

      {/* Net Pay Hero */}
      <div className="bg-brand-gradient rounded-2xl p-5 text-center border-gold shadow-glow animate-fade-in-up">
        <p className="text-sm text-white/70">差引支給額（{monthLabel(month)}・見込）</p>
        <p className="text-display text-white mt-1">
          <span className="text-xl">¥</span>{animatedNet.toLocaleString()}
        </p>
      </div>

      {/* 成績サマリ */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: '売上', value: stats.sales >= 10000 ? `${Math.round(stats.sales / 10000)}万` : stats.sales.toLocaleString(), accent: true },
          { label: '出勤', value: `${stats.workDays}日` },
          { label: '本指名', value: `${stats.honShimei}` },
          { label: '同伴', value: `${stats.douhan}` },
        ].map(s => (
          <div key={s.label} className="glass rounded-xl p-3 text-center shadow-soft">
            <p className="text-xs text-ink-tertiary">{s.label}</p>
            <p className={`font-mincho font-bold text-lg mt-0.5 ${s.accent ? 'text-brand' : 'text-ink'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-ink-tertiary text-center py-6">読み込み中…</p>
      ) : !hasData ? (
        <div className="glass rounded-2xl p-8 text-center space-y-2">
          <p className="text-2xl">📋</p>
          <p className="font-mincho font-bold text-ink">{monthLabel(month)}の実績はありません</p>
          <p className="text-sm text-ink-tertiary">出勤実績が入るとここに給与明細が表示されます。</p>
        </div>
      ) : payroll ? (
        <>
          {/* Base Pay */}
          <Section title="基本給" total={payroll.basePay}>
            <Row label="時給 × 勤務時間" detail={payroll.basePayDetail} amount={payroll.basePay} />
          </Section>

          {/* Commission */}
          {SHOW_COMMISSION && payroll.commissionItems.length > 0 && (
            <Section title="歩合" total={payroll.commissionTotal}>
              {payroll.commissionItems.map((item, i) => (
                <Row key={i} label={item.label} detail={item.detail} amount={item.amount} />
              ))}
            </Section>
          )}

          {/* Backs */}
          {SHOW_SALES_BACK && payroll.backItems.length > 0 && (
            <Section title="各種バック" total={payroll.backTotal}>
              {payroll.backItems.map((item, i) => (
                <Row key={i} label={item.label} detail={item.detail} amount={item.amount} />
              ))}
            </Section>
          )}

          {/* Gross */}
          <div className="glass rounded-xl p-4 shadow-card border-gold">
            <div className="flex justify-between items-center">
              <span className="font-mincho font-bold text-ink">総支給額</span>
              <span className="text-money-lg text-ink">¥{payroll.grossPay.toLocaleString()}</span>
            </div>
          </div>

          {/* Deductions */}
          {payroll.deductionItems.length > 0 && (
            <Section title="控除" total={payroll.deductionTotal} negative>
              {payroll.deductionItems.map((item, i) => (
                <Row key={i} label={item.label} amount={item.amount} negative />
              ))}
            </Section>
          )}

          <p className="text-[11px] text-ink-tertiary text-center">
            ※実績から算出した見込額です。確定額は「給与履歴」で確認できます。
          </p>

          {/* Export actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={handlePrint}
              className="glass rounded-xl px-4 py-2 text-sm text-ink-secondary hover:text-brand transition-colors"
            >
              印刷 / PDF
            </button>
            <button
              onClick={handleCsvDownload}
              className="glass rounded-xl px-4 py-2 text-sm text-ink-secondary hover:text-brand transition-colors"
            >
              CSVダウンロード
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Section({ title, total, negative, children }: {
  title: string; total: number; negative?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-xl p-4 shadow-soft space-y-2">
      <div className="flex justify-between items-center pb-2 mb-2">
        <span className="font-mincho font-bold text-ink">{title}</span>
        <span className={`font-bold ${negative ? 'text-danger' : 'text-ink'}`}>
          {negative ? '-' : ''}¥{total.toLocaleString()}
        </span>
      </div>
      <div className="rule-gold" />
      {children}
    </div>
  );
}

function Row({ label, detail, amount, negative }: {
  label: string; detail?: string; amount: number; negative?: boolean;
}) {
  return (
    <div className="flex justify-between items-start text-sm py-1">
      <div>
        <p className="text-ink-secondary">{label}</p>
        {detail && <p className="text-xs text-ink-tertiary">{detail}</p>}
      </div>
      <span className={negative ? 'text-danger' : 'text-ink'}>
        {negative ? '-' : ''}¥{amount.toLocaleString()}
      </span>
    </div>
  );
}
