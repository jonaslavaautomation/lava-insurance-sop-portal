/*
  # VA portal: recent activity feed + most-visited carrier/AMS

  1. Purpose
     Shows every VA (not just admins) a lightweight "who's browsing what"
     feed on the portal's landing page - e.g. "j******@gmail.com visited
     'Progressive'" - plus which carrier/AMS has the most views overall.

  2. Why this needs new functions, not just a new RLS policy
     sop_views_select already restricts a non-admin to only their OWN view
     rows (auth.uid() = user_id OR is_admin()) - correct, and NOT being
     loosened here, since that table's user_id could otherwise be
     cross-referenced. Email addresses aren't even in sop_views at all -
     they're in `profiles`, which is similarly locked down to "your own
     row, or an admin" (profiles_select_own_or_admin).

     Rather than loosening either of those (which would let any VA read
     every other user's raw, unmasked email), this adds two narrow
     SECURITY DEFINER functions that return ONLY the pre-masked shape the
     feature needs. The masking happens in the SQL itself - the real email
     is never sent to the browser at all, not even hidden by the UI - so
     opening DevTools' Network tab shows the same masked string the page
     does, not a maskable-but-still-present raw email.

     Masking format: first character of the local part + a fixed 6
     asterisks (regardless of the real local part's length, so the mask
     doesn't even leak how long the real prefix is) + '@' + the real
     domain, e.g. "jonas@lavaautomation.com" -> "j******@lavaautomation.com".

  3. Functions
     - get_recent_company_visits(p_limit): most recent SOP-view events
       (which is what "visited a carrier/AMS" means here - the same
       sop_views log already used for view counts elsewhere), joined
       through to the company and masked email, most recent first.
     - get_top_visited_company(): the single carrier/AMS with the most
       all-time views, or zero rows if nothing's been viewed yet.

     Both are callable by any authenticated user (no is_admin() gate) -
     that's the point, this is a VA-facing feature, not an admin one.
     Admin activity is never included in the first place: sop_views only
     ever contains VA-role views (see sop_views_insert_own's
     "AND NOT is_admin()" check).
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
