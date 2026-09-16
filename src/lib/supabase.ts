import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * True only when both env vars are actually present. Checked by main.tsx
 * before it even tries to render the app, so a missing-config deploy shows a
 * clear message instead of a blank white screen.
 *
 * Deliberately does NOT throw here: a throw at module-evaluation time runs
 * before React starts, so no error boundary could ever catch it.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.error(
    'Missing VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY. ' +
      'Set them for this environment (locally: .env; on Vercel: Settings → ' +
      'Environment Variables) and redeploy/restart.'
  );
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export type UserRole = 'admin' | 'va_student';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  created_at: string;
}

/** 'carrier' = insurance company. 'ams' = Agency Management System - agency
 *  software, not an insurer, but stored the same way (see the migration
 *  comment) so it reuses the exact same SOP upload/search/analytics pipeline. */
export type CompanySourceType = 'carrier' | 'ams';

export interface InsuranceCompany {
  id: string;
  name: string;
  type: CompanySourceType;
  created_at: string;
}

export interface SopDocument {
  id: string;
  insurance_company_id: string;
  title: string;
  line_of_business: string;
  process_category: string;
  version: string;
  status: 'pending' | 'published' | 'archived';
  uploaded_by: string | null;
  file_path: string | null;
  created_at: string;
  updated_at: string;
}

export type SopContentType = 'text' | 'steps';

/** One step of a walkthrough (e.g. imported from a Tango recording). */
export interface SopStep {
  stepIndex: number;
  title: string;
  /** May contain simple HTML (e.g. a wrapping <p>); rendered as plain text. */
  description: string;
  imageUrl: string | null;
  sourceUrl: string | null;
}

/** A photo/screenshot found inside an uploaded PDF or Word document. */
export interface SopImage {
  dataUrl: string;
  page?: number;
}

export interface SopContent {
  id: string;
  sop_document_id: string;
  content: string;
  content_type: SopContentType;
  steps: SopStep[] | null;
  images: SopImage[] | null;
  created_at: string;
}

export interface SopVersion {
  id: string;
  sop_document_id: string;
  version: string;
  status: 'published' | 'archived';
  created_at: string;
}

export interface SopDocumentWithCompany extends SopDocument {
  insurance_companies?: Pick<InsuranceCompany, 'id' | 'name'>;
}

// Deliberately lightweight - search_sops() no longer returns content/steps/
// images (those can carry several MB of embedded screenshots per SOP each).
// Sending that for every matching row on every search was the actual cause
// of slow search - the results list only ever shows these fields. The full
// body is fetched separately, once, only for the one SOP a VA opens - see
// SopContentDetail / fetchSopContent below.
export interface SearchResult {
  document_id: string;
  title: string;
  line_of_business: string;
  process_category: string;
  version: string;
  insurance_company_name: string;
}

/** Full body of one SOP, fetched on demand when a VA opens it (not as part
 *  of search results - see the comment on SearchResult). */
export interface SopContentDetail {
  content: string;
  content_type: SopContentType;
  steps: SopStep[] | null;
  images: SopImage[] | null;
}

export async function fetchSopContent(documentId: string): Promise<SopContentDetail | null> {
  const { data, error } = await supabase
    .from('sop_content')
    .select('content, content_type, steps, images')
    .eq('sop_document_id', documentId)
    .maybeSingle();
  if (error) {
    console.error('fetchSopContent error:', error);
    return null;
  }
  return data as SopContentDetail | null;
}

/** One "a VA opened this SOP" event. Append-only - never edited. */
export interface SopView {
  id: string;
  sop_document_id: string;
  user_id: string;
  created_at: string;
}

/** One VA's like on one SOP. Unique per (sop_document_id, user_id). */
export interface SopLike {
  id: string;
  sop_document_id: string;
  user_id: string;
  created_at: string;
}

/** Aggregate view/like counts for one SOP, always computed from the log tables. */
export interface SopEngagement {
  sop_document_id: string;
  view_count: number;
  like_count: number;
  last_viewed_at: string | null;
  last_liked_at: string | null;
}

/** One search a VA ran in the portal. Append-only - never edited. */
export interface SopSearch {
  id: string;
  user_id: string;
  insurance_company_id: string | null;
  search_query: string;
  result_count: number;
  created_at: string;
}

/** One day's view/like totals, for the admin engagement trend chart. */
export interface EngagementDailyPoint {
  day: string;
  view_count: number;
  like_count: number;
}

/** One entry in the VA portal's "who's browsing what" feed. `masked_email`
 *  comes back already-masked from get_recent_company_visits() - the real
 *  email is never sent to the browser at all. */
export interface CompanyVisit {
  masked_email: string;
  company_id: string;
  company_name: string;
  company_type: CompanySourceType;
  viewed_at: string;
}

/** The single most-viewed carrier/AMS, from get_top_visited_company(). */
export interface TopVisitedCompany {
  company_id: string;
  company_name: string;
  company_type: CompanySourceType;
  view_count: number;
}

/** One entry in the "a VA submitted a new SOP" feed, from
 *  get_recent_company_submissions() - same already-masked-in-SQL email as
 *  CompanyVisit, scoped to va_student submitters only (not admin uploads). */
export interface CompanySubmission {
  masked_email: string;
  company_id: string;
  company_name: string;
  company_type: CompanySourceType;
  sop_title: string;
  submitted_at: string;
}
