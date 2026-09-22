import { useState, useMemo } from 'react';
import { casts, type DailyRecord } from '../../data/seed';
import { usePerformance } from '../../store/PerformanceContext';
import { useSettings } from '../../store/SettingsContext';
import { useAuth } from '../../store/AuthContext';
import { calculatePayroll } from '../../lib/payroll';

type InputMode = 'daily' | 'monthly';

const inputClass = 'border border-ink/10 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20 transition-colors';

export function PerformanceEntryPage() {
  const { dailyRecords, getMonthlyPerformances, upsertDailyRecord } = usePerformance();
  const { settings } = useSettings();
  const { user } = useAuth();
  const storeId = user?.activeStoreId ?? '';
  const [selectedMonth, setSelectedMonth] = useState('2026-06');
  const [inputMode, setInputMode] = useState<InputMode>('daily');
  const [editingRecord, setEditingRecord] = useState<DailyRecord | null>(null);
  const [monthlyCastId, setMonthlyCastId] = useState(casts[0].id);
  const [saved, setSaved] = useState(false);

  const showSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const activeCasts = casts.filter(c => c.status === 'active');
  const performances = getMonthlyPerformances(selectedMonth);

  const daysInMonth = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const count = new Date(y, m, 0).getDate();
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [selectedMonth]);

  const dayOfWeek = (day: number) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    return ['日','月','火','水','木','金','土'][new Date(y, m - 1, day).getDay()];
  };

  const getRecord = (castId: string, day: number): DailyRecord | undefined => {
    const date = `${selectedMonth}-${String(day).padStart(2, '0')}`;
    return dailyRecords.find(r => r.castId === castId && r.date === date);
  };

  const openDailyForm = (castId: string, day: number) => {
    const date = `${selectedMonth}-${String(day).padStart(2, '0')}`;
    const existing = getRecord(castId, day);
    if (existing) {
      setEditingRecord({ ...existing });
    } else {
      setEditingRecord({
        id: `dr_${castId}_${day}_${Date.now()}`,
        castId,
        storeId,
        date,
        attended: true,
        attendanceType: 'normal',
        hours: 7,
        isLate: false,
        isAbsent: false,
        honShimei: 0,
        banaiShimei: 0,
        douhan: 0,
        drinks: 0,
        bottles: 0,
        extensions: 0,
        nominatedSales: 0,
        freeSales: 0,
        advancePay: 0,
      });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mincho text-xl md:text-2xl font-bold text-ink">実績入力</h1>
        {saved && (
          <span className="text-sm text-success bg-success-bg px-3 py-1 rounded-full animate-fade-in font-medium">
            保存しました
          </span>
        )}
      </div>
      <p className="text-sm text-ink-tertiary">
        キャストの日別実績を入力・編集できます。保存すると給与・ランキング・ダッシュボードに即反映されます。
      </p>

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="text-sm text-ink-secondary mr-2">月:</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex gap-1 bg-ink/5 p-1 rounded-xl">
          <button
            onClick={() => setInputMode('daily')}
            className={`px-4 py-1.5 text-sm rounded-lg transition-all ${
              inputMode === 'daily' ? 'bg-surface-card text-brand font-bold shadow-soft' : 'text-ink-tertiary'
            }`}
          >
            日別入力
          </button>
          <button
            onClick={() => setInputMode('monthly')}
            className={`px-4 py-1.5 text-sm rounded-lg transition-all ${
              inputMode === 'monthly' ? 'bg-surface-card text-brand font-bold shadow-soft' : 'text-ink-tertiary'
            }`}
          >
            月まとめ入力
          </button>
        </div>
      </div>

      {inputMode === 'daily' ? (
        <>
          {/* Grid: Cast × Day */}
          <div className="bg-surface-card rounded-2xl shadow-card overflow-auto">
            <table className="text-xs w-full min-w-[900px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-ink/5">
                  <th className="text-left px-3 py-2 font-medium text-gold text-xs tracking-wide sticky left-0 bg-surface-card z-20 min-w-[80px]">
                    キャスト
                  </th>
                  {daysInMonth.map(d => {
                    const dow = dayOfWeek(d);
                    const isWeekend = dow === '土' || dow === '日';
                    return (
                      <th
                        key={d}
                        className={`px-1 py-2 text-center font-medium min-w-[36px] ${
                          isWeekend ? 'text-brand' : 'text-ink-tertiary'
                        }`}
                      >
                        <div>{d}</div>
                        <div className="text-[10px] font-normal">{dow}</div>
                      </th>
                    );
                  })}
                  <th className="px-3 py-2 text-right font-medium text-gold text-xs tracking-wide min-w-[60px]">合計</th>
                </tr>
              </thead>
              <tbody>
                {activeCasts.map(cast => {
                  const perf = performances.find(p => p.castId === cast.id);
                  return (
                    <tr key={cast.id} className="border-t border-ink/3 hover:bg-brand/3 transition-colors">
                      <td className="px-3 py-2 font-medium text-ink sticky left-0 bg-surface-card z-10">
                        {cast.name}
                      </td>
                      {daysInMonth.map(d => {
                        const rec = getRecord(cast.id, d);
                        return (
                          <td key={d} className="px-0 py-1 text-center">
                            <button
                              onClick={() => openDailyForm(cast.id, d)}
                              className={`w-8 h-8 rounded-lg text-[10px] leading-tight transition-all hover:scale-110 ${
                                rec
                                  ? rec.attended
                                    ? rec.isLate
                                      ? 'bg-warn-bg text-warn hover:bg-warn/20'
                                      : 'bg-water-100 text-blue-700 hover:bg-water-200'
                                    : rec.isAbsent
                                      ? 'bg-danger-bg text-danger hover:bg-danger/15'
                                      : 'bg-ink/5 text-ink-tertiary'
                                  : 'bg-ink/3 text-ink-placeholder hover:bg-ink/8'
                              }`}
                              title={rec ? `${rec.hours}h / 指${rec.honShimei} / D${rec.drinks}` : 'クリックで入力'}
                            >
                              {rec ? (
                                rec.attended ? (
                                  <>{rec.hours}h</>
                                ) : rec.isAbsent ? '欠' : '-'
                              ) : ''}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right">
                        <div className="font-bold text-ink">{perf?.workDays ?? 0}日</div>
                        <div className="text-ink-tertiary">指{perf?.honShimei ?? 0}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Monthly summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {activeCasts.map(cast => {
              const perf = performances.find(p => p.castId === cast.id);
              const payroll = perf ? calculatePayroll(perf, settings) : null;
              return (
                <div key={cast.id} className="bg-surface-card rounded-2xl shadow-card p-3 text-center hover-lift">
                  <p className="font-bold text-sm text-ink">{cast.name}</p>
                  <p className="text-lg font-bold text-brand font-mincho mt-1">
                    ¥{(payroll?.netPay ?? 0).toLocaleString()}
                  </p>
                  <div className="grid grid-cols-3 gap-1 mt-2 text-[10px] text-ink-tertiary">
                    <div>{perf?.workDays ?? 0}日</div>
                    <div>指{perf?.honShimei ?? 0}</div>
                    <div>同{perf?.douhan ?? 0}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Daily edit modal */}
          {editingRecord && (
            <DailyEditModal
              record={editingRecord}
              onSave={(rec) => {
                upsertDailyRecord(rec);
                setEditingRecord(null);
                showSaved();
              }}
              onClose={() => setEditingRecord(null)}
            />
          )}
        </>
      ) : (
        <MonthlyInputForm
          selectedMonth={selectedMonth}
          castId={monthlyCastId}
          storeId={storeId}
          onChangeCast={setMonthlyCastId}
          onSave={showSaved}
        />
      )}
    </div>
  );
}

/* ─── Daily Edit Modal ─── */

function DailyEditModal({
  record,
  onSave,
  onClose,
}: {
  record: DailyRecord;
  onSave: (r: DailyRecord) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<DailyRecord>({ ...record });
  const [errors, setErrors] = useState<string[]>([]);
  const castName = casts.find(c => c.id === form.castId)?.name ?? form.castId;

  const validate = (): string[] => {
    const errs: string[] = [];
    if (form.attended && form.hours <= 0) errs.push('勤務時間は0より大きい値を入力してください');
    if (form.attended && form.hours > 24) errs.push('勤務時間は24時間以内にしてください');
    if (form.honShimei < 0) errs.push('本指名は0以上で入力してください');
    if (form.banaiShimei < 0) errs.push('場内指名は0以上で入力してください');
    if (form.douhan < 0) errs.push('同伴は0以上で入力してください');
    if (form.drinks < 0) errs.push('ドリンクは0以上で入力してください');
    if (form.bottles < 0) errs.push('ボトルは0以上で入力してください');
    if (form.extensions < 0) errs.push('延長は0以上で入力してください');
    if (form.nominatedSales < 0) errs.push('本指名売上は0以上で入力してください');
    if (form.freeSales < 0) errs.push('フリー売上は0以上で入力してください');
    if (form.advancePay < 0) errs.push('前借りは0以上で入力してください');
    return errs;
  };

  const handleSave = () => {
    const errs = validate();
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    const updated = {
      ...form,
      attendanceType: form.douhan > 0 ? 'douhan' as const : 'normal' as const,
    };
    onSave(updated);
  };

  const update = (patch: Partial<DailyRecord>) => {
    setForm(prev => ({ ...prev, ...patch }));
    setErrors([]);
  };

  const d = new Date(form.date);
  const dateLabel = `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-card rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-float">
        <div className="px-6 py-4 border-b border-ink/5 flex items-center justify-between">
          <h3 className="font-mincho font-bold text-lg text-ink">
            {castName} — {dateLabel}
          </h3>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink text-xl transition-colors">&times;</button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {errors.length > 0 && (
            <div className="bg-danger-bg border border-danger/20 rounded-xl p-3 text-sm text-danger space-y-1 animate-fade-in">
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          {/* 出勤区分 */}
          <div className="space-y-3">
            <p className="font-mincho text-sm font-bold text-ink pb-1">出勤</p>
            <div className="rule-gold" />
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm text-ink-secondary">
                <input type="checkbox" checked={form.attended}
                  onChange={e => update({ attended: e.target.checked, isAbsent: false })}
                  className="rounded accent-brand" />
                出勤
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-secondary">
                <input type="checkbox" checked={form.isLate}
                  onChange={e => update({ isLate: e.target.checked })}
                  className="rounded accent-warn" disabled={!form.attended} />
                遅刻
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-secondary">
                <input type="checkbox" checked={form.isAbsent}
                  onChange={e => update({ isAbsent: e.target.checked, attended: false })}
                  className="rounded accent-danger" />
                欠勤
              </label>
            </div>
            {form.attended && (
              <div className="flex items-center gap-3">
                <label className="text-sm text-ink-secondary w-20">勤務時間</label>
                <input type="number" value={form.hours}
                  onChange={e => update({ hours: Number(e.target.value) })}
                  className={`${inputClass} w-24`} min={0} max={24} step={0.5} />
                <span className="text-sm text-ink-tertiary">時間</span>
              </div>
            )}
          </div>

          {form.attended && (
            <>
              <div className="space-y-3">
                <p className="font-mincho text-sm font-bold text-ink pb-1">指名・同伴</p>
                <div className="rule-gold" />
                <div className="grid grid-cols-3 gap-3">
                  <NumField label="本指名" value={form.honShimei} suffix="本" onChange={v => update({ honShimei: v })} />
                  <NumField label="場内指名" value={form.banaiShimei} suffix="本" onChange={v => update({ banaiShimei: v })} />
                  <NumField label="同伴" value={form.douhan} suffix="回" onChange={v => update({ douhan: v })} />
                </div>
              </div>

              <div className="space-y-3">
                <p className="font-mincho text-sm font-bold text-ink pb-1">ドリンク・ボトル・延長</p>
                <div className="rule-gold" />
                <div className="grid grid-cols-3 gap-3">
                  <NumField label="ドリンク" value={form.drinks} suffix="杯" onChange={v => update({ drinks: v })} />
                  <NumField label="ボトル" value={form.bottles} suffix="本" onChange={v => update({ bottles: v })} />
                  <NumField label="延長" value={form.extensions} suffix="回" onChange={v => update({ extensions: v })} />
                </div>
              </div>

              <div className="space-y-3">
                <p className="font-mincho text-sm font-bold text-ink pb-1">売上</p>
                <div className="rule-gold" />
                <div className="grid grid-cols-2 gap-3">
                  <NumField label="本指名売上" value={form.nominatedSales} suffix="円" onChange={v => update({ nominatedSales: v })} />
                  <NumField label="フリー売上" value={form.freeSales} suffix="円" onChange={v => update({ freeSales: v })} />
                </div>
              </div>

              <div className="space-y-3">
                <p className="font-mincho text-sm font-bold text-ink pb-1">前借り/日払い</p>
                <div className="rule-gold" />
                <NumField label="前借り額" value={form.advancePay} suffix="円" onChange={v => update({ advancePay: v })} />
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-ink/5 flex gap-3 justify-end">
          <button onClick={onClose}
            className="px-5 py-2 text-sm text-ink-secondary hover:bg-ink/5 rounded-xl transition-colors">
            キャンセル
          </button>
          <button onClick={handleSave}
            className="px-5 py-2 text-sm bg-brand-gradient text-white font-bold rounded-xl hover:shadow-glow transition-all active:scale-95">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Monthly Input Form ─── */

function MonthlyInputForm({
  selectedMonth,
  castId,
  storeId,
  onChangeCast,
  onSave,
}: {
  selectedMonth: string;
  castId: string;
  storeId: string;
  onChangeCast: (id: string) => void;
  onSave: () => void;
}) {
  const { getMonthlyPerformances, replaceMonthlySummary } = usePerformance();
  const { settings } = useSettings();
  const activeCasts = casts.filter(c => c.status === 'active');
  const castName = activeCasts.find(c => c.id === castId)?.name ?? '';

  const perf = getMonthlyPerformances(selectedMonth).find(p => p.castId === castId);

  const [form, setForm] = useState({
    workDays: perf?.workDays ?? 0,
    hoursPerDay: perf?.hoursPerDay ?? 7,
    honShimei: perf?.honShimei ?? 0,
    banaiShimei: perf?.banaiShimei ?? 0,
    douhan: perf?.douhan ?? 0,
    drinks: perf?.drinks ?? 0,
    bottles: perf?.bottles ?? 0,
    extensions: perf?.extensions ?? 0,
    nominatedSales: perf?.nominatedSales ?? 0,
    freeSales: perf?.freeSales ?? 0,
    lateCount: perf?.lateCount ?? 0,
    absenceCount: perf?.absenceCount ?? 0,
    advancePay: perf?.advancePay ?? 0,
  });

  const handleCastChange = (id: string) => {
    onChangeCast(id);
    const p = getMonthlyPerformances(selectedMonth).find(pp => pp.castId === id);
    setForm({
      workDays: p?.workDays ?? 0,
      hoursPerDay: p?.hoursPerDay ?? 7,
      honShimei: p?.honShimei ?? 0,
      banaiShimei: p?.banaiShimei ?? 0,
      douhan: p?.douhan ?? 0,
      drinks: p?.drinks ?? 0,
      bottles: p?.bottles ?? 0,
      extensions: p?.extensions ?? 0,
      nominatedSales: p?.nominatedSales ?? 0,
      freeSales: p?.freeSales ?? 0,
      lateCount: p?.lateCount ?? 0,
      absenceCount: p?.absenceCount ?? 0,
      advancePay: p?.advancePay ?? 0,
    });
  };

  const handleSave = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const totalDays = new Date(y, m, 0).getDate();
    const records: DailyRecord[] = [];

    let workDayCount = 0;
    let honLeft = form.honShimei, banaiLeft = form.banaiShimei, douhanLeft = form.douhan;
    let drinksLeft = form.drinks, bottlesLeft = form.bottles, extLeft = form.extensions;
    let nomSalesLeft = form.nominatedSales, freeSalesLeft = form.freeSales;
    let lateLeft = form.lateCount, advLeft = form.advancePay;

    for (let d = 1; d <= totalDays && workDayCount < form.workDays; d++) {
      const date = `${selectedMonth}-${String(d).padStart(2, '0')}`;
      workDayCount++;
      const remaining = form.workDays - workDayCount + 1;
      const isLast = workDayCount === form.workDays;

      const hon = isLast ? honLeft : Math.round(honLeft / remaining);
      const ban = isLast ? banaiLeft : Math.round(banaiLeft / remaining);
      const dou = isLast ? douhanLeft : Math.round(douhanLeft / remaining);
      const dr = isLast ? drinksLeft : Math.round(drinksLeft / remaining);
      const bot = isLast ? bottlesLeft : Math.round(bottlesLeft / remaining);
      const ext = isLast ? extLeft : Math.round(extLeft / remaining);
      const ns = isLast ? nomSalesLeft : Math.round(nomSalesLeft / remaining);
      const fs = isLast ? freeSalesLeft : Math.round(freeSalesLeft / remaining);
      const isLate = lateLeft > 0;
      if (isLate) lateLeft--;
      const adv = workDayCount === 1 ? advLeft : 0;

      honLeft -= hon; banaiLeft -= ban; douhanLeft -= dou;
      drinksLeft -= dr; bottlesLeft -= bot; extLeft -= ext;
      nomSalesLeft -= ns; freeSalesLeft -= fs;

      records.push({
        id: `dr_${castId}_${d}_${Date.now()}`,
        castId,
        storeId,
        date,
        attended: true,
        attendanceType: dou > 0 ? 'douhan' : 'normal',
        hours: form.hoursPerDay,
        isLate,
        isAbsent: false,
        honShimei: hon, banaiShimei: ban, douhan: dou,
        drinks: dr, bottles: bot, extensions: ext,
        nominatedSales: ns, freeSales: fs,
        advancePay: adv,
      });
    }

    let absLeft = form.absenceCount;
    for (let d = 1; d <= totalDays && absLeft > 0; d++) {
      const date = `${selectedMonth}-${String(d).padStart(2, '0')}`;
      if (!records.some(r => r.date === date)) {
        records.push({
          id: `dr_${castId}_${d}_abs_${Date.now()}`,
          castId, storeId, date,
          attended: false, attendanceType: 'normal', hours: 0,
          isLate: false, isAbsent: true,
          honShimei: 0, banaiShimei: 0, douhan: 0,
          drinks: 0, bottles: 0, extensions: 0,
          nominatedSales: 0, freeSales: 0, advancePay: 0,
        });
        absLeft--;
      }
    }

    if (!storeId) return;
    replaceMonthlySummary(castId, storeId, selectedMonth, records);
    onSave();
  };

  const update = (patch: Partial<typeof form>) => setForm(prev => ({ ...prev, ...patch }));

  const previewPerf = {
    castId,
    storeId,
    month: selectedMonth,
    ...form,
  };
  const previewPayroll = calculatePayroll(previewPerf, settings);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-6">
        <div className="bg-surface-card rounded-2xl shadow-card p-6 space-y-5">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-ink-secondary">キャスト:</label>
            <select
              value={castId}
              onChange={e => handleCastChange(e.target.value)}
              className={inputClass}
            >
              {activeCasts.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <p className="font-mincho text-sm font-bold text-ink pb-1">出勤</p>
            <div className="rule-gold" />
            <div className="grid grid-cols-4 gap-3">
              <NumField label="出勤日数" value={form.workDays} suffix="日" onChange={v => update({ workDays: v })} />
              <NumField label="時間/日" value={form.hoursPerDay} suffix="h" onChange={v => update({ hoursPerDay: v })} />
              <NumField label="遅刻" value={form.lateCount} suffix="回" onChange={v => update({ lateCount: v })} />
              <NumField label="欠勤" value={form.absenceCount} suffix="回" onChange={v => update({ absenceCount: v })} />
            </div>
          </div>

          <div className="space-y-3">
            <p className="font-mincho text-sm font-bold text-ink pb-1">指名・同伴</p>
            <div className="rule-gold" />
            <div className="grid grid-cols-3 gap-3">
              <NumField label="本指名" value={form.honShimei} suffix="本" onChange={v => update({ honShimei: v })} />
              <NumField label="場内指名" value={form.banaiShimei} suffix="本" onChange={v => update({ banaiShimei: v })} />
              <NumField label="同伴" value={form.douhan} suffix="回" onChange={v => update({ douhan: v })} />
            </div>
          </div>

          <div className="space-y-3">
            <p className="font-mincho text-sm font-bold text-ink pb-1">ドリンク・ボトル・延長</p>
            <div className="rule-gold" />
            <div className="grid grid-cols-3 gap-3">
              <NumField label="ドリンク" value={form.drinks} suffix="杯" onChange={v => update({ drinks: v })} />
              <NumField label="ボトル" value={form.bottles} suffix="本" onChange={v => update({ bottles: v })} />
              <NumField label="延長" value={form.extensions} suffix="回" onChange={v => update({ extensions: v })} />
            </div>
          </div>

          <div className="space-y-3">
            <p className="font-mincho text-sm font-bold text-ink pb-1">売上</p>
            <div className="rule-gold" />
            <div className="grid grid-cols-2 gap-3">
              <NumField label="本指名売上" value={form.nominatedSales} suffix="円" onChange={v => update({ nominatedSales: v })} />
              <NumField label="フリー売上" value={form.freeSales} suffix="円" onChange={v => update({ freeSales: v })} />
            </div>
          </div>

          <div className="space-y-3">
            <p className="font-mincho text-sm font-bold text-ink pb-1">前借り/日払い</p>
            <div className="rule-gold" />
            <NumField label="前借り額" value={form.advancePay} suffix="円" onChange={v => update({ advancePay: v })} />
          </div>

          {!storeId && (
            <p className="text-sm text-danger">店舗を選択してください</p>
          )}
          <button onClick={handleSave}
            disabled={!storeId}
            className="bg-brand-gradient text-white px-6 py-2 rounded-xl font-medium hover:shadow-glow transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
            保存（日別レコードに展開）
          </button>
        </div>
      </div>

      {/* Preview sidebar */}
      <div className="space-y-4">
        <div className="glass rounded-2xl shadow-card p-4 space-y-3 sticky top-6">
          <h3 className="font-mincho font-bold text-sm text-ink">給与プレビュー（{castName}）</h3>
          <div className="bg-brand-gradient rounded-xl p-4 text-white text-center border-gold shadow-glow">
            <p className="text-xs text-white/70">差引支給額</p>
            <p className="text-2xl font-bold font-mincho mt-1">¥{previewPayroll.netPay.toLocaleString()}</p>
          </div>
          <div className="text-xs space-y-1.5 text-ink-secondary">
            <div className="flex justify-between"><span>基本給</span><span>¥{previewPayroll.basePay.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>歩合</span><span>¥{previewPayroll.commissionTotal.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>各種バック</span><span>¥{previewPayroll.backTotal.toLocaleString()}</span></div>
            <div className="rule-gold my-1" />
            <div className="flex justify-between font-bold text-ink"><span>総支給</span><span>¥{previewPayroll.grossPay.toLocaleString()}</span></div>
            <div className="flex justify-between text-danger"><span>控除</span><span>-¥{previewPayroll.deductionTotal.toLocaleString()}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Shared field ─── */

function NumField({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-xs text-ink-tertiary">{label}</label>
      <div className="flex items-center gap-1 mt-0.5">
        <input
          type="number"
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className={`${inputClass} w-full`}
          min={0}
        />
        <span className="text-xs text-ink-placeholder shrink-0">{suffix}</span>
      </div>
    </div>
  );
}
