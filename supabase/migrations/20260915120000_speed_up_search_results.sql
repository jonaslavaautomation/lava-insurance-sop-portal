/*
  # Speed up SOP search by not shipping full content in the results list

  1. Problem
     search_sops() returned content, content_type, steps, and images for
     every matching row - and steps/images carry every screenshot in a SOP
     as embedded base64, sometimes several MB per document. The VA portal's
     search results list only ever shows a title and a few tags, so a
     search that matched even 2-3 image-heavy SOPs was transferring tens of
     MB over the network before any result could appear - that transfer
     time was the actual cause of "search takes a while," not the query
     itself (the table is tiny).

  2. Fix
     search_sops() now returns only the lightweight fields the results
     list actually renders. It still joins sop_content and matches against
     c.content with ILIKE server-side (that's cheap - a few KB of text per
     row, not the multi-MB steps/images payload) - it just no longer sends
     that column back to the client for every match.

     The full content (content, content_type, steps, images) for one
     specific SOP is now fetched separately, in its own tiny query, only
     when a VA actually opens that SOP - see fetchSopContent() in
     src/lib/supabase.ts, which reads directly from sop_content by
     sop_document_id (already covered by the existing sop_content_select
     RLS policy, no new policy needed).
*/

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
