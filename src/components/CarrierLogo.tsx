import { useState } from 'react';
import { Building2 } from 'lucide-react';

// Same convention as public/carriers/README.md: lowercase, spaces/punctuation
// collapsed to single hyphens, matching the company name exactly.
export function slugifyCarrierName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const EXTENSIONS = ['svg', 'png', 'jpg', 'jpeg'];

/**
 * Shows the real carrier logo from public/carriers/<slugified-name>.<ext>
 * when one exists (tries each extension in turn), falling back to the
 * generic building icon badge if none is there yet - so adding a logo file
 * later just works, and a company without one yet never renders broken.
 */
export function CarrierLogo({ name, size = 36 }: { name: string; size?: number }) {
  const slug = slugifyCarrierName(name);
  const [extIndex, setExtIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const dim = { width: size, height: size };

  if (failed || extIndex >= EXTENSIONS.length) {
    return (
      <div className="rounded-md bg-brand-500/10 flex items-center justify-center flex-shrink-0" style={dim}>
        <Building2 className="text-brand-400" style={{ width: size * 0.55, height: size * 0.55 }} />
      </div>
    );
  }

  return (
    <div className="rounded-md bg-white flex items-center justify-center flex-shrink-0 overflow-hidden p-1" style={dim}>
      <img
        key={slug}
        src={`/carriers/${slug}.${EXTENSIONS[extIndex]}`}
        alt={`${name} logo`}
        className="max-w-full max-h-full object-contain"
        onError={() => {
          if (extIndex + 1 < EXTENSIONS.length) setExtIndex((i) => i + 1);
          else setFailed(true);
        }}
      />
    </div>
  );
}
