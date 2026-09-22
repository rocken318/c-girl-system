import { useEffect, useState } from 'react';
import { useAuth } from '../store/AuthContext';
import { fetchAccessibleStores } from '../data/stores';

interface Opt { id: string; name: string; }

export function StoreSwitcher() {
  const { user, switchStore } = useAuth();
  const [allStores, setAllStores] = useState<Opt[]>([]);

  useEffect(() => {
    if (user?.isIntegratedViewer) {
      fetchAccessibleStores().then(setAllStores).catch(() => setAllStores([]));
    }
  }, [user?.isIntegratedViewer]);

  if (!user) return null;

  const isIntegrated = user.isIntegratedViewer;

  // 兼務者向け：memberships から store_id で一意化
  const membershipOpts: Opt[] = Array.from(
    new Map(
      user.memberships.map((m) => [m.storeId, { id: m.storeId, name: m.storeName }])
    ).values()
  );

  const opts: Opt[] = isIntegrated ? allStores : membershipOpts;

  // 単一所属 かつ 非統合 → 非表示
  if (!isIntegrated && opts.length <= 1) return null;
  // 選択肢ゼロ（統合でも取得中/空） → 非表示
  if (opts.length === 0) return null;

  return (
    <select
      value={user.activeStoreId}
      onChange={(e) => { void switchStore(e.target.value); }}
      className="rounded-lg border border-gold/30 bg-ink/5 px-3 py-1.5 text-sm font-mincho text-ink"
      aria-label="店舗切替"
    >
      {opts.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}
