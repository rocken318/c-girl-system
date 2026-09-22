import { describe, it, expect } from 'vitest';
import { businessDate } from '../lib/businessDate';

describe('businessDate (cutover=6)', () => {
  it('深夜2時は前日', () => {
    expect(businessDate(new Date('2026-06-15T02:00:00+09:00'), 6)).toBe('2026-06-14');
  });
  it('6時は当日', () => {
    expect(businessDate(new Date('2026-06-15T06:00:00+09:00'), 6)).toBe('2026-06-15');
  });
});
