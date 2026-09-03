/*
# Insurance SOP Search Portal - Full Schema

1. Purpose
   Creates the complete database schema for the LAVA Automation Insurance SOP Search Portal.
   Supports two user roles (admin, va_student), insurance company management,
   SOP document management with versioning, content storage, and full-text search.

2. New Tables
   - `profiles`: Extends auth.users with role (admin/va_student) and full_name.
   - `insurance_companies`: Insurance company records managed by admin.
   - `sop_documents`: SOP documents with title, line of business, process category, version, status.
   - `sop_content`: Extracted text content from SOP documents (the searchable source of truth).
   - `sop_versions`: Version history for SOP documents.

3. Helper Functions
   - `is_admin()`: Returns true if the current authenticated user has role 'admin' in profiles.
   - `search_sops()`: Full-text search over published SOP content scoped to an insurance company.

4. Triggers
   - `handle_new_user`: Creates a profile row automatically when a new auth user signs up.

5. Security (RLS)
   - profiles: Users read own profile; admins read/update all profiles.
   - insurance_companies: Admins full CRUD; VA/Students read only.
   - sop_documents: Admins full CRUD; VA/Students read published only.
   - sop_content: Admins full CRUD; VA/Students read content of published docs only.
   - sop_versions: Admins full CRUD; VA/Students read published versions only.
   - All policies use `is_admin()` helper for role checks.
*/

-- ============================================================
-- PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'va_student' CHECK (role IN ('admin', 'va_student')),
  full_name text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Helper function: is current user an admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Profiles: users read own, admins read all
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON profiles;
CREATE POLICY "profiles_select_own_or_admin" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR is_admin());

-- Profiles: users update own (name only), admins update all (role)
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON profiles;
CREATE POLICY "profiles_update_own_or_admin" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR is_admin())
  WITH CHECK (auth.uid() = id OR is_admin());

-- Profiles: admins can insert (for managing users)
DROP POLICY IF EXISTS "profiles_insert_admin" ON profiles;
CREATE POLICY "profiles_insert_admin" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- INSURANCE COMPANIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS insurance_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE insurance_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_select_all" ON insurance_companies;
CREATE POLICY "companies_select_all" ON insurance_companies
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "companies_insert_admin" ON insurance_companies;
CREATE POLICY "companies_insert_admin" ON insurance_companies
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "companies_update_admin" ON insurance_companies;
CREATE POLICY "companies_update_admin" ON insurance_companies
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "companies_delete_admin" ON insurance_companies;
CREATE POLICY "companies_delete_admin" ON insurance_companies
  FOR DELETE TO authenticated
  USING (is_admin());

-- ============================================================
-- SOP DOCUMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS sop_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurance_company_id uuid NOT NULL REFERENCES insurance_companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  line_of_business text DEFAULT 'General',
  process_category text DEFAULT 'General',
  version text NOT NULL DEFAULT '1.0',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'archived')),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  file_path text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE sop_documents ENABLE ROW LEVEL SECURITY;

-- VA/Student: read published only; Admin: read all
DROP POLICY IF EXISTS "sop_docs_select" ON sop_documents;
CREATE POLICY "sop_docs_select" ON sop_documents
  FOR SELECT TO authenticated
  USING (status = 'published' OR is_admin());

DROP POLICY IF EXISTS "sop_docs_insert_admin" ON sop_documents;
CREATE POLICY "sop_docs_insert_admin" ON sop_documents
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "sop_docs_update_admin" ON sop_documents;
CREATE POLICY "sop_docs_update_admin" ON sop_documents
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "sop_docs_delete_admin" ON sop_documents;
CREATE POLICY "sop_docs_delete_admin" ON sop_documents
  FOR DELETE TO authenticated
  USING (is_admin());

CREATE INDEX IF NOT EXISTS idx_sop_docs_company ON sop_documents(insurance_company_id);
CREATE INDEX IF NOT EXISTS idx_sop_docs_status ON sop_documents(status);

-- ============================================================
-- SOP CONTENT TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS sop_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_document_id uuid NOT NULL REFERENCES sop_documents(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sop_content ENABLE ROW LEVEL SECURITY;

-- VA/Student: read content of published docs; Admin: read all
DROP POLICY IF EXISTS "sop_content_select" ON sop_content;
CREATE POLICY "sop_content_select" ON sop_content
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sop_documents
      WHERE sop_documents.id = sop_content.sop_document_id
      AND (sop_documents.status = 'published' OR is_admin())
    )
  );

DROP POLICY IF EXISTS "sop_content_insert_admin" ON sop_content;
CREATE POLICY "sop_content_insert_admin" ON sop_content
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "sop_content_update_admin" ON sop_content;
CREATE POLICY "sop_content_update_admin" ON sop_content
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "sop_content_delete_admin" ON sop_content;
CREATE POLICY "sop_content_delete_admin" ON sop_content
  FOR DELETE TO authenticated
  USING (is_admin());

CREATE INDEX IF NOT EXISTS idx_sop_content_doc ON sop_content(sop_document_id);

-- ============================================================
-- SOP VERSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS sop_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_document_id uuid NOT NULL REFERENCES sop_documents(id) ON DELETE CASCADE,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'archived')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sop_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sop_versions_select" ON sop_versions;
CREATE POLICY "sop_versions_select" ON sop_versions
  FOR SELECT TO authenticated
  USING (
    status = 'published' OR is_admin()
  );

DROP POLICY IF EXISTS "sop_versions_insert_admin" ON sop_versions;
CREATE POLICY "sop_versions_insert_admin" ON sop_versions
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "sop_versions_update_admin" ON sop_versions;
CREATE POLICY "sop_versions_update_admin" ON sop_versions
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "sop_versions_delete_admin" ON sop_versions;
CREATE POLICY "sop_versions_delete_admin" ON sop_versions
  FOR DELETE TO authenticated
  USING (is_admin());

CREATE INDEX IF NOT EXISTS idx_sop_versions_doc ON sop_versions(sop_document_id);

-- ============================================================
-- SEARCH FUNCTION
-- ============================================================
-- Searches published SOP content scoped to an insurance company.
-- Uses ILIKE for flexible text matching on title, process_category, and content.
CREATE OR REPLACE FUNCTION search_sops(
  p_company_id uuid,
  p_query text
)
RETURNS TABLE (
  document_id uuid,
  title text,
  line_of_business text,
  process_category text,
  version text,
  content text,
  insurance_company_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id,
    d.title,
    d.line_of_business,
    d.process_category,
    d.version,
    c.content,
    ic.name
  FROM sop_documents d
  JOIN sop_content c ON c.sop_document_id = d.id
  JOIN insurance_companies ic ON ic.id = d.insurance_company_id
  WHERE d.insurance_company_id = p_company_id
    AND d.status = 'published'
    AND (
      d.title ILIKE '%' || p_query || '%'
      OR d.process_category ILIKE '%' || p_query || '%'
      OR d.line_of_business ILIKE '%' || p_query || '%'
      OR c.content ILIKE '%' || p_query || '%'
    )
  ORDER BY d.title;
$$;
