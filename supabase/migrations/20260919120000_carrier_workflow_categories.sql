/*
  # Carrier Workflow Hub: admin-managed categories per carrier/AMS

  1. Why this doesn't reuse process_category
     sop_documents.process_category is a free-text column with no
     structure - no icon, no description, no ordering, no per-carrier
     admin management, and no concept of a subcategory. It stays exactly
     as-is (still shown in search results/review screens) so nothing
     that reads it breaks. This migration adds a genuinely new, minimal
     structure alongside it:
       insurance_companies (existing)
         -> sop_categories (new, FK'd to one company)
              -> sop_subcategories (new, optional, FK'd to one category)
       sop_documents gains nullable category_id/subcategory_id FKs.

     An SOP with no category_id set simply doesn't appear in any
     category's browse view yet - it's completely unaffected everywhere
     else (search, viewing, likes, views, admin library). This is
     additive, not a backfill/rename of existing data.

  2. New tables
     - sop_categories: one row per (carrier/AMS, category). name +
       description + icon (a Lucide icon name, plain text - the
       frontend maps it to a component, defensively falling back to a
       generic icon for any unrecognized string) + sort_order for
       admin-controlled ordering. Unique per company so an admin can't
       accidentally create "Quotes" twice under the same carrier.
     - sop_subcategories: one row per (category, subcategory). Same
       shape minus icon/description (the spec's example only gives
       subcategories a name + ordering). Deleting a category cascades
       to its subcategories.

  3. sop_documents changes
     category_id/subcategory_id are nullable FKs - ON DELETE SET NULL,
     not CASCADE, so deleting a category never deletes the SOPs in it
     (they just become uncategorized, matching "no subcategory" being a
     valid state and "move SOP between categories" being non-destructive).

  4. RLS
     sop_categories/sop_subcategories are not sensitive (same as
     insurance_companies itself) - every authenticated user (VA or
     admin) can SELECT them, matching companies_select_all. Only admins
     can INSERT/UPDATE/DELETE, matching companies_insert/update/delete_admin.
     No change to any existing table's RLS - sop_documents/sop_content
     policies already correctly gate on status/uploaded_by regardless of
     which columns are selected, so adding two nullable columns needs no
     policy changes there.

  5. search_sops() extended, not duplicated
     Postgres won't let CREATE OR REPLACE change output columns, so this
     drops and recreates it (same pattern as the 20260915 migration that
     slimmed its return shape). Adds:
       - p_category_id uuid DEFAULT NULL - an optional third parameter,
         so every existing call site (which only ever passes
         p_company_id/p_query) keeps working unchanged. When provided,
         scopes results to that category only ("search within category").
       - category_id / category_name / subcategory_id / subcategory_name
         in the return shape (LEFT JOIN - an uncategorized SOP still
         returns as a normal row with these null), so search results can
         show which category they belong to and the category browse view
         can reuse this same function (called once with p_query = '' -
         'x' ILIKE '%%' is always true, so this returns every published
         SOP for the company) instead of a second, near-duplicate function.
*/

CREATE TABLE IF NOT EXISTS sop_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurance_company_id uuid NOT NULL REFERENCES insurance_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT 'FileText',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (insurance_company_id, name)
);

ALTER TABLE sop_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sop_categories_select_all" ON sop_categories;
CREATE POLICY "sop_categories_select_all" ON sop_categories
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "sop_categories_insert_admin" ON sop_categories;
CREATE POLICY "sop_categories_insert_admin" ON sop_categories
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "sop_categories_update_admin" ON sop_categories;
CREATE POLICY "sop_categories_update_admin" ON sop_categories
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "sop_categories_delete_admin" ON sop_categories;
CREATE POLICY "sop_categories_delete_admin" ON sop_categories
  FOR DELETE TO authenticated
  USING (is_admin());

CREATE INDEX IF NOT EXISTS idx_sop_categories_company ON sop_categories(insurance_company_id);

CREATE TABLE IF NOT EXISTS sop_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES sop_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (category_id, name)
);

ALTER TABLE sop_subcategories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sop_subcategories_select_all" ON sop_subcategories;
CREATE POLICY "sop_subcategories_select_all" ON sop_subcategories
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "sop_subcategories_insert_admin" ON sop_subcategories;
CREATE POLICY "sop_subcategories_insert_admin" ON sop_subcategories
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "sop_subcategories_update_admin" ON sop_subcategories;
CREATE POLICY "sop_subcategories_update_admin" ON sop_subcategories
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "sop_subcategories_delete_admin" ON sop_subcategories;
CREATE POLICY "sop_subcategories_delete_admin" ON sop_subcategories
  FOR DELETE TO authenticated
  USING (is_admin());

CREATE INDEX IF NOT EXISTS idx_sop_subcategories_category ON sop_subcategories(category_id);

ALTER TABLE sop_documents
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES sop_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES sop_subcategories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sop_docs_category ON sop_documents(category_id);
CREATE INDEX IF NOT EXISTS idx_sop_docs_subcategory ON sop_documents(subcategory_id);

DROP FUNCTION IF EXISTS search_sops(uuid, text);
DROP FUNCTION IF EXISTS search_sops(uuid, text, uuid);
CREATE FUNCTION search_sops(
  p_company_id uuid,
  p_query text,
  p_category_id uuid DEFAULT NULL
)
RETURNS TABLE (
  document_id uuid,
  title text,
  line_of_business text,
  process_category text,
  version text,
  insurance_company_name text,
  category_id uuid,
  category_name text,
  subcategory_id uuid,
  subcategory_name text
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
    ic.name,
    d.category_id,
    cat.name,
    d.subcategory_id,
    sub.name
  FROM sop_documents d
  JOIN sop_content c ON c.sop_document_id = d.id
  JOIN insurance_companies ic ON ic.id = d.insurance_company_id
  LEFT JOIN sop_categories cat ON cat.id = d.category_id
  LEFT JOIN sop_subcategories sub ON sub.id = d.subcategory_id
  WHERE d.insurance_company_id = p_company_id
    AND d.status = 'published'
    AND (p_category_id IS NULL OR d.category_id = p_category_id)
    AND (
      d.title ILIKE '%' || p_query || '%'
      OR d.process_category ILIKE '%' || p_query || '%'
      OR d.line_of_business ILIKE '%' || p_query || '%'
      OR c.content ILIKE '%' || p_query || '%'
    )
  ORDER BY d.title;
$$;

NOTIFY pgrst, 'reload schema';
