import { describe, it, expect } from 'vitest';
import { formatWorked } from '../data/timeRecords';
describe('formatWorked', () => {
  it('125分 → 2時間5分', () => { expect(formatWorked(125)).toBe('2時間5分'); });
  it('null → 勤務中', () => { expect(formatWorked(null)).toBe('勤務中'); });
});
