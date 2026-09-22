import { describe, it, expect } from 'vitest';
import { attendanceRate } from '../lib/attendance';
describe('attendanceRate', () => {
  it('scheduled=0 は null', () => { expect(attendanceRate(5, 0)).toBeNull(); });
  it('10/20 → 50', () => { expect(attendanceRate(10, 20)).toBe(50); });
  it('15/14 は100超も許容(115超え等はそのまま%)', () => { expect(attendanceRate(15, 14)).toBe(107.1); });
});
