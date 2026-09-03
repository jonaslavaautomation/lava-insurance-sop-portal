/*
  One-shot fix: make sure jonas@lavaautomation.com is admin right now,
  regardless of what state the DB trigger or profiles table are currently
  in. Safe to re-run any time.
*/

-- 1. Make sure future signups still follow the single-admin rule.
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
    CASE WHEN lower(NEW.email) = 'jonas@lavaautomation.com' THEN 'admin' ELSE 'va_student' END
  );
  RETURN NEW;
END;
$$;

-- 2. Force-correct the existing row for your account (this is the part
--    that actually fixes what you're seeing right now).
UPDATE profiles
SET role = 'admin'
WHERE lower(email) = 'jonas@lavaautomation.com';

-- 3. Portal no longer needs anon access.
DROP POLICY IF EXISTS "companies_select_anon" ON insurance_companies;
DROP POLICY IF EXISTS "sop_docs_select_anon" ON sop_documents;
DROP POLICY IF EXISTS "sop_content_select_anon" ON sop_content;
DROP POLICY IF EXISTS "sop_versions_select_anon" ON sop_versions;

-- 4. Proof: this MUST show role = admin. If it shows 0 rows, the account
--    hasn't signed in yet at all (sign in once first, then re-run this).
SELECT id, email, role, full_name FROM profiles WHERE lower(email) = 'jonas@lavaautomation.com';
