import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, ChevronRight, Loader2, FolderKanban, Pencil, Check, X } from 'lucide-react';
import { supabase, type InsuranceCompany, type SopCategory, type SopSubcategory } from '@/lib/supabase';
import { ErrorState, LoadingState, EmptyState } from '@/components/admin/DataStates';
import { CarrierLogo } from '@/components/CarrierLogo';
import { CATEGORY_ICON_OPTIONS, getCategoryIcon } from '@/lib/categoryIcons';

/**
 * Full CRUD + reordering for one carrier/AMS's workflow categories and
 * their optional subcategories - the admin side of the VA portal's
 * "Browse by Category" hub. Reordering is plain up/down buttons rather
 * than drag-and-drop: it needs no extra library, and a swap-two-sort_orders
 * update is trivial to get right and verify, unlike drag-and-drop's many
 * edge cases (touch vs mouse, drop targets, accessibility).
 */
export default function AdminCategories() {
  const { companyId } = useParams<{ companyId: string }>();
  const [company, setCompany] = useState<InsuranceCompany | null>(null);
  const [categories, setCategories] = useState<SopCategory[]>([]);
  const [subcategories, setSubcategories] = useState<SopSubcategory[]>([]);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIcon, setNewIcon] = useState(CATEGORY_ICON_OPTIONS[0].value);

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIcon, setEditIcon] = useState('');

  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState('');
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editSubName, setEditSubName] = useState('');

  async function load() {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    const [{ data: comp, error: compError }, { data: cats, error: catsError }] = await Promise.all([
      supabase.from('insurance_companies').select('*').eq('id', companyId).maybeSingle(),
      supabase.from('sop_categories').select('*').eq('insurance_company_id', companyId).order('sort_order'),
    ]);
    if (compError) { setError(compError.message); setLoading(false); return; }
    if (catsError) { setError(catsError.message); setLoading(false); return; }
    setCompany(comp as InsuranceCompany | null);
    const catRows = (cats as SopCategory[]) ?? [];
    setCategories(catRows);

    if (catRows.length > 0) {
      const [{ data: subs, error: subsError }, { data: docs, error: docsError }] = await Promise.all([
        supabase.from('sop_subcategories').select('*').in('category_id', catRows.map((c) => c.id)).order('sort_order'),
        supabase.from('sop_documents').select('category_id').eq('insurance_company_id', companyId),
      ]);
      if (subsError) console.error('Subcategory load error:', subsError);
      setSubcategories((subs as SopSubcategory[]) ?? []);
      if (docsError) console.error('SOP count load error:', docsError);
      const counts: Record<string, number> = {};
      for (const d of docs ?? []) {
        if (d.category_id) counts[d.category_id] = (counts[d.category_id] ?? 0) + 1;
      }
      setDocCounts(counts);
    } else {
      setSubcategories([]);
      setDocCounts({});
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [companyId]);

  const subcategoriesByCategory = useMemo(() => {
    const map: Record<string, SopSubcategory[]> = {};
    for (const sc of subcategories) {
      (map[sc.category_id] ??= []).push(sc);
    }
    return map;
  }, [subcategories]);

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !companyId) return;
    setBusy(true);
    setError(null);
    const { error: insertError } = await supabase.from('sop_categories').insert({
      insurance_company_id: companyId,
      name: newName.trim(),
      description: newDescription.trim() || null,
      icon: newIcon,
      sort_order: categories.length,
    });
    setBusy(false);
    if (insertError) { setError(insertError.message); return; }
    setNewName(''); setNewDescription(''); setNewIcon(CATEGORY_ICON_OPTIONS[0].value); setShowAddCategory(false);
    load();
  }

  function startEditCategory(cat: SopCategory) {
    setEditingCategoryId(cat.id);
    setEditName(cat.name);
    setEditDescription(cat.description ?? '');
    setEditIcon(cat.icon);
  }

  async function saveEditCategory(id: string) {
    if (!editName.trim()) return;
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.from('sop_categories').update({
      name: editName.trim(),
      description: editDescription.trim() || null,
      icon: editIcon,
    }).eq('id', id);
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    setEditingCategoryId(null);
    load();
  }

  async function handleDeleteCategory(id: string, name: string) {
    const count = docCounts[id] ?? 0;
    const warning = count > 0
      ? `Delete "${name}"? ${count} SOP${count !== 1 ? 's are' : ' is'} currently assigned to it - they will not be deleted, just uncategorized.`
      : `Delete "${name}"?`;
    if (!confirm(warning)) return;
    setBusy(true);
    const { error: deleteError } = await supabase.from('sop_categories').delete().eq('id', id);
    setBusy(false);
    if (deleteError) { setError(deleteError.message); return; }
    load();
  }

  async function moveCategory(id: string, direction: -1 | 1) {
    const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);
    const index = sorted.findIndex((c) => c.id === id);
    const swapIndex = index + direction;
    if (index === -1 || swapIndex < 0 || swapIndex >= sorted.length) return;
    const a = sorted[index];
    const b = sorted[swapIndex];
    setBusy(true);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('sop_categories').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('sop_categories').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    setBusy(false);
    if (e1 || e2) { setError((e1 || e2)!.message); return; }
    load();
  }

  async function handleAddSubcategory(categoryId: string) {
    if (!newSubName.trim()) return;
    setBusy(true);
    setError(null);
    const existing = subcategoriesByCategory[categoryId] ?? [];
    const { error: insertError } = await supabase.from('sop_subcategories').insert({
      category_id: categoryId,
      name: newSubName.trim(),
      sort_order: existing.length,
    });
    setBusy(false);
    if (insertError) { setError(insertError.message); return; }
    setNewSubName('');
    load();
  }

  async function saveEditSubcategory(id: string) {
    if (!editSubName.trim()) return;
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.from('sop_subcategories').update({ name: editSubName.trim() }).eq('id', id);
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    setEditingSubId(null);
    load();
  }

  async function handleDeleteSubcategory(id: string, name: string) {
    if (!confirm(`Delete subcategory "${name}"? SOPs in it will not be deleted, just moved back to the parent category.`)) return;
    setBusy(true);
    const { error: deleteError } = await supabase.from('sop_subcategories').delete().eq('id', id);
    setBusy(false);
    if (deleteError) { setError(deleteError.message); return; }
    load();
  }

  async function moveSubcategory(categoryId: string, id: string, direction: -1 | 1) {
    const sorted = [...(subcategoriesByCategory[categoryId] ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const index = sorted.findIndex((s) => s.id === id);
    const swapIndex = index + direction;
    if (index === -1 || swapIndex < 0 || swapIndex >= sorted.length) return;
    const a = sorted[index];
    const b = sorted[swapIndex];
    setBusy(true);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('sop_subcategories').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('sop_subcategories').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    setBusy(false);
    if (e1 || e2) { setError((e1 || e2)!.message); return; }
    load();
  }

  if (loading) return <div className="p-8"><LoadingState label="Loading categories..." /></div>;

  if (!company) {
    return (
      <div className="p-8">
        <ErrorState message="Company not found." />
        <Link to="/admin/companies" className="text-brand-400 text-sm mt-3 inline-block">Back to Companies</Link>
      </div>
    );
  }

  const backTo = company.type === 'ams' ? '/admin/ams' : '/admin/companies';
  const inputClass = "h-10 px-3 rounded-lg border border-white/10 bg-white/[0.03] focus:ring-1 focus:ring-brand-500 focus:border-brand-500 text-sm text-slate-100 placeholder:text-slate-600";
  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="p-8 max-w-3xl">
      <Link to={backTo} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to {company.type === 'ams' ? 'AMS' : 'Companies'}
      </Link>

      <div className="flex items-center gap-3.5 mb-1">
        <CarrierLogo name={company.name} size={40} />
        <div>
          <h1 className="text-2xl font-bold text-slate-50">{company.name} — Categories</h1>
        </div>
      </div>
      <p className="text-slate-500 text-sm mb-6">
        Manage the workflow categories VAs see when browsing this {company.type === 'ams' ? 'AMS' : 'carrier'}'s SOPs.
        Each carrier/AMS has its own independent set — nothing here affects any other one.
      </p>

      {error && <div className="mb-5"><ErrorState message={error} /></div>}

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowAddCategory(!showAddCategory)}
          className="flex items-center gap-2 h-10 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-4 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Category
        </button>
      </div>

      {showAddCategory && (
        <form onSubmit={handleAddCategory} className="mb-6 bg-[#121723]/80 rounded-xl border border-white/[0.08] p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Category name, e.g. Quotes" autoFocus className={inputClass} />
            <input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Short description (optional)" className={inputClass} />
            <select value={newIcon} onChange={(e) => setNewIcon(e.target.value)} className={inputClass}>
              {CATEGORY_ICON_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-ink-secondary">{o.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy || !newName.trim()} className="h-10 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
            </button>
            <button type="button" onClick={() => setShowAddCategory(false)} className="h-10 text-sm text-slate-500 hover:text-slate-300 px-3">Cancel</button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No categories yet" description={'Click "Add Category" to give VAs a way to browse this carrier\'s SOPs by workflow.'} />
      ) : (
        <div className="space-y-3">
          {sorted.map((cat, index) => {
            const Icon = getCategoryIcon(cat.icon);
            const subs = (subcategoriesByCategory[cat.id] ?? []).sort((a, b) => a.sort_order - b.sort_order);
            const isEditing = editingCategoryId === cat.id;
            const isExpanded = expandedCategoryId === cat.id;
            return (
              <div key={cat.id} className="bg-[#121723]/80 border border-white/[0.08] rounded-xl overflow-hidden">
                <div className="p-4 flex items-start gap-3">
                  <div className="flex flex-col gap-0.5 pt-1">
                    <button disabled={busy || index === 0} onClick={() => moveCategory(cat.id, -1)} className="text-slate-600 hover:text-slate-300 disabled:opacity-20 transition-colors">
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button disabled={busy || index === sorted.length - 1} onClick={() => moveCategory(cat.id, 1)} className="text-slate-600 hover:text-slate-300 disabled:opacity-20 transition-colors">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="w-9 h-9 bg-brand-500/10 rounded-md flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4.5 h-4.5 text-brand-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                          <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} />
                          <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Description (optional)" className={inputClass} />
                          <select value={editIcon} onChange={(e) => setEditIcon(e.target.value)} className={inputClass}>
                            {CATEGORY_ICON_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-ink-secondary">{o.label}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => saveEditCategory(cat.id)} disabled={busy} className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300"><Check className="w-3.5 h-3.5" /> Save</button>
                          <button onClick={() => setEditingCategoryId(null)} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-300"><X className="w-3.5 h-3.5" /> Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-slate-100">{cat.name}</p>
                        {cat.description && <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>}
                        <p className="text-[11px] text-slate-600 mt-1">
                          {docCounts[cat.id] ?? 0} SOP{(docCounts[cat.id] ?? 0) !== 1 ? 's' : ''} assigned
                          {subs.length > 0 && ` · ${subs.length} subcategor${subs.length !== 1 ? 'ies' : 'y'}`}
                        </p>
                      </>
                    )}
                  </div>
                  {!isEditing && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => startEditCategory(cat)} className="text-slate-500 hover:text-slate-200 p-1.5 rounded-md hover:bg-white/[0.06] transition-colors" aria-label={`Edit ${cat.name}`}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteCategory(cat.id, cat.name)} className="text-slate-500 hover:text-red-400 p-1.5 rounded-md hover:bg-white/[0.06] transition-colors" aria-label={`Delete ${cat.name}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setExpandedCategoryId(isExpanded ? null : cat.id)}
                        className="text-slate-500 hover:text-slate-200 p-1.5 rounded-md hover:bg-white/[0.06] transition-colors"
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} subcategories for ${cat.name}`}
                      >
                        <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </button>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-white/[0.06] bg-white/[0.015] p-4 pl-14 space-y-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Subcategories (optional)</p>
                    {subs.length === 0 && <p className="text-xs text-slate-600">None yet — SOPs in this category will show directly, with no subcategory grouping.</p>}
                    {subs.map((sub, subIndex) => (
                      <div key={sub.id} className="flex items-center gap-2">
                        <div className="flex flex-col gap-0">
                          <button disabled={busy || subIndex === 0} onClick={() => moveSubcategory(cat.id, sub.id, -1)} className="text-slate-600 hover:text-slate-300 disabled:opacity-20 transition-colors">
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button disabled={busy || subIndex === subs.length - 1} onClick={() => moveSubcategory(cat.id, sub.id, 1)} className="text-slate-600 hover:text-slate-300 disabled:opacity-20 transition-colors">
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {editingSubId === sub.id ? (
                          <>
                            <input value={editSubName} onChange={(e) => setEditSubName(e.target.value)} className={`${inputClass} h-8 flex-1`} autoFocus />
                            <button onClick={() => saveEditSubcategory(sub.id)} className="text-emerald-400 hover:text-emerald-300 p-1"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingSubId(null)} className="text-slate-500 hover:text-slate-300 p-1"><X className="w-3.5 h-3.5" /></button>
                          </>
                        ) : (
                          <>
                            <span className="text-sm text-slate-300 flex-1">{sub.name}</span>
                            <button onClick={() => { setEditingSubId(sub.id); setEditSubName(sub.name); }} className="text-slate-500 hover:text-slate-200 p-1"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleDeleteSubcategory(sub.id, sub.name)} className="text-slate-500 hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        value={newSubName}
                        onChange={(e) => setNewSubName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubcategory(cat.id); } }}
                        placeholder="New subcategory name"
                        className={`${inputClass} h-8 flex-1`}
                      />
                      <button onClick={() => handleAddSubcategory(cat.id)} disabled={busy || !newSubName.trim()} className="text-brand-400 hover:text-brand-300 disabled:opacity-40 p-1">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
