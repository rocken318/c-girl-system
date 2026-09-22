import type { DailyRecord } from '../data/seed';
import { casts } from '../data/seed';

// Column mapping (configurable)
export interface ColumnMapping {
  castName: number;     // column index for cast name
  date: number;         // column index for date (YYYY-MM-DD)
  hours: number;
  honShimei: number;
  banaiShimei: number;
  douhan: number;
  drinks: number;
  bottles: number;
  extensions: number;
  nominatedSales: number;
  freeSales: number;
  isLate: number;       // 0 or 1
  isAbsent: number;     // 0 or 1
  advancePay: number;
}

export const defaultColumnMapping: ColumnMapping = {
  castName: 0, date: 1, hours: 2,
  honShimei: 3, banaiShimei: 4, douhan: 5,
  drinks: 6, bottles: 7, extensions: 8,
  nominatedSales: 9, freeSales: 10,
  isLate: 11, isAbsent: 12, advancePay: 13,
};

/**
 * Parse CSV string into rows (handles quoted fields with commas/newlines).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let i = 0;
  const n = normalized.length;

  while (i < n) {
    const row: string[] = [];
    // Parse one row
    while (i < n) {
      if (normalized[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        let field = '';
        while (i < n) {
          if (normalized[i] === '"') {
            if (i + 1 < n && normalized[i + 1] === '"') {
              // Escaped quote
              field += '"';
              i += 2;
            } else {
              // Closing quote
              i++;
              break;
            }
          } else {
            field += normalized[i];
            i++;
          }
        }
        row.push(field);
        // After closing quote, expect comma or newline
        if (i < n && normalized[i] === ',') i++;
        else break; // end of row
      } else {
        // Unquoted field
        let field = '';
        while (i < n && normalized[i] !== ',' && normalized[i] !== '\n') {
          field += normalized[i];
          i++;
        }
        row.push(field.trim());
        if (i < n && normalized[i] === ',') i++;
        else break; // end of row (newline or EOF)
      }
    }
    // Skip newline
    if (i < n && normalized[i] === '\n') i++;

    // Skip completely empty rows
    if (row.length > 0 && !(row.length === 1 && row[0] === '')) {
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Validate and convert CSV rows to DailyRecords.
 * Returns { records, errors }.
 */
export function csvToDailyRecords(
  rows: string[][],
  mapping: ColumnMapping,
  storeId: string,
  skipHeader: boolean,
): { records: DailyRecord[]; errors: string[] } {
  const records: DailyRecord[] = [];
  const errors: string[] = [];

  const dataRows = skipHeader ? rows.slice(1) : rows;

  // Build case-insensitive cast name → id map
  const castNameToId = new Map<string, string>();
  for (const c of casts) {
    castNameToId.set(c.name.toLowerCase(), c.id);
  }

  dataRows.forEach((row, idx) => {
    const lineNum = skipHeader ? idx + 2 : idx + 1;

    const getCol = (colIdx: number): string => row[colIdx]?.trim() ?? '';
    const getNum = (colIdx: number): number => {
      const v = getCol(colIdx);
      const n = Number(v);
      return isNaN(n) ? 0 : n;
    };

    const castNameRaw = getCol(mapping.castName);
    const dateRaw = getCol(mapping.date);

    // Validate cast name
    const castId = castNameToId.get(castNameRaw.toLowerCase());
    if (!castId) {
      errors.push(`行${lineNum}: キャスト名「${castNameRaw}」が見つかりません`);
      return;
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      errors.push(`行${lineNum}: 日付「${dateRaw}」の形式が無効です（YYYY-MM-DD）`);
      return;
    }

    const hours = getNum(mapping.hours);
    const douhan = getNum(mapping.douhan);
    const isAbsent = getNum(mapping.isAbsent) === 1;
    const isLate = getNum(mapping.isLate) === 1;

    const attended = !isAbsent && hours > 0;
    const attendanceType: 'normal' | 'douhan' = douhan > 0 ? 'douhan' : 'normal';

    records.push({
      id: `csv_${castId}_${dateRaw}_${Date.now()}_${idx}`,
      castId,
      storeId,
      date: dateRaw,
      attended,
      attendanceType,
      hours,
      isLate,
      isAbsent,
      honShimei: getNum(mapping.honShimei),
      banaiShimei: getNum(mapping.banaiShimei),
      douhan,
      drinks: getNum(mapping.drinks),
      bottles: getNum(mapping.bottles),
      extensions: getNum(mapping.extensions),
      nominatedSales: getNum(mapping.nominatedSales),
      freeSales: getNum(mapping.freeSales),
      advancePay: getNum(mapping.advancePay),
    });
  });

  return { records, errors };
}

/**
 * Generate a template CSV string with a header row and one sample row.
 */
export function generateTemplateCsv(): string {
  const header = [
    'キャスト名', '日付(YYYY-MM-DD)', '勤務時間',
    '本指名', '場内指名', '同伴',
    'ドリンク', 'ボトル', '延長',
    '本指名売上', 'フリー売上',
    '遅刻(0/1)', '欠勤(0/1)', '前借り',
  ].join(',');

  const sample = [
    'SAKURA', '2026-06-01', '7',
    '2', '1', '1',
    '4', '0', '0',
    '80000', '20000',
    '0', '0', '0',
  ].join(',');

  return `${header}\n${sample}\n`;
}
