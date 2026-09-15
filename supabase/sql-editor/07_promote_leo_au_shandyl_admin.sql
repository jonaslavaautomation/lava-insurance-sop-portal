/*
  One-shot fix: make sure leo@lavaautomation.com, au@lavaautomation.com
  and shandyl.s@lavaautomation.com are admin right now, regardless of what
  state the DB trigger or profiles table are currently in. Safe to re-run
  any time.

  Run this in Supabase Dashboard -> SQL Editor -> New query -> Run.
*/

-- 1. Make sure future signups follow the six-admin allowlist
--    (jonas + andy + martin + leo + au + shandyl.s).
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

-- 2. Force-correct the existing rows for these three accounts, if any of
--    them have already signed in at least once (this is the part that
--    actually fixes what you're seeing right now, for anyone who already
--    signed in as va_student before this ran).
UPDATE profiles
SET role = 'admin'
WHERE lower(email) IN (
  'leo@lavaautomation.com',
  'au@lavaautomation.com',
  'shandyl.s@lavaautomation.com'
);

-- 3. Proof: shows role = admin for whichever of the three have already
--    signed in. A missing row means that person hasn't signed in yet at
--    all - have them sign in once first (they'll land as va_student), then
--    re-run this script to promote them.
SELECT id, email, role, full_name FROM profiles
WHERE lower(email) IN (
  'leo@lavaautomation.com',
  'au@lavaautomation.com',
  'shandyl.s@lavaautomation.com'
);
