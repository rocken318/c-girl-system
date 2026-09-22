import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import { LogoutIcon } from '../../components/Icons';

export function CastSettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-mincho text-xl font-bold text-ink">設定</h2>

      <div className="glass rounded-2xl p-5 shadow-card space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-brand-gradient text-white flex items-center justify-center text-2xl font-bold shadow-glow">
            {user?.name?.charAt(0)}
          </div>
          <div>
            <p className="font-mincho font-bold text-lg text-ink">{user?.name}</p>
            <p className="text-sm text-ink-tertiary">キャスト</p>
          </div>
        </div>
        <div className="rule-gold" />
        <div className="space-y-2 text-sm text-ink-secondary">
          <p>入店日: {user?.castData?.joinDate}</p>
          <p>ランク: {user?.castData?.rank ?? '未設定'}</p>
        </div>
      </div>

      <button
        onClick={() => { logout(); navigate('/'); }}
        className="w-full glass rounded-xl py-3 text-ink-secondary font-medium hover:text-danger transition-colors flex items-center justify-center gap-2 shadow-soft"
      >
        <LogoutIcon size={18} />
        ログアウト
      </button>
    </div>
  );
}
