import { useState, useEffect } from 'react';
import { useSettings } from '../../store/SettingsContext';
import { useAuth } from '../../store/AuthContext';
import { fetchStoreCasts, type StoreCast } from '../../data/attendance';
import type {
  Settings,
  BackPriceSetting,
  FixedDeductionItem,
  RankingPointDef,
  SlideTier,
} from '../../store/settings';
import { SHOW_SALES_BACK, SHOW_COMMISSION } from '../../config/featureFlags';

type Tab = 'hourly' | 'backs' | 'commission' | 'deductions' | 'store' | 'ranking' | 'shift';

const allTabs: { key: Tab; label: string; hidden?: boolean }[] = [
  { key: 'hourly', label: '時給' },
  { key: 'backs', label: 'バック単価', hidden: !SHOW_SALES_BACK },
  { key: 'commission', label: '歩合', hidden: !SHOW_COMMISSION },
  { key: 'deductions', label: '控除' },
  { key: 'store', label: '店舗' },
  { key: 'ranking', label: 'ランキング' },
  { key: 'shift', label: 'シフト' },
];

const tabs = allTabs.filter(t => !t.hidden);

export function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<Tab>('hourly');
  const [saved, setSaved] = useState(false);

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mincho text-xl md:text-2xl font-bold text-ink">設定</h1>
        {saved && (
          <span className="text-sm text-success bg-success-bg px-3 py-1 rounded-full animate-fade-in font-medium">
            保存しました
          </span>
        )}
      </div>

      <p className="text-sm text-ink-tertiary">
        ここで変更した値は給与計算・ランキングに即時反映されます。
      </p>

      {/* Tab bar — pill style */}
      <div className="flex flex-nowrap gap-1 bg-ink/5 p-1 rounded-xl overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm rounded-lg whitespace-nowrap transition-all flex-shrink-0 ${
              activeTab === t.key
                ? 'bg-surface-card text-brand font-bold shadow-soft'
                : 'text-ink-tertiary hover:text-ink-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-surface-card rounded-2xl shadow-card p-6">
        {activeTab === 'hourly' && (
          <HourlyTab settings={settings} onChange={updateSettings} onSave={showSaved} />
        )}
        {activeTab === 'backs' && (
          <BacksTab settings={settings} onChange={updateSettings} onSave={showSaved} />
        )}
        {activeTab === 'commission' && (
          <CommissionTab settings={settings} onChange={updateSettings} onSave={showSaved} />
        )}
        {activeTab === 'deductions' && (
          <DeductionsTab settings={settings} onChange={updateSettings} onSave={showSaved} />
        )}
        {activeTab === 'store' && (
          <StoreTab settings={settings} onChange={updateSettings} onSave={showSaved} />
        )}
        {activeTab === 'ranking' && (
          <RankingTab settings={settings} onChange={updateSettings} onSave={showSaved} />
        )}
        {activeTab === 'shift' && (
          <ShiftTab settings={settings} onChange={updateSettings} onSave={showSaved} />
        )}
      </div>
    </div>
  );
}

/* ─── shared helpers ─── */

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

function SaveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-brand-gradient text-white px-6 py-2 rounded-xl font-medium hover:shadow-glow transition-all active:scale-95"
    >
      保存
    </button>
  );
}

const inputClass = 'border border-ink/10 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20 transition-colors';

function NumberInput({
  value,
  onChange,
  suffix,
  className = '',
}: {
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  className?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className={`${inputClass} ${className}`}
      />
      {suffix && <span className="text-sm text-ink-tertiary">{suffix}</span>}
    </div>
  );
}

/* ─── Tab: 時給 ─── */

