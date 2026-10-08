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
 * An email with no existing profile here is auto-provisioned as a new
 * account (full access intended: every VA signed up in the partner's own
 * dashboard should land here with no separate manual signup step).
 * admin.auth.admin.createUser() below never sets app_metadata.provider:
 * 'google', so handle_new_user()'s own admin-allowlist promotion (which
 * requires exactly that provider) can never fire for an SSO-created
 * account on its own - a brand new account always starts as va_student.
 *
 * The payload also carries isAdmin: the partner's dashboard is a trusted
 * source for who should land here as an admin (e.g. one of their own
 * dashboard admins), so isAdmin: true explicitly elevates that email's
 * profiles.role to 'admin' - this is a deliberate, requested trust
 * decision, not an incidental side effect. Elevation is one-directional
 * only: isAdmin: false NEVER strips admin from an account that already
 * has it for other reasons (e.g. a real admin who signed in directly via
 * Google) - it simply leaves the role alone either way.
 */

// The token is minted by the partner's backend, then has to survive: the
// network hop to the browser, the embedding iframe cold-downloading and
// booting this app's full JS bundle (first visit, no cache - can take
// several seconds on a slow connection), THEN the round trip to this
// endpoint. 60s turned out to be too tight for that whole chain on a slow
// cold load, producing an "expired" rejection that looked like a UI race
// from the outside. Still tight enough that a captured URL (browser
// history, a proxy log, a screenshot) is useless within a couple of
// minutes.
const MAX_TOKEN_AGE_MS = 180_000;
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

  let parsed: { email?: unknown; iat?: unknown; isAdmin?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Malformed SSO token payload.' });
    return;
  }

  const email = typeof parsed.email === 'string' ? parsed.email.trim().toLowerCase() : null;
  const iat = typeof parsed.iat === 'number' ? parsed.iat : null;
  // Defaults to false (never elevates) for any token shaped without this
  // field at all, not just an explicit false - older-shaped tokens from
  // before this field existed must never be treated as admin requests.
  const isAdmin = parsed.isAdmin === true;
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

  async function lookupProfile() {
    return admin.from('profiles').select('role').eq('email', email as string).maybeSingle();
  }

  const { data: existingProfile, error: lookupError } = await lookupProfile();
  if (lookupError) {
    console.error('SSO profile lookup error:', lookupError);
    res.status(500).json({ error: 'Could not verify this account.' });
    return;
  }

  let profile = existingProfile;
  if (!profile) {
    // First time this email has ever reached the SOP portal - provision a
    // brand new account rather than rejecting it. email_confirm: true
    // skips the usual "confirm your email" step, since the partner's own
    // signed token IS the proof of identity here. Deliberately NOT passing
    // app_metadata.provider: 'google' - see the comment at the top of this
    // file for why that matters.
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    // A "this email is already registered" error here just means a
    // concurrent SSO request (e.g. a double-click, or two tabs) already
    // created the account a moment ago - fall through to re-fetch it
    // rather than treating that as a failure.
    if (createError && !/already.*registered|already exists/i.test(createError.message ?? '')) {
      console.error('SSO auto-provision error:', createError);
      res.status(500).json({ error: 'Could not create an account for this email.' });
      return;
    }

    const { data: freshProfile, error: refetchError } = await lookupProfile();
    if (refetchError) {
      console.error('SSO profile re-fetch error:', refetchError);
      res.status(500).json({ error: 'Could not verify this account.' });
      return;
    }
    if (!freshProfile) {
      console.error('SSO: profile still missing immediately after createUser for', email);
      res.status(500).json({ error: 'Could not finish setting up this account.' });
      return;
    }
    profile = freshProfile;
  }

  if (isAdmin && profile.role !== 'admin') {
    const { error: elevateError } = await admin
      .from('profiles')
      .update({ role: 'admin' })
      .eq('email', email);
    if (elevateError) {
      console.error('SSO admin-elevation error:', elevateError);
      res.status(500).json({ error: 'Could not finish setting up this account.' });
      return;
    }
    profile = { ...profile, role: 'admin' };
  }
  // isAdmin === false intentionally falls through here with no action at
  // all, whatever profile.role already is - see the file's top comment on
  // why downgrading is never allowed.

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
