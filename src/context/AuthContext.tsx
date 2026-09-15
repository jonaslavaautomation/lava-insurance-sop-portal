import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Profile } from '@/lib/supabase';

interface AuthContextType {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('Error loading profile:', error);
    }
    setProfile(data as Profile | null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        // `loading` covers this too, not just the very first getSession()
        // call above — without it, ProtectedRoute sees a truthy session
        // with a still-null profile (e.g. right after Google sign-in) and,
        // since it only gates on `loading`, would briefly treat an
        // unverified-role user as authorized. See ProtectedRoute.tsx.
        setLoading(true);
        loadProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Opens Google sign-in in a small popup instead of navigating the whole
  // tab away - the main app never unmounts, so it comes back instantly
  // once the popup finishes instead of reloading the entire SPA from
  // scratch. `skipBrowserRedirect: true` stops the SDK from doing its
  // usual full-page redirect itself; we open the returned URL in a popup
  // instead. The popup lands on /auth/callback (AuthCallback.tsx), which
  // hands its session back to this window via postMessage and closes.
  async function signInWithGoogle(): Promise<{ error: string | null }> {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data?.url) {
      return { error: error?.message ?? 'Could not start Google sign-in.' };
    }

    const width = 480;
    const height = 640;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
    const popup = window.open(
      data.url,
      'lava-google-signin',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      // Popup blocked - fall back to the old full-tab redirect rather than
      // leaving the user stuck with no way to sign in.
      window.location.href = data.url;
      return { error: null };
    }

    return new Promise((resolve) => {
      let settled = false;

      function cleanup() {
        window.removeEventListener('message', onMessage);
        clearInterval(pollClosed);
      }

      async function onMessage(event: MessageEvent) {
        if (event.origin !== window.location.origin) return;
        if (event.data?.source !== 'lava-google-oauth') return;
        if (settled) return;
        settled = true;
        cleanup();

        const { access_token, refresh_token } = event.data as { access_token: string; refresh_token: string };
        const { error: setError } = await supabase.auth.setSession({ access_token, refresh_token });
        resolve({ error: setError?.message ?? null });
      }

      // If the user closes the popup themselves (or it closes without ever
      // messaging back, e.g. they denied access on Google's screen) resolve
      // with a gentle "cancelled" rather than hanging forever.
      const pollClosed = setInterval(() => {
        if (popup.closed && !settled) {
          settled = true;
          cleanup();
          resolve({ error: 'Sign-in was cancelled.' });
        }
      }, 400);

      window.addEventListener('message', onMessage);
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
