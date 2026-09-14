/*
  # Agency Management Systems (AMS) as a second SOP source type

  1. Purpose
     AMS (Agency Management System) SOPs need to live in their own
     admin section and their own "folder" in the VA portal, separate
     from insurance carriers - an AMS is a piece of agency software
     (e.g. a policy/quoting system), not an insurance company.

  2. Design decision (extend, don't duplicate)
     `insurance_companies` already is, functionally, "the list of
     organizations a SOP can belong to" - every SOP-authoring,
     search, and analytics query already joins through it. Rather
     than add a second `ams_systems` table plus a parallel
     `sop_documents.ams_id` column (and rewrite search_sops,
     get_sop_engagement, get_engagement_daily to look in two places),
     this adds one `type` column so an AMS is just a row of a
     different type in the same table. `sop_documents.insurance_company_id`
     and every existing RPC keep working completely unchanged - only
     the admin/VA UI needs to filter by type.

  3. Changes
     - `insurance_companies.type`: 'carrier' (default, for all
       existing rows) or 'ams'.
*/

ALTER TABLE insurance_companies
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'carrier' CHECK (type IN ('carrier', 'ams'));

CREATE INDEX IF NOT EXISTS idx_insurance_companies_type ON insurance_companies(type);

NOTIFY pgrst, 'reload schema';
