interface LavaLogoProps {
  /** Size/shape classes. For variant="badge" these apply to the outer square (e.g. "w-10 h-10 rounded-xl"). */
  className?: string;
  /** "mark" = red robot icon only. "badge" = icon on the dark LAVA square backdrop. */
  variant?: 'mark' | 'badge';
}

const RED = '#E31E24';

/**
 * The LAVA robot mark. Geometry here is the single source of truth — keep
 * public/favicon.svg's shapes numerically identical to this if it ever
 * changes, so the in-app logo, the browser favicon, and the social-share
 * image (scripts/generate-og-image.* ) never drift apart.
 */
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

  return (
    <div className={`${className} bg-[#1C1C1F] flex items-center justify-center flex-shrink-0`}>
      <RobotIcon className="w-[62%] h-[62%]" />
    </div>
  );
}
