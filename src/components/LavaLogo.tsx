interface LavaLogoProps {
  /** Size/shape classes, e.g. "w-10 h-10 rounded-xl". */
  className?: string;
  /** "badge" (default) = the real LAVA logo file (robot mark + wordmark on
   *  its own dark background). "mark" = a hand-drawn robot-icon-only SVG,
   *  transparent, for spots where the wordmark would be illegible (kept
   *  for that case even though nothing currently uses it). */
  variant?: 'mark' | 'badge';
}

const RED = '#E31E24';

/** Hand-drawn fallback icon (no wordmark) - only used for variant="mark". */
function RobotIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* antenna */}
      <circle cx="50" cy="11" r="7.5" fill={RED} />
      <path d="M50 18.5 L50 24 L44.5 29.5 L50 35" stroke={RED} strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* head outline */}
      <rect x="16" y="30" width="68" height="58" rx="27" stroke={RED} strokeWidth="9.5" />
      {/* eyes */}
      <circle cx="36.5" cy="55" r="8" fill={RED} />
      <circle cx="63.5" cy="55" r="8" fill={RED} />
      {/* feet */}
      <rect x="27" y="80" width="12" height="20" rx="6" fill={RED} />
      <rect x="61" y="80" width="12" height="20" rx="6" fill={RED} />
    </svg>
  );
}

export function LavaLogo({ className = 'w-9 h-9', variant = 'badge' }: LavaLogoProps) {
  if (variant === 'mark') {
    return <RobotIcon className={className} />;
  }

  // The actual brand file (public/brand/lava-logo.png), not a redrawn
  // approximation - same asset used everywhere else the LAVA logo appears.
  return <img src="/brand/lava-logo.png" alt="LAVA Automation" className={`${className} object-cover flex-shrink-0`} />;
}
