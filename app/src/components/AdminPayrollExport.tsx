import type { PayrollResult } from '../lib/payroll';
import {
  payrollBulkPrintHtml,
  payrollBulkToCsv,
  openPrintWindow,
  downloadCsv,
} from '../lib/exportPayroll';

interface Props {
  results: { result: PayrollResult; castName: string }[];
  storeName: string;
  month: string;
}

/**
 * AdminPayrollExport
 *
 * Renders two action buttons for admin payroll pages:
 * - 一括PDF印刷  — opens a printable window with all casts (one per A4 page)
 * - CSV一括ダウンロード — downloads a single CSV file with all cast payrolls
 */
export function AdminPayrollExport({ results, storeName, month }: Props) {
  function handleBulkPrint() {
    if (results.length === 0) return;
    const html = payrollBulkPrintHtml(results, storeName, month);
    openPrintWindow(html);
  }

  function handleBulkCsv() {
    if (results.length === 0) return;
    const csv = payrollBulkToCsv(results, storeName);
    const safeMonth = month.replace(/[^\d-]/g, '');
    downloadCsv(csv, `給与明細一括_${safeMonth}.csv`);
  }

  return (
    <div className="flex gap-3 flex-wrap">
      <button
        onClick={handleBulkPrint}
        disabled={results.length === 0}
        className="glass rounded-xl px-4 py-2 text-sm text-ink-secondary hover:text-brand transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        一括PDF印刷
      </button>
      <button
        onClick={handleBulkCsv}
        disabled={results.length === 0}
        className="glass rounded-xl px-4 py-2 text-sm text-ink-secondary hover:text-brand transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        CSV一括ダウンロード
      </button>
    </div>
  );
}