function HourlyTab({
  settings,
  onChange,
  onSave,
}: {
  settings: Settings;
  onChange: (p: Partial<Settings>) => void;
  onSave: () => void;
}) {
  const { user } = useAuth();
  const [castList, setCastList] = useState<StoreCast[]>([]);
  useEffect(() => {
    const sid = user?.activeStoreId;
    if (!sid) return;
    fetchStoreCasts(sid).then(setCastList).catch(() => setCastList([]));
  }, [user?.activeStoreId]);

  // 個人時給を upsert（未登録キャストは新規追加）
  const updateRate = (castId: string, hourlyRate: number) => {
    const exists = settings.hourlyRates.some(r => r.castId === castId);
    const next = exists
      ? settings.hourlyRates.map(r => (r.castId === castId ? { ...r, hourlyRate } : r))
      : [...settings.hourlyRates, { castId, hourlyRate }];
    onChange({ hourlyRates: next });
  };

  return (
    <div className="space-y-6">
      <Field label="時給モード">
        <select
          value={settings.hourlyRateMode}
          onChange={e => onChange({ hourlyRateMode: e.target.value as 'individual' | 'rank' })}
          className={`${inputClass} w-48`}
        >
          <option value="individual">個人別</option>
          <option value="rank">ランク別</option>
        </select>
      </Field>

      <div>
        <SectionHeader title="キャスト別 時給" />
        <div className="space-y-2">
          {castList.length === 0 && (
            <p className="text-sm text-ink-tertiary">キャストを読み込み中…</p>
          )}
          {castList.map(c => {
            const rate = settings.hourlyRates.find(r => r.castId === c.id)?.hourlyRate ?? 0;
            return (
              <div key={c.id} className="flex items-center gap-4">
                <span className="text-sm w-24 text-ink font-medium">{c.name}</span>
                <NumberInput
                  value={rate}
                  onChange={v => updateRate(c.id, v)}
                  suffix="円"
                  className="w-32"
                />
              </div>
            );
          })}
        </div>
      </div>

      <Field label="同伴出勤の時給加算">
        <NumberInput
          value={settings.companionHourlyBonus}
          onChange={v => onChange({ companionHourlyBonus: v })}
          suffix="円"
          className="w-32"
        />
      </Field>

      <SaveButton onClick={onSave} />
    </div>
  );
}

/* ─── Tab: バック単価 ─── */

