import { supabase } from '@/lib/supabase';

/**
 * Completes an SSO handoff from a partner's own VA Dashboard app, if the
 * current URL carries a `?sso=<token>` query param - see api/sso-login.ts
 * for the server half of this handshake, and the comment on
 * AuthContext.tsx's bootstrap effect for why this runs where it does.
 *
 * The token itself is a short-lived, HMAC-signed proof of identity minted
 * by the partner's own backend using a secret shared only between the two
 * servers - this function never sees or needs that secret; it just calls
 * our own /api/sso-login to have it checked, then redeems whatever that
 * hands back through Supabase's own verifyOtp() using only the public
 * anon key, exactly like clicking a magic-link email.
 *
 * The query param is stripped from the URL immediately, before the
 * exchange even starts, so it can never be replayed from browser history
 * or a back/forward navigation regardless of whether the exchange below
 * succeeds.
 */
export async function completeSsoHandoffIfPresent(): Promise<void> {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('sso');
  if (!token) return;

  url.searchParams.delete('sso');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);

  try {
    const res = await fetch('/api/sso-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sso: token }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { error?: string });
      console.error('SSO login failed:', body.error ?? res.statusText);
      return;
    }
    const { email, tokenHash } = (await res.json()) as { email: string; tokenHash: string };
    const { error } = await supabase.auth.verifyOtp({ email, token: tokenHash, type: 'magiclink' });
    if (error) console.error('SSO verifyOtp failed:', error.message);
  } catch (err) {
    console.error('SSO login error:', err);
  }
}
