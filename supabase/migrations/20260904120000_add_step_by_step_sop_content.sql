/*
  # Support step-by-step (Tango-style) SOP content

  1. Purpose
     Some SOPs are better represented as a numbered sequence of steps with
     a screenshot per step (e.g. imported from Tango walkthroughs) rather
     than a single block of text. This adds that as a second content type,
     rendered natively inside the VA portal — no linking out to another
     site or embedding a third-party iframe.

  2. Changes
     - sop_content: add `content_type` ('text' | 'steps', default 'text')
       and `steps` (jsonb, null for plain-text SOPs). For a 'steps' row,
       `content` still holds a flattened plain-text version of the same
       steps so full-text search (search_sops) keeps working unchanged.
     - search_sops: also returns content_type and steps so the frontend
       knows which way to render a result.

  3. `steps` shape (jsonb array), one entry per step:
     { "stepIndex": number, "title": string, "description": string (HTML,
       often empty), "imageUrl": string | null, "sourceUrl": string | null }
*/

ALTER TABLE sop_content
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'steps')),
  ADD COLUMN IF NOT EXISTS steps jsonb;

-- Postgres won't let CREATE OR REPLACE change a function's output columns,
-- so this always drops it first - safe since nothing else depends on it.
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
  content text,
  content_type text,
  steps jsonb,
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
