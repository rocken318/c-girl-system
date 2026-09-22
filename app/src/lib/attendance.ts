/** 出勤率(%)。予定日数0はnull（率を出さない）。小数1桁。 */
export function attendanceRate(attendedDays: number, scheduledDays: number): number | null {
  if (!scheduledDays) return null;
  return Math.round((attendedDays / scheduledDays) * 1000) / 10;
}
