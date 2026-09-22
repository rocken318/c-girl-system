export interface AttendanceConfirmInput {
  sourceName: string;    // 源氏名
  startTime: string;     // "20:00"
  endTime: string;       // "01:00"
  hairMakeTime?: string; // "18:00"（任意）
  douhanTime?: string;   // "19:00"（任意）
}

/**
 * 出欠確認LINEの個別文面を組み立てる。
 * - 店名は含めない（宛名は源氏名のみ）。
 * - ヘアメ時間・同伴予定は値がある場合のみ行を追加する。
 * - 本名・連絡先・LINE ID は扱わない（呼び出し側で源氏名等のみ渡すこと）。
 */
export function buildAttendanceConfirmMessage(input: AttendanceConfirmInput): string {
  const { sourceName, startTime, endTime, hairMakeTime, douhanTime } = input;

  const lines = [
    `${sourceName}さん、おはようございます。`,
    `本日は ${startTime}〜${endTime} の出勤です。よろしくお願いします🙇`,
  ];

  if (hairMakeTime) {
    lines.push(`ヘアメイクは ${hairMakeTime} のご予約です。`);
  }
  if (douhanTime) {
    lines.push(`本日は ${douhanTime} に同伴のご予定です。`);
  }

  return lines.join('\n');
}
