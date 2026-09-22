// Settings master - all payroll/ranking config lives here
// Admin can edit these via settings screen; payroll.ts references them

export interface HourlyRateSetting {
  castId: string;
  hourlyRate: number; // yen
}

export interface BackPriceSetting {
  id: string;
  name: string;       // e.g. 本指名バック
  unit: string;       // e.g. 円/本, 円/回, 円/杯
  price: number;      // yen per unit
  isCustom?: boolean;  // user-added item
}

export interface CommissionTier {
  category: string;   // e.g. 本指名売上, フリー売上
  rate: number;       // percentage 0-100
}

export interface SlideTier {
  minAmount: number;
  rate: number;
}

export interface DeductionItem {
  id: string;
  name: string;
  amount: number;     // yen (fixed) or percentage
  isPercentage: boolean;
  isCustom?: boolean;
}

export interface FixedDeductionItem {
  id: string;
  name: string;
  amount: number;
}

export interface RankingPointDef {
  category: string;   // e.g. 本指名, 同伴, ドリンク
  points: number;
}

export interface Settings {
  storeId: string;
  storeName: string;

  // Tab 1: Hourly rates
  hourlyRateMode: 'individual' | 'rank';
  hourlyRates: HourlyRateSetting[];
  companionHourlyBonus: number;

  // Tab 2: Back prices
  backPrices: BackPriceSetting[];

  // Tab 3: Commission
  commissionRates: CommissionTier[];
  slideEnabled: boolean;
  slideTiers: SlideTier[];

  // Tab 4: Deductions
  penalties: FixedDeductionItem[];
  deductionItems: FixedDeductionItem[];
  advancePayEnabled: boolean;
  withholdingTaxMode: 'none' | 'rate';
  withholdingTaxRate: number;

  // Tab 5: Store
  closingDay: 'end_of_month' | number;
  paymentDay: string;
  roundingMode: 'floor' | 'ceil' | 'round';
  roundingTiming: 'per_item' | 'final';

  // Tab 6: Ranking
  rankingPointDef: 'sales' | 'nominations' | 'custom';
  customPointDefs: RankingPointDef[];
  rankingPeriod: 'current_month' | 'custom';
  rankingPublic: boolean;
  rankingDisplayMode: 'rank_only' | 'with_points';
  rankingTopN: number;

  // Tab 7: Shift
  shiftDeadlineDay: number;
  shiftTargetMonthOffset: number;
  shiftDefaultStartTime: string;
  shiftDefaultEndTime: string;

  // 出欠ボード: 1日あたりの出勤目標人数（0 = 未設定）
  dailyAttendanceTarget: number;
}

export const defaultSettings: Settings = {
  storeId: 'store_1',
  storeName: 'NEW CLUB Kingyo',

  hourlyRateMode: 'individual',
  hourlyRates: [
    { castId: 'cast_1', hourlyRate: 3000 },
    { castId: 'cast_2', hourlyRate: 2500 },
    { castId: 'cast_3', hourlyRate: 2200 },
    { castId: 'cast_4', hourlyRate: 2000 },
    { castId: 'cast_5', hourlyRate: 2000 },
  ],
  companionHourlyBonus: 0,

  backPrices: [
    { id: 'bp_1', name: '本指名バック', unit: '円/本', price: 1000 },
    { id: 'bp_2', name: '場内指名バック', unit: '円/本', price: 500 },
    { id: 'bp_3', name: '同伴バック', unit: '円/回', price: 1500 },
    { id: 'bp_4', name: 'ドリンクバック', unit: '円/杯', price: 300 },
    { id: 'bp_5', name: 'ボトル/シャンパンバック', unit: '円/本', price: 5000 },
    { id: 'bp_6', name: '延長バック', unit: '円/回', price: 1000 },
  ],

  commissionRates: [
    { category: '本指名売上', rate: 0 },
    { category: 'フリー売上', rate: 0 },
  ],
  slideEnabled: false,
  slideTiers: [
    { minAmount: 0, rate: 5 },
    { minAmount: 500000, rate: 8 },
  ],

  penalties: [
    { id: 'pen_1', name: '遅刻', amount: 1000 },
    { id: 'pen_2', name: '欠勤', amount: 3000 },
  ],
  deductionItems: [
    { id: 'ded_1', name: '厚生費', amount: 2000 },
    { id: 'ded_2', name: '送り代', amount: 500 },
  ],
  advancePayEnabled: true,
  withholdingTaxMode: 'none',
  withholdingTaxRate: 10,

  closingDay: 'end_of_month',
  paymentDay: '翌月15日',
  roundingMode: 'floor',
  roundingTiming: 'final',

  rankingPointDef: 'custom',
  customPointDefs: [
    { category: '本指名', points: 3 },
    { category: '同伴', points: 2 },
    { category: 'ドリンク', points: 1 },
  ],
  rankingPeriod: 'current_month',
  rankingPublic: true,
  rankingDisplayMode: 'with_points',
  rankingTopN: 3,

  shiftDeadlineDay: 25,
  shiftTargetMonthOffset: 1,
  shiftDefaultStartTime: '20:00',
  shiftDefaultEndTime: '01:00',

  dailyAttendanceTarget: 0,
};
