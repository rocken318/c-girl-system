import { useState, useRef, useCallback } from 'react';
import { usePerformance } from '../../store/PerformanceContext';
import { useAuth } from '../../store/AuthContext';
import { casts } from '../../data/seed';
import type { DailyRecord } from '../../data/seed';
import {
  parseCsv,
  csvToDailyRecords,
  generateTemplateCsv,
  defaultColumnMapping,
} from '../../lib/csvImport';
import {
  parseCastRoster,
  CAST_ROSTER_HEADERS,
} from '../../lib/importTemplate';
import type { CastRosterRow } from '../../lib/importTemplate';
import { supabase } from '../../lib/supabase';
import {
  listSheetNames,
  parseWorkbook,
  pickDefaultSheet,
  guessMapping,
  mapRows,
} from '../../lib/dsystemImport';
import type { ColumnMapping, FieldKey, MappedRow } from '../../lib/dsystemImport';
import { fetchCastMap, importDailyFromMapped } from '../../data/dsystemImport';

const inputClass =
  'border border-ink/10 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20 transition-colors';

type PreviewRow = {
  lineNum: number;
  castName: string;
  date: string;
  hours: number;
  honShimei: number;
  banaiShimei: number;
  douhan: number;
  drinks: number;
  bottles: number;
  extensions: number;
  nominatedSales: number;
  freeSales: number;
  isLate: boolean;
  isAbsent: boolean;
  advancePay: number;
  record: DailyRecord | null;
  error: string | null;
};

