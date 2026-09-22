import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/AuthContext';
import { parsePunchPayload } from '../data/qr';
import { QrScanner } from '../components/QrScanner';

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

interface PunchResult {
  person_name: string;
  action: 'in' | 'out';
  at: string; // ISO 8601 timestamptz
}

type ScreenState =
  | { kind: 'scanning' }
  | { kind: 'processing' }
  | { kind: 'success'; result: PunchResult }
  | { kind: 'error'; message: string };

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

/** ISO timestamptz → JST HH:mm */
export function formatJstHHmm(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return '--:--';
  }
}

/** RPC エラーメッセージ（英語）を日本語に変換 */
export function translatePunchError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('invalid token') || lower.includes('not found')) {
    return '無効なQRコードです。正しいQRコードをかざしてください。';
  }
  if (lower.includes('cross-store') || lower.includes('cross store') || lower.includes('store')) {
    return '別の店舗のQRコードは使用できません。';
  }
  if (lower.includes('not authorized') || lower.includes('unauthorized') || lower.includes('forbidden')) {
    return '打刻の権限がありません。端末アカウントでログインしてください。';
  }
  if (lower.includes('inactive') || lower.includes('retired') || lower.includes('withdrawn')) {
    return 'このアカウントは無効化されています。管理者にお問い合わせください。';
  }
  return `打刻に失敗しました: ${msg}`;
}

// ──────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────

const AUTO_RETURN_MS = 3000;
const COOLDOWN_MS = 4000;

export function KioskPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [screen, setScreen] = useState<ScreenState>({ kind: 'scanning' });
  const processingRef = useRef(false);
  const cooldownUntilRef = useRef<number>(0);

  // 3秒後に自動復帰
  useEffect(() => {
    if (screen.kind !== 'success' && screen.kind !== 'error') return;
    const id = setTimeout(() => setScreen({ kind: 'scanning' }), AUTO_RETURN_MS);
    return () => clearTimeout(id);
  }, [screen]);

  const handleScanResult = useCallback(async (scanned: string) => {
    // 処理中 or クールダウン中は無視
    if (processingRef.current) return;
    if (Date.now() < cooldownUntilRef.current) return;

    const token = parsePunchPayload(scanned);
    if (!token) return; // 無関係なQRコード

    processingRef.current = true;
    setScreen({ kind: 'processing' });

    try {
      const { data, error } = await supabase.rpc('punch', { p_token: token });

      if (error) {
        setScreen({ kind: 'error', message: translatePunchError(error.message) });
      } else if (!data || (Array.isArray(data) && data.length === 0)) {
        setScreen({ kind: 'error', message: '打刻結果が返されませんでした。もう一度お試しください。' });
      } else {
        const row: PunchResult = Array.isArray(data) ? data[0] : data;
        setScreen({ kind: 'success', result: row });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setScreen({ kind: 'error', message: translatePunchError(msg) });
    } finally {
      processingRef.current = false;
      cooldownUntilRef.current = Date.now() + COOLDOWN_MS;
    }
  }, []);

  // ── セッション確認中 ──
  if (loading) {
    return (
      <div className="fixed inset-0 bg-surface-dark flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-gold/40 border-t-gold rounded-full animate-spin" />
      </div>
    );
  }

  // ── 未ログイン ──
  if (!user) {
    return (
      <div className="fixed inset-0 bg-dark-gradient flex flex-col items-center justify-center p-6 space-y-6 text-center">
        <div className="w-16 h-16 rounded-full bg-brand/20 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-brand">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div className="space-y-2">
          <p className="font-mincho text-xl font-bold text-white">ログインが必要です</p>
          <p className="text-sm text-white/60">端末アカウント（terminal）でログインしてください。</p>
        </div>
        <button
          onClick={() => navigate('/login')}
          className="px-6 py-3 bg-brand text-white rounded-xl font-medium hover:bg-brand-dark transition-colors"
        >
          ログインへ
        </button>
      </div>
    );
  }

  // ── terminal/admin 以外 ──
  const isAuthorized = user.role === 'terminal' || user.role === 'admin';

  if (!isAuthorized) {
    return (
      <div className="fixed inset-0 bg-dark-gradient flex flex-col items-center justify-center p-6 space-y-6 text-center">
        <div className="w-16 h-16 rounded-full bg-warn/20 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-warn">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div className="space-y-2">
          <p className="font-mincho text-xl font-bold text-white">アクセス権限がありません</p>
          <p className="text-sm text-white/60">
            このページは端末アカウント（terminal）または管理者専用です。<br />
            現在のアカウント: {user.name}（{user.role}）
          </p>
        </div>
        <button
          onClick={() => navigate('/login')}
          className="px-6 py-3 bg-warn text-white rounded-xl font-medium hover:bg-warn/80 transition-colors"
        >
          別のアカウントでログイン
        </button>
      </div>
    );
  }

  const isScanning = screen.kind === 'scanning';
  const isProcessing = screen.kind === 'processing';

  return (
    <div className="fixed inset-0 bg-dark-gradient flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between px-5 pt-safe pt-4">
        <div className="flex items-center space-x-2">
          <div className="h-0.5 w-8 bg-brand-gradient rounded-full" />
          <span className="font-mincho text-sm font-bold text-white/80 tracking-widest">C-girl 打刻端末</span>
          <div className="h-0.5 w-8 bg-brand-gradient rounded-full" />
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-white/40 hover:text-white/70 transition-colors text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20"
        >
          戻る
        </button>
      </div>

      {/* Main content area */}
      <div className="flex flex-col items-center space-y-6 w-full max-w-sm mt-16">

        {/* Result / Feedback area */}
        {(screen.kind === 'success' || screen.kind === 'error') && (
          <div
            className={`w-full rounded-2xl p-6 text-center space-y-2 animate-fade-in-up ${
              screen.kind === 'success'
                ? 'bg-success/15 border border-success/30'
                : 'bg-danger/15 border border-danger/30'
            }`}
          >
            {screen.kind === 'success' ? (
              <>
                <div className="flex justify-center mb-2">
                  <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                </div>
                <p className="font-mincho text-2xl font-bold text-white">
                  {screen.result.person_name} さん
                </p>
                <p className={`text-3xl font-bold ${screen.result.action === 'in' ? 'text-success' : 'text-brand-light'}`}>
                  {screen.result.action === 'in' ? '出勤' : '退勤'}
                </p>
                <p className="text-white/60 text-lg font-medium">
                  {formatJstHHmm(screen.result.at)}
                </p>
              </>
            ) : (
              <>
                <div className="flex justify-center mb-2">
                  <div className="w-12 h-12 rounded-full bg-danger/20 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  </div>
                </div>
                <p className="text-danger font-medium text-base leading-relaxed">{screen.message}</p>
              </>
            )}

            {/* Auto-return progress */}
            <p className="text-white/30 text-xs pt-1">3秒後に自動で戻ります</p>
          </div>
        )}

        {/* Scanner */}
        <QrScanner
          onResult={handleScanResult}
          paused={!isScanning || isProcessing}
        />

        {/* Prompt text */}
        <div className="text-center space-y-1">
          {isScanning ? (
            <>
              <p className="text-white font-medium text-base">QRコードをかざしてください</p>
              <p className="text-white/40 text-xs">出退勤を自動記録します</p>
            </>
          ) : isProcessing ? (
            <p className="text-white/60 text-sm">記録中…</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

