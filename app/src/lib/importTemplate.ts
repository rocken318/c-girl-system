export interface CastRosterRow {
  sourceName: string;
  rank: string;
  joinDate: string;   // YYYY-MM-DD
  hourlyRate: number;
}

/** 投入テンプレ(キャスト名簿)のヘッダ定義。店に配布する列順。 */
export const CAST_ROSTER_HEADERS = ['源氏名', 'ランク', '入店日', '時給'] as const;

/** ヘッダ付きCSVをキャスト名簿行へ変換。空行は無視、前後空白trim。 */
export function parseCastRoster(csv: string): CastRosterRow[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => {
    const [sourceName, rank, joinDate, hourly] = line.split(',').map((c) => c.trim());
    return { sourceName, rank, joinDate, hourlyRate: Number(hourly) || 0 };
  });
}
