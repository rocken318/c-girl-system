import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../store/AuthContext';
import {
  fetchStoreTimeRecords,
  toJstHHmm,
  formatWorked,
  type StoreTimeRecord,
} from '../../data/timeRecords';

// ─── helpers ─────────────────────────────────────────────────────────────────

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthOptions(): string[] {
  const options: string[] = [];
  const now = new Date();
  for (let i = 2; i >= -1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    );
  }
  return options;
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${Number(m)}月`;
}

/** UTC timestamptz → JST の datetime-local 入力値 (YYYY-MM-DDTHH:mm) */
function toJstDatetimeLocal(utc: string | null): string {
  if (!utc) return '';
  const d = new Date(utc);
  const jstMs = d.getTime() + 9 * 3600_000;
  const jst = new Date(jstMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}` +
    `T${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}`
  );
}

/** JST datetime-local 値 → UTC ISO 文字列 (timestamptz) */
function jstDatetimeLocalToUtc(local: string): string {
  // local は "YYYY-MM-DDTHH:mm" (JST)
  const jstMs = new Date(local + ':00+09:00').getTime();
  return new Date(jstMs).toISOString();
}

// ─── 補正モーダル ──────────────────────────────────────────────────────────────

interface EditModalProps {
  record: StoreTimeRecord;
  onClose: () => void;
  onSaved: () => void;
  actorUserId: string;
}

