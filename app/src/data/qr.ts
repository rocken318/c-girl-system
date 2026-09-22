const PREFIX = 'cgirl:punch:';

/** 端末スキャナが解釈するQRペイロード文字列を生成 */
export function punchPayload(token: string): string {
  return PREFIX + token;
}

/** スキャン文字列から token を取り出す（不正なら null） */
export function parsePunchPayload(scanned: string): string | null {
  return scanned.startsWith(PREFIX) ? scanned.slice(PREFIX.length) : null;
}
