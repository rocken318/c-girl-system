export interface Cast {
  id: string;
  storeId: string;
  name: string;       // source name (display name)
  password: string;   // demo only
  rank?: string;
  joinDate: string;
  status: 'active' | 'inactive';
}

export interface Performance {
  castId: string;
  storeId: string;
  month: string; // YYYY-MM
  workDays: number;
  hoursPerDay: number;
  nominatedSales: number;  // 本指名売上
  freeSales: number;       // フリー売上
  honShimei: number;       // 本指名 count
  banaiShimei: number;     // 場内指名 count
  douhan: number;          // 同伴 count
  drinks: number;          // ドリンク count
  bottles: number;         // ボトル/シャンパン count
  extensions: number;      // 延長 count
  lateCount: number;       // 遅刻回数
  absenceCount: number;    // 欠勤回数
  advancePay: number;      // 前借り/日払い済み額
}

/** 日別実績レコード（attendances + sales + performance_counts に対応） */
export interface DailyRecord {
  id: string;
  castId: string;
  storeId: string;
  date: string;          // YYYY-MM-DD
  // 出勤
  attended: boolean;
  attendanceType: 'normal' | 'douhan' | 'late' | 'absent' | 'same_day_absence';  // 出欠区分マーカー
  hours: number;         // 勤務時間
  isLate: boolean;
  isAbsent: boolean;     // 欠勤（出勤予定だったのに休み）
  // 指名・同伴
  honShimei: number;
  banaiShimei: number;
  douhan: number;
  // ドリンク・ボトル・延長
  drinks: number;
  bottles: number;
  extensions: number;
  // 売上
  nominatedSales: number;
  freeSales: number;
  // 前借り/日払い
  advancePay: number;
}

