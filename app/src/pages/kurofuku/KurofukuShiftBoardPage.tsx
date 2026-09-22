import { useAuth } from '../../store/AuthContext';
import { ShiftAttendanceBoard } from '../../components/ShiftAttendanceBoard';

export function KurofukuShiftBoardPage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="space-y-2">
      <div className="px-4 pt-4">
        <h2 className="font-mincho text-xl font-bold text-ink">シフト / 出欠</h2>
        <p className="text-xs text-ink-tertiary mt-0.5">所属店の全キャスト</p>
      </div>
      <ShiftAttendanceBoard storeId={user.storeId} canEdit currentUserId={user.id} />
    </div>
  );
}
