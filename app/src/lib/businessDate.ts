/** 打刻時刻と店舗カットオーバー時刻(時)から営業日(YYYY-MM-DD, JST)を算出。SQL public.business_date と一致させる。 */
export function businessDate(at: Date, cutoverHour: number): string {
  // JSTのミリ秒に変換 → cutover時間を引く → 日付部分
  const jst = new Date(at.getTime() + 9 * 3600_000);
  const shifted = new Date(jst.getTime() - cutoverHour * 3600_000);
  return shifted.toISOString().slice(0, 10);
}
