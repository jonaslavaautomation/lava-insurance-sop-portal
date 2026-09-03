# SQL Editor scripts

Ready-to-paste SQL for **Supabase Dashboard → SQL Editor → New query**, for
when you don't have (or don't want to set up) the Supabase CLI locally.

## How to use

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard) → **SQL Editor** → **New query**.
2. Open [`00_full_schema.sql`](./00_full_schema.sql), copy all of it, paste into the editor.
3. Click **Run**.

That's it — it creates every table, function, trigger, index, and RLS policy
this app needs (`profiles`, `insurance_companies`, `sop_documents`,
`sop_content`, `sop_versions`, plus the `is_admin()` / `search_sops()`
helpers), and grants the public `/portal` page anon read access to published
SOPs.

## Is it safe to run more than once?

Yes. Every statement is `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE
FUNCTION`, or `DROP POLICY IF EXISTS` + `CREATE POLICY`, so re-running it
does not duplicate tables, drop data, or error out. It ends with
`NOTIFY pgrst, 'reload schema';`, which forces Supabase's API layer to
immediately pick up any schema change instead of waiting for its next
periodic refresh.

## When to reach for this

- **New Supabase project**: run this once to stand up the whole schema.
- **"Could not find the table 'public.\<table\>' in the schema cache" error**:
  this usually means PostgREST's schema cache is stale (common right after a
  free-tier project wakes up from being paused). Re-run this file — the
  `NOTIFY pgrst, 'reload schema'` at the end forces an immediate refresh. You
  can also just retry the request a few seconds later; the cache reloads on
  its own periodically too.

## Source of truth

This file is a combined copy of the versioned migrations in
[`../migrations/`](../migrations/), kept here purely for convenient
copy-pasting into the dashboard. If the schema changes going forward, add a
new timestamped file to `../migrations/` first (that's what `supabase db
push` / CLI-based deploys read), then mirror the change here.
