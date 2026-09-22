import { describe, it, expect } from 'vitest';
import { buildDunningMessages, fallbackDunning } from '../lib/dunningPrompt';
import type { DunningContext } from '../lib/dunningPrompt';

const ctx: DunningContext = {
  sourceName: 'さくら',
  storeName: 'KINGYO',
  targetMonth: '2026-10',
  item: 'シフト希望',
};

describe('buildDunningMessages', () => {
  it('system と user の 2 件を返す', () => {
    const msgs = buildDunningMessages(ctx);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].role).toBe('user');
  });

  it('user メッセージに源氏名が含まれる', () => {
    const msgs = buildDunningMessages(ctx);
    expect(msgs[1].content).toContain('さくら');
  });

  it('user メッセージに店名が含まれる', () => {
    const msgs = buildDunningMessages(ctx);
    expect(msgs[1].content).toContain('KINGYO');
  });

  it('user メッセージに未提出内容が含まれる', () => {
    const msgs = buildDunningMessages(ctx);
    expect(msgs[1].content).toContain('シフト希望');
  });

  it('user メッセージに対象月が含まれる', () => {
    const msgs = buildDunningMessages(ctx);
    expect(msgs[1].content).toContain('2026-10');
  });

  it('本名・連絡先・LINE ID を渡さないことを確認（入力した値以外が露出しない）', () => {
    const sensitiveCtx: DunningContext = {
      sourceName: 'さくら',
      storeName: 'KINGYO',
      targetMonth: '2026-10',
      item: 'シフト希望',
    };
    const msgs = buildDunningMessages(sensitiveCtx);
    const allContent = msgs.map((m) => m.content).join('\n');
    // 本名・電話番号・LINE ID のようなフィールド名がプロンプトに含まれないことを確認
    expect(allContent).not.toContain('本名');
    expect(allContent).not.toContain('line_user_id');
    expect(allContent).not.toContain('電話');
    expect(allContent).not.toContain('連絡先');
  });

  it('system メッセージに匿名化方針の骨子（日本語・1〜2文）が含まれる', () => {
    const msgs = buildDunningMessages(ctx);
    expect(msgs[0].content).toContain('1〜2文');
    expect(msgs[0].content).toContain('日本語');
  });
});

describe('fallbackDunning', () => {
  it('店名を含む', () => {
    expect(fallbackDunning(ctx)).toContain('KINGYO');
  });

  it('源氏名を含む', () => {
    expect(fallbackDunning(ctx)).toContain('さくら');
  });

  it('対象月を含む', () => {
    expect(fallbackDunning(ctx)).toContain('2026-10');
  });

  it('未提出内容を含む', () => {
    expect(fallbackDunning(ctx)).toContain('シフト希望');
  });

  it('非空文字列を返す', () => {
    const result = fallbackDunning(ctx);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
