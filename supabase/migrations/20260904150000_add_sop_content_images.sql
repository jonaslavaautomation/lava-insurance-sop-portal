/*
  # Support images embedded inside uploaded SOP documents

  1. Purpose
     A PDF or Word document uploaded as an SOP can contain embedded
     photos/screenshots, not just text. This lets those come through too,
     shown alongside the extracted text in the VA portal, instead of being
     silently dropped.

  2. Changes
     - sop_content: add `images` (jsonb, null when there are none). Shape:
       an array of { dataUrl: string, page?: number }, in document order.
     - search_sops: also returns images.
*/

ALTER TABLE sop_content
  ADD COLUMN IF NOT EXISTS images jsonb;

CREATE OR REPLACE FUNCTION search_sops(
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
