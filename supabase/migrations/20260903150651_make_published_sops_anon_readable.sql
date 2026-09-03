/*
# Update RLS: Make published SOPs readable by anon (public VA portal)

1. Purpose
   The VA/Student portal is now public — VAs access it via a shareable URL without logging in.
   This migration grants anon SELECT access to published SOP data so the public portal works.

2. Changes
   - insurance_companies: add anon SELECT policy (all companies visible to public).
   - sop_documents: add anon SELECT policy for published docs only.
   - sop_content: add anon SELECT policy for content of published docs only.
   - sop_versions: add anon SELECT policy for published versions only.
   - search_sops function: already SECURITY DEFINER, so it works for anon callers.

3. Security
   - Admin-only operations (insert/update/delete) remain restricted to authenticated admins via is_admin().
   - Only published data is exposed to anon. Pending and archived remain admin-only.
*/

-- insurance_companies: anon can read all companies
DROP POLICY IF EXISTS "companies_select_anon" ON insurance_companies;
CREATE POLICY "companies_select_anon" ON insurance_companies
  FOR SELECT TO anon
  USING (true);

-- sop_documents: anon can read published only
DROP POLICY IF EXISTS "sop_docs_select_anon" ON sop_documents;
CREATE POLICY "sop_docs_select_anon" ON sop_documents
  FOR SELECT TO anon
  USING (status = 'published');

-- sop_content: anon can read content of published docs only
DROP POLICY IF EXISTS "sop_content_select_anon" ON sop_content;
CREATE POLICY "sop_content_select_anon" ON sop_content
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM sop_documents
      WHERE sop_documents.id = sop_content.sop_document_id
      AND sop_documents.status = 'published'
    )
  );

-- sop_versions: anon can read published versions only
DROP POLICY IF EXISTS "sop_versions_select_anon" ON sop_versions;
CREATE POLICY "sop_versions_select_anon" ON sop_versions
  FOR SELECT TO anon
  USING (status = 'published');
