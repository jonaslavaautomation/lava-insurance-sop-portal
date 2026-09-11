/*
  ============================================================
  LAVA Insurance SOP Portal — full schema, ready for the
  Supabase SQL Editor (Dashboard -> SQL Editor -> New query).

  This is the same schema as the files in supabase/migrations, combined
  into one paste-and-run file. It is safe to re-run any time -
  every statement is IF NOT EXISTS / CREATE OR REPLACE / DROP
  POLICY IF EXISTS, so running it twice does not duplicate or
  break anything.

  Use this if:
   - You're setting up a brand-new Supabase project for this app.
   - You saw a "Could not find the table ... in the schema cache"
     error and want to force everything to exist + refresh
     PostgREST's cache (see the NOTIFY at the very bottom).
  ============================================================
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

-- Trigger: auto-create profile on signup.
-- jonas@lavaautomation.com is the only email auto-promoted to admin;
-- everyone else (Google/Gmail sign-ins included) starts as va_student and
-- must be promoted manually (see promote_to_admin.sql).
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
  -- 'steps' rows render as a numbered walkthrough with a screenshot per
  -- step (e.g. imported from Tango) instead of a plain text block. `content`
  -- is still populated (a flattened version of the steps) so search keeps
  -- working either way. See `steps` shape in the migration file.
  content_type text NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'steps')),
  steps jsonb,
  -- Images embedded in the original PDF/Word upload, extracted at upload
  -- time. Shape: [{ dataUrl: string, page?: number }, ...] in document order.
  images jsonb,
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
-- Postgres won't let CREATE OR REPLACE change a function's output columns,
-- so this always drops it first - safe since nothing else depends on it.
DROP FUNCTION IF EXISTS search_sops(uuid, text);
CREATE FUNCTION search_sops(
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
  content_type text,
  steps jsonb,
  images jsonb,
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
    c.content_type,
    c.steps,
    c.images,
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

-- ============================================================
-- VA/STUDENT PORTAL ACCESS
-- ============================================================
-- The VA/Student portal at /portal requires signing in (any Google/Gmail
-- account). Signed-in non-admins already get read access to published SOP
-- data via the authenticated-role policies above (sop_docs_select,
-- sop_content_select, sop_versions_select, companies_select_all) — no
-- separate anon policy is needed, and none is granted. If you're migrating
-- an older deployment that still has the anon policies from an earlier
-- "public portal" version, drop them:
DROP POLICY IF EXISTS "companies_select_anon" ON insurance_companies;
DROP POLICY IF EXISTS "sop_docs_select_anon" ON sop_documents;
DROP POLICY IF EXISTS "sop_content_select_anon" ON sop_content;
DROP POLICY IF EXISTS "sop_versions_select_anon" ON sop_versions;

-- ============================================================
-- SOP VIEWS TABLE
-- ============================================================
-- Append-only log of "a VA actually opened this SOP" events. Never a
-- stored counter - view counts are always computed by counting rows here.
CREATE TABLE IF NOT EXISTS sop_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_document_id uuid NOT NULL REFERENCES sop_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sop_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sop_views_select" ON sop_views;
CREATE POLICY "sop_views_select" ON sop_views
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "sop_views_insert_own" ON sop_views;
CREATE POLICY "sop_views_insert_own" ON sop_views
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT is_admin());

CREATE INDEX IF NOT EXISTS idx_sop_views_doc ON sop_views(sop_document_id);
CREATE INDEX IF NOT EXISTS idx_sop_views_user ON sop_views(user_id);
CREATE INDEX IF NOT EXISTS idx_sop_views_created ON sop_views(created_at);

-- ============================================================
-- SOP LIKES TABLE
-- ============================================================
-- UNIQUE(sop_document_id, user_id) enforces "one like per VA per SOP" at
-- the database level. Unliking deletes the row; re-liking inserts a new one.
CREATE TABLE IF NOT EXISTS sop_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_document_id uuid NOT NULL REFERENCES sop_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (sop_document_id, user_id)
);

ALTER TABLE sop_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sop_likes_select" ON sop_likes;
CREATE POLICY "sop_likes_select" ON sop_likes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "sop_likes_insert_own" ON sop_likes;
CREATE POLICY "sop_likes_insert_own" ON sop_likes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sop_likes_delete_own" ON sop_likes;
CREATE POLICY "sop_likes_delete_own" ON sop_likes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sop_likes_doc ON sop_likes(sop_document_id);
CREATE INDEX IF NOT EXISTS idx_sop_likes_user ON sop_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_sop_likes_created ON sop_likes(created_at);

-- ============================================================
-- ENGAGEMENT AGGREGATE FUNCTION
-- ============================================================
-- Computes view/like counts fresh from sop_views/sop_likes every call -
-- never a stored counter. p_sop_ids narrows to specific SOPs (used by the
-- VA portal); p_since narrows to a date range (used by admin analytics).
-- Leaving both NULL returns every SOP's all-time totals.
DROP FUNCTION IF EXISTS get_sop_engagement(uuid[], timestamptz);
CREATE FUNCTION get_sop_engagement(
  p_sop_ids uuid[] DEFAULT NULL,
  p_since timestamptz DEFAULT NULL
)
RETURNS TABLE (
  sop_document_id uuid,
  view_count bigint,
  like_count bigint,
  last_viewed_at timestamptz,
  last_liked_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id AS sop_document_id,
    COALESCE(v.view_count, 0) AS view_count,
    COALESCE(l.like_count, 0) AS like_count,
    v.last_viewed_at,
    l.last_liked_at
  FROM sop_documents d
  LEFT JOIN (
    SELECT sop_document_id, COUNT(*) AS view_count, MAX(created_at) AS last_viewed_at
    FROM sop_views
    WHERE p_since IS NULL OR created_at >= p_since
    GROUP BY sop_document_id
  ) v ON v.sop_document_id = d.id
  LEFT JOIN (
    SELECT sop_document_id, COUNT(*) AS like_count, MAX(created_at) AS last_liked_at
    FROM sop_likes
    WHERE p_since IS NULL OR created_at >= p_since
    GROUP BY sop_document_id
  ) l ON l.sop_document_id = d.id
  WHERE (is_admin() OR d.status = 'published')
    AND (p_sop_ids IS NULL OR d.id = ANY(p_sop_ids));
$$;

-- ============================================================
-- SOP SEARCHES TABLE
-- ============================================================
-- Append-only log of what VAs actually search for. Backs a real
-- "Total Searches" count and a "searches with no results" list - never
-- fabricated numbers.
CREATE TABLE IF NOT EXISTS sop_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insurance_company_id uuid REFERENCES insurance_companies(id) ON DELETE SET NULL,
  search_query text NOT NULL,
  result_count int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sop_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sop_searches_select" ON sop_searches;
CREATE POLICY "sop_searches_select" ON sop_searches
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "sop_searches_insert_own" ON sop_searches;
CREATE POLICY "sop_searches_insert_own" ON sop_searches
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sop_searches_user ON sop_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_sop_searches_company ON sop_searches(insurance_company_id);
CREATE INDEX IF NOT EXISTS idx_sop_searches_created ON sop_searches(created_at);

-- ============================================================
-- DAILY ENGAGEMENT AGGREGATE (admin analytics trend chart)
-- ============================================================
-- One row per day (including zero-activity days) for the last p_days
-- days, computed fresh from sop_views/sop_likes every call. Admin-only -
-- returns nothing for a non-admin caller.
DROP FUNCTION IF EXISTS get_engagement_daily(int);
CREATE FUNCTION get_engagement_daily(p_days int DEFAULT 30)
RETURNS TABLE (
  day date,
  view_count bigint,
  like_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    gs.day::date,
    COALESCE(v.c, 0) AS view_count,
    COALESCE(l.c, 0) AS like_count
  FROM generate_series(
    current_date - (GREATEST(p_days, 1) - 1),
    current_date,
    interval '1 day'
  ) AS gs(day)
  LEFT JOIN (
    SELECT created_at::date AS d, COUNT(*) AS c FROM sop_views GROUP BY d
  ) v ON v.d = gs.day::date
  LEFT JOIN (
    SELECT created_at::date AS d, COUNT(*) AS c FROM sop_likes GROUP BY d
  ) l ON l.d = gs.day::date
  WHERE is_admin()
  ORDER BY gs.day;
$$;

-- ============================================================
-- Force PostgREST to pick up the schema immediately.
-- Fixes "Could not find the table 'public.<table>' in the schema
-- cache" if it ever shows up right after running migrations.
-- ============================================================
NOTIFY pgrst, 'reload schema';
