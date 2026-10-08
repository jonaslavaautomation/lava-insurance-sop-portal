/*
  Fixes a real bug introduced by 06_prevent_self_role_escalation.sql: that
  trigger correctly blocks a signed-in (non-admin) user from promoting
  themselves via the client-side anon/authenticated connection, but it
  ALSO blocks api/sso-login.ts's own trusted, server-side admin-elevation
  step - the one that runs when a partner-signed SSO token carries
  isAdmin: true.

  Why: is_admin() checks `auth.uid()` against the profiles table, but the
  SSO endpoint updates profiles using the service_role key with no user
  session attached at all - auth.uid() is NULL there, so is_admin() always
  returns false, and the trigger raises "Only an admin may change a
  profile's role" every single time. This made every isAdmin: true SSO
  elevation fail with a 500 ("Could not finish setting up this account."),
  while looking like a UI/auto-login bug from the outside - confirmed live
  by reproducing the exact failure against production.

  Fix: also allow the change when the request itself is authenticated as
  the service_role Postgres role (auth.role() = 'service_role') - i.e.
  only our own backend, using a key that never reaches the browser, not
  any signed-in user. The original self-escalation protection for
  ordinary users is completely unchanged.

  Safe to re-run any time. Run this in Supabase Dashboard -> SQL Editor ->
  New query -> Run.
*/

CREATE OR REPLACE FUNCTION prevent_self_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND NOT is_admin()
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only an admin may change a profile''s role';
  END IF;
  RETURN NEW;
END;
$$;

-- Proof: as your own (non-admin) account this should still fail with
-- "Only an admin may change a profile's role" if attempted:
--   update profiles set role = 'admin' where id = auth.uid();
