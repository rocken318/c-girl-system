import { describe, it, expect } from 'vitest';
import { punchPayload, parsePunchPayload } from '../data/qr';

describe('punchPayload', () => {
  it('tokenをそのままペイロード化', () => {
    expect(punchPayload('TOKEN_ABC')).toBe('kingyo:punch:TOKEN_ABC');
  });
});

describe('parsePunchPayload', () => {
  it('正常: プレフィックス付き文字列からtokenを取り出す', () => {
    expect(parsePunchPayload('kingyo:punch:TOKEN_ABC')).toBe('TOKEN_ABC');
  });
  it('異常: プレフィックスなしはnullを返す', () => {
    expect(parsePunchPayload('TOKEN_ABC')).toBeNull();
  });
});