export function ImportPage() {
  const { replaceMonthlySummary } = usePerformance();
  const { user } = useAuth();
  const storeId = user?.activeStoreId;

  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [skipHeader, setSkipHeader] = useState(true);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Template download ----
  const handleDownloadTemplate = () => {
    const csv = generateTemplateCsv();
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- Process CSV text ----
  const processText = useCallback((text: string, name: string) => {
    setFileName(name);
    setImportedCount(null);

    const rows = parseCsv(text);
    setRawRows(rows);

    buildPreview(rows, skipHeader);
  }, [skipHeader]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildPreview = (rows: string[][], skip: boolean) => {
    const { records, errors } = csvToDailyRecords(rows, defaultColumnMapping, storeId ?? '', skip);

    // Build cast name lookup
    const castIdToName = new Map(casts.map(c => [c.id, c.name]));

    const dataRows = skip ? rows.slice(1) : rows;
    const preview: PreviewRow[] = dataRows.map((row, idx) => {
      const lineNum = skip ? idx + 2 : idx + 1;
      const get = (i: number) => row[i]?.trim() ?? '';
      const getN = (i: number) => Number(get(i)) || 0;

      const record = records.find(r => r.date === get(defaultColumnMapping.date) &&
        castIdToName.get(r.castId) === get(defaultColumnMapping.castName)) ?? null;

      const rowError = errors.find(e => e.startsWith(`行${lineNum}:`)) ?? null;

      return {
        lineNum,
        castName: get(defaultColumnMapping.castName),
        date: get(defaultColumnMapping.date),
        hours: getN(defaultColumnMapping.hours),
        honShimei: getN(defaultColumnMapping.honShimei),
        banaiShimei: getN(defaultColumnMapping.banaiShimei),
        douhan: getN(defaultColumnMapping.douhan),
        drinks: getN(defaultColumnMapping.drinks),
        bottles: getN(defaultColumnMapping.bottles),
        extensions: getN(defaultColumnMapping.extensions),
        nominatedSales: getN(defaultColumnMapping.nominatedSales),
        freeSales: getN(defaultColumnMapping.freeSales),
        isLate: getN(defaultColumnMapping.isLate) === 1,
        isAbsent: getN(defaultColumnMapping.isAbsent) === 1,
        advancePay: getN(defaultColumnMapping.advancePay),
        record,
        error: rowError,
      };
    });

    setPreviewRows(preview);
    setParseErrors(errors);
  };

  const handleSkipHeaderChange = (val: boolean) => {
    setSkipHeader(val);
    if (rawRows.length > 0) buildPreview(rawRows, val);
  };

  // ---- File handling ----
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      processText(text, file.name);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ---- Import execution ----
  const handleImport = () => {
    const validRecords = previewRows.filter(r => r.record !== null).map(r => r.record!);
    if (validRecords.length === 0) return;

    setImporting(true);

    // Group by castId + month
    const groups = new Map<string, DailyRecord[]>();
    for (const rec of validRecords) {
      const month = rec.date.slice(0, 7); // YYYY-MM
      const key = `${rec.castId}__${month}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(rec);
    }

    for (const [key, recs] of groups) {
      const [castId, month] = key.split('__');
      replaceMonthlySummary(castId, storeId!, month, recs);
    }

    setImportedCount(validRecords.length);
    setImporting(false);
  };

  const validCount = previewRows.filter(r => r.record !== null).length;
  const errorCount = previewRows.filter(r => r.error !== null).length;

  // ---- Cast roster import state ----
  const [rosterFileName, setRosterFileName] = useState<string | null>(null);
  const [rosterRows, setRosterRows] = useState<CastRosterRow[]>([]);
  const [rosterImporting, setRosterImporting] = useState(false);
  const [rosterResult, setRosterResult] = useState<{ success: number; errors: string[] } | null>(null);
  const rosterFileInputRef = useRef<HTMLInputElement>(null);

  const handleRosterFile = (file: File) => {
    setRosterResult(null);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const parsed = parseCastRoster(text);
      setRosterRows(parsed);
      setRosterFileName(file.name);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleRosterFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleRosterFile(file);
    // reset so same file can be re-selected
    e.target.value = '';
  };

  const handleRosterImport = async () => {
    if (!storeId || rosterRows.length === 0) return;
    setRosterImporting(true);
    setRosterResult(null);

    const errors: string[] = [];
    let successCount = 0;

    for (const row of rosterRows) {
      if (!row.sourceName?.trim()) continue; // 空名行をスキップ
      try {
        // 冪等性: source_name + store_id で既存を検索し insert/update を切替
        const { data: existing, error: selectErr } = await supabase
          .from('casts')
          .select('id')
          .eq('store_id', storeId)
          .eq('source_name', row.sourceName)
          .maybeSingle();

        if (selectErr) {
          errors.push(`${row.sourceName}: 検索エラー — ${selectErr.message}`);
          continue;
        }

        if (existing) {
          // update: rank / join_date のみ更新
          const { error: updateErr } = await supabase
            .from('casts')
            .update({ rank: row.rank, join_date: row.joinDate || null })
            .eq('id', existing.id);
          if (updateErr) {
            errors.push(`${row.sourceName}: 更新エラー — ${updateErr.message}`);
          } else {
            successCount++;
          }
        } else {
          // insert
          const { error: insertErr } = await supabase
            .from('casts')
            .insert({
              store_id: storeId,
              source_name: row.sourceName,
              rank: row.rank,
              join_date: row.joinDate || null,
              status: 'active',
              user_id: null,
            });
          if (insertErr) {
            errors.push(`${row.sourceName}: 登録エラー — ${insertErr.message}`);
          } else {
            successCount++;
          }
        }
      } catch (e) {
        errors.push(`${row.sourceName}: 予期せぬエラー`);
      }
    }

    setRosterResult({ success: successCount, errors });
    setRosterImporting(false);
  };

  // ---- Dシステム取込 state ----
  const [dsFileName, setDsFileName] = useState<string | null>(null);
  const [dsArrayBuffer, setDsArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [dsSheetNames, setDsSheetNames] = useState<string[]>([]);
  const [dsActiveSheet, setDsActiveSheet] = useState<string>('');
  const [dsHeaders, setDsHeaders] = useState<string[]>([]);
  const [dsRawRows, setDsRawRows] = useState<Record<string, string>[]>([]);
  const [dsMapping, setDsMapping] = useState<ColumnMapping>({});
  const [dsMapped, setDsMapped] = useState<MappedRow[]>([]);
  const [dsErrors, setDsErrors] = useState<string[]>([]);
  const [dsImporting, setDsImporting] = useState(false);
  const [dsResult, setDsResult] = useState<{ ok: number; unmatched: string[]; errors: string[] } | null>(null);
  const [dsShowPreview, setDsShowPreview] = useState(false);
  const dsFileInputRef = useRef<HTMLInputElement>(null);

  const DS_FIELD_LABELS: Record<FieldKey, string> = {
    date: '日付（必須）',
    sourceName: '源氏名（必須）',
    nominatedSales: '本指名売上',
    freeSales: 'フリー売上',
    honShimei: '本指名 本数',
    banaiShimei: '場内指名 本数',
    douhan: '同伴 回数',
    drinks: 'ドリンク',
    bottles: 'ボトル',
    extensions: '延長',
  };

  const DS_FIELD_KEYS: FieldKey[] = [
    'date', 'sourceName', 'nominatedSales', 'freeSales',
    'honShimei', 'banaiShimei', 'douhan', 'drinks', 'bottles', 'extensions',
  ];

  /** シート名を指定してバッファを再パースし、ヘッダ/行/マッピングを更新する */
  const applySheet = (buf: ArrayBuffer, sheetName: string) => {
    const { headers, rows } = parseWorkbook(buf, sheetName);
    setDsActiveSheet(sheetName);
    setDsHeaders(headers);
    setDsRawRows(rows);
    const guessed = guessMapping(headers);
    setDsMapping(guessed);
    setDsMapped([]);
    setDsErrors([]);
    setDsShowPreview(false);
  };

  const handleDsFile = (file: File) => {
    setDsResult(null);
    setDsShowPreview(false);
    const reader = new FileReader();
    reader.onload = e => {
      const buf = e.target?.result as ArrayBuffer;
      try {
        const sheetNames = listSheetNames(buf);
        const defaultSheet = pickDefaultSheet(sheetNames);
        setDsFileName(file.name);
        setDsArrayBuffer(buf);
        setDsSheetNames(sheetNames);
        applySheet(buf, defaultSheet);
      } catch (err) {
        setDsErrors([`ファイル解析エラー: ${String(err)}`]);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDsSheetChange = (sheetName: string) => {
    if (!dsArrayBuffer) return;
    setDsResult(null);
    applySheet(dsArrayBuffer, sheetName);
  };

  const handleDsFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleDsFile(file);
    e.target.value = '';
  };

  const handleDsMappingChange = (field: FieldKey, value: string) => {
    setDsMapping(prev => {
      const next = { ...prev };
      if (value === '') {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
    setDsShowPreview(false);
  };

  const handleDsPreview = () => {
    const { mapped, errors } = mapRows(dsRawRows, dsMapping);
    setDsMapped(mapped);
    setDsErrors(errors);
    setDsShowPreview(true);
  };

  const handleDsImport = async () => {
    if (!storeId) return;
    setDsImporting(true);
    setDsResult(null);
    try {
      const castMap = await fetchCastMap(storeId);
      const result = await importDailyFromMapped(storeId, dsMapped, castMap);
      setDsResult(result);
    } catch (err) {
      setDsResult({ ok: 0, unmatched: [], errors: [String(err)] });
    } finally {
      setDsImporting(false);
    }
  };

  // ---- Template CSV download for cast roster ----
  const handleDownloadRosterTemplate = () => {
    const header = CAST_ROSTER_HEADERS.join(',');
    const example = 'SAKURA,A,2025-04-01,3000';
    const csv = `${header}\n${example}\n`;
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cast_roster_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-6xl">
      <h1 className="font-mincho text-xl md:text-2xl font-bold text-ink">CSVインポート</h1>

      {/* Template download */}
      <div className="bg-surface-card rounded-2xl shadow-card p-5 space-y-3">
        <h2 className="font-mincho font-bold text-ink">1. テンプレートのダウンロード</h2>
        <p className="text-sm text-ink-secondary">
          まずテンプレートCSVをダウンロードし、Excelで編集後に「名前を付けて保存」→「CSV（コンマ区切り）」で書き出してください。
        </p>
        <button
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold bg-brand-gradient text-white hover:opacity-90 transition-opacity"
        >
          テンプレートCSVダウンロード
        </button>
      </div>

      <div className="rule-gold" />

      {/* File upload */}
      <div className="bg-surface-card rounded-2xl shadow-card p-5 space-y-4">
        <h2 className="font-mincho font-bold text-ink">2. CSVファイルのアップロード</h2>

        {/* Options */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={skipHeader}
              onChange={e => handleSkipHeaderChange(e.target.checked)}
              className="accent-gold"
            />
            1行目をヘッダーとしてスキップする
          </label>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
            dragging ? 'border-gold bg-gold/5' : 'border-ink/15 hover:border-gold/50 hover:bg-gold/3'
          }`}
        >
          <p className="text-ink-secondary text-sm">
            CSVファイルをここにドロップ、またはクリックして選択
          </p>
          {fileName && (
            <p className="mt-2 text-sm font-medium text-gold">{fileName}</p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
      </div>

      {/* Preview */}
      {previewRows.length > 0 && (
        <>
          <div className="rule-gold" />

          <div className="bg-surface-card rounded-2xl shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-ink/5 flex items-center justify-between">
              <h2 className="font-mincho font-bold text-ink">3. プレビュー</h2>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-success">有効: {validCount}件</span>
                {errorCount > 0 && (
                  <span className="text-danger">エラー: {errorCount}件</span>
                )}
              </div>
            </div>

            {/* Error list */}
            {parseErrors.length > 0 && (
              <div className="mx-5 mt-4 bg-danger-bg rounded-xl p-4 space-y-1">
                <p className="text-sm font-bold text-danger">エラー内容</p>
                {parseErrors.map((e, i) => (
                  <p key={i} className="text-xs text-danger">{e}</p>
                ))}
              </div>
            )}

            {/* Preview table */}
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-ink/5">
                    <th className="text-left px-3 py-2 font-medium text-gold tracking-wide whitespace-nowrap">行</th>
                    <th className="text-left px-3 py-2 font-medium text-gold tracking-wide whitespace-nowrap">キャスト</th>
                    <th className="text-left px-3 py-2 font-medium text-gold tracking-wide whitespace-nowrap">日付</th>
                    <th className="text-right px-3 py-2 font-medium text-gold tracking-wide whitespace-nowrap">時間</th>
                    <th className="text-right px-3 py-2 font-medium text-gold tracking-wide whitespace-nowrap">本指名</th>
                    <th className="text-right px-3 py-2 font-medium text-gold tracking-wide whitespace-nowrap">場内</th>
                    <th className="text-right px-3 py-2 font-medium text-gold tracking-wide whitespace-nowrap">同伴</th>
                    <th className="text-right px-3 py-2 font-medium text-gold tracking-wide whitespace-nowrap">ドリンク</th>
                    <th className="text-right px-3 py-2 font-medium text-gold tracking-wide whitespace-nowrap">ボトル</th>
                    <th className="text-right px-3 py-2 font-medium text-gold tracking-wide whitespace-nowrap">延長</th>
                    <th className="text-right px-3 py-2 font-medium text-gold tracking-wide whitespace-nowrap">指名売上</th>
                    <th className="text-right px-3 py-2 font-medium text-gold tracking-wide whitespace-nowrap">フリー売上</th>
                    <th className="text-center px-3 py-2 font-medium text-gold tracking-wide whitespace-nowrap">遅刻</th>
                    <th className="text-center px-3 py-2 font-medium text-gold tracking-wide whitespace-nowrap">欠勤</th>
                    <th className="text-right px-3 py-2 font-medium text-gold tracking-wide whitespace-nowrap">前借り</th>
                    <th className="text-left px-3 py-2 font-medium text-gold tracking-wide whitespace-nowrap">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map(row => (
                    <tr
                      key={row.lineNum}
                      className={`border-b border-ink/5 ${row.error ? 'bg-danger-bg/50' : 'hover:bg-gold/3'}`}
                    >
                      <td className="px-3 py-2 text-ink-secondary">{row.lineNum}</td>
                      <td className="px-3 py-2 font-medium text-ink">{row.castName}</td>
                      <td className="px-3 py-2 text-ink">{row.date}</td>
                      <td className="px-3 py-2 text-right text-ink">{row.hours}</td>
                      <td className="px-3 py-2 text-right text-ink">{row.honShimei}</td>
                      <td className="px-3 py-2 text-right text-ink">{row.banaiShimei}</td>
                      <td className="px-3 py-2 text-right text-ink">{row.douhan}</td>
                      <td className="px-3 py-2 text-right text-ink">{row.drinks}</td>
                      <td className="px-3 py-2 text-right text-ink">{row.bottles}</td>
                      <td className="px-3 py-2 text-right text-ink">{row.extensions}</td>
                      <td className="px-3 py-2 text-right text-ink">¥{row.nominatedSales.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-ink">¥{row.freeSales.toLocaleString()}</td>
                      <td className="px-3 py-2 text-center">{row.isLate ? '●' : '-'}</td>
                      <td className="px-3 py-2 text-center">{row.isAbsent ? '●' : '-'}</td>
                      <td className="px-3 py-2 text-right text-ink">{row.advancePay > 0 ? `¥${row.advancePay.toLocaleString()}` : '-'}</td>
                      <td className="px-3 py-2">
                        {row.error ? (
                          <span className="text-danger text-xs">エラー</span>
                        ) : (
                          <span className="text-success text-xs">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Import action */}
          <div className="bg-surface-card rounded-2xl shadow-card p-5 flex items-center justify-between">
            <div className="text-sm text-ink-secondary">
              有効な <span className="font-bold text-ink">{validCount}件</span> のレコードをインポートします。
              {errorCount > 0 && (
                <span className="text-danger ml-2">（{errorCount}件はスキップ）</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              {importedCount !== null && (
                <div className="bg-success-bg text-success text-sm px-4 py-2 rounded-xl font-medium">
                  {importedCount}件のインポートが完了しました
                </div>
              )}
              {!storeId && (
                <span className="text-sm text-danger">店舗を選択してください</span>
              )}
              <button
                onClick={handleImport}
                disabled={validCount === 0 || importing || !storeId}
                className="px-6 py-2 rounded-xl text-sm font-bold bg-brand-gradient text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {importing ? '取込中...' : '取込実行'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ===== Cast roster import section ===== */}
      <div className="rule-gold" />

      <div className="bg-surface-card rounded-2xl shadow-card p-5 space-y-4">
        <h2 className="font-mincho font-bold text-ink">キャスト名簿テンプレ（CSV）取込</h2>
        <p className="text-sm text-ink-secondary">
          店に配布するキャスト名簿テンプレCSVを読み込み、アクティブ店舗のキャスト（
          <code className="bg-ink/5 rounded px-1">casts</code>
          ）を登録・更新します。<br />
          同一店舗・同一源氏名が既存の場合はランク・入店日を上書き（冪等）。
          <br />
          <span className="text-gold font-medium">時給は設定画面（給与マスタ）で管理します。</span>
          ここではプレビューのみで保存されません。
        </p>

        {/* Template format display */}
        <div className="bg-ink/3 rounded-xl p-3 text-xs font-mono text-ink-secondary space-y-1">
          <p className="font-bold text-ink text-xs mb-1">テンプレ列（店に配布するフォーマット）</p>
          <p>{CAST_ROSTER_HEADERS.join(',')}</p>
          <p className="text-ink/50">例: SAKURA,A,2025-04-01,3000</p>
        </div>

        {/* Download template button */}
        <button
          onClick={handleDownloadRosterTemplate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-gold/40 text-gold hover:bg-gold/5 transition-colors"
        >
          テンプレCSVダウンロード
        </button>

        {/* File input */}
        <div
          onClick={() => rosterFileInputRef.current?.click()}
          className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors border-ink/15 hover:border-gold/50 hover:bg-gold/3"
        >
          <p className="text-ink-secondary text-sm">
            キャスト名簿CSVをクリックして選択
          </p>
          {rosterFileName && (
            <p className="mt-2 text-sm font-medium text-gold">{rosterFileName}</p>
          )}
          <input
            ref={rosterFileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleRosterFileInput}
          />
        </div>

        {/* Preview table */}
        {rosterRows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-ink/10">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink/5 bg-ink/2">
                  <th className="text-left px-3 py-2 font-medium text-gold whitespace-nowrap">源氏名</th>
                  <th className="text-left px-3 py-2 font-medium text-gold whitespace-nowrap">ランク</th>
                  <th className="text-left px-3 py-2 font-medium text-gold whitespace-nowrap">入店日</th>
                  <th className="text-right px-3 py-2 font-medium text-gold whitespace-nowrap">時給（表示のみ）</th>
                </tr>
              </thead>
              <tbody>
                {rosterRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-ink/5 hover:bg-gold/3">
                    <td className="px-3 py-2 font-medium text-ink">{row.sourceName}</td>
                    <td className="px-3 py-2 text-ink">{row.rank}</td>
                    <td className="px-3 py-2 text-ink">{row.joinDate}</td>
                    <td className="px-3 py-2 text-right text-ink-secondary">¥{row.hourlyRate.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Import action */}
        {rosterRows.length > 0 && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-ink-secondary">
              <span className="font-bold text-ink">{rosterRows.length}件</span> をアクティブ店舗に取込（source_name冪等）
            </p>
            <div className="flex items-center gap-4">
              {rosterResult && (
                <div className={`text-sm px-4 py-2 rounded-xl font-medium ${rosterResult.errors.length === 0 ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'}`}>
                  {rosterResult.success}件完了
                  {rosterResult.errors.length > 0 && `・${rosterResult.errors.length}件エラー`}
                </div>
              )}
              {!storeId && (
                <span className="text-sm text-danger">アクティブ店舗を選択してください</span>
              )}
              <button
                onClick={handleRosterImport}
                disabled={rosterRows.length === 0 || rosterImporting || !storeId}
                className="px-6 py-2 rounded-xl text-sm font-bold bg-brand-gradient text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {rosterImporting ? '登録中...' : '取込実行'}
              </button>
            </div>
          </div>
        )}

        {/* Error detail */}
        {rosterResult && rosterResult.errors.length > 0 && (
          <div className="bg-danger-bg rounded-xl p-4 space-y-1">
            <p className="text-sm font-bold text-danger">エラー詳細</p>
            {rosterResult.errors.map((e, i) => (
              <p key={i} className="text-xs text-danger">{e}</p>
            ))}
          </div>
        )}
      </div>

      {/* ===== Dシステム取込セクション ===== */}
      <div className="rule-gold" />

      <div className="bg-surface-card rounded-2xl shadow-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-mincho font-bold text-ink">Dシステム取込（Excel/CSV）</h2>
            <p className="text-sm text-ink-secondary mt-1">
              会計POS「Dシステム」が出力するExcel/CSVを読み込み、列を対応付けてキャスト毎の日次売上を取込みます。
            </p>
          </div>
        </div>

        {/* ファイル選択 */}
        <div
          onClick={() => dsFileInputRef.current?.click()}
          className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors border-ink/15 hover:border-gold/50 hover:bg-gold/3"
        >
          <p className="text-ink-secondary text-sm">
            Excel（.xlsx）またはCSV（.csv）をクリックして選択
          </p>
          {dsFileName && (
            <p className="mt-2 text-sm font-medium text-gold">{dsFileName}</p>
          )}
          <input
            ref={dsFileInputRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={handleDsFileInput}
          />
        </div>

        {/* シート選択 */}
        {dsSheetNames.length > 1 && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-ink flex-shrink-0">シート選択</label>
            <select
              value={dsActiveSheet}
              onChange={e => handleDsSheetChange(e.target.value)}
              className={`${inputClass} text-sm`}
            >
              {dsSheetNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        )}

        {/* 列マッピング UI */}
        {dsHeaders.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">
              列マッピング — 検出したヘッダ（{dsHeaders.length}列）から各項目に対応する列を選択してください
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DS_FIELD_KEYS.map(field => (
                <div key={field} className="flex items-center gap-2">
                  <label className={`text-xs w-36 flex-shrink-0 ${field === 'date' || field === 'sourceName' ? 'font-bold text-ink' : 'text-ink-secondary'}`}>
                    {DS_FIELD_LABELS[field]}
                  </label>
                  <select
                    value={dsMapping[field] ?? ''}
                    onChange={e => handleDsMappingChange(field, e.target.value)}
                    className={`flex-1 ${inputClass} text-xs`}
                  >
                    <option value="">（未対応）</option>
                    {dsHeaders.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <button
              onClick={handleDsPreview}
              disabled={!dsMapping.date || !dsMapping.sourceName}
              className="px-5 py-2 rounded-xl text-sm font-bold border border-gold/40 text-gold hover:bg-gold/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              プレビュー
            </button>
            {(!dsMapping.date || !dsMapping.sourceName) && (
              <p className="text-xs text-danger">日付と源氏名の列を選択してください</p>
            )}
          </div>
        )}

        {/* エラー表示 */}
        {dsErrors.length > 0 && (
          <div className="bg-danger-bg rounded-xl p-4 space-y-1">
            <p className="text-sm font-bold text-danger">マッピングエラー（{dsErrors.length}件）</p>
            {dsErrors.slice(0, 10).map((e, i) => (
              <p key={i} className="text-xs text-danger">{e}</p>
            ))}
            {dsErrors.length > 10 && (
              <p className="text-xs text-danger">…他 {dsErrors.length - 10} 件</p>
            )}
          </div>
        )}

        {/* プレビューテーブル */}
        {dsShowPreview && dsMapped.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-ink-secondary">
              変換結果: <span className="font-bold text-ink">{dsMapped.length}件</span>（先頭5件表示）
              {dsErrors.length > 0 && <span className="text-danger ml-2">スキップ {dsErrors.length}件</span>}
            </p>
            <div className="overflow-x-auto rounded-xl border border-ink/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-ink/5 bg-ink/2">
                    {['日付', '源氏名', '本指名売上', 'フリー売上', '本指名', '場内', '同伴', 'ドリンク', 'ボトル', '延長'].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-gold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dsMapped.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b border-ink/5 hover:bg-gold/3">
                      <td className="px-3 py-2 text-ink">{row.date}</td>
                      <td className="px-3 py-2 font-medium text-ink">{row.sourceName}</td>
                      <td className="px-3 py-2 text-right text-ink">¥{row.nominatedSales.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-ink">¥{row.freeSales.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-ink">{row.honShimei}</td>
                      <td className="px-3 py-2 text-right text-ink">{row.banaiShimei}</td>
                      <td className="px-3 py-2 text-right text-ink">{row.douhan}</td>
                      <td className="px-3 py-2 text-right text-ink">{row.drinks}</td>
                      <td className="px-3 py-2 text-right text-ink">{row.bottles}</td>
                      <td className="px-3 py-2 text-right text-ink">{row.extensions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 取込実行 */}
        {dsShowPreview && dsMapped.length > 0 && (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-ink-secondary">
              <span className="font-bold text-ink">{dsMapped.length}件</span> をアクティブ店舗の日次実績に取込みます（売上・本数フィールドのみ更新）
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              {dsResult && (
                <div className={`text-sm px-4 py-2 rounded-xl font-medium ${dsResult.errors.length === 0 ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'}`}>
                  {dsResult.ok}件完了
                  {dsResult.unmatched.length > 0 && `・未突合 ${dsResult.unmatched.length}名`}
                  {dsResult.errors.length > 0 && `・エラー ${dsResult.errors.length}件`}
                </div>
              )}
              {!storeId && (
                <span className="text-sm text-danger">アクティブ店舗を選択してください</span>
              )}
              <button
                onClick={handleDsImport}
                disabled={dsMapped.length === 0 || dsImporting || !storeId}
                className="px-6 py-2 rounded-xl text-sm font-bold bg-brand-gradient text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {dsImporting ? '取込中...' : '取込実行'}
              </button>
            </div>
          </div>
        )}

        {/* 結果詳細（未一致・エラー） */}
        {dsResult && (dsResult.unmatched.length > 0 || dsResult.errors.length > 0) && (
          <div className="space-y-2">
            {dsResult.unmatched.length > 0 && (
              <div className="bg-ink/3 rounded-xl p-4 space-y-1">
                <p className="text-sm font-bold text-ink-secondary">未突合の源氏名（{dsResult.unmatched.length}名）— キャスト名簿を確認してください</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {dsResult.unmatched.map((name, i) => (
                    <span key={i} className="text-xs bg-ink/10 rounded-lg px-2 py-1 text-ink">{name}</span>
                  ))}
                </div>
              </div>
            )}
            {dsResult.errors.length > 0 && (
              <div className="bg-danger-bg rounded-xl p-4 space-y-1">
                <p className="text-sm font-bold text-danger">エラー詳細</p>
                {dsResult.errors.map((e, i) => (
                  <p key={i} className="text-xs text-danger">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Column mapping reference */}
      <div className="bg-surface-card rounded-2xl shadow-card p-5 space-y-3">
        <h2 className="font-mincho font-bold text-ink">カラム対応表（固定）</h2>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="border-b border-ink/5">
                <th className="text-left px-3 py-2 text-gold">列番号</th>
                <th className="text-left px-3 py-2 text-gold">項目名</th>
                <th className="text-left px-3 py-2 text-gold">形式・備考</th>
              </tr>
            </thead>
            <tbody className="text-ink-secondary">
              {[
                ['A（1列目）', 'キャスト名', 'SAKURA / RIN / YUI / HANA / MIKU'],
                ['B（2列目）', '日付', 'YYYY-MM-DD（例: 2026-06-01）'],
                ['C（3列目）', '勤務時間', '数値（例: 7）'],
                ['D（4列目）', '本指名', '数値'],
                ['E（5列目）', '場内指名', '数値'],
                ['F（6列目）', '同伴', '数値'],
                ['G（7列目）', 'ドリンク', '数値'],
                ['H（8列目）', 'ボトル', '数値'],
                ['I（9列目）', '延長', '数値'],
                ['J（10列目）', '本指名売上', '数値（円）'],
                ['K（11列目）', 'フリー売上', '数値（円）'],
                ['L（12列目）', '遅刻', '0=なし / 1=あり'],
                ['M（13列目）', '欠勤', '0=なし / 1=あり'],
                ['N（14列目）', '前借り', '数値（円）'],
              ].map(([col, name, note]) => (
                <tr key={col} className="border-b border-ink/5">
                  <td className={`px-3 py-1.5 ${inputClass} !py-1 !border-0`}>{col}</td>
                  <td className="px-3 py-1.5 font-medium text-ink">{name}</td>
                  <td className="px-3 py-1.5">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
