/*
  # SOP views, likes, and engagement analytics

  1. Purpose
     Track when a VA actually opens an SOP's detail content (not when it
     merely appears in search results or is viewed by an admin), let a VA
     like an SOP once, and give admins an analytics view of engagement —
     all without ever storing a manually-editable counter. View/like
     counts are always computed on the fly from the log tables below, so
     the tables themselves are the single source of truth.

  2. New Tables
     - `sop_views`: one row per SOP-open event (id, sop_document_id,
       user_id, created_at). Append-only log — no update/delete policy is
       granted, matching "the database records should be the source of
       truth."
     - `sop_likes`: one row per (sop, user) like (id, sop_document_id,
       user_id, created_at), with a UNIQUE(sop_document_id, user_id)
       constraint so a VA can only like a given SOP once at the database
       level. Unliking is a DELETE of that row, so re-liking inserts a
       fresh row (this is also why the table isn't append-only like
       sop_views).

  3. Indexes
     idx_sop_views_doc / idx_sop_views_user / idx_sop_views_created and
     the equivalent idx_sop_likes_* indexes support the aggregate
     COUNT(*) GROUP BY queries used everywhere counts are shown, and the
     date-range filtering on the admin analytics page.

  4. Helper Function
     - `get_sop_engagement(p_sop_ids, p_since)`: SECURITY DEFINER RPC that
       aggregates view_count/like_count/last_viewed_at/last_liked_at per
       SOP, computed fresh from sop_views/sop_likes (never a stored
       counter). Used by both the VA portal (to show counts on cards and
       the detail view, always scoped to specific SOP ids) and the admin
       analytics page (with no id filter, optionally date-filtered via
       p_since). Non-admins only ever get rows for published SOPs, same
       rule as search_sops.

  5. Security (RLS)
     - sop_views: a VA may INSERT only their own view row, and only while
       not an admin (defense-in-depth so admin opens are never counted
       even if the client ever called this directly). SELECT is limited
       to your own rows or admin. No UPDATE/DELETE - it's a log.
     - sop_likes: a VA may INSERT/DELETE only their own like row (this is
       what makes the like/unlike toggle work) and may SELECT only their
       own rows or admin. Aggregate counts for other users' likes are
       only ever exposed through get_sop_engagement, which returns counts
       only - never who viewed or liked what.
*/

-- ============================================================
-- SOP VIEWS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS sop_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_document_id uuid NOT NULL REFERENCES sop_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sop_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sop_views_select" ON sop_views;
CREATE POLICY "sop_views_select" ON sop_views
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "sop_views_insert_own" ON sop_views;
CREATE POLICY "sop_views_insert_own" ON sop_views
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT is_admin());

CREATE INDEX IF NOT EXISTS idx_sop_views_doc ON sop_views(sop_document_id);
CREATE INDEX IF NOT EXISTS idx_sop_views_user ON sop_views(user_id);
CREATE INDEX IF NOT EXISTS idx_sop_views_created ON sop_views(created_at);

-- ============================================================
-- SOP LIKES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS sop_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_document_id uuid NOT NULL REFERENCES sop_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (sop_document_id, user_id)
);

ALTER TABLE sop_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sop_likes_select" ON sop_likes;
CREATE POLICY "sop_likes_select" ON sop_likes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "sop_likes_insert_own" ON sop_likes;
CREATE POLICY "sop_likes_insert_own" ON sop_likes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sop_likes_delete_own" ON sop_likes;
CREATE POLICY "sop_likes_delete_own" ON sop_likes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sop_likes_doc ON sop_likes(sop_document_id);
CREATE INDEX IF NOT EXISTS idx_sop_likes_user ON sop_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_sop_likes_created ON sop_likes(created_at);

-- ============================================================
-- ENGAGEMENT AGGREGATE FUNCTION
-- ============================================================
-- Computes view/like counts fresh from sop_views/sop_likes every call -
-- never a stored counter. p_sop_ids narrows to specific SOPs (used by the
-- VA portal); p_since narrows to a date range (used by admin analytics).
-- Leaving both NULL returns every SOP's all-time totals.
DROP FUNCTION IF EXISTS get_sop_engagement(uuid[], timestamptz);
CREATE FUNCTION get_sop_engagement(
  p_sop_ids uuid[] DEFAULT NULL,
  p_since timestamptz DEFAULT NULL
)
RETURNS TABLE (
  sop_document_id uuid,
  view_count bigint,
  like_count bigint,
  last_viewed_at timestamptz,
  last_liked_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id AS sop_document_id,
    COALESCE(v.view_count, 0) AS view_count,
    COALESCE(l.like_count, 0) AS like_count,
    v.last_viewed_at,
    l.last_liked_at
  FROM sop_documents d
  LEFT JOIN (
    SELECT sop_document_id, COUNT(*) AS view_count, MAX(created_at) AS last_viewed_at
    FROM sop_views
    WHERE p_since IS NULL OR created_at >= p_since
    GROUP BY sop_document_id
  ) v ON v.sop_document_id = d.id
  LEFT JOIN (
    SELECT sop_document_id, COUNT(*) AS like_count, MAX(created_at) AS last_liked_at
    FROM sop_likes
    WHERE p_since IS NULL OR created_at >= p_since
    GROUP BY sop_document_id
  ) l ON l.sop_document_id = d.id
  WHERE (is_admin() OR d.status = 'published')
    AND (p_sop_ids IS NULL OR d.id = ANY(p_sop_ids));
$$;

NOTIFY pgrst, 'reload schema';
