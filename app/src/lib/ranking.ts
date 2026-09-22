import type { Settings } from '../store/settings';
import type { Performance } from '../data/seed';
import { casts } from '../data/seed';

export interface RankingEntry {
  castId: string;
  castName: string;
  points: number;
  rank: number;
}

export function calculateRanking(
  allPerformances: Performance[],
  settings: Settings
): RankingEntry[] {
  const entries: RankingEntry[] = allPerformances.map(perf => {
    const cast = casts.find(c => c.id === perf.castId);
    let points = 0;

    switch (settings.rankingPointDef) {
      case 'sales':
        points = perf.nominatedSales + perf.freeSales;
        break;
      case 'nominations':
        points = perf.honShimei + perf.banaiShimei;
        break;
      case 'custom': {
        const countMap: Record<string, number> = {
          '本指名': perf.honShimei,
          '同伴': perf.douhan,
          'ドリンク': perf.drinks,
          '場内指名': perf.banaiShimei,
          'ボトル': perf.bottles,
          '延長': perf.extensions,
        };
        for (const def of settings.customPointDefs) {
          points += (countMap[def.category] ?? 0) * def.points;
        }
        break;
      }
    }

    return {
      castId: perf.castId,
      castName: cast?.name ?? 'Unknown',
      points,
      rank: 0,
    };
  });

  entries.sort((a, b) => b.points - a.points);
  entries.forEach((e, i) => { e.rank = i + 1; });

  return entries;
}
