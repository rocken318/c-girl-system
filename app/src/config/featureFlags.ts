/**
 * フィーチャーフラグ — 運用開始前の機能を一括で ON/OFF する。
 * true にするだけで表示が復活するよう、JSX は削除せずフラグでガードする。
 */

/** 売上バック（各種バック / 本指名売上バック 等）の表示フラグ
 *  false: バック設定タブ・給与明細の各種バックセクションを非表示
 *  true : 通常表示（バック運用開始時に true へ変更）
 */
export const SHOW_SALES_BACK = true;

/** 歩合（commission = 売上 × %) の表示フラグ
 *  false: 歩合設定タブ・給与明細の歩合セクションを非表示
 *         ※計算は defaultSettings.commissionRates の rate:0 で結果を0にする（エンジン不変）
 *  true : 通常表示
 */
export const SHOW_COMMISSION = false;
