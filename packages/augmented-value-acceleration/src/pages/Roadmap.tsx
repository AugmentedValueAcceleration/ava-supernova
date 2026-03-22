import { useEffect, useState, Fragment } from 'react';
import { supabase } from '../lib/supabase';

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
  shipped: { bg: 'rgba(34, 197, 94, 0.12)', text: '#4ade80', label: 'Shipped' },
  'in-progress': { bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24', label: 'In Progress' },
  planned: { bg: 'rgba(59, 130, 246, 0.12)', text: '#60a5fa', label: 'Planned' },
  future: { bg: 'rgba(107, 114, 128, 0.12)', text: '#9ca3af', label: 'Future' },
};

const CATEGORY_COLORS: Record<string, string> = {
  core: '#a855f7',
  extension: '#60a5fa',
  companion: '#4ade80',
  platform: '#fbbf24',
  security: '#f87171',
  education: '#f472b6',
  infra: '#fb923c',
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

  // Form state
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
      const { data } = await supabase
        .from('roadmap_items')
        .select('*')
        .order('sort_order', { ascending: true });
      setItems(data || []);
    } catch {
      // silent
    }
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
    setEditItem(null);
    setFormTitle('');
    setFormDesc('');
    setFormStatus('planned');
    setFormCategory('core');
    setFormDateLabel('');
    setFormSortOrder(String(items.length));
    setFormVisible(true);
    setShowForm(true);
  }

  function openEditForm(item: RoadmapItem) {
    setEditItem(item);
    setFormTitle(item.title);
    setFormDesc(item.description || '');
    setFormStatus(item.status);
    setFormCategory(item.category);
    setFormDateLabel(item.date_label || '');
    setFormSortOrder(String(item.sort_order));
    setFormVisible(item.visible);
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: formTitle.trim(),
        description: formDesc.trim() || null,
        status: formStatus,
        category: formCategory,
        date_label: formDateLabel.trim() || null,
        sort_order: Number(formSortOrder) || 0,
        visible: formVisible,
      };

      if (editItem) {
        await supabase.from('roadmap_items').update(payload).eq('id', editItem.id);
      } else {
        await supabase.from('roadmap_items').insert(payload);
      }
      setShowForm(false);
      await fetchItems();
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisibility(item: RoadmapItem) {
    setActionLoading(item.id);
    try {
      await supabase.from('roadmap_items').update({ visible: !item.visible }).eq('id', item.id);
      await fetchItems();
    } finally {
      setActionLoading(null);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: '#1a1a35', border: '1px solid #1f1f3a',
    borderRadius: 8, color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  return (
    <div style={{ padding: '32px 40px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Roadmap</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            {items.length} items. {items.filter(i => i.status === 'shipped').length} shipped.
          </p>
        </div>
        <button
          onClick={openCreateForm}
          style={{
            background: '#a855f7', border: 'none', borderRadius: 10,
            padding: '10px 20px', fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer',
          }}
        >
          + Add Item
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <select style={{ ...inputStyle, width: 'auto', minWidth: 140 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_STYLES[s].label}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 'auto', minWidth: 140 }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 16px 0' }}>
            {editItem ? 'Edit Item' : 'New Roadmap Item'}
          </h2>
          <form onSubmit={handleSave}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginBottom: 6 }}>Title</div>
            <input value={formTitle} onChange={e => setFormTitle(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }} placeholder="Feature name" />

            <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginBottom: 6 }}>Description</div>
            <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={3} style={{ ...inputStyle, marginBottom: 12, resize: 'none' }} placeholder="Optional description..." />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginBottom: 6 }}>Status</div>
                <select value={formStatus} onChange={e => setFormStatus(e.target.value)} style={inputStyle}>
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_STYLES[s].label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginBottom: 6 }}>Category</div>
                <select value={formCategory} onChange={e => setFormCategory(e.target.value)} style={inputStyle}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginBottom: 6 }}>Date Label</div>
                <input value={formDateLabel} onChange={e => setFormDateLabel(e.target.value)} style={inputStyle} placeholder="e.g. Q2 2026" />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginBottom: 6 }}>Sort Order</div>
                <input type="number" value={formSortOrder} onChange={e => setFormSortOrder(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9ca3af', marginBottom: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={formVisible} onChange={e => setFormVisible(e.target.checked)} style={{ accentColor: '#a855f7' }} />
              Visible on public roadmap
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} style={{
                background: '#a855f7', border: 'none', borderRadius: 8,
                padding: '10px 20px', fontSize: 12, fontWeight: 600, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.5 : 1,
              }}>
                {saving ? 'Saving...' : editItem ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{
                background: '#1a1a35', border: '1px solid #1f1f3a', borderRadius: 8,
                padding: '10px 20px', fontSize: 12, color: '#9ca3af', cursor: 'pointer',
              }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading roadmap...</div>}

      {/* Items List */}
      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
              No roadmap items found. Add one to get started.
            </div>
          ) : (
            filtered.map(item => {
              const ss = STATUS_STYLES[item.status] || STATUS_STYLES.future;
              const catColor = CATEGORY_COLORS[item.category] || '#6b7280';
              const isExpanded = expandedId === item.id;

              return (
                <Fragment key={item.id}>
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    style={{
                      background: '#111127', border: '1px solid #1f1f3a', borderRadius: isExpanded ? '14px 14px 0 0' : 14,
                      padding: '14px 20px', cursor: 'pointer',
                      opacity: item.visible ? 1 : 0.5,
                      transition: 'opacity 0.2s',
                    }}
                    onMouseOver={e => (e.currentTarget.style.borderColor = '#2f2f4a')}
                    onMouseOut={e => (e.currentTarget.style.borderColor = '#1f1f3a')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{
                        background: ss.bg, color: ss.text, fontSize: 10, fontWeight: 700,
                        padding: '3px 10px', borderRadius: 10,
                      }}>
                        {ss.label}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 10,
                        background: `${catColor}15`, color: catColor, textTransform: 'capitalize' as const,
                      }}>
                        {item.category}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#fff', flex: 1 }}>{item.title}</span>
                      {item.date_label && (
                        <span style={{ fontSize: 11, color: '#6b7280' }}>{item.date_label}</span>
                      )}
                      {!item.visible && (
                        <span style={{ fontSize: 10, color: '#6b7280', fontStyle: 'italic' }}>hidden</span>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{
                      background: '#0d0d22', border: '1px solid #1f1f3a', borderTop: 'none',
                      borderRadius: '0 0 14px 14px', padding: '16px 20px',
                    }}>
                      {item.description && (
                        <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 12px 0', lineHeight: 1.6 }}>
                          {item.description}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditForm(item); }}
                          style={{
                            background: 'none', border: '1px solid #1f1f3a', borderRadius: 6,
                            padding: '6px 12px', fontSize: 11, color: '#60a5fa', cursor: 'pointer',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleVisibility(item); }}
                          disabled={actionLoading === item.id}
                          style={{
                            background: 'none', border: '1px solid #1f1f3a', borderRadius: 6,
                            padding: '6px 12px', fontSize: 11,
                            color: item.visible ? '#fb923c' : '#4ade80',
                            cursor: 'pointer',
                            opacity: actionLoading === item.id ? 0.5 : 1,
                          }}
                        >
                          {item.visible ? 'Hide' : 'Show'}
                        </button>
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
