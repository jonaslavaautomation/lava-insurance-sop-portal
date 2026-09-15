/*
  # Add leo@lavaautomation.com, au@lavaautomation.com and
  # shandyl.s@lavaautomation.com as admins

  1. Purpose
     Extends the admin allowlist in handle_new_user() (see
     20260915130000_prevent_self_role_escalation.sql and the earlier
     20260914130000/20260914140000 migrations) to also auto-promote three
     more emails to admin on sign-in, alongside jonas@lavaautomation.com,
     andy@lavaautomation.com and martin@lavaautomation.com.

  2. Changes
     - Replaces handle_new_user() to check an exact-email allowlist of six
       emails instead of three. Still not domain-wide - every other
       account (any other @lavaautomation.com address included) still
       starts as va_student and must be promoted manually.
     - Does NOT retroactively change an existing profile row - the trigger
       only fires on new-user creation. If any of these three has already
       signed in once (so a 'va_student' profile row already exists), also
       run supabase/sql-editor/07_promote_leo_au_shandyl_admin.sql once in
       the Supabase SQL Editor to fix that existing row.
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
        THEN 'admin'
      ELSE 'va_student'
    END
  );
  RETURN NEW;
END;
$$;
