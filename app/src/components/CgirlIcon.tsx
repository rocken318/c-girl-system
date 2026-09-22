/**
 * C-girl ロゴマーク — 自己完結型のインライン SVG（ピンク→パープルのグラデーション円に白い "C"）。
 * gradient 円が背景色に依存せず視認できるため onDark は互換のため残すのみ（描画は不変）。
 * 正式ロゴ確定時はこのコンポーネントのみ差し替える。
 */
export function CgirlIcon({
  size = 48,
  animate = false,
  onDark: _onDark = true,
}: {
  size?: number;
  animate?: boolean;
  onDark?: boolean;
}) {
  return (
    <span className={animate ? 'animate-float inline-block' : 'inline-block'}>
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="C-girl" className="object-contain">
        <defs>
          <linearGradient id="cgirl-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e6398b" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="46" fill="url(#cgirl-grad)" />
        <path d="M66 36a20 20 0 1 0 0 28" fill="none" stroke="#ffffff" strokeWidth="9" strokeLinecap="round" />
      </svg>
    </span>
  );
}
