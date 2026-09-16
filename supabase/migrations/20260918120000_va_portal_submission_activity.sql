/*
  # VA portal: show SOP submissions in the Recent Activity feed too

  1. Purpose
     Alongside "j******@lavaautomation.com visited 'Progressive'"
     (get_recent_company_visits), the portal's Recent Activity feed should
     also show "j******@lavaautomation.com submitted a new SOP for
     'Progressive'" whenever a VA submits one - a distinct event type in
     the same feed, not a replacement for the visits one.

  2. Why this needs its own function, not a plain query
     A submission is a 'pending' sop_documents row. sop_docs_select
     correctly restricts a non-admin to seeing only their OWN row
     regardless of status (status = 'published' OR is_admin() OR
     uploaded_by = auth.uid()) - as it should; this feature doesn't loosen
     that. Instead, same pattern as get_recent_company_visits/
     get_top_visited_company: a narrow SECURITY DEFINER function that
     returns ONLY the pre-masked shape this feed needs (masked email,
     company, SOP title, timestamp) - never the submission's actual
     content, status, or raw uploader id/email.

  3. Scoped to VA submissions specifically, not admin uploads
     uploaded_by is set the same way regardless of who uploads (admin or
     VA) - so this filters to profiles.role = 'va_student' explicitly,
     mirroring how sop_views naturally only ever contains VA activity
     (admins are excluded from view-tracking entirely). An admin's own
     upload should not appear in "community activity" the same way a VA's
     submission does.
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
