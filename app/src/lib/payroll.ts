import type { Settings } from '../store/settings';
import type { Performance } from '../data/seed';

export interface PayrollItem {
  label: string;
  amount: number;
  detail?: string;
}

export interface PayrollResult {
  castId: string;
  month: string;
  basePay: number;
  basePayDetail: string;
  commissionItems: PayrollItem[];
  commissionTotal: number;
  backItems: PayrollItem[];
  backTotal: number;
  grossPay: number;
  deductionItems: PayrollItem[];
  deductionTotal: number;
  netPay: number;
}

function applyRounding(value: number, mode: Settings['roundingMode']): number {
  switch (mode) {
    case 'floor': return Math.floor(value);
    case 'ceil': return Math.ceil(value);
    case 'round': return Math.round(value);
  }
}

export function calculatePayroll(
  perf: Performance,
  settings: Settings
): PayrollResult {
  const round = (v: number) =>
    settings.roundingTiming === 'per_item' ? applyRounding(v, settings.roundingMode) : v;

  // 1. Base pay
  const hourlyRate = settings.hourlyRates.find(r => r.castId === perf.castId)?.hourlyRate ?? 0;
  const totalHours = perf.workDays * perf.hoursPerDay;
  const companionBonus = settings.companionHourlyBonus * perf.douhan;
  const basePay = round(hourlyRate * totalHours + companionBonus);
  const basePayDetail = `¥${hourlyRate.toLocaleString()} × ${totalHours}h` +
    (companionBonus > 0 ? ` + 同伴加算 ¥${companionBonus.toLocaleString()}` : '');

  // 2. Commission (歩合)
  const salesMap: Record<string, number> = {
    '本指名売上': perf.nominatedSales,
    'フリー売上': perf.freeSales,
  };
  const commissionItems: PayrollItem[] = [];
  let commissionTotal = 0;

  if (settings.slideEnabled && settings.slideTiers.length > 0) {
    const totalSales = perf.nominatedSales + perf.freeSales;
    const tier = [...settings.slideTiers]
      .sort((a, b) => b.minAmount - a.minAmount)
      .find(t => totalSales >= t.minAmount);
    if (tier) {
      const amount = round(totalSales * tier.rate / 100);
      commissionItems.push({
        label: `スライド歩合 (${tier.rate}%)`,
        amount,
        detail: `売上 ¥${totalSales.toLocaleString()} × ${tier.rate}%`,
      });
      commissionTotal += amount;
    }
  } else {
    for (const cr of settings.commissionRates) {
      const sales = salesMap[cr.category] ?? 0;
      if (sales > 0) {
        const amount = round(sales * cr.rate / 100);
        commissionItems.push({
          label: `${cr.category} (${cr.rate}%)`,
          amount,
          detail: `¥${sales.toLocaleString()} × ${cr.rate}%`,
        });
        commissionTotal += amount;
      }
    }
  }

  // 3. Backs
  const perfCountMap: Record<string, number> = {
    '本指名バック': perf.honShimei,
    '場内指名バック': perf.banaiShimei,
    '同伴バック': perf.douhan,
    'ドリンクバック': perf.drinks,
    'ボトル/シャンパンバック': perf.bottles,
    '延長バック': perf.extensions,
  };
  const backItems: PayrollItem[] = [];
  let backTotal = 0;
  for (const bp of settings.backPrices) {
    const count = perfCountMap[bp.name] ?? 0;
    if (count > 0 && bp.price > 0) {
      const amount = round(count * bp.price);
      backItems.push({
        label: bp.name,
        amount,
        detail: `${count} × ¥${bp.price.toLocaleString()}`,
      });
      backTotal += amount;
    }
  }

  const grossPay = basePay + commissionTotal + backTotal;

  // 4. Deductions
  const deductionItems: PayrollItem[] = [];
  let deductionTotal = 0;

  // Penalties
  if (perf.lateCount > 0) {
    const pen = settings.penalties.find(p => p.name === '遅刻');
    if (pen) {
      const amount = pen.amount * perf.lateCount;
      deductionItems.push({ label: `遅刻罰金 (${perf.lateCount}回)`, amount });
      deductionTotal += amount;
    }
  }
  if (perf.absenceCount > 0) {
    const pen = settings.penalties.find(p => p.name === '欠勤');
    if (pen) {
      const amount = pen.amount * perf.absenceCount;
      deductionItems.push({ label: `欠勤罰金 (${perf.absenceCount}回)`, amount });
      deductionTotal += amount;
    }
  }

  // Fixed deductions
  for (const ded of settings.deductionItems) {
    if (ded.amount > 0) {
      deductionItems.push({ label: ded.name, amount: ded.amount });
      deductionTotal += ded.amount;
    }
  }

  // Advance pay
  if (settings.advancePayEnabled && perf.advancePay > 0) {
    deductionItems.push({ label: '前借り/日払い精算', amount: perf.advancePay });
    deductionTotal += perf.advancePay;
  }

  // Withholding tax
  if (settings.withholdingTaxMode === 'rate' && settings.withholdingTaxRate > 0) {
    const taxAmount = round(grossPay * settings.withholdingTaxRate / 100);
    deductionItems.push({
      label: `源泉徴収 (${settings.withholdingTaxRate}%)`,
      amount: taxAmount,
    });
    deductionTotal += taxAmount;
  }

  let netPay = grossPay - deductionTotal;
  if (settings.roundingTiming === 'final') {
    netPay = applyRounding(netPay, settings.roundingMode);
  }

  return {
    castId: perf.castId,
    month: perf.month,
    basePay: settings.roundingTiming === 'final' ? basePay : applyRounding(basePay, settings.roundingMode),
    basePayDetail,
    commissionItems,
    commissionTotal,
    backItems,
    backTotal,
    grossPay,
    deductionItems,
    deductionTotal,
    netPay,
  };
}
