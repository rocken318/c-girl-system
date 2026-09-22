/**
 * Kingyo logo — renders the official PNG logo from /public.
 *
 * Props:
 *  - size: pixel size (width=height, aspect ratio preserved via object-fit)
 *  - animate: adds the float animation
 *  - onDark: true (default) = white logo as-is on dark backgrounds
 *            false = logo inside a brand-red circle for contrast on light backgrounds
 */
export function KingyoIcon({
  size = 48,
  animate = false,
  onDark = true,
}: {
  size?: number;
  animate?: boolean;
  onDark?: boolean;
}) {
  const img = (
    <img
      src="/kingyo_logo_white_transparent.png"
      alt="Kingyo"
      width={onDark ? size : Math.round(size * 0.65)}
      height={onDark ? size : Math.round(size * 0.65)}
      className="object-contain"
      draggable={false}
    />
  );

  if (onDark) {
    return (
      <span className={animate ? 'animate-float inline-block' : 'inline-block'}>
        {img}
      </span>
    );
  }

  // Light background: show logo inside a brand-red circle for contrast
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-brand ${animate ? 'animate-float' : ''}`}
      style={{ width: size, height: size }}
    >
      {img}
    </span>
  );
}
