/*
  # Add andy@lavaautomation.com as a second admin

  1. Purpose
     - Previously only jonas@lavaautomation.com was auto-promoted to admin
       on sign-in (see 20260903200000_single_admin_and_require_auth.sql).
       andy@lavaautomation.com now needs admin access too.

  2. Changes
     - Replaces handle_new_user() to check an exact-email allowlist
       (jonas + andy) instead of a single email. Still not domain-wide -
       everyone else (any domain, including other @lavaautomation.com
       accounts) starts as va_student and must be promoted manually.
     - Does NOT retroactively change an existing profile row - the trigger
       only fires on new-user creation. If andy@lavaautomation.com has
       already signed in once (so a 'va_student' profile row already
       exists for him), also run
       supabase/sql-editor/03_promote_andy_admin.sql once in the Supabase
       SQL Editor to fix that existing row.
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
      WHEN lower(NEW.email) IN ('jonas@lavaautomation.com', 'andy@lavaautomation.com')
        THEN 'admin'
      ELSE 'va_student'
    END
  );
  RETURN NEW;
END;
$$;
