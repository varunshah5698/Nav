const INK = "#14180F";
const LIME = "#D8F85E";

/**
 * ResearchGraph mark — three connected nodes on a lime tile.
 * The two filled nodes sit on the baseline (what we have measured);
 * the hollow apex node is the open question sitting on top of them.
 */
export function LogoMark({
  size = 30,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <rect width="32" height="32" rx="9" fill={LIME} />
      <g transform="rotate(-10 16 16)" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M16 9.2 9.2 21.8M16 9.2l6.8 12.6M9.2 21.8h13.6"
          fill="none"
          stroke={INK}
          strokeOpacity="0.55"
          strokeWidth="2.1"
        />
        <circle cx="9.2" cy="21.8" r="3.3" fill={INK} />
        <circle cx="22.8" cy="21.8" r="3.3" fill={INK} />
        <circle cx="16" cy="9.2" r="2.6" fill={LIME} stroke={INK} strokeWidth="2.1" />
      </g>
    </svg>
  );
}
