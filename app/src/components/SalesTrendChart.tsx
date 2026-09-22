import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { BRAND_COLOR } from '../config/brand';

export interface TrendPoint { label: string; current: number; lastYear: number }

/** Y軸用のコンパクト表記（万単位）。狭いスマホでも横幅を食わない。 */
const fmtMan = (v: number): string => (Number(v) === 0 ? '0' : `${Math.round(Number(v) / 10000)}万`);

export function SalesTrendChart({ data, mode = 'fit' }: { data: TrendPoint[]; mode?: 'fit' | 'scroll' }) {
  if (!data.length) return <p className="text-sm text-ink-tertiary">データなし</p>;

  const chart = (
    <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 11 }}
        interval={mode === 'scroll' ? 0 : 'preserveStartEnd'}
        minTickGap={mode === 'scroll' ? 0 : 24}
      />
      <YAxis tickFormatter={fmtMan} tick={{ fontSize: 10 }} width={40} />
      <Tooltip formatter={(v: number) => `¥${Number(v).toLocaleString()}`} />
      <Line type="monotone" dataKey="current" name="今年" stroke={BRAND_COLOR} strokeWidth={2} dot={false} />
    </LineChart>
  );

  if (mode === 'scroll') {
    const width = Math.max(data.length * 44, 320);
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
