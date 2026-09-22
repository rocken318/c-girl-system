import { describe, it, expect } from 'vitest';
import { buildExecSummaryMessages } from '../lib/execSummaryPrompt';
import type { ExecSummaryCtx } from '../lib/execSummaryPrompt';

const ctx: ExecSummaryCtx = {
  storeName: 'KINGYO',
  month: '2026-09',
  sales: 2810000,
  target: 3000000,
  achievement: 93.7,
  yoyRate: 5.2,
  projection: 2950000,
  atRiskCount: 3,
};

describe('buildExecSummaryMessages', () => {
  it('system と user の 2 件を返す', () => {
    const msgs = buildExecSummaryMessages(ctx);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].role).toBe('user');
  });

  it('user メッセージに店名が含まれる', () => {
    const msgs = buildExecSummaryMessages(ctx);
    expect(msgs[1].content).toContain('KINGYO');
  });

  it('user メッセージに当月売上が含まれる', () => {
    const msgs = buildExecSummaryMessages(ctx);
    expect(msgs[1].content).toContain('2,810,000');
  });

  it('user メッセージに達成率が含まれる', () => {
    const msgs = buildExecSummaryMessages(ctx);
    expect(msgs[1].content).toContain('93.7%');
  });

  it('user メッセージに前年比が含まれる（プラス記号つき）', () => {
    const msgs = buildExecSummaryMessages(ctx);
    expect(msgs[1].content).toContain('+5.2%');
  });

  it('user メッセージに着地見込が含まれる', () => {
    const msgs = buildExecSummaryMessages(ctx);
    expect(msgs[1].content).toContain('2,950,000');
  });

  it('user メッセージに離脱リスク件数が含まれる', () => {
    const msgs = buildExecSummaryMessages(ctx);
    expect(msgs[1].content).toContain('3名');
  });

  it('target が null のとき「未設定」と表現される', () => {
    const c: ExecSummaryCtx = { ...ctx, target: null, achievement: null };
    const msgs = buildExecSummaryMessages(c);
    expect(msgs[1].content).toContain('未設定');
  });

  it('achievement が null のとき「—」と表現される', () => {
    const c: ExecSummaryCtx = { ...ctx, achievement: null };
    const msgs = buildExecSummaryMessages(c);
    expect(msgs[1].content).toContain('達成率: —');
  });

  it('yoyRate が null のとき「—」と表現される', () => {
    const c: ExecSummaryCtx = { ...ctx, yoyRate: null };
    const msgs = buildExecSummaryMessages(c);
    expect(msgs[1].content).toContain('前年比: —');
  });

  it('projection が null のとき「—」と表現される', () => {
    const c: ExecSummaryCtx = { ...ctx, projection: null };
    const msgs = buildExecSummaryMessages(c);
    expect(msgs[1].content).toContain('着地見込: —');
  });

  it('yoyRate がマイナスのときプラス記号がつかない', () => {
    const c: ExecSummaryCtx = { ...ctx, yoyRate: -3.1 };
    const msgs = buildExecSummaryMessages(c);
    expect(msgs[1].content).toContain('-3.1%');
    expect(msgs[1].content).not.toContain('+-3.1%');
  });

  it('system メッセージに経営者向け・日本語・2〜3文の指示が含まれる', () => {
    const msgs = buildExecSummaryMessages(ctx);
    expect(msgs[0].content).toContain('2〜3文');
    expect(msgs[0].content).toContain('日本語');
    expect(msgs[0].content).toContain('経営者');
  });

  it('isPartial のとき前年比ラベルが「同日数まで」になり注意書きが入る', () => {
    const msgs = buildExecSummaryMessages({ ...ctx, isPartial: true, asOf: '16日' });
    expect(msgs[1].content).toContain('前年同月比(同日数まで)');
    expect(msgs[1].content).toContain('16日時点');
    expect(msgs[1].content).toContain('「減少」と断定しない');
    // system 側にも月途中の注意
    expect(msgs[0].content).toContain('月の途中');
  });

  it('isPartial 未指定（満期間）では従来どおり「前年比」ラベル', () => {
    const msgs = buildExecSummaryMessages(ctx);
    expect(msgs[1].content).toContain('前年比:');
    expect(msgs[1].content).not.toContain('同日数まで');
  });
});
