import crypto from 'node:crypto';

/** LINE webhook 署名検証（HMAC-SHA256, base64） */
export function verifyLineSignature(
  rawBody: string,
  signature: string | undefined,
  channelSecret: string
): boolean {
  if (!signature) return false;
  const mac = crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  // タイミング安全比較
  const a = Buffer.from(mac);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
