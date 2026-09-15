/*
  # Let VAs submit their own SOPs for admin review

  1. Purpose
     Previously only admins could write to sop_documents/sop_content at
     all - a signed-in va_student had no way to submit anything. This adds
     narrowly-scoped write access so a VA can submit their own SOP, which
     lands as 'pending' in the exact same Pending Reviews queue admins
     already use for admin-uploaded SOPs - no separate review path.

  2. Changes
     - sop_docs_insert_own_pending: any authenticated user may insert a
       sop_documents row, but ONLY as status = 'pending' and ONLY
       attributing themselves (uploaded_by = auth.uid()) - they cannot
       submit as already-published, and cannot submit on someone else's
       behalf. This is an ADDITIONAL permissive policy alongside the
       existing admin-only insert policy, not a replacement - an admin's
       own upload flow is unaffected.
     - sop_content_insert_own_pending: mirrors the above for the content
       row, checked by walking back to the parent sop_documents row.
     - sop_docs_select / sop_content_select: extended so a submitter can
       see their OWN submission regardless of status (so they can track
       whether it's still pending, got published, or was rejected/
       archived) - previously a non-admin could only ever see published
       rows, even their own pending ones.
     - Deliberately NOT added: UPDATE or DELETE for non-admins. A VA can
       submit and track status, but can't edit or withdraw a submission
       once sent - that's a possible future addition, not in scope here.
*/

DROP POLICY IF EXISTS "sop_docs_select" ON sop_documents;
CREATE POLICY "sop_docs_select" ON sop_documents
  FOR SELECT TO authenticated
  USING (status = 'published' OR is_admin() OR uploaded_by = auth.uid());

DROP POLICY IF EXISTS "sop_docs_insert_own_pending" ON sop_documents;
CREATE POLICY "sop_docs_insert_own_pending" ON sop_documents
  FOR INSERT TO authenticated
  WITH CHECK (status = 'pending' AND uploaded_by = auth.uid());

DROP POLICY IF EXISTS "sop_content_select" ON sop_content;
CREATE POLICY "sop_content_select" ON sop_content
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sop_documents
      WHERE sop_documents.id = sop_content.sop_document_id
      AND (sop_documents.status = 'published' OR is_admin() OR sop_documents.uploaded_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "sop_content_insert_own_pending" ON sop_content;
CREATE POLICY "sop_content_insert_own_pending" ON sop_content
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sop_documents
      WHERE sop_documents.id = sop_content.sop_document_id
      AND sop_documents.uploaded_by = auth.uid()
      AND sop_documents.status = 'pending'
    )
  );
