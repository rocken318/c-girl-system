import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyLineSignature } from '../lib/lineSignature';
import { unsubmittedCasts } from '../lib/submissionCheck';

describe('verifyLineSignature', () => {
  const secret = 'test-channel-secret';
  const body = '{"events":[]}';

  function makeSignature(b: string, s: string) {
    return crypto.createHmac('sha256', s).update(b).digest('base64');
  }

  it('正しい署名は true', () => {
    const sig = makeSignature(body, secret);
    expect(verifyLineSignature(body, sig, secret)).toBe(true);
  });

  it('改ざんされた署名は false', () => {
    const sig = makeSignature(body, secret);
    // 最後の文字を変えて改ざん
    const tampered = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
    expect(verifyLineSignature(body, tampered, secret)).toBe(false);
  });

  it('signature が undefined のとき false', () => {
    expect(verifyLineSignature(body, undefined, secret)).toBe(false);
  });
});

describe('unsubmittedCasts', () => {
  it('提出済みを除いた差集合を返す', () => {
    const active = ['c1', 'c2', 'c3', 'c4'];
    const submitted = ['c1', 'c3'];
    expect(unsubmittedCasts(active, submitted)).toEqual(['c2', 'c4']);
  });

  it('全員提出済みなら空配列', () => {
    expect(unsubmittedCasts(['c1', 'c2'], ['c1', 'c2'])).toEqual([]);
  });

  it('提出済みが空なら全員が未提出', () => {
    expect(unsubmittedCasts(['c1', 'c2'], [])).toEqual(['c1', 'c2']);
  });

  it('アクティブが空なら空配列', () => {
    expect(unsubmittedCasts([], ['c1'])).toEqual([]);
  });
});
