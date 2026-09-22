import { describe, it, expect } from 'vitest';
import { projectLanding, monthProgress } from '../lib/forecast';

describe('projectLanding', () => {
  it('15日経過・30日月で2倍に線形補完', () => {
    expect(projectLanding(300_000, 15, 30)).toBe(600_000);
  });

  it('daysElapsed=0 は 0 を返す', () => {
    expect(projectLanding(500_000, 0, 30)).toBe(0);
  });

  it('daysElapsed 負数も 0 を返す', () => {
    expect(projectLanding(100_000, -1, 30)).toBe(0);
  });

  it('端数は Math.round で丸める', () => {
    // 100_001 / 3 * 30 = 1_000_010 → round → 1_000_010
    expect(projectLanding(100_001, 3, 30)).toBe(1_000_010);
  });
});

describe('monthProgress', () => {
  it('当月：14日時点で daysElapsed=14, daysInPeriod=30', () => {
    // 2026-09-14T12:00:00+09:00 → JST 9/14
    const today = new Date('2026-09-14T03:00:00Z'); // UTC 03:00 = JST 12:00
    expect(monthProgress('2026-09', today)).toEqual({ daysElapsed: 14, daysInPeriod: 30 });
  });

  it('過去月（2026-08）は確定 → daysElapsed=31', () => {
    const today = new Date('2026-09-14T03:00:00Z');
    expect(monthProgress('2026-08', today)).toEqual({ daysElapsed: 31, daysInPeriod: 31 });
  });

  it('未来月（2026-02 を 2026-01 基準で見る）→ daysElapsed=0', () => {
    const today = new Date('2026-01-15T03:00:00Z'); // JST 2026-01-15
    expect(monthProgress('2026-02', today)).toEqual({ daysElapsed: 0, daysInPeriod: 28 });
  });

  it('2月（うるう年2028）の daysInPeriod=29', () => {
    const today = new Date('2028-01-15T03:00:00Z'); // JST 2028-01-15
    expect(monthProgress('2028-02', today)).toEqual({ daysElapsed: 0, daysInPeriod: 29 });
  });

  it('当月末日（30日）でクランプされる', () => {
    // 30日の月を31日として入力しても 30 を返す
    const today = new Date('2026-09-30T03:00:00Z'); // JST 9/30
    const result = monthProgress('2026-09', today);
    expect(result.daysElapsed).toBe(30);
    expect(result.daysInPeriod).toBe(30);
  });
});
