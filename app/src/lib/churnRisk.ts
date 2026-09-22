export interface ChurnInput {
  salesCur: number;
  salesPrev: number;
  attendedCur: number;
  attendedPrev: number;
}

export type ChurnLevel = 'high' | 'medium' | 'none';

export interface ChurnResult {
  level: ChurnLevel;
  reasons: string[];
}

/** 前月比で離脱リスクを判定。high>medium>none。 */
export function assessChurnRisk(i: ChurnInput): ChurnResult {
  const reasons: string[] = [];
  let level: ChurnLevel = 'none';

  const bump = (l: ChurnLevel) => {
    if (l === 'high') level = 'high';
    else if (l === 'medium' && level !== 'high') level = 'medium';
  };

  // 来なくなった（前月出勤あり→当月0）
  if (i.attendedPrev > 0 && i.attendedCur === 0) {
    reasons.push(`出勤 ${i.attendedPrev}→0日`);
    bump('high');
  }

  // 売上ドロップ
  if (i.salesPrev > 0) {
    const ratio = i.salesCur / i.salesPrev;
    if (ratio <= 0.6) {
      reasons.push(`売上 前月比 ${Math.round((ratio - 1) * 100)}%`);
      bump('high');
    } else if (ratio <= 0.8) {
      reasons.push(`売上 前月比 ${Math.round((ratio - 1) * 100)}%`);
      bump('medium');
    }
  }

  // 出勤半減（0では無いが大きく減少）
  if (i.attendedPrev > 0 && i.attendedCur > 0 && i.attendedCur <= i.attendedPrev * 0.5) {
    reasons.push(`出勤 ${i.attendedPrev}→${i.attendedCur}日`);
    bump('medium');
  }

  return { level, reasons };
}
