import React, { useState } from 'react';
import { useAuth } from '../../store/AuthContext';
import { usePayrollSnapshot, type PayrollSnapshot } from '../../store/PayrollSnapshotContext';
import { periodKey } from '../../lib/targets';

function formatMonth(ym: string) {
  const [y, m] = ym.split('-');
  return `${y}年${parseInt(m, 10)}月`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function PayrollBreakdown({ snap }: { snap: PayrollSnapshot }) {
  return (
    <div className="space-y-4 mt-4">
      {/* Base Pay */}
      <Section title="基本給" total={snap.basePay}>
        <Row label="時給 × 勤務時間" detail={snap.basePayDetail} amount={snap.basePay} />
      </Section>

      {/* Commission */}
      {snap.commissionItems.length > 0 && (
        <Section title="歩合" total={snap.commissionTotal}>
          {snap.commissionItems.map((item, i) => (
            <Row key={i} label={item.label} detail={item.detail} amount={item.amount} />
          ))}
        </Section>
      )}

      {/* Backs */}
      {snap.backItems.length > 0 && (
        <Section title="各種バック" total={snap.backTotal}>
          {snap.backItems.map((item, i) => (
            <Row key={i} label={item.label} detail={item.detail} amount={item.amount} />
          ))}
        </Section>
      )}

      {/* Gross */}
      <div className="glass rounded-xl p-4 shadow-card border-gold">
        <div className="flex justify-between items-center">
          <span className="font-mincho font-bold text-ink">総支給額</span>
          <span className="text-money-lg text-ink">¥{snap.grossPay.toLocaleString()}</span>
        </div>
      </div>

      {/* Deductions */}
      {snap.deductionItems.length > 0 && (
        <Section title="控除" total={snap.deductionTotal} negative>
          {snap.deductionItems.map((item, i) => (
            <Row key={i} label={item.label} amount={item.amount} negative />
          ))}
        </Section>
      )}

      {/* Confirmed info */}
      <div className="text-xs text-ink-tertiary text-center pt-1">
        確定日: {formatDate(snap.confirmedAt)}
      </div>
    </div>
  );
}

function Section({ title, total, negative, children }: {
  title: string; total: number; negative?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-xl p-4 shadow-soft space-y-2">
      <div className="flex justify-between items-center pb-2 mb-2">
        <span className="font-mincho font-bold text-ink">{title}</span>
        <span className={`font-bold ${negative ? 'text-danger' : 'text-ink'}`}>
          {negative ? '-' : ''}¥{total.toLocaleString()}
        </span>
      </div>
      <div className="rule-gold" />
      {children}
    </div>
  );
}

function Row({ label, detail, amount, negative }: {
  label: string; detail?: string; amount: number; negative?: boolean;
}) {
  return (
    <div className="flex justify-between items-start text-sm py-1">
      <div>
        <p className="text-ink-secondary">{label}</p>
        {detail && <p className="text-xs text-ink-tertiary">{detail}</p>}
      </div>
      <span className={negative ? 'text-danger' : 'text-ink'}>
        {negative ? '-' : ''}¥{amount.toLocaleString()}
      </span>
    </div>
  );
}

export function PayrollHistoryPage() {
  const { user } = useAuth();
  const { snapshots } = usePayrollSnapshot();
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const castId = user?.castData?.id ?? '';

  // Filter snapshots for this cast only
  const mySnapshots = snapshots
    .filter(s => s.castId === castId)
    .sort((a, b) => b.month.localeCompare(a.month));

  // 当月
  const currentMonth = periodKey(new Date(), 'month');
  const currentMonthSnap = mySnapshots.find(s => s.month === currentMonth);

  if (!castId) {
    return (
      <div className="p-4 text-center text-ink-tertiary text-sm">
        キャスト情報を取得できませんでした
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-mincho text-xl font-bold text-ink">給与履歴</h2>

      {/* Current month status */}
      <div className="glass rounded-2xl p-4 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-ink-tertiary">当月（{formatMonth(currentMonth)}）</p>
            <p className="font-mincho font-bold text-ink mt-0.5">給与ステータス</p>
          </div>
          {currentMonthSnap ? (
            <div className="text-right">
              <span className="bg-success-bg text-success text-xs font-bold px-3 py-1 rounded-full">
                確定済
              </span>
              <p className="text-money-lg text-ink mt-2">
                ¥{currentMonthSnap.netPay.toLocaleString()}
              </p>
            </div>
          ) : (
            <div className="text-right">
              <span className="bg-warn-bg text-warn text-xs font-bold px-3 py-1 rounded-full">
                未確定
              </span>
              <p className="text-xs text-ink-tertiary mt-2">管理者が確定後に表示されます</p>
            </div>
          )}
        </div>
      </div>

      {/* No history state */}
      {mySnapshots.length === 0 && (
        <div className="glass rounded-2xl p-8 text-center space-y-2">
          <p className="text-2xl">📋</p>
          <p className="font-mincho font-bold text-ink">確定済み給与なし</p>
          <p className="text-sm text-ink-tertiary">
            管理者が給与を確定すると、ここに履歴が表示されます。
          </p>
        </div>
      )}

      {/* Snapshots list */}
      {mySnapshots.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-mincho font-bold text-ink text-sm px-1">確定済み一覧</h3>
          {mySnapshots.map(snap => (
            <div key={snap.month} className="glass rounded-2xl shadow-soft overflow-hidden">
              {/* Row header — always visible */}
              <button
                className="w-full px-4 py-4 flex items-center justify-between text-left hover:bg-brand/3 transition-colors"
                onClick={() => setExpandedMonth(expandedMonth === snap.month ? null : snap.month)}
              >
                <div>
                  <p className="font-mincho font-bold text-ink">{formatMonth(snap.month)}</p>
                  <p className="text-xs text-ink-tertiary mt-0.5">確定日: {formatDate(snap.confirmedAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-ink-tertiary">差引支給額</p>
                    <p className="font-bold text-ink text-lg">¥{snap.netPay.toLocaleString()}</p>
                  </div>
                  <div className={`text-ink-tertiary transition-transform ${expandedMonth === snap.month ? 'rotate-180' : ''}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
              </button>

              {/* Expanded breakdown */}
              {expandedMonth === snap.month && (
                <div className="px-4 pb-4 border-t border-ink/5">
                  {/* Net pay hero */}
                  <div className="bg-brand-gradient rounded-2xl p-4 text-center border-gold shadow-glow my-4">
                    <p className="text-xs text-white/70">差引支給額</p>
                    <p className="text-display text-white mt-1">
                      <span className="text-xl">¥</span>{snap.netPay.toLocaleString()}
                    </p>
                    <p className="text-xs text-white/50 mt-1">{formatMonth(snap.month)}分</p>
                  </div>

                  <PayrollBreakdown snap={snap} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
