interface LavaLogoProps {
  /** Size/shape classes. For variant="badge" these apply to the outer square (e.g. "w-10 h-10 rounded-xl"). */
  className?: string;
  /** "mark" = red robot icon only. "badge" = icon on the dark LAVA square backdrop. */
  variant?: 'mark' | 'badge';
}

const RED = '#E31E24';

function RobotIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* antenna */}
      <circle cx="50" cy="12" r="7" fill={RED} />
      <path d="M50 19 L50 25 L45 31 L50 37" stroke={RED} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      {/* head outline */}
      <rect x="18" y="32" width="64" height="54" rx="24" stroke={RED} strokeWidth="9" />
      {/* eyes */}
      <circle cx="38" cy="58" r="7" fill={RED} />
      <circle cx="62" cy="58" r="7" fill={RED} />
      {/* feet */}
      <rect x="29" y="78" width="10" height="18" rx="5" fill={RED} />
      <rect x="61" y="78" width="10" height="18" rx="5" fill={RED} />
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
