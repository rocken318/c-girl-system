import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { defaultSettings, type Settings } from './settings';
import { supabase } from '../lib/supabase';

interface SettingsContextType {
  settings: Settings;
  loading: boolean;
  updateSettings: (patch: Partial<Settings>) => void;
  replaceSettings: (s: Settings) => void;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

/** Supabase の settings.data JSON を Settings 型として返す。未接続時は defaultSettings。 */
async function fetchSettings(storeId: string): Promise<Settings | null> {
  const { data, error } = await supabase
    .from('settings')
    .select('data')
    .eq('store_id', storeId)
    .single();
  if (error || !data) return null;
  return data.data as Settings;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(false);

  // 永続化先の store_id。認証＋取得成功時のみ設定され、未認証/デモ時は null のまま。
  // null の間は Supabase へ書き込まず in-memory のみ（従来挙動）。
  const persistStoreIdRef = useRef<string | null>(null);

  // updater を純関数に保ちつつ最新 settings から patch を合成するための ref。
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  /** settings テーブルへ upsert（store_id をキー）。RLS で admin のみ書込可。 */
  const persist = useCallback((next: Settings) => {
    const storeId = persistStoreIdRef.current;
    if (!storeId) return; // 未認証/デモ → in-memory のみ
    supabase
      .from('settings')
      .upsert({ store_id: storeId, data: next }, { onConflict: 'store_id' })
      .then(({ error }) => {
        if (error) console.error('[SettingsContext] persist error:', error);
      });
  }, []);

  // 認証済みセッションが確立したら store_id を使って設定を取得する。
  // Supabase Auth セッションから store_id を特定するため profiles を経由する。
  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      try {
        // 現在のセッションユーザーの store_id を取得
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          // 未認証 → fallback
          persistStoreIdRef.current = null;
          if (isMounted) setLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('store_id')
          .eq('id', session.user.id)
          .single();

        if (!profile?.store_id) {
          persistStoreIdRef.current = null;
          if (isMounted) setLoading(false);
          return;
        }

        const fetched = await fetchSettings(profile.store_id);
        if (isMounted && fetched) {
          persistStoreIdRef.current = profile.store_id;
          setSettings(fetched);
        }
      } catch (e) {
        console.error('[SettingsContext] fetch error:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    // セッション変化（ログイン/ログアウト）でリロード。INITIAL_SESSION は mount 時の
    // load() と二重になるため無視する。
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') return;
      if (isMounted) load();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    setSettings(next);
    persist(next); // 認証済みなら Supabase settings へ永続化（マスタ駆動）
  }, [persist]);

  const replaceSettings = useCallback((s: Settings) => {
    setSettings(s);
    persist(s);
  }, [persist]);

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings, replaceSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
