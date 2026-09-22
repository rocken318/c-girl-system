import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { KingyoIcon } from './KingyoIcon';
import { DemoBadge } from './DemoBadge';
import { StoreSwitcher } from './StoreSwitcher';
import { ChartIcon, UsersIcon, EditIcon, ClipboardIcon, TrophyIcon, SettingsIcon, LogoutIcon, UploadIcon, CheckCircleIcon, CalendarCheckIcon, ClockIcon, TargetIcon, StarIcon } from './Icons';

const menuItems = [
  { path: '/admin', label: 'ダッシュボード', Icon: ChartIcon },
  { path: '/admin/casts', label: 'キャスト管理', Icon: UsersIcon },
  { path: '/admin/cast-view', label: 'キャスト別ビュー', Icon: StarIcon },
  { path: '/admin/performance', label: '実績入力', Icon: EditIcon },
  { path: '/admin/requests', label: '申請管理', Icon: ClipboardIcon },
  { path: '/admin/ranking', label: 'ランキング', Icon: TrophyIcon },
  { path: '/admin/shifts', label: 'シフト管理', Icon: CalendarCheckIcon },
  { path: '/admin/attendance-board', label: 'シフト/出欠ボード', Icon: ClipboardIcon },
  { path: '/admin/attendance', label: '勤怠', Icon: ClockIcon },
  { path: '/admin/payroll-confirm', label: '給与確定', Icon: CheckCircleIcon },
  { path: '/admin/sales-targets', label: '売上目標', Icon: TargetIcon },
  { path: '/admin/settings', label: '設定', Icon: SettingsIcon },
  { path: '/admin/import', label: 'CSVインポート', Icon: UploadIcon },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleNav = (path: string) => {
    navigate(path);
    setDrawerOpen(false);
  };

  const SidebarContent = () => (
    <>
      <div className="p-5 flex items-center gap-3">
        <KingyoIcon size={36} />
        <div>
          <div className="text-gold-gradient font-mincho font-bold text-lg leading-tight">Kingyo</div>
          <div className="text-xs text-white/30">管理画面</div>
        </div>
      </div>
      <div className="px-4 pb-3">
        <StoreSwitcher />
      </div>

      <div className="rule-gold mx-4" />

      <nav className="flex-1 py-4 space-y-0.5">
        {menuItems.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => handleNav(item.path)}
              className={`w-full flex items-center gap-3 px-5 py-3 text-sm transition-all text-left ${
                isActive
                  ? 'text-brand-light font-bold border-l-3 border-gold bg-white/5'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/3'
              }`}
            >
              <item.Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="rule-gold mx-4" />

      <div className="p-4">
        <button
          onClick={() => { logout(); navigate('/'); }}
          className="w-full flex items-center justify-center gap-2 text-sm text-white/30 hover:text-brand-light py-2 transition-colors"
        >
          <LogoutIcon size={16} />
          ログアウト
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-surface-base">
      <DemoBadge />

      {/* Desktop layout */}
      <div className="hidden md:flex min-h-screen">
        {/* Sidebar - desktop */}
        <aside className="w-60 bg-surface-sidebar flex flex-col shrink-0">
          <SidebarContent />
        </aside>

        {/* Main - desktop */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile layout */}
      <div className="md:hidden min-h-screen flex flex-col">
        {/* Mobile top bar */}
        <header className="bg-surface-sidebar flex items-center justify-between px-4 py-3 shrink-0">
          <div className="flex items-center gap-3">
            <KingyoIcon size={28} />
            <div className="text-gold-gradient font-mincho font-bold text-base leading-tight">Kingyo</div>
          </div>
          <div className="flex items-center gap-2">
            <StoreSwitcher />
            <button
              onClick={() => setDrawerOpen(true)}
              className="text-white/60 hover:text-white transition-colors p-2"
              aria-label="メニューを開く"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <rect y="3" width="20" height="2" rx="1" />
                <rect y="9" width="20" height="2" rx="1" />
                <rect y="15" width="20" height="2" rx="1" />
              </svg>
            </button>
          </div>
        </header>

        {/* Mobile main content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Drawer */}
          <aside className="relative w-60 bg-surface-sidebar flex flex-col shrink-0 shadow-float">
            <div className="flex items-center justify-between px-5 pt-5 pb-0">
              <div />
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-white/40 hover:text-white transition-colors text-xl leading-none"
                aria-label="メニューを閉じる"
              >
                &times;
              </button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}
    </div>
  );
}
