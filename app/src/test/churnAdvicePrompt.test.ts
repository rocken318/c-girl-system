import { describe, it, expect } from 'vitest';
import { buildChurnAdviceMessages } from '../lib/churnAdvicePrompt';
import type { ChurnAdviceCtx } from '../lib/churnAdvicePrompt';

const ctx: ChurnAdviceCtx = {
  sourceName: 'さくら',
  level: 'high',
  reasons: ['売上-40%', '出勤日数減少'],
  storeName: 'KINGYO',
};

describe('buildChurnAdviceMessages', () => {
  it('system と user の 2 件を返す', () => {
    const msgs = buildChurnAdviceMessages(ctx);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].role).toBe('user');
  });

  it('user メッセージに源氏名が含まれる', () => {
    const msgs = buildChurnAdviceMessages(ctx);
    expect(msgs[1].content).toContain('さくら');
  });

  it('user メッセージに店名が含まれる', () => {
    const msgs = buildChurnAdviceMessages(ctx);
    expect(msgs[1].content).toContain('KINGYO');
  });

  it('user メッセージにリスクレベルが含まれる', () => {
    const msgs = buildChurnAdviceMessages(ctx);
    expect(msgs[1].content).toContain('high');
  });

  it('user メッセージに理由が含まれる', () => {
    const msgs = buildChurnAdviceMessages(ctx);
    expect(msgs[1].content).toContain('売上-40%');
    expect(msgs[1].content).toContain('出勤日数減少');
  });

  it('本名・連絡先・LINE ID・cast_id を渡さないことを確認（入力した値以外が露出しない）', () => {
    const sensitiveCtx: ChurnAdviceCtx = {
      sourceName: 'さくら',
      level: 'medium',
      reasons: ['売上-20%'],
      storeName: 'KINGYO',
    };
    const msgs = buildChurnAdviceMessages(sensitiveCtx);
    const allContent = msgs.map((m) => m.content).join('\n');
    expect(allContent).not.toContain('本名');
    expect(allContent).not.toContain('line_user_id');
    expect(allContent).not.toContain('電話');
    expect(allContent).not.toContain('連絡先');
    expect(allContent).not.toContain('cast_id');
  });

  it('system メッセージに日本語・1〜2文の指示が含まれる', () => {
    const msgs = buildChurnAdviceMessages(ctx);
    expect(msgs[0].content).toContain('1〜2文');
    expect(msgs[0].content).toContain('日本語');
  });

  it('medium リスクでも正しく動作する', () => {
    const medCtx: ChurnAdviceCtx = {
      sourceName: 'もも',
      level: 'medium',
      reasons: ['出勤日数-2日'],
      storeName: 'KINGYO',
    };
    const msgs = buildChurnAdviceMessages(medCtx);
    expect(msgs[1].content).toContain('medium');
    expect(msgs[1].content).toContain('もも');
  });
});
