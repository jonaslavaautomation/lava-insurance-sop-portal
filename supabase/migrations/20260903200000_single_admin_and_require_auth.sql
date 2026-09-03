/*
  # Restrict admin to one email; require sign-in for the VA portal

  1. Purpose
     - jonas@lavaautomation.com is the only account that should ever be
       admin. The previous migration auto-promoted the whole
       @lavaautomation.com domain — this narrows that back down to the one
       exact email. Everyone else (any domain) starts as va_student.
     - The VA/Student portal now requires signing in with Google (any
       Gmail account) instead of being publicly readable. The anon-role
       read policies added for the public portal are no longer needed and
       are revoked here.

  2. Changes
     - Replaces handle_new_user() to check the exact email instead of the
       domain.
     - Drops the four anon SELECT policies from the "make published SOPs
       anon readable" migration. Authenticated users (any signed-in
       account) already have equivalent read access via the existing
       authenticated-role policies, so no new policy is needed to
       replace them.
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
    CASE WHEN lower(NEW.email) = 'jonas@lavaautomation.com' THEN 'admin' ELSE 'va_student' END
  );
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "companies_select_anon" ON insurance_companies;
DROP POLICY IF EXISTS "sop_docs_select_anon" ON sop_documents;
DROP POLICY IF EXISTS "sop_content_select_anon" ON sop_content;
DROP POLICY IF EXISTS "sop_versions_select_anon" ON sop_versions;
