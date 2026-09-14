/*
  One-shot fix: make sure andy@lavaautomation.com is admin right now,
  regardless of what state the DB trigger or profiles table are currently
  in. Safe to re-run any time.

  Run this in Supabase Dashboard -> SQL Editor -> New query -> Run.
*/

-- 1. Make sure future signups follow the two-admin allowlist (jonas + andy).
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

-- 2. Force-correct the existing row for andy's account, if he has already
--    signed in at least once (this is the part that actually fixes what
--    you're seeing right now, if he's already signed in as va_student).
UPDATE profiles
SET role = 'admin'
WHERE lower(email) = 'andy@lavaautomation.com';

-- 3. Proof: this should show role = admin. If it shows 0 rows, andy
--    hasn't signed in yet at all - have him sign in once first (he'll
--    land as va_student), then re-run this script to promote him.
SELECT id, email, role, full_name FROM profiles WHERE lower(email) = 'andy@lavaautomation.com';
