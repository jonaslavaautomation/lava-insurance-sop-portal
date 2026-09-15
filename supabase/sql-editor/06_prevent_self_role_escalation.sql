/*
  CRITICAL one-shot fix: closes a self-privilege-escalation hole.

  "profiles_update_own_or_admin" lets a user UPDATE their own profile row
  (intended for editing their own name), but only checks the ROW (auth.uid()
  = id) - it never restricted which COLUMNS a non-admin may change. That
  means any signed-in va_student could currently run, from the browser
  console or app code:

    supabase.from('profiles').update({ role: 'admin' }).eq('id', <own id>)

  ...and immediately become admin, since every is_admin() check (every RLS
  policy, the admin dashboard's route guard, etc.) just re-reads this same
  column. This adds a database trigger that rejects any change to `role`
  unless the caller is already an admin - enforced server-side regardless
  of what the client sends.

  Safe to re-run any time. Run this in Supabase Dashboard -> SQL Editor ->
  New query -> Run. Do this one first, before anything else.
*/

CREATE OR REPLACE FUNCTION prevent_self_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT is_admin() THEN
    RAISE EXCEPTION 'Only an admin may change a profile''s role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_role_escalation ON profiles;
CREATE TRIGGER trg_prevent_self_role_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_self_role_escalation();

-- Proof: as your own (non-admin) account this should now fail with
-- "Only an admin may change a profile's role" if attempted:
--   update profiles set role = 'admin' where id = auth.uid();
