/*
  One-shot: adds the VA portal's "recent activity" feed and "most visited"
  carrier/AMS. Two narrow functions that return only pre-masked data - the
  real email is masked in SQL, never sent to the browser unmasked (see the
  migration file's full comment for why this isn't just a looser RLS
  policy). Without this, the portal's new activity panel will fail to load.

  Safe to re-run any time. Run this in Supabase Dashboard -> SQL Editor ->
  New query -> Run.
*/

DROP FUNCTION IF EXISTS get_recent_company_visits(int);
CREATE FUNCTION get_recent_company_visits(p_limit int DEFAULT 20)
RETURNS TABLE (
  masked_email text,
  company_id uuid,
  company_name text,
  company_type text,
  viewed_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    left(p.email, 1) || '******@' || split_part(p.email, '@', 2) AS masked_email,
    ic.id,
    ic.name,
    ic.type,
    v.created_at
  FROM sop_views v
  JOIN profiles p ON p.id = v.user_id
  JOIN sop_documents d ON d.id = v.sop_document_id
  JOIN insurance_companies ic ON ic.id = d.insurance_company_id
  ORDER BY v.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

DROP FUNCTION IF EXISTS get_top_visited_company();
CREATE FUNCTION get_top_visited_company()
RETURNS TABLE (
  company_id uuid,
  company_name text,
  company_type text,
  view_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ic.id, ic.name, ic.type, COUNT(*)::bigint AS view_count
  FROM sop_views v
  JOIN sop_documents d ON d.id = v.sop_document_id
  JOIN insurance_companies ic ON ic.id = d.insurance_company_id
  GROUP BY ic.id, ic.name, ic.type
  ORDER BY view_count DESC
  LIMIT 1;
$$;

NOTIFY pgrst, 'reload schema';
