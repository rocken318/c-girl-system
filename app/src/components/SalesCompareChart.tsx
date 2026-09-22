import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { TrendPoint } from './SalesTrendChart';

/** Y軸用のコンパクト表記（万単位）。 */
const fmtMan = (v: number): string => (Number(v) === 0 ? '0' : `${Math.round(Number(v) / 10000)}万`);

export function SalesCompareChart({ data, mode = 'fit' }: { data: TrendPoint[]; mode?: 'fit' | 'scroll' }) {
  if (!data.length) return <p className="text-sm text-ink-tertiary">データなし</p>;

  const chart = (
    <BarChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 11 }}
        interval={mode === 'scroll' ? 0 : 'preserveStartEnd'}
        minTickGap={mode === 'scroll' ? 0 : 24}
      />
      <YAxis tickFormatter={fmtMan} tick={{ fontSize: 10 }} width={40} />
      <Tooltip formatter={(v: number) => `¥${Number(v).toLocaleString()}`} />
      <Legend />
      <Bar dataKey="current" name="今年" fill="#c8243e" radius={[3, 3, 0, 0]} />
      <Bar dataKey="lastYear" name="前年" fill="#b8a06a" radius={[3, 3, 0, 0]} />
    </BarChart>
  );

  // 横スクロール: データ点ごとに一定幅を確保し、コンテナ幅を超えたらスクロール
  if (mode === 'scroll') {
    const width = Math.max(data.length * 56, 320);
    return (
      <div className="overflow-x-auto">
        <div style={{ width }}>
          <ResponsiveContainer width="100%" height={260}>{chart}</ResponsiveContainer>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>{chart}</ResponsiveContainer>
  );
}
