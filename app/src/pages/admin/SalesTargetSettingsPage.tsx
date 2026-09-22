import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../store/AuthContext';
import { supabase } from '../../lib/supabase';
import { periodKey, type PeriodType } from '../../lib/targets';
import { fetchStoreTarget, fetchCastTarget, upsertTarget } from '../../data/targets';

/* ─── shared UI helpers (same style as SettingsPage) ─── */

const inputClass =
  'border border-ink/10 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20 transition-colors';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-ink-secondary">{label}</label>
      {children}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <>
      <p className="font-mincho text-sm font-bold text-ink mb-3">{title}</p>
      <div className="rule-gold mb-3" />
    </>
  );
}

/* ─── Period type labels ─── */

const PERIOD_LABELS: Record<PeriodType, string> = {
  day: '日次',
  month: '月次',
  quarter: '四半期',
  half: '半期',
  year: '年次',
};

/* ─── Cast row type ─── */

interface CastRow {
  id: string;
  source_name: string;
}

/* ─── Store Target Section ─── */

function StoreTargetSection({ storeId }: { storeId: string }) {
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [key, setKey] = useState<string>(() => periodKey(new Date(), 'month'));
  const [amount, setAmount] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Period type 変更時に既定キーを更新
  const handleTypeChange = (t: PeriodType) => {
    setPeriodType(t);
    setKey(periodKey(new Date(), t));
    setStatus('idle');
  };

  // 現在値を取得
  const loadCurrent = useCallback(async () => {
    if (!storeId || !key) return;
    try {
      const val = await fetchStoreTarget(storeId, periodType, key);
      setAmount(val !== null ? String(val) : '');
    } catch {
      // 取得失敗は無視（入力欄を空にする）
      setAmount('');
    }
  }, [storeId, periodType, key]);

  useEffect(() => {
    loadCurrent();
  }, [loadCurrent]);

  const handleSave = async () => {
    const target_amount = Number(amount);
    if (isNaN(target_amount) || amount.trim() === '') {
      alert('金額を入力してください');
      return;
    }
    setSaving(true);
    setStatus('idle');
    try {
      await upsertTarget({
        store_id: storeId,
        scope: 'store',
        cast_id: null,
        period_type: periodType,
        period_key: key,
        target_amount,
      });
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setStatus('error');
      alert(`保存に失敗しました: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="店舗目標" />

      <Field label="期間種別">
        <select
          value={periodType}
          onChange={e => handleTypeChange(e.target.value as PeriodType)}
          className={`${inputClass} w-40`}
        >
          {(Object.keys(PERIOD_LABELS) as PeriodType[]).map(t => (
            <option key={t} value={t}>{PERIOD_LABELS[t]}</option>
          ))}
        </select>
      </Field>

      <Field label="期間キー">
        <input
          type="text"
          value={key}
          onChange={e => { setKey(e.target.value); setStatus('idle'); }}
          placeholder="例: 2026-09"
          className={`${inputClass} w-48`}
        />
        <p className="text-xs text-ink-tertiary mt-1">
          {periodType === 'day' && 'YYYY-MM-DD 形式'}
          {periodType === 'month' && 'YYYY-MM 形式'}
          {periodType === 'quarter' && 'YYYY-Q1〜Q4 形式'}
          {periodType === 'half' && 'YYYY-H1 または YYYY-H2'}
          {periodType === 'year' && 'YYYY 形式'}
        </p>
      </Field>

      <Field label="目標金額（円）">
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={amount}
            onChange={e => { setAmount(e.target.value); setStatus('idle'); }}
            placeholder="例: 3000000"
            className={`${inputClass} w-48`}
            min={0}
          />
          <span className="text-sm text-ink-tertiary">円</span>
        </div>
      </Field>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-gradient text-white px-6 py-2 rounded-xl font-medium hover:shadow-glow transition-all active:scale-95 disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存'}
        </button>
        {status === 'success' && (
          <span className="text-sm text-success bg-success-bg px-3 py-1 rounded-full animate-fade-in font-medium">
            保存しました
          </span>
        )}
        {status === 'error' && (
          <span className="text-sm text-danger text-xs">{errorMsg}</span>
        )}
      </div>
    </div>
  );
}

/* ─── Cast Targets Section ─── */

function CastTargetsSection({ storeId }: { storeId: string }) {
  const thisMonth = periodKey(new Date(), 'month');
  const [casts, setCasts] = useState<CastRow[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [successIds, setSuccessIds] = useState<Set<string>>(new Set());
  const [loadingCasts, setLoadingCasts] = useState(true);

  // アクティブキャスト一覧取得
  useEffect(() => {
    if (!storeId) return;
    setLoadingCasts(true);
    supabase
      .from('casts')
      .select('id, source_name')
      .eq('store_id', storeId)
      .eq('status', 'active')
      .order('source_name')
      .then(({ data, error }) => {
        if (error) {
          console.error('[CastTargets] casts fetch error:', error);
          setCasts([]);
        } else {
          setCasts((data ?? []) as CastRow[]);
        }
        setLoadingCasts(false);
      });
  }, [storeId]);

  // 当月目標値を一括取得
  useEffect(() => {
    if (!storeId || casts.length === 0) return;
    Promise.all(
      casts.map(async c => {
        try {
          const val = await fetchCastTarget(storeId, c.id, 'month', thisMonth);
          return { id: c.id, val };
        } catch {
          return { id: c.id, val: null };
        }
      })
    ).then(results => {
      const map: Record<string, string> = {};
      results.forEach(({ id, val }) => {
        map[id] = val !== null ? String(val) : '';
      });
      setAmounts(map);
    });
  }, [storeId, casts, thisMonth]);

  const showSuccess = (id: string) => {
    setSuccessIds(prev => new Set(prev).add(id));
    setTimeout(() => setSuccessIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    }), 2500);
  };

  const saveCast = async (castId: string) => {
    const target_amount = Number(amounts[castId] ?? '');
    if (isNaN(target_amount) || (amounts[castId] ?? '').trim() === '') {
      alert('金額を入力してください');
      return;
    }
    setSavingId(castId);
    try {
      await upsertTarget({
        store_id: storeId,
        scope: 'cast',
        cast_id: castId,
        period_type: 'month',
        period_key: thisMonth,
        target_amount,
      });
      showSuccess(castId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`保存に失敗しました: ${msg}`);
    } finally {
      setSavingId(null);
    }
  };

  const saveAll = async () => {
    const targets = casts.filter(c => {
      const v = amounts[c.id] ?? '';
      return v.trim() !== '';
    });
    if (targets.length === 0) {
      alert('金額が入力されているキャストがいません');
      return;
    }
    setSavingAll(true);
    const errors: string[] = [];
    for (const c of targets) {
      const target_amount = Number(amounts[c.id]);
      if (isNaN(target_amount)) continue;
      try {
        await upsertTarget({
          store_id: storeId,
          scope: 'cast',
          cast_id: c.id,
          period_type: 'month',
          period_key: thisMonth,
          target_amount,
        });
        showSuccess(c.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${c.source_name}: ${msg}`);
      }
    }
    setSavingAll(false);
    if (errors.length > 0) {
      alert(`一部の保存に失敗しました:\n${errors.join('\n')}`);
    }
  };

  if (loadingCasts) {
    return (
      <div className="space-y-4">
        <SectionHeader title={`キャスト個人目標（${thisMonth}）`} />
        <p className="text-sm text-ink-tertiary">読み込み中…</p>
      </div>
    );
  }

  if (casts.length === 0) {
    return (
      <div className="space-y-4">
        <SectionHeader title={`キャスト個人目標（${thisMonth}）`} />
        <p className="text-sm text-ink-tertiary">アクティブなキャストがいません</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader title={`キャスト個人目標（${thisMonth}）`} />

      <div className="space-y-3">
        {casts.map(c => (
          <div key={c.id} className="flex items-center gap-3 flex-wrap">
            <span className="text-sm w-28 text-ink font-medium truncate">{c.source_name}</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={amounts[c.id] ?? ''}
                onChange={e => setAmounts(prev => ({ ...prev, [c.id]: e.target.value }))}
                placeholder="目標金額"
                className={`${inputClass} w-40`}
                min={0}
              />
              <span className="text-sm text-ink-tertiary">円</span>
            </div>
            <button
              onClick={() => saveCast(c.id)}
              disabled={savingId === c.id || savingAll}
              className="text-xs bg-surface-card border border-ink/10 rounded-lg px-3 py-1.5 text-brand hover:bg-brand/5 transition-colors disabled:opacity-40"
            >
              {savingId === c.id ? '保存中…' : '保存'}
            </button>
            {successIds.has(c.id) && (
              <span className="text-xs text-success animate-fade-in">✓</span>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={saveAll}
        disabled={savingAll || savingId !== null}
        className="bg-brand-gradient text-white px-6 py-2 rounded-xl font-medium hover:shadow-glow transition-all active:scale-95 disabled:opacity-50"
      >
        {savingAll ? '一括保存中…' : '一括保存'}
      </button>
    </div>
  );
}

/* ─── Main Page ─── */

export function SalesTargetSettingsPage() {
  const { user } = useAuth();
  const storeId = user?.activeStoreId ?? '';
  const disabled = !storeId;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mincho text-xl md:text-2xl font-bold text-ink">売上目標</h1>
      </div>

      <p className="text-sm text-ink-tertiary">
        店舗全体・キャスト個人の売上目標を設定します。設定した目標はダッシュボードの達成率に反映されます。
      </p>

      {disabled ? (
        <div className="bg-surface-card rounded-2xl shadow-card p-6">
          <p className="text-sm text-ink-secondary">店舗を選択してください</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 店舗目標 */}
          <div className="bg-surface-card rounded-2xl shadow-card p-6">
            <StoreTargetSection storeId={storeId} />
          </div>

          {/* キャスト個人目標 */}
          <div className="bg-surface-card rounded-2xl shadow-card p-6">
            <CastTargetsSection storeId={storeId} />
          </div>
        </div>
      )}
    </div>
  );
}
