import type { CastDailyRecord } from '../data/manager';
import type { Performance } from '../data/seed';

/** 月別 daily_records を給与計算用 Performance に集計する（純関数）。 */
export function recordsToPerformance(
  records: CastDailyRecord[],
  castId: string,
  storeId: string,
  month: string,
): Performance {
  const attended = records.filter(r => r.attended && !r.isAbsent);
  const totalHours = attended.reduce((a, r) => a + (r.hours || 0), 0);
  const workDays = attended.length;
  const sum = (f: (r: CastDailyRecord) => number) => records.reduce((a, r) => a + (f(r) || 0), 0);
  return {
    castId,
    storeId,
    month,
    workDays,
    hoursPerDay: workDays > 0 ? totalHours / workDays : 0,
    nominatedSales: sum(r => r.nominatedSales),
    freeSales: sum(r => r.freeSales),
    honShimei: sum(r => r.honShimei),
    banaiShimei: sum(r => r.banaiShimei),
    douhan: sum(r => r.douhan),
    drinks: sum(r => r.drinks),
    bottles: sum(r => r.bottles),
    extensions: sum(r => r.extensions),
    lateCount: records.filter(r => r.isLate).length,
    absenceCount: records.filter(r => r.isAbsent).length,
    advancePay: sum(r => r.advancePay),
  };
}
