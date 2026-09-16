import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { FatalError } from './components/FatalError.tsx';
import { isSupabaseConfigured } from './lib/supabase.ts';
import './index.css';

// Every deploy renames content-hashed chunk files (e.g. pdf-<hash>.js) -
// a tab left open from before a redeploy, or a browser that cached the
// old page, ends up asking the new deployment for a file that no longer
// exists. Vite's production build wraps every dynamic import() with a
// helper that dispatches this event on exactly that failure ("Failed to
// fetch dynamically imported module") instead of leaving the app stuck.
// Reloading once picks up the current deployment. Guarded with
// sessionStorage so a genuinely broken deployment doesn't reload forever
// - it only auto-retries once, then falls through to the ErrorBoundary.
// The flag is cleared shortly after a successful mount so the same tab
// can still recover from a LATER redeploy if it's left open for a while.
const STALE_CHUNK_KEY = 'lava-reloaded-after-stale-chunk';
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem(STALE_CHUNK_KEY)) return;
  sessionStorage.setItem(STALE_CHUNK_KEY, '1');
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSupabaseConfigured ? (
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    ) : (
      <FatalError
        title="Configuration missing"
        message="Missing VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY for this deployment."
      />
    )}
  </StrictMode>
);

// Made it this far without a preload error - the current bundle is good.
// Clear the flag so a stale-chunk failure from a LATER redeploy (this same
// tab left open for hours/days) can still trigger one more auto-reload.
setTimeout(() => sessionStorage.removeItem(STALE_CHUNK_KEY), 3000);
