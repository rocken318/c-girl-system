import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../../store/AuthContext';
import { punchPayload } from '../../data/qr';

export function MyQrPage() {
  const { user } = useAuth();
  const token = user?.punchToken;
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    QRCode.toDataURL(punchPayload(token), {
      width: 280,
      margin: 2,
      color: { dark: '#1a0a0e', light: '#fffaf6' },
    })
      .then(setQrDataUrl)
      .catch(() => setError('QR生成に失敗しました'));
  }, [token]);

  return (
    <div className="p-4 flex flex-col items-center space-y-6 animate-fade-in-up">
      {/* Page title */}
      <div className="w-full">
        <h2 className="font-mincho text-xl font-bold text-ink">自分のQRコード</h2>
        <p className="text-xs text-ink-tertiary mt-0.5">出退勤用 個人QR</p>
      </div>

      {token ? (
        <>
          {/* QR Card */}
          <div className="glass rounded-2xl shadow-glow border-gold p-6 flex flex-col items-center space-y-4 w-full max-w-xs">
            {/* Decorative top stripe */}
            <div className="h-0.5 w-16 bg-brand-gradient rounded-full" />

            {/* QR image */}
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="個人打刻QRコード"
                className="rounded-xl shadow-soft"
                width={240}
                height={240}
              />
            ) : error ? (
              <div className="w-60 h-60 flex items-center justify-center rounded-xl bg-danger-bg text-danger text-sm text-center px-4">
                {error}
              </div>
            ) : (
              <div className="w-60 h-60 flex items-center justify-center rounded-xl bg-white/40">
                <span className="text-ink-tertiary text-sm">生成中…</span>
              </div>
            )}

            {/* User name */}
            <p className="font-mincho text-lg font-bold text-ink">{user?.name}</p>
            <div className="h-0.5 w-16 bg-brand-gradient rounded-full" />
          </div>

          {/* Instruction */}
          <div className="glass rounded-xl p-4 shadow-soft w-full max-w-xs text-center space-y-1">
            <p className="text-sm font-medium text-ink">
              この画面を店の端末にかざしてください
            </p>
            <p className="text-xs text-ink-tertiary">
              スキャンすると自動で出退勤が記録されます
            </p>
          </div>

          {/* Security note */}
          <p className="text-xs text-ink-tertiary text-center max-w-xs">
            このQRコードは個人専用です。他の人に見せないようにしてください。
          </p>
        </>
      ) : (
        /* Token not set */
        <div className="glass rounded-2xl shadow-soft p-8 flex flex-col items-center space-y-3 w-full max-w-xs text-center">
          <div className="w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-brand">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
          </div>
          <p className="font-mincho text-base font-bold text-ink">QRコード未設定</p>
          <p className="text-sm text-ink-tertiary">
            {user
              ? '打刻用トークンが設定されていません。管理者にお問い合わせください。'
              : 'ログインしてください。'}
          </p>
        </div>
      )}
    </div>
  );
}
