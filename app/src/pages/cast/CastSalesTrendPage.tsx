import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../store/AuthContext';
import { supabase } from '../../lib/supabase';
import { periodKey } from '../../lib/targets';

interface MonthSales { month: string; sales: number }

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}年${Number(m)}月`;
}
function shortMonth(ym: string): string {
  const [, m] = ym.split('-');
  return `${Number(m)}月`;
}
function yearOf(ym: string): string {
  return ym.split('-')[0];
}
function compactYen(v: number): string {
  if (v === 0) return '0';
  return v >= 10000 ? `${Math.round(v / 10000)}万` : v.toLocaleString();
}

export function CastSalesTrendPage() {
  const { user } = useAuth();
  const castId = user?.castData?.id ?? '';
  const thisMonth = periodKey(new Date(), 'month');

  const [data, setData] = useState<MonthSales[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!castId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: rows } = await supabase
        .from('daily_records')
        .select('date, data')
        .eq('cast_id', castId)
        .order('date');
      if (cancelled) return;
      const byMonth = new Map<string, number>();
      for (const r of rows ?? []) {
        const d = (r.data ?? {}) as Record<string, unknown>;
        const ym = (r.date as string).slice(0, 7);
        const s = (Number(d.nominatedSales) || 0) + (Number(d.freeSales) || 0);
        byMonth.set(ym, (byMonth.get(ym) ?? 0) + s);
      }
      const arr = [...byMonth.entries()]
        .map(([month, sales]) => ({ month, sales }))
        .sort((a, b) => a.month.localeCompare(b.month));
      setData(arr);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [castId]);

  // 最新月が見えるよう右端へスクロール
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [data]);

  const max = useMemo(() => Math.max(1, ...data.map(d => d.sales)), [data]);
  const descList = useMemo(() => [...data].reverse(), [data]);

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-mincho text-xl font-bold text-ink">月別売上推移</h2>
      <p className="text-xs text-ink-tertiary -mt-2">横にスワイプして過去の月を確認できます</p>

      {loading ? (
        <p className="text-sm text-ink-tertiary text-center py-8">読み込み中…</p>
      ) : data.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center space-y-2">
          <p className="text-2xl">📈</p>
          <p className="font-mincho font-bold text-ink">売上データがありません</p>
        </div>
      ) : (
        <>
          {/* 横スクロール棒グラフ */}
          <div className="glass rounded-2xl p-4 shadow-card">
            <div ref={scrollRef} className="overflow-x-auto pb-2 -mx-1 px-1">
              <div className="flex items-end gap-3 h-52" style={{ minWidth: `${data.length * 60}px` }}>
                {data.map(d => {
                  const isCur = d.month === thisMonth;
                  const h = Math.max(6, Math.round((d.sales / max) * 100));
                  return (
                    <div key={d.month} className="flex flex-col items-center justify-end gap-1 flex-1 min-w-[52px]">
                      <span className="text-[11px] font-bold text-ink whitespace-nowrap">{compactYen(d.sales)}</span>
                      <div
                        className={`w-9 rounded-t-lg transition-all ${isCur ? 'bg-brand-gradient shadow-glow' : 'bg-brand/60'}`}
                        style={{ height: `${h}%` }}
                        title={`${monthLabel(d.month)}: ¥${d.sales.toLocaleString()}`}
                      />
                      <span className={`text-[11px] whitespace-nowrap ${isCur ? 'text-brand font-bold' : 'text-ink-tertiary'}`}>
                        {shortMonth(d.month)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 月別リスト（新しい順・前月比） */}
          <div className="glass rounded-2xl shadow-card overflow-hidden">
            {descList.map((d, i) => {
              const prev = descList[i + 1];
              const mom = prev && prev.sales > 0 ? Math.round(((d.sales - prev.sales) / prev.sales) * 1000) / 10 : null;
              return (
                <div key={d.month} className="flex items-center justify-between px-4 py-3 border-b border-ink/5 last:border-0">
                  <div>
                    <p className="font-medium text-ink text-sm">
                      {monthLabel(d.month)}
                      {d.month === thisMonth && <span className="ml-2 text-[10px] bg-brand/10 text-brand px-1.5 py-0.5 rounded-full">今月</span>}
                    </p>
                    {mom !== null && (
                      <p className={`text-xs ${mom >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        前月比 {mom >= 0 ? '+' : ''}{mom}%
                      </p>
                    )}
                  </div>
                  <p className="font-mincho font-bold text-brand">¥{d.sales.toLocaleString()}</p>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-ink-tertiary text-center">
            {yearOf(data[0].month)}年〜 の実績を集計しています
          </p>
        </>
      )}
    </div>
  );
}
