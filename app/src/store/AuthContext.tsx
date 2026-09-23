import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import {
  fetchMyMemberships,
  setActiveStore,
  type StoreMembership,
} from '../data/stores';

// ---------------------------------------------------------------------------
// Types — 既存の呼び出し側 (user.role / user.castData / user.name) と互換維持
// ---------------------------------------------------------------------------

export type Role = 'admin' | 'cast' | 'terminal' | 'kurofuku';

/** casts テーブル行から必要なフィールドを抜粋した互換型 */
export interface CastData {
  id: string;       // casts.id (UUID)
  storeId: string;  // casts.store_id
  name: string;     // casts.source_name
  rank?: string;    // casts.rank
  joinDate: string; // casts.join_date
  status: 'active' | 'inactive';
}

export interface AuthUser {
  id: string;              // auth.users.id (UUID)
  name: string;            // profiles.display_name
  role: Role;              // profiles.role ('admin'|'cast'|'terminal'|'kurofuku')
  storeId: string;         // 後方互換 = activeStoreId と同値
  punchToken?: string;     // profiles.punch_token（cast/kurofuku のみ）
  castData?: CastData;     // role='cast' の場合のみ
  // --- マルチストア拡張 ---
  memberships: StoreMembership[];   // 所属店舗一覧
  isIntegratedViewer: boolean;      // profiles.is_integrated_viewer
  activeStoreId: string;            // profiles.active_store_id（切替後の現在店舗）
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  /** デモ用クイックログイン — Supabase Auth へ移行後は内部でemail/passを使用 */
  loginAsRole: (role: Role) => Promise<void>;
  logout: () => Promise<void>;
  /** アクティブ店舗を切替（RPC経由）→ユーザー情報を再取得して反映 */
  switchStore: (storeId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextType | null>(null);

// ---------------------------------------------------------------------------
// Helper: profiles + casts + memberships → AuthUser
// ---------------------------------------------------------------------------

async function fetchAuthUser(userId: string): Promise<AuthUser | null> {
  // profiles を取得（is_integrated_viewer / active_store_id を追加）
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, store_id, role, display_name, status, punch_token, is_integrated_viewer, active_store_id')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    console.error('[AuthContext] profiles fetch error:', profileError);
    return null;
  }

  const role: Role =
    profile.role === 'admin'
      ? 'admin'
      : profile.role === 'kurofuku'
      ? 'kurofuku'
      : profile.role === 'terminal'
      ? 'terminal'
      : 'cast';

  // active_store_id が未設定の場合は store_id にフォールバック
  const activeStoreId: string = (profile.active_store_id as string | null) ?? (profile.store_id as string) ?? '';

  // メンバーシップ一覧を取得（RLSで自分の行のみ）
  let memberships: StoreMembership[] = [];
  try {
    memberships = await fetchMyMemberships();
  } catch (err) {
    console.warn('[AuthContext] memberships fetch error (non-fatal):', err);
  }

  const baseUser: AuthUser = {
    id: profile.id as string,
    name: (profile.display_name as string) ?? '',
    role,
    storeId: activeStoreId,       // 後方互換：activeStoreId と同値
    punchToken: (profile.punch_token as string | null) ?? undefined,
    memberships,
    isIntegratedViewer: (profile.is_integrated_viewer as boolean | null) ?? false,
    activeStoreId,
  };

  // キャストの場合のみ casts テーブルも取得（kurofuku は casts 行を持たない）
  if (role === 'cast') {
    const { data: cast, error: castError } = await supabase
      .from('casts')
      .select('id, store_id, source_name, rank, join_date, status')
      .eq('user_id', userId)
      .single();

    if (!castError && cast) {
      baseUser.castData = {
        id: cast.id as string,
        storeId: cast.store_id as string,
        name: cast.source_name as string,
        rank: (cast.rank as string | null) ?? undefined,
        joinDate: cast.join_date as string,
        status: cast.status as 'active' | 'inactive',
      };
    }
  }

  return baseUser;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // 起動時に既存セッションを復元
  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;
      if (session?.user) {
        const authUser = await fetchAuthUser(session.user.id);
        if (isMounted) setUser(authUser);
      }
      if (isMounted) setLoading(false);
    });

    // セッション変化を購読
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isMounted) return;
        if (session?.user) {
          const authUser = await fetchAuthUser(session.user.id);
          setUser(authUser);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ログイン（ログインID または email + password）
  // ID だけ入力された場合は合成メール <id>@cgirl.local に変換（キャストは ID+パスワードでログイン）
  const login = async (identifier: string, password: string): Promise<boolean> => {
    const id = identifier.trim();
    const email = id.includes('@') ? id : `${id.toLowerCase()}@cgirl.local`;
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.user) {
      console.error('[AuthContext] signIn error:', error);
      return false;
    }
    // onAuthStateChange が user を更新するので ここでは true を返すだけでよい
    return true;
  };

  // デモ用クイックログイン（LoginPage を迂回して役割でログイン）
  const loginAsRole = async (role: Role): Promise<void> => {
    // デモ入場用の seed アカウント（ID/パス入力不要）
    const creds: Record<Role, { email: string; password: string }> = {
      admin: { email: 'admin@cgirl.local', password: 'admin1234' },
      cast: { email: 'sakura@cgirl.local', password: 'sakura1234' },
      kurofuku: { email: 'kurofuku@cgirl.local', password: 'kurofuku1234' },
      terminal: { email: 'terminal@cgirl.local', password: 'terminal1234' },
    };
    const { email, password } = creds[role];
    await supabase.auth.signInWithPassword({ email, password });
    // onAuthStateChange が user を更新する
  };

  // ログアウト
  const logout = async (): Promise<void> => {
    await supabase.auth.signOut();
    // onAuthStateChange が user = null にする
  };

  // 店舗切替（RPC経由 → ユーザー情報再取得）
  const switchStore = async (storeId: string): Promise<void> => {
    await setActiveStore(storeId);
    // active_store_id が DB 更新されたのでユーザー情報を再取得
    const currentSession = await supabase.auth.getSession();
    const uid = currentSession.data.session?.user?.id;
    if (uid) {
      const updated = await fetchAuthUser(uid);
      setUser(updated);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginAsRole, logout, switchStore }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
