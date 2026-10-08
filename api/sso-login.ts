import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * SSO handoff endpoint for VAs signing in through a partner's own VA
 * Dashboard app, then clicking through into this SOP portal. The partner's
 * backend signs a short-lived { email, iat } payload with a secret shared
 * only between the two servers (SOP_SSO_SECRET) and sends the VA here as
 * e.g. /portal?sso=<base64url-payload>.<hex-hmac-signature> - see
 * src/lib/ssoHandoff.ts for the frontend half of this handshake.
 *
 * This endpoint never mints a session directly. All it does is confirm
 * "this request really did come from the partner's trusted backend, for
 * this exact email, within the last minute" - then hands back a Supabase
 * one-time magic-link token (via the admin API, using the service_role
 * key). The frontend redeems that itself through the normal,
 * already-audited supabase.auth.verifyOtp() path using only the public
 * anon key. The service_role key and SOP_SSO_SECRET never leave this
 * function.
 *
 * Deliberately conservative on both ends:
 *  - An email with no existing profile here is rejected, not silently
 *    provisioned - SSO only ever signs in a VA already known to this
 *    portal (added by an admin, or who's signed up here before), never
 *    creates a new account on the partner's say-so alone.
 *  - An existing profile with role 'admin' is rejected too - this path can
 *    only ever produce a va_student session, regardless of what the
 *    partner's own data says, as an independent second guard against ever
 *    using SSO to reach an admin account.
 */

// Generous enough for real network latency between the two servers, tight
// enough that a captured URL (browser history, a proxy log, a screenshot)
// is useless within a couple of minutes.
const MAX_TOKEN_AGE_MS = 60_000;
const MAX_CLOCK_SKEW_MS = 30_000;

// Minimal structural types for Vercel's Node request/response - avoids
// pulling in @vercel/node purely for two type aliases (its real install,
// tried first, dragged in ~30 transitive vulnerabilities including a
// critical one for what would only ever be used as type annotations).
interface ApiRequest {
  method?: string;
  body?: unknown;
}
interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

// Exported purely so it can be unit-tested directly (HMAC comparison logic
// is the one security-critical piece of this file worth isolating) -
// not used anywhere outside this module otherwise.
export function verifySignature(payload: string, signatureHex: string, secret: string): boolean {
  const expectedHex = createHmac('sha256', secret).update(payload).digest('hex');
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(signatureHex, 'hex');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secret = process.env.SOP_SSO_SECRET;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !supabaseUrl || !serviceRoleKey) {
    console.error('SSO login misconfigured: missing SOP_SSO_SECRET / VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    res.status(500).json({ error: 'SSO is not configured on this server.' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const token = typeof body.sso === 'string' ? body.sso : null;
  if (!token || !token.includes('.')) {
    res.status(400).json({ error: 'Missing or malformed SSO token.' });
    return;
  }

  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature || !verifySignature(payloadB64, signature, secret)) {
    res.status(401).json({ error: 'Invalid SSO token.' });
    return;
  }

  let parsed: { email?: unknown; iat?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Malformed SSO token payload.' });
    return;
  }

  const email = typeof parsed.email === 'string' ? parsed.email.trim().toLowerCase() : null;
  const iat = typeof parsed.iat === 'number' ? parsed.iat : null;
  if (!email || !iat) {
    res.status(400).json({ error: 'SSO token payload missing email or timestamp.' });
    return;
  }

  const age = Date.now() - iat;
  if (age > MAX_TOKEN_AGE_MS || age < -MAX_CLOCK_SKEW_MS) {
    res.status(401).json({ error: 'SSO token has expired - please try again from the VA Dashboard.' });
    return;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('email', email)
    .maybeSingle();

  if (profileError) {
    console.error('SSO profile lookup error:', profileError);
    res.status(500).json({ error: 'Could not verify this account.' });
    return;
  }
  if (!profile) {
    res.status(404).json({ error: 'No SOP portal account exists for this email yet.' });
    return;
  }
  if (profile.role !== 'va_student') {
    res.status(403).json({ error: 'This account cannot be signed in through SSO.' });
    return;
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('SSO generateLink error:', linkError);
    res.status(500).json({ error: 'Could not start your session.' });
    return;
  }

  res.status(200).json({ email, tokenHash: linkData.properties.hashed_token });
}
