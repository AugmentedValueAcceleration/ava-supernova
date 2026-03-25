import { useEffect, useState, Fragment } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, inputStyle as themeInputStyle, cardStyle, primaryBtnStyle, ghostBtnStyle, labelStyle, chipStyle } from '../lib/theme';

interface RoadmapItem {
  id: string;
  title: string;
  description: string | null;
  status: 'shipped' | 'in-progress' | 'planned' | 'future';
  category: string;
  date_label: string | null;
  sort_order: number;
  visible: boolean;
  created_at: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  shipped: { bg: theme.greenBg, text: theme.green, label: 'Shipped' },
  'in-progress': { bg: theme.yellowBg, text: theme.yellow, label: 'In Progress' },
  planned: { bg: theme.blueBg, text: theme.blue, label: 'Planned' },
  future: { bg: 'rgba(107, 114, 128, 0.12)', text: theme.textSecondary, label: 'Future' },
};

const CATEGORY_COLORS: Record<string, string> = {
  core: theme.accent,
  extension: theme.blue,
  companion: theme.green,
  platform: theme.yellow,
  security: theme.red,
  education: '#f472b6',
  infra: theme.orange,
};

const STATUSES = ['shipped', 'in-progress', 'planned', 'future'] as const;
const DEFAULT_CATEGORIES = ['core', 'extension', 'companion', 'platform', 'security', 'education', 'infra'];

