/*
  # Search logging + daily engagement aggregate

  1. Purpose
     Backs the redesigned admin analytics/telemetry surfaces with real
     data instead of anything fabricated:
       - a genuine "Total Searches" count and "searches with no results"
         list need an actual log of what VAs searched for.
       - the engagement trend chart (Views/Likes over 7D/30D/90D) needs
         real per-day totals, not a hand-drawn shape.

  2. New Table
     - `sop_searches`: one row per search a VA runs in the portal
       (user_id, insurance_company_id, search_query, result_count,
       created_at). Append-only, same pattern as sop_views.

  3. Helper Function
     - `get_engagement_daily(p_days)`: SECURITY DEFINER, admin-only.
       Returns one row per day for the last p_days days (including days
       with zero activity) with that day's view_count/like_count,
       computed fresh from sop_views/sop_likes - never a stored series.

  4. Security (RLS)
     - sop_searches: a VA may insert only their own search row and select
       only their own rows; admins may select all. No update/delete -
       it's a log, same as sop_views.
     - get_engagement_daily returns rows only when is_admin() - a VA
       calling it gets an empty result, not an error and not other
       users' data.
*/

CREATE TABLE IF NOT EXISTS sop_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insurance_company_id uuid REFERENCES insurance_companies(id) ON DELETE SET NULL,
  search_query text NOT NULL,
  result_count int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sop_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sop_searches_select" ON sop_searches;
CREATE POLICY "sop_searches_select" ON sop_searches
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "sop_searches_insert_own" ON sop_searches;
CREATE POLICY "sop_searches_insert_own" ON sop_searches
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sop_searches_user ON sop_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_sop_searches_company ON sop_searches(insurance_company_id);
CREATE INDEX IF NOT EXISTS idx_sop_searches_created ON sop_searches(created_at);

-- ============================================================
-- DAILY ENGAGEMENT AGGREGATE (admin analytics trend chart)
-- ============================================================
DROP FUNCTION IF EXISTS get_engagement_daily(int);
CREATE FUNCTION get_engagement_daily(p_days int DEFAULT 30)
RETURNS TABLE (
  day date,
  view_count bigint,
  like_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    gs.day::date,
    COALESCE(v.c, 0) AS view_count,
    COALESCE(l.c, 0) AS like_count
  FROM generate_series(
    current_date - (GREATEST(p_days, 1) - 1),
    current_date,
    interval '1 day'
  ) AS gs(day)
  LEFT JOIN (
    SELECT created_at::date AS d, COUNT(*) AS c FROM sop_views GROUP BY d
  ) v ON v.d = gs.day::date
  LEFT JOIN (
    SELECT created_at::date AS d, COUNT(*) AS c FROM sop_likes GROUP BY d
  ) l ON l.d = gs.day::date
  WHERE is_admin()
  ORDER BY gs.day;
$$;

NOTIFY pgrst, 'reload schema';
