import { useEffect, useState } from 'react';
import { useAuth } from '../../store/AuthContext';
import { fetchStoreRequests, updateRequestStatus, type RequestRow } from '../../data/requests';

export function RequestManagementPage() {
  const { user } = useAuth();
  const storeId = user?.activeStoreId ?? '';

  const [requests, setRequests] = useState<RequestRow[]>([]);

  const load = async () => {
    if (!storeId) return;
    try {
      const data = await fetchStoreRequests(storeId);
      setRequests(data);
    } catch {
      // silent — empty list
    }
  };

  useEffect(() => { void load(); }, [storeId]);

  const handleAction = async (id: string, action: 'approved' | 'rejected') => {
    try {
      await updateRequestStatus(id, action);
      await load();
    } catch {
      // silent
    }
  };

  const pending = requests.filter(r => r.status === 'pending');
  const processed = requests.filter(r => r.status !== 'pending');

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <h1 className="font-mincho text-xl md:text-2xl font-bold text-ink">申請管理</h1>

      {/* Pending */}
      <div>
        <h2 className="font-mincho text-lg font-bold text-ink mb-3">未承認（{pending.length}件）</h2>
        {pending.length === 0 && <p className="text-sm text-ink-tertiary">未承認の申請はありません</p>}
        <div className="space-y-3">
          {pending.map(req => (
            <div key={req.id} className="bg-surface-card rounded-2xl p-4 border border-warn/20 shadow-card flex items-start justify-between animate-fade-in-up">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-sm text-ink">{req.castName}</span>
                  <span className="bg-warn-bg text-warn text-xs px-2.5 py-0.5 rounded-full font-medium">{req.type}</span>
                </div>
                <p className="text-sm text-ink-secondary">{req.detail}</p>
                <p className="text-xs text-ink-tertiary mt-1">{req.date} | 申請日: {req.createdAt}</p>
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <button
                  onClick={() => handleAction(req.id, 'approved')}
                  className="bg-success text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:opacity-90 transition-opacity active:scale-95"
                >承認</button>
                <button
                  onClick={() => handleAction(req.id, 'rejected')}
                  className="bg-danger text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:opacity-90 transition-opacity active:scale-95"
                >却下</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Processed */}
      {processed.length > 0 && (
        <div>
          <h2 className="font-mincho text-lg font-bold text-ink mb-3">処理済み</h2>
          <div className="space-y-2">
            {processed.map(req => (
              <div key={req.id} className="bg-surface-card rounded-xl p-3 shadow-soft flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm text-ink mr-2">{req.castName}</span>
                  <span className="text-xs text-ink-tertiary">{req.type} - {req.date}</span>
                </div>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  req.status === 'approved' ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
                }`}>
                  {req.status === 'approved' ? '承認済' : '却下'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
