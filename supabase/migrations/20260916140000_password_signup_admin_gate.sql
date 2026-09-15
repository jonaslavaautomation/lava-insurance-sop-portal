/*
  # Re-allow password sign-up for VAs, without reopening the admin-email
  # squatting hole

  1. Background
     Password sign-up was removed entirely earlier (see the "Fix critical
     auth/RBAC security gaps" commit) because handle_new_user() grants
     admin purely by matching NEW.email against the allowlist, with no
     check on HOW the account was created - so anyone could have signed up
     with a password using one of the admin emails and been auto-granted
     admin, without ever proving they own that Google account.

  2. This migration
     Brings password sign-up back (VAs without a Google account need a way
     in), but closes the actual hole at its source instead of removing the
     feature: handle_new_user() now only grants admin when BOTH the email
     matches the allowlist AND the sign-up came from a verified Google
     identity (NEW.raw_app_meta_data->>'provider' = 'google'). A password
     sign-up using an admin's exact email now always lands as va_student,
     regardless of the allowlist - it can only ever become admin by
     actually signing in with that Google account, or being promoted
     manually by an existing admin (see promote_to_admin.sql).
*/

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE
      WHEN lower(NEW.email) IN (
        'jonas@lavaautomation.com',
        'andy@lavaautomation.com',
        'martin@lavaautomation.com',
        'leo@lavaautomation.com',
        'au@lavaautomation.com',
        'shandyl.s@lavaautomation.com'
      )
        AND NEW.raw_app_meta_data->>'provider' = 'google'
        THEN 'admin'
      ELSE 'va_student'
    END
  );
  RETURN NEW;
END;
$$;
