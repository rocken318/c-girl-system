/**
 * forecast.ts — 売上着地予測（ラン率ベース）
 * 純関数・決定的・副作用なし。
 */

/**
 * 経過日数のペースから期間末の着地額を線形予測する。
 * daysElapsed <= 0 の場合は 0 を返す。
 */
export function projectLanding(
  salesSoFar: number,
  daysElapsed: number,
  daysInPeriod: number,
): number {
  if (daysElapsed <= 0) return 0;
  return Math.round((salesSoFar / daysElapsed) * daysInPeriod);
}

/**
 * periodKey（'YYYY-MM' 形式）と today を受け取り、
 * 当月の経過日数と当月日数を JST 基準で返す。
 *
 * - 当月：daysElapsed = JST今日の日付（1〜daysInPeriod）
 * - 過去月：daysElapsed = daysInPeriod（確定）
 * - 未来月：daysElapsed = 0
 */
export function monthProgress(
  periodKey: string,
  today: Date,
): { daysElapsed: number; daysInPeriod: number } {
  const [ys, ms] = periodKey.split('-').map(Number);
  const daysInPeriod = new Date(Date.UTC(ys, ms, 0)).getUTCDate();

  const jst = new Date(today.getTime() + 9 * 3600_000);
  const ty = jst.getUTCFullYear();
  const tm = jst.getUTCMonth() + 1;
  const td = jst.getUTCDate();

  if (ty === ys && tm === ms) {
    // 当月：今日の日付を経過日数とする（月末を超えないようクランプ）
    return { daysElapsed: Math.min(td, daysInPeriod), daysInPeriod };
  }

  // 対象月が過去（今日より前）なら確定 = 全日、未来なら 0
  const targetBeforeToday = ys < ty || (ys === ty && ms < tm);
  return { daysElapsed: targetBeforeToday ? daysInPeriod : 0, daysInPeriod };
}
