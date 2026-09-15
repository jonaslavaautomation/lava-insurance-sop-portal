import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { LavaLogo } from '@/components/LavaLogo';
import { GoogleIcon } from '@/components/GoogleIcon';

// Google-only by design: role (admin vs va_student) is decided entirely
// server-side, keyed off a verified Google identity's email (see
// handle_new_user() in supabase/sql-editor/00_full_schema.sql). A
// password-based sign-up path used to exist here too, but it let anyone
// attempt to "claim" one of the admin emails via email/password before the
// real owner ever signed in with Google — removed rather than hardened,
// since this product never actually needed it.
export default function Login() {
  const { signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    setGoogleLoading(false);
    if (error) {
      setError(error);
    } else {
      // The popup already established the session (see AuthContext) - this
      // tab never navigated away, so head into the app now.
      navigate('/admin');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <LavaLogo className="w-16 h-16 rounded-2xl mb-4 mx-auto shadow-lg shadow-black/40" />
          <h1 className="text-2xl font-bold text-slate-50">LAVA Automation</h1>
          <p className="text-slate-500 mt-1 text-sm">Insurance SOP Search Portal</p>
        </div>

        <div className="bg-[#121723]/80 rounded-2xl border border-white/[0.08] p-8">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-2.5 border border-white/10 hover:bg-white/[0.04] text-slate-200 font-medium py-2.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon className="w-4 h-4" />}
            Continue with Google
          </button>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 mt-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Sign in with your Google account. New accounts start as VA/Student
          access automatically.
        </p>
      </div>
    </div>
  );
}
