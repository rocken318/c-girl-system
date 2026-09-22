import { useEffect, useState } from 'react';
import { useAuth } from '../../store/AuthContext';
import { fetchMyRequests, createRequest, type RequestRow } from '../../data/requests';

export function RequestsPage() {
  const { user } = useAuth();
  const castId = user?.castData?.id ?? '';
  const storeId = user?.castData?.storeId ?? '';

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState('欠勤届');
  const [formDate, setFormDate] = useState('');
  const [formDetail, setFormDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const load = async () => {
    if (!castId) return;
    setLoading(true);
    try {
      const data = await fetchMyRequests(castId);
      setRequests(data);
    } catch {
      // silent — empty list
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [castId]);

  const handleSubmit = async () => {
    if (!formDate || !formDetail) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await createRequest({ storeId, castId, type: formType, date: formDate, detail: formDetail });
      setShowForm(false);
      setFormDate('');
      setFormDetail('');
      await load();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case 'pending': return { text: '申請中', cls: 'bg-warn-bg text-warn' };
      case 'approved': return { text: '承認済', cls: 'bg-success-bg text-success' };
      case 'rejected': return { text: '却下', cls: 'bg-danger-bg text-danger' };
      default: return { text: s, cls: 'bg-white/50 text-ink-tertiary' };
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mincho text-xl font-bold text-ink">各種申請</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-brand-gradient text-white text-sm px-4 py-2 rounded-xl font-medium hover:shadow-glow transition-all active:scale-95"
        >
          {showForm ? '閉じる' : '＋ 新規申請'}
        </button>
      </div>

      {showForm && (
        <div className="glass rounded-2xl p-4 border border-brand/15 shadow-card space-y-3 animate-fade-in-up">
          <div>
            <label className="text-xs text-ink-secondary font-medium tracking-wide">種類</label>
            <select value={formType} onChange={e => setFormType(e.target.value)}
              className="w-full mt-1 px-3 py-2.5 border border-ink/10 rounded-xl text-sm bg-white focus:outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20 transition-colors">
              <option>欠勤届</option>
              <option>遅刻届</option>
              <option>同伴報告</option>
              <option>シフト変更</option>
              <option>その他</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-ink-secondary font-medium tracking-wide">日付</label>
            <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
              className="w-full mt-1 px-3 py-2.5 border border-ink/10 rounded-xl text-sm bg-white focus:outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-ink-secondary font-medium tracking-wide">詳細</label>
            <textarea value={formDetail} onChange={e => setFormDetail(e.target.value)}
              className="w-full mt-1 px-3 py-2.5 border border-ink/10 rounded-xl text-sm bg-white focus:outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20 transition-colors" rows={3} />
          </div>
          {submitError && <p className="text-xs text-danger">{submitError}</p>}
          <button onClick={handleSubmit} disabled={submitting}
            className="w-full bg-brand-gradient text-white py-2.5 rounded-xl text-sm font-bold hover:shadow-glow transition-all disabled:opacity-60">
            {submitting ? '送信中…' : '送信する'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {loading && <p className="text-center text-ink-tertiary text-sm py-8">読み込み中…</p>}
        {!loading && requests.length === 0 && <p className="text-center text-ink-tertiary text-sm py-8">申請はありません</p>}
        {requests.map(req => {
          const st = statusLabel(req.status);
          return (
            <div key={req.id} className="glass rounded-xl p-3 shadow-soft">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-ink text-sm">{req.type}</span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${st.cls}`}>{st.text}</span>
              </div>
              <p className="text-xs text-ink-tertiary">{req.date} — {req.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
