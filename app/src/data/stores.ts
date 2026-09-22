import { supabase } from '../lib/supabase';

export interface StoreMembership {
  storeId: string;
  storeName: string;
  role: 'admin' | 'kurofuku' | 'cast' | 'terminal';
  isPrimary: boolean;
}

/** 自分のメンバーシップ一覧（user_id で明示的に自分の行のみ）＋店名join
 *  注：memberships_select RLS は admin/統合閲覧者に他人の行も見せるため、
 *  user_id で明示的に絞らないと「自分の所属」にならない（店舗切替UIが壊れる）。
 */
export async function fetchMyMemberships(): Promise<StoreMembership[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('user_store_memberships')
    .select('store_id, role, is_primary, stores(name)')
    .eq('user_id', user.id)
    .eq('status', 'active');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => {
    // supabase-js の join は単一外部キーの場合オブジェクトで返るが、
    // 配列で来た場合も両対応
    const storesField = r.stores as { name?: string } | { name?: string }[] | null;
    const storeName = Array.isArray(storesField)
      ? (storesField[0]?.name ?? '')
      : (storesField?.name ?? '');
    return {
      storeId: r.store_id as string,
      storeName,
      role: r.role as StoreMembership['role'],
      isPrimary: r.is_primary as boolean,
    };
  });
}

/** アクティブ店舗を切替。DBの検証付きRPC switch_active_store(has_store_access検証)を呼ぶ。
 *  直接 profiles を update しない（profiles_self_update ポリシーは撤去済み）。
 */
export async function setActiveStore(storeId: string): Promise<void> {
  const { error } = await supabase.rpc('switch_active_store', { p_store: storeId });
  if (error) throw error;
}

/** 統合閲覧者向け：全店一覧（RLSで統合は全store_select可） */
export async function fetchAccessibleStores(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('stores')
    .select('id, name')
    .eq('status', 'active')
    .order('name');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
  }));
}
