/*
  One-shot: adds SOP-submission events to the VA portal's Recent Activity
  feed (alongside the existing "visited" events). Same pre-masked-in-SQL
  approach as 10_va_portal_activity_feed.sql - the real email is never
  sent to the browser. Without this, submission events just won't show up
  in the feed (the app already handles a missing RPC result gracefully).

  Safe to re-run any time. Run this in Supabase Dashboard -> SQL Editor ->
  New query -> Run.
*/

DROP FUNCTION IF EXISTS get_recent_company_submissions(int);
CREATE FUNCTION get_recent_company_submissions(p_limit int DEFAULT 20)
RETURNS TABLE (
  masked_email text,
  company_id uuid,
  company_name text,
  company_type text,
  sop_title text,
  submitted_at timestamptz
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
    d.title,
    d.created_at
  FROM sop_documents d
  JOIN profiles p ON p.id = d.uploaded_by
  JOIN insurance_companies ic ON ic.id = d.insurance_company_id
  WHERE p.role = 'va_student'
  ORDER BY d.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

NOTIFY pgrst, 'reload schema';
