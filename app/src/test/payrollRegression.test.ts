/**
 * Payroll Regression Test — SAKURA ¥281,000
 *
 * 不変条件：給与エンジン(payroll.ts) + 既定設定(defaultSettings) + SAKURA 実績で
 * 差引支給額 = ¥281,000 であること。Supabase 非依存・純ロジックテスト。
 *
 * 内訳:
 *   basePay:        ¥210,000 (¥3,000 × 70h)
 *   commissionTotal:      ¥0 (rate:0 のためゼロ)
 *   backTotal:       ¥79,500 (本指名28×¥1,000 + 場内12×¥500 + 同伴7×¥1,500
 *                             + ドリンク50×¥300 + ボトル3×¥5,000 + 延長5×¥1,000)
 *   grossPay:       ¥289,500
 *   deductionTotal:   ¥8,500 (遅刻1×¥1,000 + 厚生費¥2,000 + 送り代¥500 + 前借¥5,000)
 *   netPay:         ¥281,000
 */

import { describe, it, expect } from 'vitest';
import { calculatePayroll } from '../lib/payroll';
import { defaultSettings } from '../store/settings';
import { performances } from '../data/seed';

describe('payroll regression', () => {
  const sakura = performances.find(p => p.castId === 'cast_1');

  it('SAKURA は ¥281,000', () => {
    if (!sakura) throw new Error('SAKURA の Performance が seed に存在しない');
    const result = calculatePayroll(sakura, defaultSettings);

    // 各内訳を検証
    expect(result.basePay).toBe(210_000);
    expect(result.commissionTotal).toBe(0);
    expect(result.backTotal).toBe(79_500);
    expect(result.grossPay).toBe(289_500);
    expect(result.deductionTotal).toBe(8_500);

    // 最重要：差引支給額
    expect(result.netPay).toBe(281_000);
  });
});
