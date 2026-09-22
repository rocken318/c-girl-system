/** 出欠区分。unconfirmed は「予定はあるが未記録」の初期状態。 */
export type AttendanceStatus =
  | 'unconfirmed'
  | 'present'
  | 'douhan'
  | 'late'
  | 'absent'
  | 'same_day_absence';

/** UI で選択できる区分（未確認は選択肢に含めない）。 */
export const ATTENDANCE_STATUSES: Exclude<AttendanceStatus, 'unconfirmed'>[] = [
  'present', 'douhan', 'late', 'absent', 'same_day_absence',
];

export interface AttendanceFields {
  attended: boolean;
  isLate: boolean;
  isAbsent: boolean;
  attendanceType: 'normal' | 'douhan' | 'late' | 'absent' | 'same_day_absence';
}

/** 区分 → daily_records の出欠フィールド。 */
export function statusToFields(status: Exclude<AttendanceStatus, 'unconfirmed'>): AttendanceFields {
  switch (status) {
    case 'present':          return { attended: true,  isLate: false, isAbsent: false, attendanceType: 'normal' };
    case 'douhan':           return { attended: true,  isLate: false, isAbsent: false, attendanceType: 'douhan' };
    case 'late':             return { attended: true,  isLate: true,  isAbsent: false, attendanceType: 'late' };
    case 'absent':           return { attended: false, isLate: false, isAbsent: true,  attendanceType: 'absent' };
    case 'same_day_absence': return { attended: false, isLate: false, isAbsent: true,  attendanceType: 'same_day_absence' };
  }
}

/** daily_records の出欠フィールド → 区分。マークが無ければ unconfirmed。 */
export function fieldsToStatus(fields: {
  attended?: boolean;
  isLate?: boolean;
  isAbsent?: boolean;
  attendanceType?: string;
}): AttendanceStatus {
  const { attended = false, isLate = false, isAbsent = false, attendanceType = 'normal' } = fields;
  if (isAbsent) {
    return attendanceType === 'same_day_absence' ? 'same_day_absence' : 'absent';
  }
  if (attended) {
    if (attendanceType === 'douhan') return 'douhan';
    return isLate ? 'late' : 'present';
  }
  return 'unconfirmed';
}

/** 出勤率で「出勤日」として数える区分か（出勤/同伴/遅刻）。 */
export function countsAsAttended(status: AttendanceStatus): boolean {
  return status === 'present' || status === 'douhan' || status === 'late';
}

/**
 * 既存の daily_records.data に出欠区分をマージする（純関数）。
 * 売上・指名・時間などのフィールドは既存値を保持（非破壊）。
 * - 同伴出勤: douhanTime を設定し、未計上(0)なら douhan=1（再マークは冪等）。
 * - 欠勤/当欠: douhan=0（来ていないため）。
 * - 出勤/遅刻: douhan は既存値を維持。
 */
export function mergeAttendanceData(
  existing: Record<string, unknown>,
  status: Exclude<AttendanceStatus, 'unconfirmed'>,
  douhanTime?: string,
): Record<string, unknown> {
  const fields = statusToFields(status);
  const merged: Record<string, unknown> = { ...existing, ...fields };

  const currentDouhan = Number(existing.douhan) || 0;
  if (status === 'douhan') {
    merged.douhan = currentDouhan >= 1 ? currentDouhan : 1;
    if (douhanTime) merged.douhanTime = douhanTime;
  } else {
    // 同伴以外は同伴時刻を残さない（古い douhanTime を消す）
    delete merged.douhanTime;
    merged.douhan = (status === 'absent' || status === 'same_day_absence') ? 0 : currentDouhan;
  }
  return merged;
}
