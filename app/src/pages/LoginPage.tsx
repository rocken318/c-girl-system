import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { CgirlIcon } from '../components/CgirlIcon';

function roleToPath(role: string): string {
  if (role === 'admin') return '/admin';
  if (role === 'kurofuku') return '/kurofuku';
  if (role === 'terminal') return '/kiosk';
  return '/cast';
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  // user が確定（またはすでに存在）したら role ベースで遷移
  // I2: email prefix ではなく実際の role を使う
  useEffect(() => {
    if (user) {
      navigate(roleToPath(user.role));
    }
  }, [user, navigate]);

  const handleLogin = async () => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const success = await login(email.trim(), password);
      if (!success) {
        setError('ログインIDまたはパスワードが正しくありません');
      }
      // 成功時は onAuthStateChange → user が更新 → 上の useEffect が遷移する
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-gradient water-ripple-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-in-up">
        {/* Branding */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-5">
            <CgirlIcon size={88} animate />
          </div>
          <h1 className="font-mincho text-4xl font-bold tracking-wider text-white">
            C-girl
          </h1>
          <p className="text-gold-gradient font-mincho text-xl mt-1 tracking-[0.3em]">
            C - girl
          </p>
          <div className="rule-gold w-32 mx-auto mt-4" />
        </div>

        {/* Login card */}
        <div className="glass-dark rounded-2xl p-6 shadow-float">
          <h2 className="font-mincho text-xl font-bold text-white text-center mb-1">
            おかえりなさい
          </h2>
          <p className="text-sm text-white/50 text-center mb-6">
            あなた専用のページにログインしてください
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5 tracking-wide">
                ログインID（またはメール）
              </label>
              <input
                type="text"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="例: sakura"
                className="w-full px-4 py-3 bg-white/8 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20 text-base transition-colors"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5 tracking-wide">
                パスワード
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••"
                className="w-full px-4 py-3 bg-white/8 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20 text-base transition-colors"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-sm text-brand-light text-center animate-fade-in">{error}</p>
            )}

            <button
              onClick={handleLogin}
              disabled={submitting}
              className="w-full bg-brand-gradient border border-gold/30 text-white font-bold py-4 rounded-xl text-lg tracking-[0.2em] transition-all hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? '…' : 'ロ グ イ ン'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-white/25 mt-6 tracking-wide">
          admin: admin@cgirl.local / admin1234 &nbsp;|&nbsp; cast: sakura@cgirl.local / sakura1234 &nbsp;|&nbsp; 黒服: kurofuku@cgirl.local / kurofuku1234
        </p>
      </div>
    </div>
  );
}
