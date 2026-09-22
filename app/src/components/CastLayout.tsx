import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { CgirlIcon } from './CgirlIcon';
import { DemoBadge } from './DemoBadge';
import { HomeIcon, ChartIcon, CalendarIcon, SettingsIcon, QrCodeIcon } from './Icons';

const tabs = [
  { path: '/cast', label: 'ホーム', Icon: HomeIcon },
  { path: '/cast/sales-trend', label: '売上推移', Icon: ChartIcon },
  { path: '/cast/qr', label: '自分のQR', Icon: QrCodeIcon },
  { path: '/cast/attendance', label: '出勤', Icon: CalendarIcon },
  { path: '/cast/settings', label: '設定', Icon: SettingsIcon },
];

export function CastLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-water-mesh flex flex-col max-w-md mx-auto">
      <DemoBadge />
      {/* Header */}
      <header className="glass shadow-soft sticky top-0 z-40">
        <div className="h-0.5 bg-brand-gradient" />
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <CgirlIcon size={28} onDark={false} />
            <span className="font-mincho font-bold text-brand text-lg">C-girl</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-gradient text-white flex items-center justify-center text-sm font-bold shadow-soft">
              {user?.name?.charAt(0)}
            </div>
            <span className="text-sm font-medium text-ink">{user?.name}</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto pb-24">
        <Outlet />
      </main>

      {/* Floating Bottom Tab Bar */}
      <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[calc(28rem-2rem)] glass rounded-2xl shadow-elevated flex justify-around py-2 z-50">
        {tabs.map(tab => {
          const isActive = location.pathname === tab.path ||
            (tab.path !== '/cast' && location.pathname.startsWith(tab.path));
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center gap-0.5 px-4 py-1.5 text-xs rounded-xl transition-all ${
                isActive
                  ? 'text-brand font-bold scale-105'
                  : 'text-ink-tertiary hover:text-ink-secondary'
              }`}
            >
              {isActive && (
                <div className="absolute -top-0.5 w-6 h-1 bg-brand-gradient rounded-full" />
              )}
              <tab.Icon size={22} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
