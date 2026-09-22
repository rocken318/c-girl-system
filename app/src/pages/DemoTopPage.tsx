import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';

export function DemoTopPage() {
  const { loginAsRole } = useAuth();
  const navigate = useNavigate();

  const handleAdmin = async () => {
    await loginAsRole('admin');
    navigate('/admin');
  };

  const handleCast = async () => {
    await loginAsRole('cast');
    navigate('/cast');
  };

  const handleKurofuku = async () => {
    await loginAsRole('kurofuku');
    navigate('/kurofuku');
  };

  const handleKiosk = async () => {
    await loginAsRole('terminal');
    navigate('/kiosk');
  };

  return (
    <div className="min-h-screen bg-dark-gradient water-ripple-bg ripple-center flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Center content */}
      <div className="flex flex-col items-center animate-fade-in-up">
        {/* Logo */}
        <div className="mb-6 animate-float">
          <img
            src="/kingyo_logo_white_transparent.png"
            alt="Kingyo Logo"
            width={120}
            height={120}
            className="drop-shadow-lg"
          />
        </div>

        {/* Title */}
        <h1 className="font-mincho text-4xl font-bold text-white tracking-wider mb-1">
          Kingyo
        </h1>
        <p className="text-gold-gradient font-mincho text-xl tracking-[0.4em] mb-2">
          金 魚
        </p>

        {/* Gold rule */}
        <div className="rule-gold w-40 mb-8" />

        {/* Entry cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
          {/* Admin card */}
          <button
            onClick={handleAdmin}
            className="glass-dark rounded-2xl p-6 flex-1 text-left hover-lift hover:border-gold/30 transition-[transform,box-shadow,border-color] group focus-gold touch-action-manipulation"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-brand-gradient flex items-center justify-center text-white text-lg shadow-glow group-hover:scale-110 transition-transform">
                ⚙
              </div>
              <span className="font-mincho font-bold text-white text-lg">管理者</span>
            </div>
            <p className="text-sm font-bold text-white mb-1">管理者として入る</p>
            <p className="text-xs text-white/50 leading-relaxed">
              ダッシュボード・給与計算・キャスト管理など全機能にアクセス
            </p>
          </button>

          {/* Cast card */}
          <button
            onClick={handleCast}
            className="glass-dark rounded-2xl p-6 flex-1 text-left hover-lift hover:border-gold/30 transition-[transform,box-shadow,border-color] group focus-gold touch-action-manipulation"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gold-shimmer flex items-center justify-center text-white text-lg shadow-gold group-hover:scale-110 transition-transform">
                ✦
              </div>
              <span className="font-mincho font-bold text-white text-lg">キャスト</span>
            </div>
            <p className="text-sm font-bold text-white mb-1">キャストとして入る</p>
            <p className="text-xs text-white/50 leading-relaxed">
              SAKURA としてマイページ・給与明細・ランキングを確認
            </p>
          </button>

          {/* Kurofuku card */}
          <button
            onClick={handleKurofuku}
            className="glass-dark rounded-2xl p-6 flex-1 text-left hover-lift hover:border-gold/30 transition-[transform,box-shadow,border-color] group focus-gold touch-action-manipulation"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-brand-gradient flex items-center justify-center text-white text-lg shadow-glow group-hover:scale-110 transition-transform">
                ◆
              </div>
              <span className="font-mincho font-bold text-white text-lg">黒服</span>
            </div>
            <p className="text-sm font-bold text-white mb-1">黒服として入る</p>
            <p className="text-xs text-white/50 leading-relaxed">
              自分の勤怠・QR。担当キャストの管理は今後対応
            </p>
          </button>

          {/* Kiosk (terminal) card */}
          <button
            onClick={handleKiosk}
            className="glass-dark rounded-2xl p-6 flex-1 text-left hover-lift hover:border-gold/30 transition-[transform,box-shadow,border-color] group focus-gold touch-action-manipulation"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gold-shimmer flex items-center justify-center text-white text-lg shadow-gold group-hover:scale-110 transition-transform">
                ▣
              </div>
              <span className="font-mincho font-bold text-white text-lg">店舗端末</span>
            </div>
            <p className="text-sm font-bold text-white mb-1">端末として入る（QR打刻）</p>
            <p className="text-xs text-white/50 leading-relaxed">
              個人QRをかざして出退勤を記録する共有端末画面
            </p>
          </button>
        </div>

        {/* Note */}
        <p className="text-xs text-white/30 mt-8 text-center">
          ※ デモのためログイン画面は飛ばしています
        </p>
        <Link
          to="/login"
          className="text-xs text-gold/60 hover:text-gold transition-colors mt-2 underline underline-offset-2"
        >
          ログイン画面はこちら
        </Link>
      </div>
    </div>
  );
}
