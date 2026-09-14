/*
  # Add martin@lavaautomation.com as a third admin

  1. Purpose
     - Extends the admin allowlist in handle_new_user() (see
       20260914130000_add_andy_admin.sql) to also auto-promote
       martin@lavaautomation.com to admin on sign-in, alongside
       jonas@lavaautomation.com and andy@lavaautomation.com.

  2. Changes
     - Replaces handle_new_user() to check an exact-email allowlist
       (jonas + andy + martin) instead of just jonas + andy. Still not
       domain-wide - everyone else (any domain, including other
       @lavaautomation.com accounts) starts as va_student and must be
       promoted manually.
     - Does NOT retroactively change an existing profile row - the trigger
       only fires on new-user creation. If martin@lavaautomation.com has
       already signed in once (so a 'va_student' profile row already
       exists for him), also run
       supabase/sql-editor/04_promote_martin_admin.sql once in the
       Supabase SQL Editor to fix that existing row.
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
        'martin@lavaautomation.com'
      )
        THEN 'admin'
      ELSE 'va_student'
    END
  );
  RETURN NEW;
END;
$$;
