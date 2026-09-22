/**
 * manager.test.ts — manager.ts の純関数テスト（Supabase 非依存）
 */

import { describe, it, expect } from 'vitest';
import { dailySales, sumSales, avgSales, type CastDailyRecord } from '../data/manager';

const makeRec = (nominatedSales: number, freeSales: number): Pick<CastDailyRecord, 'nominatedSales' | 'freeSales'> => ({
  nominatedSales,
  freeSales,
});

describe('dailySales', () => {
  it('本指名売上 + フリー売上を返す', () => {
    expect(dailySales(makeRec(71429, 21429))).toBe(92858);
  });

  it('両方0なら0', () => {
    expect(dailySales(makeRec(0, 0))).toBe(0);
  });

  it('片方だけある場合', () => {
    expect(dailySales(makeRec(100000, 0))).toBe(100000);
    expect(dailySales(makeRec(0, 50000))).toBe(50000);
  });
});

describe('sumSales', () => {
  it('複数日の合計を返す', () => {
    const records = [
      makeRec(71429, 21429),
      makeRec(76923, 23077),
      makeRec(83333, 25000),
    ];
    // 92858 + 100000 + 108333
    expect(sumSales(records)).toBe(92858 + 100000 + 108333);
  });

  it('空配列なら0', () => {
    expect(sumSales([])).toBe(0);
  });

  it('SAKURA 2026-06 合計（14日分 nominatedSales=1,000,000 freeSales=300,000）', () => {
    // seed の SAKURA 2026-06 performances: nominatedSales=1,000,000 freeSales=300,000
    // daily_records の合計が一致することを確認するサンプル（2日分で検証）
    const day1 = makeRec(71429, 21429);
    const day2 = makeRec(76923, 23077);
    expect(sumSales([day1, day2])).toBe(71429 + 21429 + 76923 + 23077);
  });
});

describe('avgSales', () => {
  it('平均を返す', () => {
    const records = [makeRec(100000, 0), makeRec(200000, 0)];
    expect(avgSales(records)).toBe(150000);
  });

  it('空配列なら0', () => {
    expect(avgSales([])).toBe(0);
  });

  it('端数は四捨五入', () => {
    const records = [makeRec(100000, 0), makeRec(100001, 0), makeRec(100002, 0)];
    // 300003 / 3 = 100001
    expect(avgSales(records)).toBe(100001);
  });
});
