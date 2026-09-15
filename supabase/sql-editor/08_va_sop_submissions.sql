/*
  One-shot: enables the VA portal's "Submit an SOP" feature. Lets any
  signed-in VA/student insert their own SOP (as 'pending', attributed to
  themselves only) and see its status afterward - without this, the
  feature's Submit button will fail with a permissions error.

  Safe to re-run any time. Run this in Supabase Dashboard -> SQL Editor ->
  New query -> Run.
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

NOTIFY pgrst, 'reload schema';
