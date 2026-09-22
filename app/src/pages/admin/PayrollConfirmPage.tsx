import React, { useState } from 'react';
import { useSettings } from '../../store/SettingsContext';
import { usePerformance } from '../../store/PerformanceContext';
import { useAuth } from '../../store/AuthContext';
import { usePayrollSnapshot, type PayrollSnapshot } from '../../store/PayrollSnapshotContext';
import { calculatePayroll, type PayrollResult } from '../../lib/payroll';
import { casts } from '../../data/seed';
import { SHOW_SALES_BACK, SHOW_COMMISSION } from '../../config/featureFlags';

function makeSnapshot(
  castId: string,
  castName: string,
  storeId: string,
  month: string,
  result: PayrollResult,
  settingsSnapshot: string,
  confirmedBy: string
): PayrollSnapshot {
  return {
    id: `snap_${castId}_${month}_${Date.now()}`,
    castId,
    castName,
    storeId,
    month,
    confirmedAt: new Date().toISOString(),
    confirmedBy,
    basePay: result.basePay,
    basePayDetail: result.basePayDetail,
    commissionItems: result.commissionItems,
    commissionTotal: result.commissionTotal,
    backItems: result.backItems,
    backTotal: result.backTotal,
    grossPay: result.grossPay,
    deductionItems: result.deductionItems,
    deductionTotal: result.deductionTotal,
    netPay: result.netPay,
    settingsSnapshot,
  };
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function PayrollBreakdown({ snap }: { snap: PayrollSnapshot }) {
  return (
    <div className="space-y-3 mt-3">
      {/* Base Pay */}
      <BreakSection title="基本給" total={snap.basePay}>
        <BreakRow label="時給 × 勤務時間" detail={snap.basePayDetail} amount={snap.basePay} />
      </BreakSection>

      {/* Commission */}
      {SHOW_COMMISSION && snap.commissionItems.length > 0 && (
        <BreakSection title="歩合" total={snap.commissionTotal}>
          {snap.commissionItems.map((item, i) => (
            <BreakRow key={i} label={item.label} detail={item.detail} amount={item.amount} />
          ))}
        </BreakSection>
      )}

      {/* Backs — SHOW_SALES_BACK=true のときのみ表示（featureFlags.ts で切替） */}
      {SHOW_SALES_BACK && snap.backItems.length > 0 && (
        <BreakSection title="各種バック" total={snap.backTotal}>
          {snap.backItems.map((item, i) => (
            <BreakRow key={i} label={item.label} detail={item.detail} amount={item.amount} />
          ))}
        </BreakSection>
      )}

      {/* Gross */}
      <div className="flex justify-between items-center px-3 py-2 bg-ink/5 rounded-lg">
        <span className="font-mincho font-bold text-sm text-ink">総支給額</span>
        <span className="font-bold text-ink">¥{snap.grossPay.toLocaleString()}</span>
      </div>

      {/* Deductions */}
      {snap.deductionItems.length > 0 && (
        <BreakSection title="控除" total={snap.deductionTotal} negative>
          {snap.deductionItems.map((item, i) => (
            <BreakRow key={i} label={item.label} amount={item.amount} negative />
          ))}
        </BreakSection>
      )}

      {/* Net Pay */}
      <div className="flex justify-between items-center px-3 py-2 bg-brand/10 rounded-lg border border-brand/20">
        <span className="font-mincho font-bold text-sm text-brand">差引支給額</span>
        <span className="font-bold text-brand">¥{snap.netPay.toLocaleString()}</span>
      </div>
    </div>
  );
}

function BreakSection({ title, total, negative, children }: {
  title: string; total: number; negative?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="border border-ink/10 rounded-lg p-3 space-y-1">
      <div className="flex justify-between items-center pb-1 mb-1">
        <span className="text-xs font-bold text-ink-secondary">{title}</span>
        <span className={`text-sm font-bold ${negative ? 'text-danger' : 'text-ink'}`}>
          {negative ? '-' : ''}¥{total.toLocaleString()}
        </span>
      </div>
      <div className="rule-gold" />
      {children}
    </div>
  );
}

function BreakRow({ label, detail, amount, negative }: {
  label: string; detail?: string; amount: number; negative?: boolean;
}) {
  return (
    <div className="flex justify-between items-start text-xs py-0.5">
      <div>
        <p className="text-ink-secondary">{label}</p>
        {detail && <p className="text-ink-tertiary">{detail}</p>}
      </div>
      <span className={negative ? 'text-danger' : 'text-ink'}>
        {negative ? '-' : ''}¥{amount.toLocaleString()}
      </span>
    </div>
  );
}

export function PayrollConfirmPage() {
  const { settings } = useSettings();
  const { getMonthlyPerformances } = usePerformance();
  const { user } = useAuth();
  const { confirmPayroll, reconfirmPayroll, getSnapshot, isConfirmed } = usePayrollSnapshot();

  const [selectedMonth, setSelectedMonth] = useState('2026-06');
  const [expandedCastId, setExpandedCastId] = useState<string | null>(null);

  const performances = getMonthlyPerformances(selectedMonth);
  const settingsJson = JSON.stringify(settings);
  const adminName = user?.name ?? '管理者';

  // Build rows: cast + calculated payroll + snapshot
  const rows = casts
    .filter(c => c.status === 'active')
    .map(cast => {
      const perf = performances.find(p => p.castId === cast.id);
      const calculated = perf ? calculatePayroll(perf, settings) : null;
      const snapshot = getSnapshot(cast.id, selectedMonth);
      const confirmed = isConfirmed(cast.id, selectedMonth);

      // Detect diff between confirmed snapshot and current calculation
      let hasDiff = false;
      if (confirmed && snapshot && calculated) {
        hasDiff = snapshot.netPay !== calculated.netPay;
      }

      return { cast, calculated, snapshot, confirmed, hasDiff };
    });

  const handleConfirmSingle = async (castId: string, castName: string, storeId: string, result: PayrollResult) => {
    const snap = makeSnapshot(castId, castName, storeId, selectedMonth, result, settingsJson, adminName);
    try {
      await confirmPayroll(snap);
    } catch (e) {
      // 書込み失敗は UI に「確定済」と見せない。ユーザーへ明示する。
      alert(e instanceof Error ? e.message : '給与確定の保存に失敗しました');
    }
  };

  const handleReconfirmSingle = async (castId: string, castName: string, storeId: string, result: PayrollResult, existingId: string) => {
    const snap = makeSnapshot(castId, castName, storeId, selectedMonth, result, settingsJson, adminName);
    try {
      await reconfirmPayroll(existingId, snap);
    } catch (e) {
      alert(e instanceof Error ? e.message : '給与再確定の保存に失敗しました');
    }
  };

  const handleBulkConfirm = async () => {
    const failed: string[] = [];
    for (const row of rows) {
      if (!row.confirmed && row.calculated) {
        const snap = makeSnapshot(
          row.cast.id,
          row.cast.name,
          row.cast.storeId,
          selectedMonth,
          row.calculated,
          settingsJson,
          adminName
        );
        try {
          await confirmPayroll(snap);
        } catch {
          failed.push(row.cast.name);
        }
      }
    }
    if (failed.length > 0) {
      alert(`給与確定の保存に失敗しました: ${failed.join('、')}`);
    }
  };

  const confirmedCount = rows.filter(r => r.confirmed).length;
  const unconfirmedCount = rows.length - confirmedCount;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-mincho text-xl md:text-2xl font-bold text-ink">給与確定</h1>
          <p className="text-sm text-ink-tertiary mt-1">月次給与を確定するとスナップショットが保存され、以後の設定変更に影響されません。</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="border border-ink/20 rounded-lg px-3 py-2 text-sm bg-surface-card text-ink focus:outline-none focus:ring-2 focus:ring-gold/50"
          />
          {unconfirmedCount > 0 && (
            <button
              onClick={handleBulkConfirm}
              className="bg-brand-gradient text-white px-4 py-2 rounded-xl text-sm font-bold shadow-soft hover:opacity-90 transition-opacity"
            >
              一括確定（{unconfirmedCount}名）
            </button>
          )}
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex gap-3">
        <span className="bg-success-bg text-success text-xs font-bold px-3 py-1 rounded-full">
          確定済 {confirmedCount}名
        </span>
        <span className="bg-warn-bg text-warn text-xs font-bold px-3 py-1 rounded-full">
          未確定 {unconfirmedCount}名
        </span>
      </div>

      {/* Main table */}
      <div className="bg-surface-card rounded-2xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-ink/5">
          <h2 className="font-mincho font-bold text-ink">
            {selectedMonth.replace('-', '年')}月 キャスト給与一覧
          </h2>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/5 bg-surface-base">
              <th className="text-left px-5 py-3 font-medium text-gold text-xs tracking-wide">キャスト</th>
              <th className="text-right px-5 py-3 font-medium text-gold text-xs tracking-wide">現在の計算値</th>
              <th className="text-right px-5 py-3 font-medium text-gold text-xs tracking-wide">確定額</th>
              <th className="text-center px-5 py-3 font-medium text-gold text-xs tracking-wide">ステータス</th>
              <th className="text-center px-5 py-3 font-medium text-gold text-xs tracking-wide">確定日時</th>
              <th className="text-center px-5 py-3 font-medium text-gold text-xs tracking-wide">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ cast, calculated, snapshot, confirmed, hasDiff }) => (
              <React.Fragment key={cast.id}>
                <tr className="border-t border-ink/5 hover:bg-brand/3 transition-colors">
                  {/* Cast name */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-brand-gradient text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {cast.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-ink">{cast.name}</p>
                        <p className="text-xs text-ink-tertiary">{cast.rank ? `ランク ${cast.rank}` : ''}</p>
                      </div>
                    </div>
                  </td>

                  {/* Current calc */}
                  <td className="px-5 py-4 text-right">
                    {calculated ? (
                      <span className="font-bold text-ink">¥{calculated.netPay.toLocaleString()}</span>
                    ) : (
                      <span className="text-ink-tertiary">データなし</span>
                    )}
                  </td>

                  {/* Confirmed amount */}
                  <td className="px-5 py-4 text-right">
                    {confirmed && snapshot ? (
                      <div>
                        <span className="font-bold text-ink">¥{snapshot.netPay.toLocaleString()}</span>
                        {hasDiff && (
                          <div className="text-xs text-warn mt-0.5">
                            差額: {(calculated!.netPay - snapshot.netPay) >= 0 ? '+' : ''}
                            ¥{(calculated!.netPay - snapshot.netPay).toLocaleString()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-ink-tertiary">—</span>
                    )}
                  </td>

                  {/* Status badge */}
                  <td className="px-5 py-4 text-center">
                    {confirmed ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="bg-success-bg text-success text-xs font-bold px-2 py-1 rounded-full">
                          確定済
                        </span>
                        {hasDiff && (
                          <span className="bg-warn-bg text-warn text-xs font-bold px-2 py-1 rounded-full">
                            差異あり
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="bg-warn-bg text-warn text-xs font-bold px-2 py-1 rounded-full">
                        未確定
                      </span>
                    )}
                  </td>

                  {/* Confirmed at */}
                  <td className="px-5 py-4 text-center text-xs text-ink-tertiary">
                    {snapshot ? formatDate(snapshot.confirmedAt) : '—'}
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {!confirmed && calculated && (
                        <button
                          onClick={() => handleConfirmSingle(cast.id, cast.name, cast.storeId, calculated)}
                          className="bg-brand-gradient text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:opacity-90 transition-opacity"
                        >
                          個別確定
                        </button>
                      )}
                      {confirmed && snapshot && calculated && hasDiff && (
                        <button
                          onClick={() => handleReconfirmSingle(cast.id, cast.name, cast.storeId, calculated, snapshot.id)}
                          className="bg-warn text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:opacity-90 transition-opacity"
                        >
                          再確定
                        </button>
                      )}
                      {confirmed && snapshot && (
                        <button
                          onClick={() => setExpandedCastId(expandedCastId === cast.id ? null : cast.id)}
                          className="border border-ink/20 text-ink-secondary px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-ink/5 transition-colors"
                        >
                          {expandedCastId === cast.id ? '閉じる' : '明細'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Expanded breakdown */}
                {expandedCastId === cast.id && snapshot && (
                  <tr className="border-t border-ink/5 bg-surface-base">
                    <td colSpan={6} className="px-8 py-4">
                      <div className="max-w-2xl">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-mincho font-bold text-sm text-ink">
                            {cast.name} — 確定済み給与明細
                          </h3>
                          <div className="text-xs text-ink-tertiary">
                            確定者: {snapshot.confirmedBy} / {formatDate(snapshot.confirmedAt)}
                          </div>
                        </div>
                        <div className="rule-gold mb-3" />
                        <PayrollBreakdown snap={snapshot} />

                        {hasDiff && calculated && (
                          <div className="mt-4 p-3 bg-warn-bg border border-warn/30 rounded-lg">
                            <p className="text-xs font-bold text-warn mb-1">設定変更による差異</p>
                            <div className="flex gap-6 text-xs text-ink-secondary">
                              <span>確定額: <strong>¥{snapshot.netPay.toLocaleString()}</strong></span>
                              <span>現在の計算値: <strong>¥{calculated.netPay.toLocaleString()}</strong></span>
                              <span>差額: <strong className={calculated.netPay > snapshot.netPay ? 'text-success' : 'text-danger'}>
                                {calculated.netPay >= snapshot.netPay ? '+' : ''}¥{(calculated.netPay - snapshot.netPay).toLocaleString()}
                              </strong></span>
                            </div>
                            <p className="text-xs text-warn/70 mt-2">
                              「再確定」ボタンで現在の計算値に更新できます。
                            </p>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="py-12 text-center text-ink-tertiary text-sm">
            対象月のキャストデータがありません
          </div>
        )}
        </div>
      </div>

      {/* Confirmed snapshots summary */}
      {confirmedCount > 0 && (
        <div className="bg-surface-card rounded-2xl shadow-card p-5 space-y-3">
          <h2 className="font-mincho font-bold text-ink">確定済みスナップショット</h2>
          <div className="rule-gold" />
          <div className="space-y-2">
            {rows
              .filter(r => r.confirmed && r.snapshot)
              .map(({ cast, snapshot }) => (
                <div key={cast.id} className="flex items-center justify-between py-2 border-b border-ink/5 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand-gradient text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {cast.name.charAt(0)}
                    </div>
                    <span className="text-sm text-ink font-medium">{cast.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-ink-tertiary">
                    <span>確定日: {formatDate(snapshot!.confirmedAt)}</span>
                    <span className="font-bold text-ink text-sm">¥{snapshot!.netPay.toLocaleString()}</span>
                  </div>
                </div>
              ))}
          </div>
          <div className="flex justify-between items-center pt-2">
            <span className="font-mincho text-sm font-bold text-ink">確定済み合計</span>
            <span className="font-bold text-ink text-lg">
              ¥{rows
                .filter(r => r.confirmed && r.snapshot)
                .reduce((sum, r) => sum + (r.snapshot?.netPay ?? 0), 0)
                .toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