export default function Roadmap() {
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<RoadmapItem | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formStatus, setFormStatus] = useState<string>('planned');
  const [formCategory, setFormCategory] = useState('core');
  const [formDateLabel, setFormDateLabel] = useState('');
  const [formSortOrder, setFormSortOrder] = useState('0');
  const [formVisible, setFormVisible] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('roadmap_items').select('*').order('sort_order', { ascending: true });
      setItems(data || []);
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const categories = [...new Set([...DEFAULT_CATEGORIES, ...items.map(i => i.category)])].sort();

  const filtered = items.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && i.category !== categoryFilter) return false;
    return true;
  });

  function openCreateForm() {
    setEditItem(null); setFormTitle(''); setFormDesc(''); setFormStatus('planned'); setFormCategory('core');
    setFormDateLabel(''); setFormSortOrder(String(items.length)); setFormVisible(true); setShowForm(true);
  }

  function openEditForm(item: RoadmapItem) {
    setEditItem(item); setFormTitle(item.title); setFormDesc(item.description || ''); setFormStatus(item.status);
    setFormCategory(item.category); setFormDateLabel(item.date_label || ''); setFormSortOrder(String(item.sort_order));
    setFormVisible(item.visible); setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      const payload = { title: formTitle.trim(), description: formDesc.trim() || null, status: formStatus, category: formCategory, date_label: formDateLabel.trim() || null, sort_order: Number(formSortOrder) || 0, visible: formVisible };
      if (editItem) { await supabase.from('roadmap_items').update(payload).eq('id', editItem.id); }
      else { await supabase.from('roadmap_items').insert(payload); }
      setShowForm(false); await fetchItems();
    } finally { setSaving(false); }
  }

  async function toggleVisibility(item: RoadmapItem) {
    setActionLoading(item.id);
    try { await supabase.from('roadmap_items').update({ visible: !item.visible }).eq('id', item.id); await fetchItems(); }
    finally { setActionLoading(null); }
  }

  return (
    <div style={pageStyle}>
      <PageHeader title="Roadmap" subtitle={`${items.length} items. ${items.filter(i => i.status === 'shipped').length} shipped.`} onRefresh={fetchItems}>
        <button onClick={openCreateForm} style={primaryBtnStyle}>+ Add Item</button>
      </PageHeader>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <select style={{ ...themeInputStyle, width: 'auto', minWidth: 140 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_STYLES[s].label}</option>)}
        </select>
        <select style={{ ...themeInputStyle, width: 'auto', minWidth: 140 }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 400, color: theme.text, margin: '0 0 16px 0' }}>{editItem ? 'Edit Item' : 'New Roadmap Item'}</h2>
          <form onSubmit={handleSave}>
            <div style={labelStyle}>Title</div>
            <input value={formTitle} onChange={e => setFormTitle(e.target.value)} style={{ ...themeInputStyle, marginBottom: 12 }} placeholder="Feature name" />
            <div style={labelStyle}>Description</div>
            <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={3} style={{ ...themeInputStyle, marginBottom: 12, resize: 'none' }} placeholder="Optional description..." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><div style={labelStyle}>Status</div><select value={formStatus} onChange={e => setFormStatus(e.target.value)} style={themeInputStyle}>{STATUSES.map(s => <option key={s} value={s}>{STATUS_STYLES[s].label}</option>)}</select></div>
              <div><div style={labelStyle}>Category</div><select value={formCategory} onChange={e => setFormCategory(e.target.value)} style={themeInputStyle}>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><div style={labelStyle}>Date Label</div><input value={formDateLabel} onChange={e => setFormDateLabel(e.target.value)} style={themeInputStyle} placeholder="e.g. Q2 2026" /></div>
              <div><div style={labelStyle}>Sort Order</div><input type="number" value={formSortOrder} onChange={e => setFormSortOrder(e.target.value)} style={themeInputStyle} /></div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: theme.textSecondary, marginBottom: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={formVisible} onChange={e => setFormVisible(e.target.checked)} style={{ accentColor: theme.accent }} />
              Visible on public roadmap
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} style={{ ...primaryBtnStyle, opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving...' : editItem ? 'Update' : 'Create'}</button>
              <button type="button" onClick={() => setShowForm(false)} style={ghostBtnStyle}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', color: theme.textMuted, padding: 60 }}>Loading roadmap...</div>}

      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: theme.textMuted }}>No roadmap items found. Add one to get started.</div>
          ) : (
            filtered.map(item => {
              const ss = STATUS_STYLES[item.status] || STATUS_STYLES.future;
              const catColor = CATEGORY_COLORS[item.category] || theme.textMuted;
              const isExpanded = expandedId === item.id;

              return (
                <Fragment key={item.id}>
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    style={{
                      ...cardStyle,
                      borderRadius: isExpanded ? '12px 12px 0 0' : 12,
                      padding: '14px 20px', cursor: 'pointer',
                      opacity: item.visible ? 1 : 0.5,
                    }}
                    onMouseOver={e => (e.currentTarget.style.borderColor = theme.accentBgStrong)}
                    onMouseOut={e => (e.currentTarget.style.borderColor = theme.border)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={chipStyle(ss.bg, ss.text)}>{ss.label}</span>
                      <span style={chipStyle(`${catColor}15`, catColor)}>{item.category}</span>
                      <span style={{ fontSize: 14, fontWeight: 400, color: theme.text, flex: 1 }}>{item.title}</span>
                      {item.date_label && <span style={{ fontSize: 11, color: theme.textMuted }}>{item.date_label}</span>}
                      {!item.visible && <span style={{ fontSize: 10, color: theme.textMuted, fontStyle: 'italic' }}>hidden</span>}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{
                      background: theme.surfaceBg, border: `1px solid ${theme.border}`, borderTop: 'none',
                      borderRadius: '0 0 12px 12px', padding: '16px 20px',
                    }}>
                      {item.description && <p style={{ fontSize: 13, color: theme.textSecondary, margin: '0 0 12px 0', lineHeight: 1.6 }}>{item.description}</p>}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={(e) => { e.stopPropagation(); openEditForm(item); }} style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 11, color: theme.blue, cursor: 'pointer' }}>Edit</button>
                        <button onClick={(e) => { e.stopPropagation(); toggleVisibility(item); }} disabled={actionLoading === item.id} style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 11, color: item.visible ? theme.orange : theme.green, cursor: 'pointer', opacity: actionLoading === item.id ? 0.5 : 1 }}>{item.visible ? 'Hide' : 'Show'}</button>
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
