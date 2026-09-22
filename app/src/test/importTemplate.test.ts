import { describe, it, expect } from 'vitest';
import { parseCastRoster } from '../lib/importTemplate';

describe('parseCastRoster', () => {
  it('ヘッダ付きCSVをキャスト行に変換', () => {
    const csv = '源氏名,ランク,入店日,時給\nSAKURA,A,2025-04-01,3000\nRIN,A,2025-06-01,3000';
    const rows = parseCastRoster(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ sourceName: 'SAKURA', rank: 'A', joinDate: '2025-04-01', hourlyRate: 3000 });
  });
  it('空行・余分な空白を無視', () => {
    const csv = '源氏名,ランク,入店日,時給\n  MIKU , B , 2026-01-01 , 2800 \n';
    const rows = parseCastRoster(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceName).toBe('MIKU');
    expect(rows[0].hourlyRate).toBe(2800);
  });
});
