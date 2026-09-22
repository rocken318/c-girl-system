/**
 * dsystemImport.ts
 * 汎用 Dシステム（Excel/CSV）取込ロジック
 * 純ロジック層: DOM/Supabase に依存しない
 */
import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FieldKey =
  | 'date'
  | 'sourceName'
  | 'nominatedSales'
  | 'freeSales'
  | 'honShimei'
  | 'banaiShimei'
  | 'douhan'
  | 'drinks'
  | 'bottles'
  | 'extensions';

/** 各フィールド → ヘッダ名のマッピング */
export type ColumnMapping = Partial<Record<FieldKey, string>>;

export type MappedRow = {
  date: string;
  sourceName: string;
  nominatedSales: number;
  freeSales: number;
  honShimei: number;
  banaiShimei: number;
  douhan: number;
  drinks: number;
  bottles: number;
  extensions: number;
};

// ---------------------------------------------------------------------------
// parseWorkbook
// ---------------------------------------------------------------------------

export type ParsedWorkbook = {
  headers: string[];
  rows: Record<string, string>[];
  sheetNames: string[];
  sheetName: string;
};

/**
 * ワークブックの全シート名を返す。
 */
export function listSheetNames(data: ArrayBuffer): string[] {
  const workbook = XLSX.read(data, { type: 'array', cellDates: false });
  return workbook.SheetNames;
}

/**
 * シート名一覧から「一覧」系シートを優先して選ぶ。
 * 優先キーワード: 一覧 / 集計 / 売上 / サマリ / summary（大小無視）
 * 該当なければ先頭シートを返す。純関数。
 */
export function pickDefaultSheet(sheetNames: string[]): string {
  if (sheetNames.length === 0) return '';
  const PRIORITY_PATTERNS = [/一覧/, /集計/, /売上/, /サマリ/, /summary/i];
  for (const pattern of PRIORITY_PATTERNS) {
    const found = sheetNames.find(n => pattern.test(n));
    if (found) return found;
  }
  return sheetNames[0];
}

/**
 * ArrayBuffer → { headers, rows, sheetNames, sheetName }
 * sheetName 指定時はそのシート、未指定なら pickDefaultSheet のシートを読む。
 * 1行目をヘッダとし、残行を Record<header, cellString> として返す。
 * 空行（全セル空）は除外。
 */
export function parseWorkbook(data: ArrayBuffer, sheetName?: string): ParsedWorkbook {
  const workbook = XLSX.read(data, { type: 'array', cellDates: false });
  const sheetNames = workbook.SheetNames;
  const resolvedSheetName = sheetName ?? pickDefaultSheet(sheetNames);
  const sheet = workbook.Sheets[resolvedSheetName];

  // sheet_to_json with header:1 → string[][]
  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });

  if (raw.length === 0) return { headers: [], rows: [], sheetNames, sheetName: resolvedSheetName };

  const headers = (raw[0] as string[]).map(h => String(h ?? '').trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < raw.length; i++) {
    const cells = raw[i] as string[];
    // 空行除外
    const anyValue = cells.some(c => String(c ?? '').trim() !== '');
    if (!anyValue) continue;

    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rec[h] = String(cells[idx] ?? '').trim();
    });
    rows.push(rec);
  }

  return { headers, rows, sheetNames, sheetName: resolvedSheetName };
}

// ---------------------------------------------------------------------------
// guessMapping
// ---------------------------------------------------------------------------

