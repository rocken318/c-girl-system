import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { SettingsProvider } from './store/SettingsContext';
import { AuthProvider, useAuth } from './store/AuthContext';
import { PerformanceProvider } from './store/PerformanceContext';
import { PayrollSnapshotProvider } from './store/PayrollSnapshotContext';
import { ShiftProvider } from './store/ShiftContext';
import { LoginPage } from './pages/LoginPage';
import { DemoBadge } from './components/DemoBadge';
import { CastLayout } from './components/CastLayout';
import { AdminLayout } from './components/AdminLayout';
import { MyPage } from './pages/cast/MyPage';
import { PayrollPage } from './pages/cast/PayrollPage';
import { AttendancePage } from './pages/cast/AttendancePage';
import { RankingPage } from './pages/cast/RankingPage';
import { RequestsPage } from './pages/cast/RequestsPage';
import { CastSettingsPage } from './pages/cast/CastSettingsPage';
import { ShiftSubmitPage } from './pages/cast/ShiftSubmitPage';
import { ShiftViewPage } from './pages/cast/ShiftViewPage';
import { CastSalesTrendPage } from './pages/cast/CastSalesTrendPage';
import { DashboardPage } from './pages/admin/DashboardPage';
import { CastManagementPage } from './pages/admin/CastManagementPage';
import { CastDetailPage } from './pages/admin/CastDetailPage';
import { RequestManagementPage } from './pages/admin/RequestManagementPage';
import { RankingManagementPage } from './pages/admin/RankingManagementPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { PerformanceEntryPage } from './pages/admin/PerformanceEntryPage';
import { ImportPage } from './pages/admin/ImportPage';
import { PayrollConfirmPage } from './pages/admin/PayrollConfirmPage';
import { PayrollHistoryPage } from './pages/cast/PayrollHistoryPage';
import { ShiftManagementPage } from './pages/admin/ShiftManagementPage';
import { AttendanceAdminPage } from './pages/admin/AttendanceAdminPage';
import { ShiftAttendanceBoardPage } from './pages/admin/ShiftAttendanceBoardPage';
import { SalesTargetSettingsPage } from './pages/admin/SalesTargetSettingsPage';
import { MyQrPage } from './pages/cast/MyQrPage';
import { KioskPage } from './pages/KioskPage';
import { DemoTopPage } from './pages/DemoTopPage';
import { KurofukuLayout } from './components/KurofukuLayout';
import { KurofukuAttendancePage } from './pages/kurofuku/KurofukuAttendancePage';
import { KurofukuCastsPage } from './pages/kurofuku/KurofukuCastsPage';
import { KurofukuShiftBoardPage } from './pages/kurofuku/KurofukuShiftBoardPage';
import type { Role } from './store/AuthContext';
import { DEMO_MODE } from './config/demo';
import { DemoRoleSwitcher } from './components/DemoRoleSwitcher';

/** ルート `/` 用: 未ログインなら admin 自動ログイン → /admin へ遷移。
 *  ログイン済みならロール別ホームへ即リダイレクト。 */
function AutoEnter() {
  const { user, loading, loginAsRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return; // セッション復元中は待つ

    if (user) {
      // 既にログイン済み → ロール別ホームへ
      const dest: Record<Role, string> = {
        admin: '/admin',
        cast: '/cast',
        kurofuku: '/kurofuku',
        terminal: '/kiosk',
      };
      navigate(dest[user.role] ?? '/admin', { replace: true });
    } else if (DEMO_MODE) {
      // デモ: 未ログインは admin 自動入場
      loginAsRole('admin').then(() => {
        navigate('/admin', { replace: true });
      });
    } else {
      // 本番: ログイン画面へ
      navigate('/login', { replace: true });
    }
  }, [loading, user, loginAsRole, navigate]);

  return (
    <div className="min-h-screen bg-dark-gradient flex items-center justify-center">
      <p className="text-white/60 font-mincho text-sm tracking-widest animate-pulse">読み込み中…</p>
    </div>
  );
}

function RequireAuth({ role, children }: { role: Role; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null; // セッション復元中は描画を保留
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** キオスク用ガード: ログイン済みであれば role 問わず通す（KioskPage 内部で権限チェック） */
function RequireAuthAny({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <>
      <DemoRoleSwitcher />
      <DemoBadge />
      <Routes>
        <Route path="/" element={DEMO_MODE ? <DemoTopPage /> : <AutoEnter />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Kiosk — フルスクリーン端末打刻 (DemoBadge は上に重なるが pointer-events-none なので干渉なし) */}
        <Route
          path="/kiosk"
          element={
            <RequireAuthAny>
              <KioskPage />
            </RequireAuthAny>
          }
        />

      {/* Cast routes */}
      <Route
        path="/cast"
        element={
          <RequireAuth role="cast">
            <CastLayout />
          </RequireAuth>
        }
      >
        <Route index element={<MyPage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="ranking" element={<RankingPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="settings" element={<CastSettingsPage />} />
        <Route path="payroll-history" element={<PayrollHistoryPage />} />
        <Route path="shift-submit" element={<ShiftSubmitPage />} />
        <Route path="shift-view" element={<ShiftViewPage />} />
        <Route path="sales-trend" element={<CastSalesTrendPage />} />
        <Route path="qr" element={<MyQrPage />} />
      </Route>

      {/* Kurofuku routes */}
      <Route
        path="/kurofuku"
        element={
          <RequireAuth role="kurofuku">
            <KurofukuLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/kurofuku/casts" replace />} />
        <Route path="casts" element={<KurofukuCastsPage />} />
        <Route path="board" element={<KurofukuShiftBoardPage />} />
        <Route path="attendance" element={<KurofukuAttendancePage />} />
        <Route path="qr" element={<MyQrPage />} />
      </Route>

      {/* Admin routes */}
      <Route
        path="/admin"
        element={
          <RequireAuth role="admin">
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="casts" element={<CastManagementPage />} />
        <Route path="cast-view" element={<CastDetailPage />} />
        <Route path="performance" element={<PerformanceEntryPage />} />
        <Route path="requests" element={<RequestManagementPage />} />
        <Route path="ranking" element={<RankingManagementPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="payroll-confirm" element={<PayrollConfirmPage />} />
        <Route path="shifts" element={<ShiftManagementPage />} />
        <Route path="attendance" element={<AttendanceAdminPage />} />
        <Route path="attendance-board" element={<ShiftAttendanceBoardPage />} />
        <Route path="sales-targets" element={<SalesTargetSettingsPage />} />
      </Route>
    </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <PerformanceProvider>
          <PayrollSnapshotProvider>
            <ShiftProvider>
              <AuthProvider>
                <AppRoutes />
              </AuthProvider>
            </ShiftProvider>
          </PayrollSnapshotProvider>
        </PerformanceProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}