function BacksTab({
  settings,
  onChange,
  onSave,
}: {
  settings: Settings;
  onChange: (p: Partial<Settings>) => void;
  onSave: () => void;
}) {
  const updateBack = (id: string, price: number) => {
    onChange({
      backPrices: settings.backPrices.map(bp =>
        bp.id === id ? { ...bp, price } : bp
      ),
    });
  };

  const addCustom = () => {
    const newItem: BackPriceSetting = {
      id: `bp_custom_${Date.now()}`,
      name: '新規項目',
      unit: '円/回',
      price: 0,
      isCustom: true,
    };
    onChange({ backPrices: [...settings.backPrices, newItem] });
  };

  const updateName = (id: string, name: string) => {
    onChange({
      backPrices: settings.backPrices.map(bp =>
        bp.id === id ? { ...bp, name } : bp
      ),
    });
  };

  const removeBack = (id: string) => {
    onChange({
      backPrices: settings.backPrices.filter(bp => bp.id !== id),
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-tertiary">各種バックの単価設定。件数 × 単価 で給与に加算されます。</p>

      <div className="space-y-3">
        {settings.backPrices.map(bp => (
          <div key={bp.id} className="flex items-center gap-3">
            {bp.isCustom ? (
              <input
                value={bp.name}
                onChange={e => updateName(bp.id, e.target.value)}
                className={`${inputClass} w-44`}
              />
            ) : (
              <span className="text-sm w-44 text-ink">{bp.name}</span>
            )}
            <NumberInput
              value={bp.price}
              onChange={v => updateBack(bp.id, v)}
              suffix={bp.unit}
              className="w-28"
            />
            {bp.isCustom && (
              <button
                onClick={() => removeBack(bp.id)}
                className="text-xs text-danger hover:text-brand-dark transition-colors"
              >
                削除
              </button>
            )}
          </div>
        ))}
      </div>

      <button onClick={addCustom} className="text-sm text-brand hover:text-brand-dark transition-colors">
        ＋ 独自項目を追加
      </button>

      <div>
        <SaveButton onClick={onSave} />
      </div>
    </div>
  );
}

/* ─── Tab: 歩合 ─── */

function CommissionTab({
  settings,
  onChange,
  onSave,
}: {
  settings: Settings;
  onChange: (p: Partial<Settings>) => void;
  onSave: () => void;
}) {
  const updateRate = (idx: number, rate: number) => {
    const next = [...settings.commissionRates];
    next[idx] = { ...next[idx], rate };
    onChange({ commissionRates: next });
  };

  const updateSlide = (idx: number, field: keyof SlideTier, value: number) => {
    const next = [...settings.slideTiers];
    next[idx] = { ...next[idx], [field]: value };
    onChange({ slideTiers: next });
  };

  const addSlide = () => {
    onChange({
      slideTiers: [...settings.slideTiers, { minAmount: 0, rate: 0 }],
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <SectionHeader title="区分別 歩合率" />
        <div className="space-y-2">
          {settings.commissionRates.map((cr, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-sm w-32 text-ink">{cr.category}</span>
              <NumberInput
                value={cr.rate}
                onChange={v => updateRate(i, v)}
                suffix="%"
                className="w-24"
              />
            </div>
          ))}
        </div>
      </div>

      <Field label="スライド適用">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.slideEnabled}
            onChange={e => onChange({ slideEnabled: e.target.checked })}
            className="rounded accent-brand"
          />
          <span className="text-sm text-ink-secondary">ON（売上帯ごとに率を変える）</span>
        </label>
      </Field>

      {settings.slideEnabled && (
        <div>
          <SectionHeader title="スライド表" />
          <div className="space-y-2">
            {settings.slideTiers.map((tier, i) => (
              <div key={i} className="flex items-center gap-3">
                <NumberInput
                  value={tier.minAmount}
                  onChange={v => updateSlide(i, 'minAmount', v)}
                  suffix="円〜"
                  className="w-32"
                />
                <NumberInput
                  value={tier.rate}
                  onChange={v => updateSlide(i, 'rate', v)}
                  suffix="%"
                  className="w-24"
                />
              </div>
            ))}
          </div>
          <button onClick={addSlide} className="text-sm text-brand hover:text-brand-dark mt-2 transition-colors">
            ＋ 行を追加
          </button>
        </div>
      )}

      <SaveButton onClick={onSave} />
    </div>
  );
}

/* ─── Tab: 控除 ─── */

function DeductionsTab({
  settings,
  onChange,
  onSave,
}: {
  settings: Settings;
  onChange: (p: Partial<Settings>) => void;
  onSave: () => void;
}) {
  const updatePenalty = (id: string, amount: number) => {
    onChange({
      penalties: settings.penalties.map(p => (p.id === id ? { ...p, amount } : p)),
    });
  };

  const updateDeduction = (id: string, amount: number) => {
    onChange({
      deductionItems: settings.deductionItems.map(d =>
        d.id === id ? { ...d, amount } : d
      ),
    });
  };

  const addPenalty = () => {
    const item: FixedDeductionItem = {
      id: `pen_${Date.now()}`,
      name: '新規罰金',
      amount: 0,
    };
    onChange({ penalties: [...settings.penalties, item] });
  };

  const addDeduction = () => {
    const item: FixedDeductionItem = {
      id: `ded_${Date.now()}`,
      name: '新規天引き',
      amount: 0,
    };
    onChange({ deductionItems: [...settings.deductionItems, item] });
  };

  return (
    <div className="space-y-6">
      <div>
        <SectionHeader title="罰金設定" />
        <div className="space-y-2">
          {settings.penalties.map(pen => (
            <div key={pen.id} className="flex items-center gap-3">
              <span className="text-sm w-24 text-ink">{pen.name}</span>
              <NumberInput
                value={pen.amount}
                onChange={v => updatePenalty(pen.id, v)}
                suffix="円"
                className="w-28"
              />
            </div>
          ))}
        </div>
        <button onClick={addPenalty} className="text-sm text-brand hover:text-brand-dark mt-2 transition-colors">
          ＋ 罰金項目を追加
        </button>
      </div>

      <div>
        <SectionHeader title="天引き項目" />
        <div className="space-y-2">
          {settings.deductionItems.map(ded => (
            <div key={ded.id} className="flex items-center gap-3">
              <span className="text-sm w-24 text-ink">{ded.name}</span>
              <NumberInput
                value={ded.amount}
                onChange={v => updateDeduction(ded.id, v)}
                suffix="円"
                className="w-28"
              />
            </div>
          ))}
        </div>
        <button onClick={addDeduction} className="text-sm text-brand hover:text-brand-dark mt-2 transition-colors">
          ＋ 天引き項目を追加
        </button>
      </div>

      <Field label="前借り/日払い精算">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.advancePayEnabled}
            onChange={e => onChange({ advancePayEnabled: e.target.checked })}
            className="rounded accent-brand"
          />
          <span className="text-sm text-ink-secondary">当月の日払い済み額を差引する</span>
        </label>
      </Field>

      <div>
        <SectionHeader title="源泉徴収" />
        <div className="flex items-center gap-3">
          <select
            value={settings.withholdingTaxMode}
            onChange={e =>
              onChange({ withholdingTaxMode: e.target.value as 'none' | 'rate' })
            }
            className={inputClass}
          >
            <option value="none">なし</option>
            <option value="rate">率指定</option>
          </select>
          {settings.withholdingTaxMode === 'rate' && (
            <NumberInput
              value={settings.withholdingTaxRate}
              onChange={v => onChange({ withholdingTaxRate: v })}
              suffix="%"
              className="w-24"
            />
          )}
        </div>
      </div>

      <SaveButton onClick={onSave} />
    </div>
  );
}

/* ─── Tab: 店舗 ─── */

function StoreTab({
  settings,
  onChange,
  onSave,
}: {
  settings: Settings;
  onChange: (p: Partial<Settings>) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-6">
      <Field label="店舗名">
        <input
          value={settings.storeName}
          onChange={e => onChange({ storeName: e.target.value })}
          className={`${inputClass} w-64`}
        />
      </Field>

      <Field label="締め日">
        <select
          value={settings.closingDay === 'end_of_month' ? 'end_of_month' : String(settings.closingDay)}
          onChange={e => {
            const v = e.target.value;
            onChange({
              closingDay: v === 'end_of_month' ? 'end_of_month' : Number(v),
            });
          }}
          className={`${inputClass} w-48`}
        >
          <option value="end_of_month">末日</option>
          {[5, 10, 15, 20, 25].map(d => (
            <option key={d} value={d}>
              毎月{d}日
            </option>
          ))}
        </select>
      </Field>

      <Field label="支払日">
        <input
          value={settings.paymentDay}
          onChange={e => onChange({ paymentDay: e.target.value })}
          className={`${inputClass} w-48`}
        />
      </Field>

      <Field label="端数処理">
        <select
          value={settings.roundingMode}
          onChange={e =>
            onChange({ roundingMode: e.target.value as Settings['roundingMode'] })
          }
          className={`${inputClass} w-48`}
        >
          <option value="floor">切捨て</option>
          <option value="ceil">切上げ</option>
          <option value="round">四捨五入</option>
        </select>
      </Field>

      <Field label="丸めタイミング">
        <select
          value={settings.roundingTiming}
          onChange={e =>
            onChange({
              roundingTiming: e.target.value as Settings['roundingTiming'],
            })
          }
          className={`${inputClass} w-48`}
        >
          <option value="final">最終合計</option>
          <option value="per_item">項目ごと</option>
        </select>
      </Field>

      <div>
        <SectionHeader title="出欠ボード" />
        <Field label="1日あたり出勤目標人数（0で非表示）">
          <NumberInput
            value={settings.dailyAttendanceTarget ?? 0}
            onChange={v => onChange({ dailyAttendanceTarget: Math.max(0, Math.floor(v)) })}
            suffix="人"
            className="w-24"
          />
        </Field>
        <p className="text-xs text-ink-tertiary mt-1">
          出欠ボードの月次一覧で、日別出勤人数の目標ラインとして表示されます。
        </p>
      </div>

      <SaveButton onClick={onSave} />
    </div>
  );
}

/* ─── Tab: ランキング ─── */

function RankingTab({
  settings,
  onChange,
  onSave,
}: {
  settings: Settings;
  onChange: (p: Partial<Settings>) => void;
  onSave: () => void;
}) {
  const updatePointDef = (idx: number, points: number) => {
    const next = [...settings.customPointDefs];
    next[idx] = { ...next[idx], points };
    onChange({ customPointDefs: next });
  };

  const addPointDef = () => {
    const item: RankingPointDef = { category: '新規', points: 1 };
    onChange({ customPointDefs: [...settings.customPointDefs, item] });
  };

  return (
    <div className="space-y-6">
      <Field label="pt定義">
        <select
          value={settings.rankingPointDef}
          onChange={e =>
            onChange({
              rankingPointDef: e.target.value as Settings['rankingPointDef'],
            })
          }
          className={`${inputClass} w-48`}
        >
          <option value="sales">売上</option>
          <option value="nominations">指名本数</option>
          <option value="custom">独自pt</option>
        </select>
      </Field>

      {settings.rankingPointDef === 'custom' && (
        <div>
          <SectionHeader title="独自pt配点" />
          <div className="space-y-2">
            {settings.customPointDefs.map((def, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm w-24 text-ink">{def.category}</span>
                <NumberInput
                  value={def.points}
                  onChange={v => updatePointDef(i, v)}
                  suffix="pt"
                  className="w-24"
                />
              </div>
            ))}
          </div>
          <button onClick={addPointDef} className="text-sm text-brand hover:text-brand-dark mt-2 transition-colors">
            ＋ 種別を追加
          </button>
        </div>
      )}

      <Field label="公開設定">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.rankingPublic}
            onChange={e => onChange({ rankingPublic: e.target.checked })}
            className="rounded accent-brand"
          />
          <span className="text-sm text-ink-secondary">キャストにランキングを公開</span>
        </label>
      </Field>

      <Field label="表示モード">
        <select
          value={settings.rankingDisplayMode}
          onChange={e =>
            onChange({
              rankingDisplayMode: e.target.value as Settings['rankingDisplayMode'],
            })
          }
          className={`${inputClass} w-48`}
        >
          <option value="rank_only">順位のみ</option>
          <option value="with_points">pt表示</option>
        </select>
      </Field>

      <Field label="表示人数（上位N名）">
        <NumberInput
          value={settings.rankingTopN}
          onChange={v => onChange({ rankingTopN: v })}
          suffix="名"
          className="w-24"
        />
      </Field>

      <SaveButton onClick={onSave} />
    </div>
  );
}

/* ─── Tab: シフト ─── */

function ShiftTab({
  settings,
  onChange,
  onSave,
}: {
  settings: Settings;
  onChange: (p: Partial<Settings>) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-6">
      <SectionHeader title="シフト提出設定" />

      <Field label="提出期限日（毎月X日まで）">
        <NumberInput
          value={settings.shiftDeadlineDay}
          onChange={v => onChange({ shiftDeadlineDay: Math.min(28, Math.max(1, v)) })}
          suffix="日"
          className="w-24"
        />
      </Field>

      <Field label="対象月">
        <select
          value={settings.shiftTargetMonthOffset}
          onChange={e => onChange({ shiftTargetMonthOffset: Number(e.target.value) })}
          className={`${inputClass} w-48`}
        >
          <option value={1}>翌月</option>
          <option value={2}>翌々月</option>
        </select>
      </Field>

      <Field label="デフォルト開始時刻">
        <input
          type="time"
          value={settings.shiftDefaultStartTime}
          onChange={e => onChange({ shiftDefaultStartTime: e.target.value })}
          className={`${inputClass} w-40`}
        />
      </Field>

      <Field label="デフォルト終了時刻">
        <input
          type="time"
          value={settings.shiftDefaultEndTime}
          onChange={e => onChange({ shiftDefaultEndTime: e.target.value })}
          className={`${inputClass} w-40`}
        />
      </Field>

      <SaveButton onClick={onSave} />
    </div>
  );
}