function EditModal({ record, onClose, onSaved, actorUserId }: EditModalProps) {
  const [clockIn, setClockIn] = useState(toJstDatetimeLocal(record.clock_in_at));
  const [clockOut, setClockOut] = useState(toJstDatetimeLocal(record.clock_out_at));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName =
    record.profiles?.display_name ?? record.person_id.slice(0, 8);

  const handleSave = async () => {
    if (!clockIn) {
      setError('出勤時刻は必須です');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const newClockIn = jstDatetimeLocalToUtc(clockIn);
      const newClockOut = clockOut ? jstDatetimeLocalToUtc(clockOut) : null;

      // (a) time_records を update
      const { error: updateError } = await supabase
        .from('time_records')
        .update({
          clock_in_at: newClockIn,
          clock_out_at: newClockOut,
          source: 'manual',
          updated_by: actorUserId,
        })
        .eq('id', record.id);

      if (updateError) throw updateError;

      // (b) audit_logs に記録（record.store_id を直接使用 — 追加SELECTは不要）
      const { error: auditError } = await supabase.from('audit_logs').insert({
        actor_user_id: actorUserId,
        action: 'time_record_correction',
        target: record.id,
        before: {
          clock_in_at: record.clock_in_at,
          clock_out_at: record.clock_out_at,
        },
        after: {
          clock_in_at: newClockIn,
          clock_out_at: newClockOut,
        },
        store_id: record.store_id,
      });

      if (auditError) {
        // audit エラーは警告に留める（本体は更新済み）
        console.warn('[AttendanceAdmin] audit_log insert error:', auditError);
      }

      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface-card rounded-2xl shadow-float w-full max-w-sm p-6 space-y-5">
        <div>
          <h2 className="font-mincho text-lg font-bold text-ink">勤怠補正</h2>
          <p className="text-xs text-ink-tertiary mt-0.5">
            {displayName} / {record.business_date}
          </p>
        </div>

        <div className="rule-gold" />

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-ink-secondary mb-1">
              出勤 (JST)
            </label>
            <input
              type="datetime-local"
              value={clockIn}
              onChange={e => setClockIn(e.target.value)}
              className="w-full bg-surface-base border border-ink/10 rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-secondary mb-1">
              退勤 (JST)
            </label>
            <input
              type="datetime-local"
              value={clockOut}
              onChange={e => setClockOut(e.target.value)}
              className="w-full bg-surface-base border border-ink/10 rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
            <p className="text-[11px] text-ink-tertiary mt-1">空欄 = 勤務中</p>
          </div>
        </div>

        {error && (
          <p className="text-xs text-rose-500 bg-rose-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 border border-ink/15 text-ink-secondary rounded-xl py-2 text-sm hover:bg-ink/5 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-brand-gradient text-white rounded-xl py-2 text-sm font-medium hover:shadow-glow transition-all active:scale-95 disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────────────────────────────

export function AttendanceAdminPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(getCurrentMonth());
  const [records, setRecords] = useState<StoreTimeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<StoreTimeRecord | null>(null);

  const monthOptions = getMonthOptions();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStoreTimeRecords(month);
      setRecords(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'データ取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaved = () => {
    setEditTarget(null);
    load();
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-mincho text-xl md:text-2xl font-bold text-ink">
          勤怠管理
        </h1>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-ink-tertiary hover:text-ink-secondary transition-colors border border-ink/10 px-3 py-1.5 rounded-lg"
        >
          {loading ? '読込中…' : '更新'}
        </button>
      </div>

      <Link
        to="/admin/attendance-board"
        className="glass rounded-xl px-4 py-2 text-sm text-brand font-medium inline-block shadow-soft"
      >
        シフト / 出欠ボードを開く →
      </Link>

      {/* Month selector */}
      <div className="flex gap-1 bg-ink/5 p-1 rounded-xl overflow-x-auto">
        {monthOptions.map(m => (
          <button
            key={m}
            onClick={() => setMonth(m)}
            className={`px-4 py-2 text-sm rounded-lg whitespace-nowrap transition-all ${
              month === m
                ? 'bg-surface-card text-brand font-bold shadow-soft'
                : 'text-ink-tertiary hover:text-ink-secondary'
            }`}
          >
            {formatMonthLabel(m)}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-surface-card rounded-2xl shadow-card overflow-hidden">
        <div className="p-5 flex items-center justify-between border-b border-ink/5">
          <p className="font-mincho text-sm font-bold text-ink">
            勤怠一覧
          </p>
          <span className="text-xs text-ink-tertiary">{records.length} 件</span>
        </div>

        {loading ? (
          <div className="p-10 text-center text-ink-tertiary text-sm">
            読み込み中…
          </div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center text-ink-tertiary text-sm">
            {formatMonthLabel(month)} のデータはありません
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left bg-ink/3">
                  <th className="px-5 py-3 text-xs text-ink-secondary font-medium">
                    氏名
                  </th>
                  <th className="px-4 py-3 text-xs text-ink-secondary font-medium">
                    営業日
                  </th>
                  <th className="px-4 py-3 text-xs text-ink-secondary font-medium">
                    出勤
                  </th>
                  <th className="px-4 py-3 text-xs text-ink-secondary font-medium">
                    退勤
                  </th>
                  <th className="px-4 py-3 text-xs text-ink-secondary font-medium">
                    勤務時間
                  </th>
                  <th className="px-4 py-3 text-xs text-ink-secondary font-medium">
                    種別
                  </th>
                  <th className="px-4 py-3 text-xs text-ink-secondary font-medium">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {records.map(rec => (
                  <tr
                    key={rec.id}
                    className="hover:bg-ink/2 transition-colors"
                  >
                    <td className="px-5 py-3 font-medium text-ink">
                      {rec.profiles?.display_name ?? (
                        <span className="text-ink-tertiary text-xs">
                          {rec.person_id.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">
                      {rec.business_date}
                    </td>
                    <td className="px-4 py-3 text-ink font-mono">
                      {rec.clock_in_at ? toJstHHmm(rec.clock_in_at) : '—'}
                    </td>
                    <td className="px-4 py-3 text-ink font-mono">
                      {rec.clock_out_at ? toJstHHmm(rec.clock_out_at) : '—'}
                    </td>
                    <td className="px-4 py-3 text-ink-secondary text-xs">
                      {formatWorked(rec.worked_minutes)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          rec.source === 'manual'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {rec.source === 'manual' ? '手動' : 'QR'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditTarget(rec)}
                        className="text-xs text-brand hover:text-brand-dark transition-colors border border-brand/30 px-2 py-0.5 rounded-lg"
                      >
                        補正
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editTarget && user && (
        <EditModal
          record={editTarget}
          actorUserId={user.id}
          onClose={() => setEditTarget(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