export interface RequestItem {
  id: string;
  castId: string;
  castName: string;
  storeId: string;
  type: '欠勤届' | '遅刻届' | '同伴報告' | 'シフト変更' | 'その他';
  date: string;
  detail: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export const casts: Cast[] = [
  { id: 'cast_1', storeId: 'store_1', name: 'SAKURA', password: '1234', rank: 'A', joinDate: '2025-04-01', status: 'active' },
  { id: 'cast_2', storeId: 'store_1', name: 'RIN', password: '1234', rank: 'A', joinDate: '2025-06-01', status: 'active' },
  { id: 'cast_3', storeId: 'store_1', name: 'YUI', password: '1234', rank: 'B', joinDate: '2025-08-01', status: 'active' },
  { id: 'cast_4', storeId: 'store_1', name: 'HANA', password: '1234', rank: 'B', joinDate: '2025-10-01', status: 'active' },
  { id: 'cast_5', storeId: 'store_1', name: 'MIKU', password: '1234', rank: 'B', joinDate: '2026-01-01', status: 'active' },
];

export const performances: Performance[] = [
  {
    castId: 'cast_1', storeId: 'store_1', month: '2026-06',
    workDays: 14, hoursPerDay: 5,
    nominatedSales: 1000000, freeSales: 300000,
    honShimei: 28, banaiShimei: 12, douhan: 7, drinks: 50, bottles: 3, extensions: 5,
    lateCount: 1, absenceCount: 0, advancePay: 5000,
  },
  {
    castId: 'cast_2', storeId: 'store_1', month: '2026-06',
    workDays: 12, hoursPerDay: 7,
    nominatedSales: 700000, freeSales: 200000,
    honShimei: 20, banaiShimei: 8, douhan: 5, drinks: 35, bottles: 2, extensions: 3,
    lateCount: 0, absenceCount: 0, advancePay: 0,
  },
  {
    castId: 'cast_3', storeId: 'store_1', month: '2026-06',
    workDays: 10, hoursPerDay: 7,
    nominatedSales: 500000, freeSales: 150000,
    honShimei: 15, banaiShimei: 6, douhan: 4, drinks: 28, bottles: 1, extensions: 2,
    lateCount: 0, absenceCount: 1, advancePay: 3000,
  },
  {
    castId: 'cast_4', storeId: 'store_1', month: '2026-06',
    workDays: 8, hoursPerDay: 6,
    nominatedSales: 300000, freeSales: 100000,
    honShimei: 10, banaiShimei: 4, douhan: 2, drinks: 20, bottles: 0, extensions: 1,
    lateCount: 2, absenceCount: 0, advancePay: 0,
  },
  {
    castId: 'cast_5', storeId: 'store_1', month: '2026-06',
    workDays: 6, hoursPerDay: 6,
    nominatedSales: 200000, freeSales: 80000,
    honShimei: 7, banaiShimei: 3, douhan: 1, drinks: 15, bottles: 0, extensions: 0,
    lateCount: 0, absenceCount: 0, advancePay: 0,
  },
];

/**
 * 日別実績から月次Performanceに集約する関数。
 * payroll.ts / ranking.ts はこの集約結果を受け取る。
 */
export function aggregateToMonthly(records: DailyRecord[], month: string): Performance[] {
  const map = new Map<string, DailyRecord[]>();
  for (const r of records) {
    if (!r.date.startsWith(month)) continue;
    const key = `${r.castId}__${r.storeId}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }

  const results: Performance[] = [];
  for (const [key, recs] of map) {
    const [castId, storeId] = key.split('__');
    const workDays = recs.filter(r => r.attended).length;
    const totalHours = recs.reduce((s, r) => s + (r.attended ? r.hours : 0), 0);
    results.push({
      castId,
      storeId,
      month,
      workDays,
      hoursPerDay: workDays > 0 ? totalHours / workDays : 0,
      nominatedSales: recs.reduce((s, r) => s + r.nominatedSales, 0),
      freeSales: recs.reduce((s, r) => s + r.freeSales, 0),
      honShimei: recs.reduce((s, r) => s + r.honShimei, 0),
      banaiShimei: recs.reduce((s, r) => s + r.banaiShimei, 0),
      douhan: recs.reduce((s, r) => s + r.douhan, 0),
      drinks: recs.reduce((s, r) => s + r.drinks, 0),
      bottles: recs.reduce((s, r) => s + r.bottles, 0),
      extensions: recs.reduce((s, r) => s + r.extensions, 0),
      lateCount: recs.filter(r => r.isLate).length,
      absenceCount: recs.filter(r => r.isAbsent).length,
      advancePay: recs.reduce((s, r) => s + r.advancePay, 0),
    });
  }
  return results;
}

/** SAKURAの日別seed生成（合計: 出勤14日, 5h/日, 指名28, 同伴7, ドリンク50, ボトル3, 延長5,
 *  本指名売上1,000,000, フリー売上300,000, 遅刻1回, 前借5000） */
function generateDailyRecords(): DailyRecord[] {
  const all: DailyRecord[] = [];
  interface CastSeed {
    castId: string;
    workDayIndices: number[];
    hours: number;
    honShimei: number;
    banaiShimei: number;
    douhan: number;
    drinks: number;
    bottles: number;
    extensions: number;
    nominatedSales: number;
    freeSales: number;
    lateIdx: number[];
    absentIdx: number[];
    advancePay: number;
  }

  const seeds: CastSeed[] = [
    { castId: 'cast_1', workDayIndices: [1,2,3,4,5,7,8,9,10,11,14,15,16,17], hours: 5,
      honShimei: 28, banaiShimei: 12, douhan: 7, drinks: 50, bottles: 3, extensions: 5,
      nominatedSales: 1000000, freeSales: 300000, lateIdx: [3], absentIdx: [], advancePay: 5000 },
    { castId: 'cast_2', workDayIndices: [1,2,3,5,7,8,9,10,14,15,16,17], hours: 7,
      honShimei: 20, banaiShimei: 8, douhan: 5, drinks: 35, bottles: 2, extensions: 3,
      nominatedSales: 700000, freeSales: 200000, lateIdx: [], absentIdx: [], advancePay: 0 },
    { castId: 'cast_3', workDayIndices: [1,2,4,5,7,8,10,14,15,16], hours: 7,
      honShimei: 15, banaiShimei: 6, douhan: 4, drinks: 28, bottles: 1, extensions: 2,
      nominatedSales: 500000, freeSales: 150000, lateIdx: [], absentIdx: [3], advancePay: 3000 },
    { castId: 'cast_4', workDayIndices: [2,3,5,7,9,10,14,16], hours: 6,
      honShimei: 10, banaiShimei: 4, douhan: 2, drinks: 20, bottles: 0, extensions: 1,
      nominatedSales: 300000, freeSales: 100000, lateIdx: [2,7], absentIdx: [], advancePay: 0 },
    { castId: 'cast_5', workDayIndices: [1,3,7,10,14,16], hours: 6,
      honShimei: 7, banaiShimei: 3, douhan: 1, drinks: 15, bottles: 0, extensions: 0,
      nominatedSales: 200000, freeSales: 80000, lateIdx: [], absentIdx: [], advancePay: 0 },
  ];

  for (const s of seeds) {
    const workDays = s.workDayIndices.length;
    // Distribute counts across work days
    let honLeft = s.honShimei, banaiLeft = s.banaiShimei, douhanLeft = s.douhan;
    let drinksLeft = s.drinks, bottlesLeft = s.bottles, extLeft = s.extensions;
    let nomSalesLeft = s.nominatedSales, freeSalesLeft = s.freeSales;
    let advLeft = s.advancePay;

    for (let i = 0; i < workDays; i++) {
      const day = s.workDayIndices[i];
      const remaining = workDays - i;
      const date = `2026-06-${String(day).padStart(2, '0')}`;

      const hon = i < workDays - 1 ? Math.round(honLeft / remaining) : honLeft;
      const ban = i < workDays - 1 ? Math.round(banaiLeft / remaining) : banaiLeft;
      const dou = i < workDays - 1 ? Math.round(douhanLeft / remaining) : douhanLeft;
      const dr = i < workDays - 1 ? Math.round(drinksLeft / remaining) : drinksLeft;
      const bot = i < workDays - 1 ? Math.round(bottlesLeft / remaining) : bottlesLeft;
      const ext = i < workDays - 1 ? Math.round(extLeft / remaining) : extLeft;
      const ns = i < workDays - 1 ? Math.round(nomSalesLeft / remaining) : nomSalesLeft;
      const fs = i < workDays - 1 ? Math.round(freeSalesLeft / remaining) : freeSalesLeft;
      const adv = i === 0 ? advLeft : 0;

      honLeft -= hon; banaiLeft -= ban; douhanLeft -= dou;
      drinksLeft -= dr; bottlesLeft -= bot; extLeft -= ext;
      nomSalesLeft -= ns; freeSalesLeft -= fs;

      all.push({
        id: `dr_${s.castId}_${day}`,
        castId: s.castId,
        storeId: 'store_1',
        date,
        attended: true,
        attendanceType: dou > 0 ? 'douhan' : 'normal',
        hours: s.hours,
        isLate: s.lateIdx.includes(day),
        isAbsent: false,
        honShimei: hon,
        banaiShimei: ban,
        douhan: dou,
        drinks: dr,
        bottles: bot,
        extensions: ext,
        nominatedSales: ns,
        freeSales: fs,
        advancePay: adv,
      });
    }

    // Absent days
    for (const day of s.absentIdx) {
      all.push({
        id: `dr_${s.castId}_${day}_abs`,
        castId: s.castId,
        storeId: 'store_1',
        date: `2026-06-${String(day).padStart(2, '0')}`,
        attended: false,
        attendanceType: 'normal',
        hours: 0,
        isLate: false,
        isAbsent: true,
        honShimei: 0, banaiShimei: 0, douhan: 0,
        drinks: 0, bottles: 0, extensions: 0,
        nominatedSales: 0, freeSales: 0, advancePay: 0,
      });
    }
  }

  return all;
}

export const initialDailyRecords: DailyRecord[] = generateDailyRecords();

export const initialRequests: RequestItem[] = [
  { id: 'req_1', castId: 'cast_2', castName: 'RIN', storeId: 'store_1', type: '欠勤届', date: '2026-06-22', detail: '体調不良のためお休みさせてください', status: 'pending', createdAt: '2026-06-19' },
  { id: 'req_2', castId: 'cast_3', castName: 'YUI', storeId: 'store_1', type: '同伴報告', date: '2026-06-18', detail: '佐藤様と同伴出勤しました', status: 'pending', createdAt: '2026-06-18' },
  { id: 'req_3', castId: 'cast_1', castName: 'SAKURA', storeId: 'store_1', type: 'シフト変更', date: '2026-06-25', detail: '25日を出勤→休みに変更希望', status: 'pending', createdAt: '2026-06-19' },
  { id: 'req_4', castId: 'cast_1', castName: 'SAKURA', storeId: 'store_1', type: '同伴報告', date: '2026-06-15', detail: '田中様と同伴出勤しました', status: 'approved', createdAt: '2026-06-15' },
];
