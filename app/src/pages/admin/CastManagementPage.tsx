import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../store/AuthContext';
import { useSettings } from '../../store/SettingsContext';

/** casts テーブル行（本名簿）。seed.ts の Cast には依存しない。 */
interface CastRow {
  id: string;
  source_name: string;
  rank: string | null;
  join_date: string | null;
  status: 'active' | 'inactive';
}

type EditState = {
  castId: string; // '' = 新規追加モード
  source_name: string;
  rank: string;
  join_date: string;
  status: 'active' | 'inactive';
  hourlyRate: number;
  loginId: string; // 新規追加時のみ: ログインID（<id>@cgirl.local に変換）
  password: string; // 新規追加時のみ: 初期パスワード
};

export function CastManagementPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const activeStoreId = user?.activeStoreId;
  const { settings, updateSettings } = useSettings();

  const [castList, setCastList] = useState<CastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const loadCasts = useCallback(async () => {
    if (!activeStoreId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('casts')
      .select('id, source_name, rank, join_date, status')
      .eq('store_id', activeStoreId)
      .order('source_name');
    if (error) {
      setLoadError(error.message);
      setCastList([]);
    } else {
      setCastList((data ?? []) as CastRow[]);
    }
    setLoading(false);
  }, [activeStoreId]);

  // 初回ロード & activeStoreId 変化で再取得（店舗切替に追従）
  // loadCasts は非同期フェッチ後に setState するため set-state-in-effect は意図通り
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCasts();
  }, [loadCasts]);

  const openEdit = (cast: CastRow) => {
    setEditing({
      castId: cast.id,
      source_name: cast.source_name,
      rank: cast.rank ?? '',
      join_date: cast.join_date ?? '',
      status: cast.status,
      hourlyRate: settings.hourlyRates.find(r => r.castId === cast.id)?.hourlyRate ?? 0,
      loginId: '',
      password: '',
    });
  };

  const openAdd = () => {
    setEditing({
      castId: '', // 空 = 新規追加モード
      source_name: '',
      rank: '',
      join_date: '',
      status: 'active',
      hourlyRate: 0,
      loginId: '',
      password: '',
    });
  };

  const closeEdit = () => {
    if (saving) return;
    setEditing(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const isNew = editing.castId === '';
    const sourceName = editing.source_name.trim();
    if (!sourceName) {
      alert('源氏名を入力してください');
      return;
    }
    if (isNew && !activeStoreId) {
      alert('店舗が選択されていません');
      return;
    }
    // 新規追加はログインID・初期パスワードを検証（<id>@cgirl.local で作成）
    const loginId = editing.loginId.trim().toLowerCase();
    if (isNew) {
      if (!/^[a-z0-9._-]{3,32}$/.test(loginId)) {
        alert('ログインIDは半角英数字と ._- の3〜32文字で入力してください');
        return;
      }
      if (editing.password.length < 6) {
        alert('初期パスワードは6文字以上で入力してください');
        return;
      }
    }
    setSaving(true);

    // 新規は発行API（service role で auth+profile+membership+casts を一括作成）、既存は update。
    // 永続化後の castId を後続の時給 upsert に使う。
    let castId = editing.castId;
    if (isNew) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setSaving(false);
        alert('セッションが無効です。再ログインしてください');
        return;
      }
      let json: { castId?: string; error?: string } = {};
      try {
        const resp = await fetch('/api/casts/provision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            storeId: activeStoreId,
            loginId,
            password: editing.password,
            source_name: sourceName,
            rank: editing.rank,
            join_date: editing.join_date,
            status: editing.status,
          }),
        });
        json = (await resp.json().catch(() => ({}))) as { castId?: string; error?: string };
        if (!resp.ok) {
          setSaving(false);
          const map: Record<string, string> = {
            login_id_taken: 'そのログインIDは既に使われています',
            invalid_login_id: 'ログインIDの形式が不正です',
            weak_password: '初期パスワードは6文字以上にしてください',
            invalid_source_name: '源氏名を入力してください',
            forbidden: '追加する権限がありません',
            forbidden_store: '別店舗への追加はできません',
          };
          alert(`追加に失敗しました: ${map[json.error ?? ''] ?? json.error ?? `HTTP ${resp.status}`}`);
          return;
        }
      } catch {
        setSaving(false);
        alert('追加に失敗しました（通信エラー）');
        return;
      }
      if (!json.castId) {
        setSaving(false);
        alert('追加に失敗しました（不正な応答）');
        return;
      }
      castId = json.castId;
    } else {
      const { error } = await supabase
        .from('casts')
        .update({
          source_name: sourceName,
          rank: editing.rank || null,
          join_date: editing.join_date || null,
          status: editing.status,
        })
        .eq('id', castId);
      if (error) {
        setSaving(false);
        alert(`保存に失敗しました: ${error.message}`);
        return;
      }
    }
    setSaving(false);

    // 時給を settings.hourlyRates に upsert（settings テーブル・admin RLS）
    const exists = settings.hourlyRates.some(r => r.castId === castId);
    const nextRates = exists
      ? settings.hourlyRates.map(r =>
          r.castId === castId ? { ...r, hourlyRate: editing.hourlyRate } : r
        )
      : [...settings.hourlyRates, { castId, hourlyRate: editing.hourlyRate }];
    updateSettings({ hourlyRates: nextRates });

    setEditing(null);
    await loadCasts(); // 永続化後に再取得して一覧を最新化
  };

  const handleRetire = async (castId: string) => {
    const { error } = await supabase
      .from('casts')
      .update({ status: 'inactive' })
      .eq('id', castId);
    if (error) {
      alert(`退店処理に失敗しました: ${error.message}`);
      return;
    }
    await loadCasts();
  };

  const inputClass =
    'w-full border border-ink/10 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20 transition-colors';

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mincho text-xl md:text-2xl font-bold text-ink">キャスト管理</h1>
        <button
          onClick={openAdd}
          disabled={!activeStoreId}
          className="bg-brand-gradient text-white px-4 py-2 rounded-xl text-sm font-medium hover:shadow-glow transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ＋ キャスト追加
        </button>
      </div>

      {!activeStoreId ? (
        <div className="bg-surface-card rounded-2xl shadow-card p-12 text-center text-ink-tertiary text-sm">
          店舗を選択してください
        </div>
      ) : loading ? (
        <div className="bg-surface-card rounded-2xl shadow-card p-12 text-center text-ink-tertiary text-sm animate-pulse">
          読み込み中…
        </div>
      ) : loadError ? (
        <div className="bg-surface-card rounded-2xl shadow-card p-12 text-center space-y-3">
          <p className="text-danger text-sm">名簿の取得に失敗しました</p>
          <p className="text-ink-tertiary text-xs">{loadError}</p>
          <button
            onClick={() => void loadCasts()}
            className="text-xs text-gold hover:text-gold-light transition-colors underline underline-offset-2"
          >
            再試行
          </button>
        </div>
      ) : (
        <div className="bg-surface-card rounded-2xl shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/5">
                  <th className="text-left px-5 py-3 font-medium text-gold text-xs tracking-wide">源氏名</th>
                  <th className="text-left px-5 py-3 font-medium text-gold text-xs tracking-wide">ランク</th>
                  <th className="text-left px-5 py-3 font-medium text-gold text-xs tracking-wide hidden sm:table-cell">入店日</th>
                  <th className="text-left px-5 py-3 font-medium text-gold text-xs tracking-wide">ステータス</th>
                  <th className="text-right px-5 py-3 font-medium text-gold text-xs tracking-wide">操作</th>
                </tr>
              </thead>
              <tbody>
                {castList.map(cast => (
                  <tr key={cast.id} className="border-t border-ink/3 hover:bg-brand/3 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-gradient text-white flex items-center justify-center text-xs font-bold shadow-soft shrink-0">
                          {cast.source_name.charAt(0)}
                        </div>
                        <span className="font-medium text-ink">{cast.source_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{cast.rank ?? '-'}</td>
                    <td className="px-5 py-3 text-ink-secondary hidden sm:table-cell">{cast.join_date ?? '-'}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          cast.status === 'active'
                            ? 'bg-success-bg text-success'
                            : 'bg-ink/5 text-ink-tertiary'
                        }`}
                      >
                        {cast.status === 'active' ? '在籍' : '退店'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => navigate(`/admin/cast-view?cast=${cast.id}`)}
                        className="text-xs text-brand hover:text-brand-dark mr-3 transition-colors touch-manipulation py-1"
                      >
                        詳細
                      </button>
                      <button
                        onClick={() => openEdit(cast)}
                        className="text-xs text-gold hover:text-gold-light mr-3 transition-colors touch-manipulation py-1"
                      >
                        編集
                      </button>
                      {cast.status === 'active' && (
                        <button
                          onClick={() => void handleRetire(cast.id)}
                          className="text-xs text-ink-tertiary hover:text-danger transition-colors touch-manipulation py-1"
                        >
                          退店
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {castList.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-ink-tertiary text-sm">
                      この店舗の名簿はまだありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal — モバイル対応: fixed + overflow-y-auto で画面内スクロール */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeEdit}
          />

          {/* Panel — モバイルはボトムシート、sm以上はセンターモーダル */}
          <div className="relative z-10 w-full sm:max-w-md bg-surface-card rounded-t-2xl sm:rounded-2xl shadow-card max-h-[90dvh] overflow-y-auto">
            {/* Handle bar (mobile only) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-ink/20" />
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-mincho font-bold text-ink text-lg">{editing.castId === '' ? 'キャスト追加' : 'キャスト編集'}</h2>
                <button
                  onClick={closeEdit}
                  className="text-ink-tertiary hover:text-ink transition-colors p-1 touch-manipulation"
                  aria-label="閉じる"
                >
                  ✕
                </button>
              </div>

              <div className="rule-gold" />

              {/* 源氏名 */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-ink-secondary">源氏名</label>
                <input
                  type="text"
                  value={editing.source_name}
                  onChange={e => setEditing(prev => prev && { ...prev, source_name: e.target.value })}
                  className={inputClass}
                />
              </div>

              {/* ログイン情報（新規追加時のみ） */}
              {editing.castId === '' && (
                <>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-ink-secondary">ログインID</label>
                    <input
                      type="text"
                      value={editing.loginId}
                      onChange={e => setEditing(prev => prev && { ...prev, loginId: e.target.value })}
                      className={inputClass}
                      placeholder="例: sakura（半角英数字・._-）"
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                    <p className="text-xs text-ink-tertiary">このID＋パスワードでキャストがログインします</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-ink-secondary">初期パスワード</label>
                    <input
                      type="text"
                      value={editing.password}
                      onChange={e => setEditing(prev => prev && { ...prev, password: e.target.value })}
                      className={inputClass}
                      placeholder="6文字以上"
                    />
                  </div>
                </>
              )}

              {/* ランク */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-ink-secondary">ランク</label>
                <input
                  type="text"
                  value={editing.rank}
                  onChange={e => setEditing(prev => prev && { ...prev, rank: e.target.value })}
                  className={inputClass}
                  placeholder="例: A, S, Gold …"
                />
              </div>

              {/* 時給 */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-ink-secondary">時給（円）</label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={editing.hourlyRate}
                  onChange={e => setEditing(prev => prev && { ...prev, hourlyRate: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>

              {/* 入店日 */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-ink-secondary">入店日</label>
                <input
                  type="date"
                  value={editing.join_date}
                  onChange={e => setEditing(prev => prev && { ...prev, join_date: e.target.value })}
                  className={inputClass}
                />
              </div>

              {/* ステータス */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-ink-secondary">ステータス</label>
                <select
                  value={editing.status}
                  onChange={e =>
                    setEditing(prev =>
                      prev && { ...prev, status: e.target.value as 'active' | 'inactive' }
                    )
                  }
                  className={inputClass}
                >
                  <option value="active">在籍</option>
                  <option value="inactive">退店</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeEdit}
                  disabled={saving}
                  className="flex-1 border border-ink/20 text-ink-secondary px-4 py-3 rounded-xl text-sm font-medium hover:bg-ink/5 transition-colors touch-manipulation disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => void saveEdit()}
                  disabled={saving}
                  className="flex-1 bg-brand-gradient text-white px-4 py-3 rounded-xl text-sm font-bold hover:shadow-glow transition-all active:scale-95 touch-manipulation disabled:opacity-60"
                >
                  {saving ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
