/**
 * デモモード。ON の間はログイン不要でロール切替バーを表示し、'/' で管理者に自動入場する。
 * 本番開始時は Vercel の環境変数 `VITE_DEMO_MODE=false` を設定するとログインが復活する。
 * 未設定時は既定 ON（現行のデモ運用を維持）。
 */
export const DEMO_MODE = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false';
