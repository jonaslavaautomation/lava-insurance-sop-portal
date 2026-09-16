import {
  FileText, Repeat2, FileSearch, RefreshCw, XCircle, Receipt, ShieldAlert,
  LogIn, MoreHorizontal, Search, Car, Home, Users, ClipboardList, Phone,
  type LucideIcon,
} from 'lucide-react';

/**
 * Curated set of icons an admin can pick for a workflow category (see
 * sop_categories.icon), covering the common insurance-workflow buckets from
 * the spec (Quotes, Endorsements, Document Retrieval, Renewals,
 * Cancellations, Billing, Claims, Portal/System, Other) plus a few generic
 * options. Stored as plain text in the database - CATEGORY_ICON_MAP below
 * is the only place that name gets turned into a component, so adding a new
 * option here never requires a migration.
 */
export const CATEGORY_ICON_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'FileText', label: 'Document', icon: FileText },
  { value: 'Search', label: 'Quotes', icon: Search },
  { value: 'Repeat2', label: 'Endorsements', icon: Repeat2 },
  { value: 'FileSearch', label: 'Document Retrieval', icon: FileSearch },
  { value: 'RefreshCw', label: 'Renewals', icon: RefreshCw },
  { value: 'XCircle', label: 'Cancellations', icon: XCircle },
  { value: 'Receipt', label: 'Billing & Payments', icon: Receipt },
  { value: 'ShieldAlert', label: 'Claims', icon: ShieldAlert },
  { value: 'LogIn', label: 'Portal / System', icon: LogIn },
  { value: 'Car', label: 'Auto', icon: Car },
  { value: 'Home', label: 'Property', icon: Home },
  { value: 'Users', label: 'Customer Service', icon: Users },
  { value: 'ClipboardList', label: 'General Process', icon: ClipboardList },
  { value: 'Phone', label: 'Contact / Calls', icon: Phone },
  { value: 'MoreHorizontal', label: 'Other', icon: MoreHorizontal },
];

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORY_ICON_OPTIONS.map((o) => [o.value, o.icon])
);

/** Looks up a stored icon name, falling back to a generic icon for
 *  anything unrecognized (a typo, or an option removed in a later update)
 *  so a bad value never breaks rendering. */
export function getCategoryIcon(name: string | null | undefined): LucideIcon {
  return (name && CATEGORY_ICON_MAP[name]) || FileText;
}
