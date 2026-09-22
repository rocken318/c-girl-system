import type { PayrollResult } from './payroll';
import { BRAND_COLOR } from '../config/brand';

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  // Wrap in quotes if the cell contains a comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(escapeCsvCell).join(',');
}

/**
 * Generates a UTF-8 CSV string for one or more PayrollResults.
 * Headers: キャスト名,月,基本給,歩合,バック,総支給,控除,差引支給額
 * Followed by per-item detail rows for commissions, backs, and deductions.
 */
export function payrollToCsv(
  results: PayrollResult[],
  storeName: string
): string {
  const lines: string[] = [];

  // File-level header
  lines.push(csvRow([`店舗: ${storeName}`]));
  lines.push('');

  // Column headers
  lines.push(
    csvRow(['キャスト名', '月', '基本給', '歩合', 'バック', '総支給', '控除', '差引支給額'])
  );

  for (const r of results) {
    // Summary row — castId is used as the name placeholder; callers should
    // pass a pre-enriched array or use payrollBulkExport which has castName.
    lines.push(
      csvRow([
        r.castId,
        r.month,
        r.basePay,
        r.commissionTotal,
        r.backTotal,
        r.grossPay,
        r.deductionTotal,
        r.netPay,
      ])
    );

    // Detail rows: commission
    for (const item of r.commissionItems) {
      lines.push(
        csvRow(['', '', '', `  ${item.label}`, '', item.amount, '', ''])
      );
    }
    // Detail rows: back
    for (const item of r.backItems) {
      lines.push(
        csvRow(['', '', '', '', `  ${item.label}: ${item.amount}`, '', '', ''])
      );
    }
    // Detail rows: deductions
    for (const item of r.deductionItems) {
      lines.push(
        csvRow(['', '', '', '', '', '', `  ${item.label}: ${item.amount}`, ''])
      );
    }

    lines.push('');
  }

  // BOM so Excel opens the file correctly on Windows
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * Enriched version — takes results that already carry castName so the CSV
 * is human-readable.
 */
export function payrollBulkToCsv(
  results: { result: PayrollResult; castName: string }[],
  storeName: string
): string {
  const lines: string[] = [];

  lines.push(csvRow([`店舗: ${storeName}`]));
  lines.push('');
  lines.push(
    csvRow(['キャスト名', '月', '基本給', '歩合', 'バック', '総支給', '控除', '差引支給額'])
  );

  for (const { result: r, castName } of results) {
    lines.push(
      csvRow([
        castName,
        r.month,
        r.basePay,
        r.commissionTotal,
        r.backTotal,
        r.grossPay,
        r.deductionTotal,
        r.netPay,
      ])
    );

    for (const item of r.commissionItems) {
      lines.push(
        csvRow(['', '', '', `  ${item.label}`, '', item.amount, '', ''])
      );
    }
    for (const item of r.backItems) {
      lines.push(
        csvRow(['', '', '', '', `  ${item.label}: ${item.amount}`, '', '', ''])
      );
    }
    for (const item of r.deductionItems) {
      lines.push(
        csvRow(['', '', '', '', '', '', `  ${item.label}: ${item.amount}`, ''])
      );
    }

    lines.push('');
  }

  return '\uFEFF' + lines.join('\r\n');
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

/** Triggers a browser download for the given CSV string. */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Print HTML helpers
// ---------------------------------------------------------------------------

const BRAND = BRAND_COLOR;
const GOLD = '#c9a84c';

/** Shared <style> block for print layouts. */
function printStyles(): string {
  return `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&family=Noto+Sans+JP:wght@400;500&display=swap');

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        font-family: 'Noto Sans JP', sans-serif;
        font-size: 11pt;
        color: #1a1a2e;
        background: #fff;
      }

      .page {
        width: 210mm;
        min-height: 297mm;
        padding: 18mm 16mm;
        page-break-after: always;
      }

      .page:last-child { page-break-after: avoid; }

      /* Header */
      .doc-header {
        text-align: center;
        border-bottom: 2px solid ${BRAND};
        padding-bottom: 10px;
        margin-bottom: 16px;
      }

      .store-name {
        font-family: 'Noto Serif JP', serif;
        font-size: 13pt;
        color: ${BRAND};
        letter-spacing: 0.08em;
      }

      .doc-title {
        font-family: 'Noto Serif JP', serif;
        font-size: 18pt;
        font-weight: 700;
        color: #1a1a2e;
        margin: 4px 0;
      }

      .doc-meta {
        display: flex;
        justify-content: space-between;
        font-size: 10pt;
        color: #555;
        margin-bottom: 18px;
      }

      /* Sections */
      .section {
        margin-bottom: 12px;
        border: 1px solid #e8e0d0;
        border-radius: 6px;
        overflow: hidden;
      }

      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #faf8f5;
        padding: 6px 12px;
        border-bottom: 1px solid ${GOLD}55;
      }

      .section-title {
        font-family: 'Noto Serif JP', serif;
        font-weight: 700;
        font-size: 11pt;
        color: #1a1a2e;
      }

      .section-total {
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        font-size: 11pt;
      }

      .section-total.negative { color: ${BRAND}; }

      .item-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 5px 12px;
        border-bottom: 1px solid #f0ebe2;
        font-size: 10pt;
      }

      .item-row:last-child { border-bottom: none; }

      .item-label { color: #333; }
      .item-detail { font-size: 9pt; color: #777; }

      .item-amount {
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .item-amount.negative { color: ${BRAND}; }

      /* Hero box */
      .hero {
        background: linear-gradient(135deg, ${BRAND} 0%, #8b1a2a 100%);
        color: #fff;
        text-align: center;
        border-radius: 8px;
        padding: 14px 12px;
        margin-bottom: 16px;
      }

      .hero-label {
        font-size: 10pt;
        opacity: 0.8;
        margin-bottom: 4px;
      }

      .hero-amount {
        font-family: 'Noto Serif JP', serif;
        font-size: 26pt;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.04em;
      }

      /* Summary table */
      .summary-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 16px;
        font-size: 10pt;
      }

      .summary-table td {
        padding: 5px 12px;
        border: 1px solid #e8e0d0;
      }

      .summary-table .label-cell {
        background: #faf8f5;
        font-family: 'Noto Serif JP', serif;
        width: 50%;
      }

      .summary-table .value-cell {
        font-variant-numeric: tabular-nums;
        text-align: right;
      }

      /* Footer */
      .doc-footer {
        margin-top: 24px;
        text-align: center;
        font-size: 9pt;
        color: #888;
        border-top: 1px solid #e8e0d0;
        padding-top: 10px;
      }

      @media print {
        @page { size: A4 portrait; margin: 0; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  `;
}

/** Renders the inner body for a single cast's payslip. */
function payslipBody(
  result: PayrollResult,
  castName: string,
  storeName: string,
  month: string
): string {
  const fmt = (n: number) => `¥${n.toLocaleString('ja-JP')}`;

  const commissionRows = result.commissionItems
    .map(
      item => `
      <div class="item-row">
        <div>
          <div class="item-label">${item.label}</div>
          ${item.detail ? `<div class="item-detail">${item.detail}</div>` : ''}
        </div>
        <div class="item-amount">${fmt(item.amount)}</div>
      </div>`
    )
    .join('');

  const backRows = result.backItems
    .map(
      item => `
      <div class="item-row">
        <div>
          <div class="item-label">${item.label}</div>
          ${item.detail ? `<div class="item-detail">${item.detail}</div>` : ''}
        </div>
        <div class="item-amount">${fmt(item.amount)}</div>
      </div>`
    )
    .join('');

  const deductionRows = result.deductionItems
    .map(
      item => `
      <div class="item-row">
        <div class="item-label">${item.label}</div>
        <div class="item-amount negative">-${fmt(item.amount)}</div>
      </div>`
    )
    .join('');

  return `
    <div class="doc-header">
      <div class="store-name">${storeName}</div>
      <div class="doc-title">給与明細書</div>
    </div>

    <div class="doc-meta">
      <span>キャスト：${castName}</span>
      <span>${month}</span>
    </div>

    <!-- Net pay hero -->
    <div class="hero">
      <div class="hero-label">差引支給額</div>
      <div class="hero-amount">${fmt(result.netPay)}</div>
    </div>

    <!-- Summary table -->
    <table class="summary-table">
      <tr>
        <td class="label-cell">基本給</td>
        <td class="value-cell">${fmt(result.basePay)}</td>
        <td class="label-cell">歩合合計</td>
        <td class="value-cell">${fmt(result.commissionTotal)}</td>
      </tr>
      <tr>
        <td class="label-cell">バック合計</td>
        <td class="value-cell">${fmt(result.backTotal)}</td>
        <td class="label-cell">総支給額</td>
        <td class="value-cell">${fmt(result.grossPay)}</td>
      </tr>
      <tr>
        <td class="label-cell">控除合計</td>
        <td class="value-cell" style="color:${BRAND}">-${fmt(result.deductionTotal)}</td>
        <td class="label-cell">差引支給額</td>
        <td class="value-cell" style="font-weight:700">${fmt(result.netPay)}</td>
      </tr>
    </table>

    <!-- Base pay -->
    <div class="section">
      <div class="section-header">
        <span class="section-title">基本給</span>
        <span class="section-total">${fmt(result.basePay)}</span>
      </div>
      <div class="item-row">
        <div>
          <div class="item-label">時給 × 勤務時間</div>
          <div class="item-detail">${result.basePayDetail}</div>
        </div>
        <div class="item-amount">${fmt(result.basePay)}</div>
      </div>
    </div>

    ${result.commissionItems.length > 0 ? `
    <div class="section">
      <div class="section-header">
        <span class="section-title">歩合</span>
        <span class="section-total">${fmt(result.commissionTotal)}</span>
      </div>
      ${commissionRows}
    </div>` : ''}

    ${result.backItems.length > 0 ? `
    <div class="section">
      <div class="section-header">
        <span class="section-title">各種バック</span>
        <span class="section-total">${fmt(result.backTotal)}</span>
      </div>
      ${backRows}
    </div>` : ''}

    ${result.deductionItems.length > 0 ? `
    <div class="section">
      <div class="section-header">
        <span class="section-title">控除</span>
        <span class="section-total negative">-${fmt(result.deductionTotal)}</span>
      </div>
      ${deductionRows}
    </div>` : ''}

    <div class="doc-footer">この明細は ${storeName} が発行しました</div>
  `;
}

/**
 * Returns a complete printable HTML document for a single cast payslip.
 * Call window.open() with this string, then window.print().
 */
export function payrollToPrintHtml(
  result: PayrollResult,
  castName: string,
  storeName: string,
  month: string
): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${storeName} 給与明細 ${castName} ${month}</title>
  ${printStyles()}
</head>
<body>
  <div class="page">
    ${payslipBody(result, castName, storeName, month)}
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 400);
    });
  </script>
</body>
</html>`;
}

/**
 * Returns a complete printable HTML document for all casts (one per page).
 */
export function payrollBulkPrintHtml(
  results: { result: PayrollResult; castName: string }[],
  storeName: string,
  month: string
): string {
  const pages = results
    .map(
      ({ result, castName }) =>
        `<div class="page">${payslipBody(result, castName, storeName, month)}</div>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${storeName} 給与明細一括 ${month}</title>
  ${printStyles()}
</head>
<body>
  ${pages}
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 400);
    });
  </script>
</body>
</html>`;
}

/** Opens a new window with the given HTML and triggers the print dialog. */
export function openPrintWindow(html: string): void {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
