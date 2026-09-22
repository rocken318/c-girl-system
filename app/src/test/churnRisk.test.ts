import { describe, it, expect } from 'vitest';
import { assessChurnRisk } from '../lib/churnRisk';

describe('assessChurnRisk', () => {
  it('前月出勤5・当月0 → high、reasonに"出勤 5→0日"', () => {
    const result = assessChurnRisk({
      salesCur: 0, salesPrev: 100,
      attendedCur: 0, attendedPrev: 5,
    });
    expect(result.level).toBe('high');
    expect(result.reasons).toContain('出勤 5→0日');
  });

  it('salesPrev=100, salesCur=50（ratio 0.5 <= 0.6）→ high', () => {
    const result = assessChurnRisk({
      salesCur: 50, salesPrev: 100,
      attendedCur: 3, attendedPrev: 3,
    });
    expect(result.level).toBe('high');
    expect(result.reasons.some(r => r.startsWith('売上 前月比'))).toBe(true);
  });

  it('salesPrev=100, salesCur=75（ratio 0.75）→ medium', () => {
    const result = assessChurnRisk({
      salesCur: 75, salesPrev: 100,
      attendedCur: 5, attendedPrev: 5,
    });
    expect(result.level).toBe('medium');
    expect(result.reasons.some(r => r.startsWith('売上 前月比'))).toBe(true);
  });

  it('前月100/当月120（増加）・出勤同等 → none', () => {
    const result = assessChurnRisk({
      salesCur: 120, salesPrev: 100,
      attendedCur: 5, attendedPrev: 5,
    });
    expect(result.level).toBe('none');
    expect(result.reasons).toHaveLength(0);
  });

  it('出勤 10→4（<=半分）→ medium', () => {
    const result = assessChurnRisk({
      salesCur: 100, salesPrev: 100,
      attendedCur: 4, attendedPrev: 10,
    });
    expect(result.level).toBe('medium');
    expect(result.reasons).toContain('出勤 10→4日');
  });

  it('出勤半減かつ売上60%超80%以下 → medium（重複なし）', () => {
    const result = assessChurnRisk({
      salesCur: 70, salesPrev: 100,
      attendedCur: 5, attendedPrev: 10,
    });
    expect(result.level).toBe('medium');
  });

  it('salesPrev=0（前月データ無し）→ 売上判定スキップ', () => {
    const result = assessChurnRisk({
      salesCur: 0, salesPrev: 0,
      attendedCur: 3, attendedPrev: 3,
    });
    expect(result.level).toBe('none');
  });
});
