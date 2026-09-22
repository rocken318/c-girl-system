import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { DEMO_MODE } from '../config/demo';
import type { Role } from '../store/AuthContext';

const ROLES: { role: Role; label: string; path: string }[] = [
  { role: 'admin', label: '管理者画面', path: '/admin' },
  { role: 'kurofuku', label: '黒服', path: '/kurofuku' },
  { role: 'cast', label: 'キャストページ', path: '/cast' },
  { role: 'terminal', label: '店舗端末', path: '/kiosk' },
];

/**
 * デモ用の役割切替。右下の小さな「DEMO」FABをタップすると役割ピルが開く。
 * ヘッダー/コンテンツに被らず、ラベルは折り返さない（whitespace-nowrap）。
 * 本番では VITE_DEMO_MODE=false で丸ごと非表示。
 */
export function DemoRoleSwitcher() {
  const { loginAsRole } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!DEMO_MODE) return null;

  const go = async (role: Role, path: string) => {
    setOpen(false);
    await loginAsRole(role);
    navigate(path, { replace: true });
  };

  return (
    <div className="fixed bottom-24 right-3 z-[200] flex flex-col items-end gap-2 print:hidden">
      {open && (
        <div className="flex flex-col items-end gap-1.5 animate-fade-in-up">
          <span className="rounded-full bg-ink/80 px-3 py-1 text-[11px] font-medium text-white/90 shadow-elevated backdrop-blur">
            表示を切り替え
          </span>
          {ROLES.map(r => (
            <button
              key={r.role}
              onClick={() => go(r.role, r.path)}
              className="whitespace-nowrap rounded-full border border-ink/10 bg-white/95 px-4 py-2 text-sm font-medium text-ink shadow-elevated backdrop-blur transition-colors hover:bg-brand hover:text-white"
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={() => { setOpen(false); navigate('/'); }}
            className="whitespace-nowrap rounded-full border border-ink/10 bg-white/70 px-4 py-1.5 text-xs font-medium text-ink-secondary shadow-elevated backdrop-blur transition-colors hover:bg-ink/5"
          >
            ↩ トップ（入口）に戻る
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="デモ: 表示を切り替える"
        aria-expanded={open}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-brand px-4 py-2.5 text-xs font-bold text-white shadow-elevated transition-opacity hover:opacity-90"
      >
        <span className="tracking-widest">DEMO</span>
        <span className="font-normal opacity-90">表示切替</span>
        <span className="text-[10px]">{open ? '✕' : '▾'}</span>
      </button>
    </div>
  );
}
