import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../store/AuthContext';
import { useSettings } from '../../store/SettingsContext';
import { calculatePayroll } from '../../lib/payroll';
import { recordsToPerformance } from '../../lib/castAggregate';
import { useCountUp } from '../../hooks/useAnimations';
import { CalendarIcon, StarIcon, EditIcon, HistoryIcon, CalendarCheckIcon } from '../../components/Icons';
import { AttendanceCalendar } from '../../components/AttendanceCalendar';
import { supabase } from '../../lib/supabase';
import { periodKey, achievementRate } from '../../lib/targets';
import { fetchCastTarget } from '../../data/targets';
import {
  fetchCastDailyRecords,
  fetchCastShifts,
  sumSales,
  type CastDailyRecord,
  type CastShift,
} from '../../data/manager';

// ─── helpers ──────────────────────────────────────────────────────────────

function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${Number(m)}月`;
}

/** 締め日まで残り日数（settings.closingDay 基準・ローカル日付） */
function daysUntilClosing(closingDay: 'end_of_month' | number, now = new Date()): number {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const target = closingDay === 'end_of_month' ? lastDay : Math.min(closingDay, lastDay);
  if (d <= target) return target - d;
  const nextLast = new Date(y, m + 2, 0).getDate();
  return (lastDay - d) + (closingDay === 'end_of_month' ? nextLast : Math.min(Number(closingDay), nextLast));
}

export function MyPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const castId = user?.castData?.id ?? '';
  const storeId = user?.castData?.storeId ?? '';
  const month = periodKey(new Date(), 'month');

  // 当月の実績・シフト・目標（管理側キャスト別ビューと同じ live データ）
  const [records, setRecords] = useState<CastDailyRecord[]>([]);
  const [shifts, setShifts] = useState<CastShift[]>([]);
  const [targetSales, setTargetSales] = useState<number | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  // LINE連携 state
  const [lineLinkCode, setLineLinkCode] = useState<string | null>(null);
  const [lineLinked, setLineLinked] = useState(false);
  const [lineLinkLoading, setLineLinkLoading] = useState(true);
  const [codeCopied, setCodeCopied] = useState(false);

  // 当月データ取得
  // 非同期フェッチ前後の setState は意図通り（読み込み表示のため）
  useEffect(() => {
    if (!castId || !storeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDataLoading(false);
      return;
    }
    let cancelled = false;
    setDataLoading(true);
    (async () => {
      try {
        const [recs, shfs, target] = await Promise.all([
          fetchCastDailyRecords(castId, month),
          fetchCastShifts(castId, month),
          fetchCastTarget(storeId, castId, 'month', month).catch(() => null),
        ]);
        if (cancelled) return;
        setRecords(recs);
        setShifts(shfs);
        setTargetSales(target);
      } catch (err) {
        console.warn('[MyPage] 当月データ取得エラー:', err);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [castId, storeId, month]);

  // 給与・売上・出勤の集計（live daily_records から）
  const payroll = useMemo(
    () => (castId ? calculatePayroll(recordsToPerformance(records, castId, storeId, month), settings) : null),
    [records, castId, storeId, month, settings],
  );
  const actualSales = useMemo(() => sumSales(records), [records]);
  const hero = useMemo(() => ({
    workDays: records.filter(r => r.attended && !r.isAbsent).length,
    honShimei: records.reduce((a, r) => a + (r.honShimei || 0), 0),
    douhan: records.reduce((a, r) => a + (r.douhan || 0), 0),
  }), [records]);
  const scheduledDays = shifts.filter(s => s.status === 'approved' || s.status === 'published').length;
  const attRate = scheduledDays > 0 ? Math.round((hero.workDays / scheduledDays) * 100) : null;
  const remainingDays = daysUntilClosing(settings.closingDay);

  const animatedPay = useCountUp(payroll?.netPay ?? 0);

  // LINE連携コード & 連携済み状態を取得
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        if (!cancelled) setLineLinkLoading(false);
        return;
      }
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('line_link_code')
          .eq('id', user.id)
          .single();

        if (cancelled) return;
        const code = (profileData as { line_link_code?: string | null } | null)?.line_link_code ?? null;
        setLineLinkCode(code);

        if (castId) {
          const { data: linkData } = await supabase
            .from('line_links')
            .select('id')
            .eq('cast_id', castId)
            .maybeSingle();
          if (!cancelled) setLineLinked(!!linkData);
        }
      } catch (err) {
        console.warn('[MyPage] LINE連携情報取得エラー:', err);
      } finally {
        if (!cancelled) setLineLinkLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, castId]);

  const handleCopyCode = async () => {
    if (!lineLinkCode) return;
    try {
      await navigator.clipboard.writeText(lineLinkCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // clipboard API が使えない場合は無視
    }
  };

  const menuItems = [
    { label: '出勤履歴', Icon: CalendarIcon, path: '/cast/attendance' },
    { label: '給与・成績', Icon: StarIcon, path: '/cast/payroll' },
    { label: '給与履歴', Icon: HistoryIcon, path: '/cast/payroll-history' },
    { label: '申請する', Icon: EditIcon, path: '/cast/requests' },
    { label: 'シフト提出', Icon: CalendarIcon, path: '/cast/shift-submit' },
    { label: '確定シフト', Icon: CalendarCheckIcon, path: '/cast/shift-view' },
  ];

  return (
    <div className="p-4 space-y-4 md:space-y-5 max-w-2xl mx-auto">
      {/* Salary Hero Card */}
      <div className="bg-brand-gradient rounded-2xl p-5 md:p-6 shadow-glow border-gold animate-fade-in-up">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-white/80 font-medium">今月のお給料（見込）</p>
          <span className="text-[11px] text-white/60 bg-white/10 rounded-full px-2.5 py-0.5">{monthLabel(month)}</span>
        </div>
        <p className="text-display text-white">
          <span className="text-xl">¥</span>
          {animatedPay.toLocaleString()}
        </p>
        <p className="text-xs text-white/50 mt-2">
          締日まで残り{remainingDays}日 ・ 確定額は給与明細で確認できます
        </p>

        <div className="grid grid-cols-4 mt-5 pt-4 border-t border-white/15">
          {[
            { label: '出勤', value: hero.workDays, unit: '日' },
            { label: '指名', value: hero.honShimei, unit: '本' },
            { label: '同伴', value: hero.douhan, unit: '回' },
            { label: '出勤率', value: attRate ?? '—', unit: attRate !== null ? '%' : '' },
          ].map(stat => (
            <div key={stat.label} className="text-center">
              <p className="text-xs text-white/60">{stat.label}</p>
              <p className="font-mincho text-xl md:text-2xl font-bold text-white mt-0.5">
                {stat.value}<span className="text-xs font-normal text-white/50 ml-0.5">{stat.unit}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 今月の売上目標 */}
      <div className="glass rounded-2xl p-5 shadow-card animate-fade-in-up delay-1">
        <p className="text-sm font-medium text-ink/70 mb-3">今月の売上目標</p>
        {dataLoading ? (
          <p className="text-xs text-ink/40">読み込み中…</p>
        ) : targetSales === null ? (
          <p className="text-xs text-ink/40">今月の目標は未設定です</p>
        ) : (() => {
          const rate = achievementRate(actualSales, targetSales);
          const barWidth = Math.min(100, rate);
          const remaining = Math.max(0, targetSales - actualSales);
          const achieved = actualSales >= targetSales;
          return (
            <>
              <div className="w-full h-2.5 bg-ink/10 rounded-full overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${achieved ? 'bg-emerald-500' : 'bg-brand'}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <p className="text-sm font-medium text-ink">
                今月{' '}
                <span className="text-base font-bold text-brand">¥{actualSales.toLocaleString()}</span>
                {' '}／{' '}
                <span className="text-ink/60">¥{targetSales.toLocaleString()}</span>
                <span className="ml-2 text-xs text-ink/50">（達成率{rate}%）</span>
              </p>
              <p className="mt-1 text-xs font-medium">
                {achieved ? (
                  <span className="text-emerald-600">目標達成🎉</span>
                ) : (
                  <span className="text-ink/60">あと¥{remaining.toLocaleString()}で達成</span>
                )}
              </p>
            </>
          );
        })()}
      </div>

      {/* 今月の出欠 */}
      <div className="glass rounded-2xl p-5 shadow-card animate-fade-in-up delay-2">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-ink/70">今月の出欠</p>
          <span className="text-xs text-ink/50">出勤 <b className="text-ink">{hero.workDays}</b> 日</span>
        </div>
        {dataLoading ? (
          <p className="text-xs text-ink/40">読み込み中…</p>
        ) : (
          <AttendanceCalendar month={month} records={records} />
        )}
      </div>

      {/* Menu Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {menuItems.map((item, i) => (
          <button
            key={item.label}
            onClick={() => navigate(item.path)}
            className={`glass rounded-xl p-5 shadow-card flex flex-col items-center gap-3 hover-lift animate-fade-in-up delay-${(i % 4) + 1}`}
          >
            <div className="w-11 h-11 rounded-full bg-brand/8 flex items-center justify-center text-brand">
              <item.Icon size={22} />
            </div>
            <span className="text-sm font-medium text-ink">{item.label}</span>
          </button>
        ))}
      </div>

      {/* LINE通知の連携カード */}
      <div className="glass rounded-2xl p-5 shadow-card animate-fade-in-up">
        <p className="text-sm font-medium text-ink/70 mb-3">LINE通知の連携</p>
        {lineLinkLoading ? (
          <p className="text-xs text-ink/40">読み込み中…</p>
        ) : lineLinked ? (
          <div className="flex items-center gap-2">
            <span className="text-lg text-green-500">✓</span>
            <span className="text-sm font-medium text-ink">LINE連携済み</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-ink/60 space-y-1">
              <p>① 公式LINEアカウントを友だち追加</p>
              <p>② 下の連携コードをトークで送信してください</p>
            </div>
            {lineLinkCode ? (
              <div className="flex items-center gap-3">
                <span className="font-mincho text-2xl font-bold tracking-widest text-brand select-all">
                  {lineLinkCode}
                </span>
                <button
                  onClick={handleCopyCode}
                  className="text-xs px-3 py-1.5 rounded-lg bg-brand/10 text-brand font-medium hover:bg-brand/20 transition-colors"
                >
                  {codeCopied ? 'コピー済み ✓' : 'コピー'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-ink/40">連携コードを取得できませんでした</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