/**
 * ヘッダ配列から「よくある日本語列名」でフィールドを推測する。
 * 部分一致（includes）で判定。先に完全一致、次に部分一致の順で試みる。
 */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};

  /** ヘッダの中から最初にマッチするものを返す */
  const find = (tests: Array<(h: string) => boolean>): string | undefined => {
    for (const test of tests) {
      const found = headers.find(test);
      if (found) return found;
    }
    return undefined;
  };

  // date
  mapping.date = find([
    h => h === '日付',
    h => h.includes('日付'),
    h => h === 'DATE' || h === 'date',
  ]);

  // sourceName
  mapping.sourceName = find([
    h => h === '源氏名',
    h => h.includes('源氏名'),
    h => h === 'キャスト名',
    h => h.includes('キャスト名'),
    h => h === 'キャスト',
    h => h.includes('キャスト'),
    h => h === '名前',
    h => h.includes('名前'),
    h => h === '氏名',
    h => h.includes('氏名'),
  ]);

  // nominatedSales — 「本指名売上」は「本指名」よりも先に試みる
  mapping.nominatedSales = find([
    h => h === '本指名売上',
    h => h.includes('本指名売上'),
    h => h.includes('指名売上'),
  ]);

  // freeSales
  mapping.freeSales = find([
    h => h === 'フリー売上',
    h => h.includes('フリー売上'),
    h => h === 'フリー' && !h.includes('指名'),
  ]);

  // honShimei — 「本指名売上」にマッチしない純粋な本数列
  mapping.honShimei = find([
    h => h === '本指名',
    h => h === '本指名数',
    h => h === '本指名本数',
    // 売上を含まない部分一致
    h => h.includes('本指名') && !h.includes('売上'),
  ]);

  // banaiShimei
  mapping.banaiShimei = find([
    h => h === '場内指名',
    h => h === '場内',
    h => h.includes('場内指名'),
    h => h.includes('場内'),
  ]);

  // douhan
  mapping.douhan = find([
    h => h === '同伴',
    h => h.includes('同伴'),
  ]);

  // drinks
  mapping.drinks = find([
    h => h === 'ドリンク',
    h => h.includes('ドリンク'),
  ]);

  // bottles — シャンパン/ボトル
  mapping.bottles = find([
    h => h === 'ボトル',
    h => h.includes('ボトル'),
    h => h === 'シャンパン',
    h => h.includes('シャンパン'),
  ]);

  // extensions
  mapping.extensions = find([
    h => h === '延長',
    h => h.includes('延長'),
  ]);

  // undefined のキーは除去して返す
  return Object.fromEntries(
    Object.entries(mapping).filter(([, v]) => v !== undefined)
  ) as ColumnMapping;
}

// ---------------------------------------------------------------------------
// Date normalization
// ---------------------------------------------------------------------------

/** Excel シリアル値の判定（5桁の整数文字列）*/
function isExcelSerial(s: string): boolean {
  return /^\d{5}$/.test(s.trim());
}

/**
 * 日付文字列を YYYY-MM-DD に正規化する。
 * - `2026/9/1` → `2026-09-01`
 * - `2026-9-1` → `2026-09-01`
 * - `2026-09-01` → そのまま
 * - Excel serial (45901 など) → XLSX.SSF.parse_date_code 相当で変換
 * 変換失敗時は null を返す。
 */
function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // Excel serial value (5桁整数)
  if (isExcelSerial(s)) {
    const serial = parseInt(s, 10);
    // Excel epoch: 1900-01-00 (実質 1899-12-31)
    // serial 1 = 1900-01-01 → Date = epoch + (serial - 1) days
    // Windows Excel のバグ: serial 60 = 1900-02-29(存在しない) のため
    // serial > 60 の場合 serial - 1 で補正
    const offset = serial > 60 ? serial - 1 : serial;
    const epoch = new Date(Date.UTC(1899, 11, 31)); // 1899-12-31
    const ms = epoch.getTime() + offset * 86400000;
    const d = new Date(ms);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // スラッシュ or ハイフン区切り (YYYY/M/D or YYYY-M-D)
  const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m) {
    const yyyy = m[1];
    const mm = m[2].padStart(2, '0');
    const dd = m[3].padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// mapRows
// ---------------------------------------------------------------------------

/**
 * rows（parseWorkbook が返す Record<header,string>[]）と mapping を受け取り、
 * MappedRow[] に変換する。
 * - date / sourceName 欠落行は errors に積んで mapped から除外。
 * - 数値フィールドは Number(...)||0。
 */
export function mapRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping
): { mapped: MappedRow[]; errors: string[] } {
  const mapped: MappedRow[] = [];
  const errors: string[] = [];

  rows.forEach((row, idx) => {
    const lineNum = idx + 1;

    // 必須: date
    const rawDate = mapping.date ? (row[mapping.date] ?? '') : '';
    const date = normalizeDate(rawDate);
    if (!date) {
      errors.push(`行${lineNum}: date が無効または欠落 (値="${rawDate}")`);
      return;
    }

    // 必須: sourceName
    const sourceName = mapping.sourceName ? (row[mapping.sourceName] ?? '').trim() : '';
    if (!sourceName) {
      errors.push(`行${lineNum}: sourceName が欠落`);
      return;
    }

    const getNum = (key: FieldKey): number => {
      if (!mapping[key]) return 0;
      const v = row[mapping[key]!] ?? '';
      return Number(v) || 0;
    };

    mapped.push({
      date,
      sourceName,
      nominatedSales: getNum('nominatedSales'),
      freeSales: getNum('freeSales'),
      honShimei: getNum('honShimei'),
      banaiShimei: getNum('banaiShimei'),
      douhan: getNum('douhan'),
      drinks: getNum('drinks'),
      bottles: getNum('bottles'),
      extensions: getNum('extensions'),
    });
  });

  return { mapped, errors };
}
