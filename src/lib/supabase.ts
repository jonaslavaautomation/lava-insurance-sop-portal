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

export interface InsuranceCompany {
  id: string;
  name: string;
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

export interface SearchResult {
  document_id: string;
  title: string;
  line_of_business: string;
  process_category: string;
  version: string;
  content: string;
  content_type: SopContentType;
  steps: SopStep[] | null;
  images: SopImage[] | null;
  insurance_company_name: string;
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
