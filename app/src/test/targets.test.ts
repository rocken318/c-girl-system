import { describe, it, expect } from 'vitest';
import { periodKey, periodRange, prevYearPeriodKey, sumSales, achievementRate, yoyDelta } from '../lib/targets';

describe('periodKey', () => {
  it('各種別', () => {
    const d = new Date('2026-08-15T12:00:00+09:00');
    expect(periodKey(d, 'day')).toBe('2026-08-15');
    expect(periodKey(d, 'month')).toBe('2026-08');
    expect(periodKey(d, 'quarter')).toBe('2026-Q3');
    expect(periodKey(d, 'half')).toBe('2026-H2');
    expect(periodKey(d, 'year')).toBe('2026');
  });
});
describe('periodRange', () => {
  it('month/quarter/half/year/day の範囲', () => {
    expect(periodRange('2026-02', 'month')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodRange('2026-Q1', 'quarter')).toEqual({ start: '2026-01-01', end: '2026-03-31' });
    expect(periodRange('2026-H2', 'half')).toEqual({ start: '2026-07-01', end: '2026-12-31' });
    expect(periodRange('2026', 'year')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(periodRange('2026-09-14', 'day')).toEqual({ start: '2026-09-14', end: '2026-09-14' });
  });
});
describe('prevYearPeriodKey', () => {
  it('年を-1', () => {
    expect(prevYearPeriodKey('2026-08', 'month')).toBe('2025-08');
    expect(prevYearPeriodKey('2026-Q3', 'quarter')).toBe('2025-Q3');
    expect(prevYearPeriodKey('2026', 'year')).toBe('2025');
  });
});
describe('sumSales', () => {
  it('範囲内の nominatedSales+freeSales を合算', () => {
    const recs = [
      { date: '2026-08-01', nominatedSales: 100, freeSales: 20 },
      { date: '2026-08-31', nominatedSales: 200, freeSales: 0 },
      { date: '2026-09-01', nominatedSales: 999, freeSales: 999 },
    ];
    expect(sumSales(recs, '2026-08-01', '2026-08-31')).toBe(320);
  });
});
describe('achievementRate', () => {
  it('達成率%（target0は0）', () => {
    expect(achievementRate(50, 100)).toBe(50);
    expect(achievementRate(0, 0)).toBe(0);
  });
});
describe('yoyDelta', () => {
  it('前年比（lastYear0はrate=null）', () => {
    expect(yoyDelta(120, 100)).toEqual({ diff: 20, rate: 20 });
    expect(yoyDelta(120, 0)).toEqual({ diff: 120, rate: null });
  });
});
