/*
  # Auto-promote company-domain sign-ins to admin

  1. Purpose
     Anyone signing up (including via Google OAuth) with an
     @lavaautomation.com email is automatically given the 'admin' role
     instead of the 'va_student' default. Everyone else still starts as
     'va_student' and must be promoted manually (see
     supabase/sql-editor/promote_to_admin.sql).

  2. Changes
     - Replaces handle_new_user() to set role based on email domain at
       signup time. Existing profiles are untouched — this only affects
       new signups going forward.
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
    CASE WHEN NEW.email ILIKE '%@lavaautomation.com' THEN 'admin' ELSE 'va_student' END
  );
  RETURN NEW;
END;
$$;
