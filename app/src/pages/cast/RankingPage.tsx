import { useSettings } from '../../store/SettingsContext';
import { usePerformance } from '../../store/PerformanceContext';
import { calculateRanking } from '../../lib/ranking';
import { useAuth } from '../../store/AuthContext';
import { MedalIcon } from '../../components/Icons';

export function RankingPage() {
  const { settings } = useSettings();
  const { user } = useAuth();
  const { getMonthlyPerformances } = usePerformance();
  const ranking = calculateRanking(getMonthlyPerformances('2026-06'), settings);
  const visible = ranking.slice(0, settings.rankingTopN);

  const cardStyle = (i: number, isMe: boolean) => {
    const base = 'rounded-2xl p-4 transition-all';
    if (i === 0) return `${base} bg-gold-shimmer shadow-gold border border-gold/30`;
    if (i === 1) return `${base} bg-gradient-to-r from-slate-100 to-slate-50 shadow-card border border-slate-200`;
    if (i === 2) return `${base} bg-gradient-to-r from-amber-50 to-orange-50 shadow-card border border-amber-200/50`;
    return `${base} glass shadow-soft ${isMe ? 'border-2 border-brand/30 shadow-glow' : ''}`;
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-mincho text-xl font-bold text-ink">ランキング</h2>
      <p className="text-sm text-ink-tertiary">
        2026年6月 ・ {settings.rankingPointDef === 'sales' ? '売上' : settings.rankingPointDef === 'nominations' ? '指名数' : '独自pt'}
      </p>

      <div className="space-y-3">
        {visible.map((entry, i) => {
          const isMe = entry.castId === user?.castData?.id;
          return (
            <div
              key={entry.castId}
              className={`${cardStyle(i, isMe)} animate-fade-in-up delay-${Math.min(i + 1, 5)}`}
            >
              <div className="flex items-center gap-3">
                {i < 3 ? (
                  <MedalIcon rank={(i + 1) as 1 | 2 | 3} size={36} />
                ) : (
                  <span className="w-9 h-9 rounded-full bg-ink/5 flex items-center justify-center font-mincho font-bold text-ink-secondary">
                    {entry.rank}
                  </span>
                )}
                <div className="flex-1">
                  <p className={`font-bold ${i === 0 ? 'text-lg' : ''} text-ink`}>
                    {entry.castName}
                    {isMe && <span className="text-xs text-brand ml-2 font-normal">← あなた</span>}
                  </p>
                </div>
                {settings.rankingDisplayMode === 'with_points' && (
                  <span className={`font-mincho text-xl font-bold ${i === 0 ? 'text-gold' : 'text-brand'}`}>
                    {entry.points}<span className="text-sm font-normal text-ink-tertiary">pt</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!settings.rankingPublic && (
        <p className="text-center text-sm text-ink-tertiary">ランキングは現在非公開です</p>
      )}
    </div>
  );
}
