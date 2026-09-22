export type PeriodType = 'day' | 'month' | 'quarter' | 'half' | 'year';
export interface DailyLike { date: string; nominatedSales: number; freeSales: number }

function pad(n: number): string { return String(n).padStart(2, '0'); }

/** JST基準で期間キーを算出 */
export function periodKey(at: Date, type: PeriodType): string {
  const jst = new Date(at.getTime() + 9 * 3600_000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  switch (type) {
    case 'day': return `${y}-${pad(m)}-${pad(d)}`;
    case 'month': return `${y}-${pad(m)}`;
    case 'quarter': return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
    case 'half': return `${y}-H${m <= 6 ? 1 : 2}`;
    case 'year': return `${y}`;
  }
}

function lastDayOfMonth(y: number, m: number): number { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** period_key → {start,end}（両端 YYYY-MM-DD） */
export function periodRange(key: string, type: PeriodType): { start: string; end: string } {
  if (type === 'day') return { start: key, end: key };
  if (type === 'year') { const y = Number(key); return { start: `${y}-01-01`, end: `${y}-12-31` }; }
  if (type === 'month') {
    const [ys, ms] = key.split('-'); const y = Number(ys), m = Number(ms);
    return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}` };
  }
  if (type === 'quarter') {
    const [ys, q] = key.split('-Q'); const y = Number(ys); const qn = Number(q);
    const sm = (qn - 1) * 3 + 1; const em = sm + 2;
    return { start: `${y}-${pad(sm)}-01`, end: `${y}-${pad(em)}-${pad(lastDayOfMonth(y, em))}` };
  }
  const [ys, h] = key.split('-H'); const y = Number(ys); const hn = Number(h);
  const sm = hn === 1 ? 1 : 7; const em = hn === 1 ? 6 : 12;
  return { start: `${y}-${pad(sm)}-01`, end: `${y}-${pad(em)}-${pad(lastDayOfMonth(y, em))}` };
}

export function prevYearPeriodKey(key: string, _type: PeriodType): string {
  const y = key.slice(0, 4); const py = String(Number(y) - 1);
  return py + key.slice(4);
}

export function sumSales(records: DailyLike[], start: string, end: string): number {
  return records
    .filter((r) => r.date >= start && r.date <= end)
    .reduce((acc, r) => acc + (r.nominatedSales || 0) + (r.freeSales || 0), 0);
}

export function achievementRate(actual: number, target: number): number {
  if (!target) return 0;
  return Math.round((actual / target) * 1000) / 10;
}

export function yoyDelta(current: number, lastYear: number): { diff: number; rate: number | null } {
  const diff = current - lastYear;
  if (!lastYear) return { diff, rate: null };
  return { diff, rate: Math.round((diff / lastYear) * 1000) / 10 };
}
