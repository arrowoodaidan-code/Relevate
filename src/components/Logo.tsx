/**
 * Relevate brand logo components — the original leaf-house mark.
 *
 * A leaf shape with a house cutout, emerald gradient, and wood stem.
 * Production vector source: /home/team/shared/logos/relevate-logo.svg
 * (design team, 2026-08-05). IDs are namespaced per instance so multiple marks
 * can render on the same page without SVG gradient/pattern collisions.
 */
let logoIdCounter = 0;
function nextLogoId(): string {
  logoIdCounter += 1;
  return `rel-logo-${logoIdCounter}`;
}
interface RelevateMarkProps {
  className?: string;
  ariaLabel?: string;
}

/**
 * Leaf-house mark (64×64 viewBox): emerald leaf with a house cutout and wood stem.
 */
export function RelevateMark({
  className,
  ariaLabel = "Relevate",
}: RelevateMarkProps) {
  const id = nextLogoId();
  const leafGrad = `${id}-leaf`;
  const woodGrad = `${id}-wood`;
  const houseMask = `${id}-house-mask`;
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id={leafGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a7f3d0" />
          <stop offset="30%" stopColor="#34d399" />
          <stop offset="70%" stopColor="#059669" />
          <stop offset="100%" stopColor="#065f46" />
        </linearGradient>
        <linearGradient id={woodGrad} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#b08d57" />
          <stop offset="100%" stopColor="#8a5a3b" />
        </linearGradient>
        <mask id={houseMask}>
          <rect x="0" y="0" width="64" height="64" fill="#fff" />
          <path d="M24 35 L32 26.5 L40 35 L40 48.5 L24 48.5 Z" fill="#000" />
          <rect x="28.8" y="40" width="6.4" height="8.5" rx="1" fill="#fff" />
        </mask>
      </defs>
      <path
        mask={`url(#${houseMask})`}
        d="M32 3 C43 3 54.5 17 51.5 33 C49.2 45.5 41.5 54.5 32 54.5 C22.5 54.5 14.8 45.5 12.5 33 C9.5 17 21 3 32 3 Z"
        fill={`url(#${leafGrad})`}
      />
      <path
        mask={`url(#${houseMask})`}
        d="M32 8.5 C30.5 20 30.5 34 32 47"
        fill="none"
        stroke="#d1fae5"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.45"
      />
      <path d="M32 54.5 L32 60.5" stroke={`url(#${woodGrad})`} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Full lockup: leaf-house mark + "Relevate" wordmark + wood underline
 * (260×64 viewBox). For headers, footers, and print.
 */
export function RelevateLockup({
  className,
  ariaLabel = "Relevate — AI marketing for real estate agents",
}: RelevateMarkProps) {
  const id = nextLogoId();
  const leafGrad = `${id}-leaf`;
  const woodGrad = `${id}-wood`;
  const houseMask = `${id}-house-mask`;
  return (
    <svg
      viewBox="0 0 260 64"
      className={className}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id={leafGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a7f3d0" />
          <stop offset="30%" stopColor="#34d399" />
          <stop offset="70%" stopColor="#059669" />
          <stop offset="100%" stopColor="#065f46" />
        </linearGradient>
        <linearGradient id={woodGrad} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#b08d57" />
          <stop offset="100%" stopColor="#8a5a3b" />
        </linearGradient>
        <mask id={houseMask}>
          <rect x="0" y="0" width="64" height="64" fill="#fff" />
          <path d="M24 35 L32 26.5 L40 35 L40 48.5 L24 48.5 Z" fill="#000" />
          <rect x="28.8" y="40" width="6.4" height="8.5" rx="1" fill="#fff" />
        </mask>
      </defs>

      {/* Mark (52px within 260×64 canvas) */}
      <use href={`#rel-mark-${id}`} x="0" y="4" width="52" height="52" />

      {/* Wordmark */}
      <text
        x="68"
        y="41"
        fontFamily="'Inter','Segoe UI',system-ui,sans-serif"
        fontSize="32"
        fontWeight="700"
        letterSpacing="0.5"
        fill="#d1fae5"
      >
        Relevate
      </text>
      {/* Wood underline accent */}
      <rect x="68" y="50" width="148" height="3" rx="1.5" fill={`url(#${woodGrad})`} />
    </svg>
  );
}
