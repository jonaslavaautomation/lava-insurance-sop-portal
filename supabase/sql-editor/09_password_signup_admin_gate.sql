/*
  One-shot: re-enables password sign-up safely. VAs without a Google
  account can now create an account with just an email + password, while
  the admin allowlist can still only ever be granted through a verified
  Google sign-in - a password account using an admin's exact email always
  lands as va_student.

  Safe to re-run any time. Run this in Supabase Dashboard -> SQL Editor ->
  New query -> Run.
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

-- Proof: this shows 'provider' for each existing account so you can
-- confirm the admins really did come in via google:
SELECT id, email, raw_app_meta_data->>'provider' AS provider
FROM auth.users
ORDER BY created_at;
