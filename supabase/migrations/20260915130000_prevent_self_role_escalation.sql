/*
  # CRITICAL: prevent a user from granting themselves admin

  1. Problem
     "profiles_update_own_or_admin" lets a user UPDATE their own profile
     row (`auth.uid() = id`), intended for editing their own name. But the
     policy is a row-level check only - it never restricts WHICH COLUMNS a
     non-admin may change. Because `auth.uid() = id` is true for the
     row's owner, `WITH CHECK` still passes even when the update includes
     `role`. Any signed-in va_student could run:

       supabase.from('profiles').update({ role: 'admin' }).eq('id', me)

     and immediately become admin - a full RBAC bypass, since every
     is_admin() check (every RLS policy, ProtectedRoute, etc.) just
     re-reads this same column.

  2. Fix
     A BEFORE UPDATE trigger that rejects any change to `role` unless the
     caller is already an admin. This is enforced in the database, not
     just the app, so it holds regardless of what the client sends.
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
