import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

/**
 * Lands here inside the Google sign-in popup window (see
 * AuthContext.signInWithGoogle) — never as the main app. Its only job is:
 * grab the session Supabase just established from the OAuth redirect,
 * hand the tokens to the window that opened it via postMessage, and close
 * itself. Deliberately tiny/dependency-light so the popup finishes fast.
 *
 * If this page is ever opened directly (no window.opener — someone
 * bookmarked it, or popups were blocked and we fell back to a full-page
 * redirect), it falls back to just navigating into the app itself instead
 * of trying to close a tab it didn't open.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionError || !data.session) {
        setError(sessionError?.message ?? 'Sign-in did not complete. Please try again.');
        return;
      }

      const { access_token, refresh_token } = data.session;

      if (window.opener && window.opener !== window) {
        window.opener.postMessage(
          { source: 'lava-google-oauth', access_token, refresh_token },
          window.location.origin
        );
        window.close();
        // Some browsers momentarily keep rendering after close() is called -
        // fall back to a normal in-page redirect if we're still here shortly after.
        setTimeout(() => { if (!cancelled) navigate('/admin', { replace: true }); }, 800);
      } else {
        navigate('/admin', { replace: true });
      }
    }

    finish();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink px-4">
      <div className="text-center">
        {error ? (
          <>
            <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-slate-300">{error}</p>
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="text-sm text-brand-400 hover:text-brand-300 mt-3"
            >
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <Loader2 className="w-6 h-6 text-brand-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Signing you in...</p>
          </>
        )}
      </div>
    </div>
  );
}
