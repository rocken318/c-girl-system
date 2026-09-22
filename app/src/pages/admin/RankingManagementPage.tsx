import { useSettings } from '../../store/SettingsContext';
import { usePerformance } from '../../store/PerformanceContext';
import { calculateRanking } from '../../lib/ranking';
import { MedalIcon } from '../../components/Icons';

export function RankingManagementPage() {
  const { settings } = useSettings();
  const { getMonthlyPerformances } = usePerformance();
  const ranking = calculateRanking(getMonthlyPerformances('2026-06'), settings);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mincho text-xl md:text-2xl font-bold text-ink">ランキング管理</h1>
        <span className="text-sm text-ink-tertiary">
          pt定義: {settings.rankingPointDef === 'sales' ? '売上' : settings.rankingPointDef === 'nominations' ? '指名数' : '独自pt'}
          {' '}| 公開: {settings.rankingPublic ? 'ON' : 'OFF'}
          {' '}| 上位{settings.rankingTopN}名表示
        </span>
      </div>

      <div className="bg-surface-card rounded-2xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/5">
              <th className="text-center px-5 py-3 font-medium text-gold text-xs tracking-wide w-16">順位</th>
              <th className="text-left px-5 py-3 font-medium text-gold text-xs tracking-wide">キャスト名</th>
              <th className="text-right px-5 py-3 font-medium text-gold text-xs tracking-wide">ポイント</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((entry, i) => (
              <tr key={entry.castId} className={`border-t border-ink/3 hover:bg-brand/3 transition-colors ${
                i === 0 ? 'bg-gold/5' : ''
              }`}>
                <td className="px-5 py-3 text-center">
                  {i < 3 ? (
                    <MedalIcon rank={(i + 1) as 1 | 2 | 3} size={28} />
                  ) : (
                    <span className="text-ink-secondary font-mincho">{entry.rank}</span>
                  )}
                </td>
                <td className="px-5 py-3 font-medium text-ink">{entry.castName}</td>
                <td className="px-5 py-3 text-right font-bold text-brand">{entry.points}pt</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <p className="text-sm text-ink-tertiary">
        ランキングの集計方法は【設定 → ランキング】タブで変更できます。
      </p>
    </div>
  );
}
