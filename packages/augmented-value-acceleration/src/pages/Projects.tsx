import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, inputStyle as baseInputStyle, primaryBtnStyle, ghostBtnStyle, modalOverlayStyle, modalContentStyle, labelStyle, emptyStateStyle } from '../lib/theme';

/* -- Types ----------------------------------------------------------------- */

interface Client {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  priority: string;
  client_id: string;
  client_name?: string;
  start_date: string;
  end_date: string;
  budget: number;
  tags: string[];
  task_count?: number;
  team_lead?: string;
  created_at: string;
}

type StatusFilter = 'all' | 'active' | 'completed' | 'paused' | 'archived';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: theme.greenBg, text: theme.green },
  completed: { bg: theme.blueBg, text: theme.blue },
  paused: { bg: theme.yellowBg, text: theme.yellow },
  archived: { bg: 'rgba(108, 112, 134, 0.12)', text: theme.textMuted },
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: theme.redBg, text: theme.red },
  high: { bg: theme.yellowBg, text: theme.yellow },
  medium: { bg: theme.blueBg, text: theme.blue },
  low: { bg: theme.greenBg, text: theme.green },
};

/* -- Component ------------------------------------------------------------- */

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', description: '', status: 'active', priority: 'medium',
    client_id: '', start_date: '', end_date: '', budget: '', tags: '',
  });

  /* -- Fetch --------------------------------------------------------------- */

  const fetchData = async () => {
    setLoading(true);
    const [projRes, clientRes] = await Promise.all([
      supabase.from('business_projects').select('*').order('created_at', { ascending: false }),
      supabase.from('business_clients').select('id, name'),
    ]);
    const clientMap: Record<string, string> = {};
    (clientRes.data || []).forEach((c: any) => { clientMap[c.id] = c.name; });
    setClients(clientRes.data || []);
    setProjects((projRes.data || []).map((p: any) => ({
      ...p,
      client_name: clientMap[p.client_id] || '—',
      tags: p.tags || [],
    })));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  /* -- Create -------------------------------------------------------------- */

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload: any = {
      name: form.name.trim(),
      description: form.description.trim(),
      status: form.status,
      priority: form.priority,
      client_id: form.client_id || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      budget: form.budget ? parseFloat(form.budget) : 0,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    };
    await supabase.from('business_projects').insert(payload);
    setForm({ name: '', description: '', status: 'active', priority: 'medium', client_id: '', start_date: '', end_date: '', budget: '', tags: '' });
    setShowCreate(false);
    setSaving(false);
    fetchData();
  };

  /* -- Delete -------------------------------------------------------------- */

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this project?')) return;
    await supabase.from('business_projects').delete().eq('id', id);
    fetchData();
  };

  /* -- Derived ------------------------------------------------------------- */

  const filtered = filter === 'all' ? projects : projects.filter(p => p.status === filter);
  const stats = {
    total: projects.length,
    active: projects.filter(p => p.status === 'active').length,
    completed: projects.filter(p => p.status === 'completed').length,
    paused: projects.filter(p => p.status === 'paused').length,
  };

  const tabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: `All (${stats.total})` },
    { key: 'active', label: `Active (${stats.active})` },
    { key: 'completed', label: `Completed (${stats.completed})` },
    { key: 'paused', label: `Paused (${stats.paused})` },
    { key: 'archived', label: 'Archived' },
  ];

  /* -- Render -------------------------------------------------------------- */

  return (
    <div style={pageStyle}>
      {/* Header */}
      <PageHeader title="Projects" subtitle="Manage your business projects" onRefresh={fetchData}>
        <button onClick={() => setShowCreate(true)} style={primaryBtnStyle}>+ New Project</button>
      </PageHeader>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: theme.sectionGap }}>
        {[
          { label: 'Total', value: stats.total, color: theme.accent },
          { label: 'Active', value: stats.active, color: theme.green },
          { label: 'Completed', value: stats.completed, color: theme.blue },
          { label: 'Paused', value: stats.paused, color: theme.yellow },
        ].map(s => (
          <div key={s.label} style={{
            background: theme.cardBg, border: 'none',
            borderRadius: theme.radiusLg, padding: '28px 24px',
          }}>
            <div style={{ fontSize: 32, fontWeight: 300, color: s.color }}>{loading ? '...' : s.value}</div>
            <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 10 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)} style={{
            padding: '8px 18px', borderRadius: theme.radiusSm,
            border: `1px solid ${filter === t.key ? theme.accent : theme.border}`,
            background: filter === t.key ? theme.accentBg : theme.cardBg,
            color: filter === t.key ? theme.accent : theme.textSecondary,
            fontSize: 13, fontWeight: 400, cursor: 'pointer', transition: 'all 0.2s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: theme.textMuted, padding: 60 }}>Loading projects...</div>}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div style={emptyStateStyle}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>📁</div>
          <div style={{ fontSize: 16, fontWeight: 400, color: theme.textSecondary, marginBottom: 8 }}>No projects found</div>
          <div style={{ fontSize: 14, color: theme.textMuted }}>Create your first project to get started</div>
        </div>
      )}

      {/* Project Cards Grid */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
          {filtered.map(p => {
            const sc = STATUS_COLORS[p.status] || STATUS_COLORS.active;
            const pc = PRIORITY_COLORS[p.priority] || PRIORITY_COLORS.medium;
            const expanded = expandedId === p.id;
            return (
              <div key={p.id} style={{
                background: theme.cardBg, border: `1px solid ${theme.border}`,
                borderRadius: theme.radiusLg, padding: 24,
                cursor: 'pointer', transition: 'border-color 0.2s',
              }}
                onClick={() => setExpandedId(expanded ? null : p.id)}
                onMouseOver={e => e.currentTarget.style.borderColor = theme.accent}
                onMouseOut={e => e.currentTarget.style.borderColor = theme.border}
              >
                {/* Top row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 400, color: theme.text, margin: 0 }}>{p.name}</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 400, background: sc.bg, color: sc.text }}>{p.status}</span>
                    <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 400, background: pc.bg, color: pc.text }}>{p.priority}</span>
                  </div>
                </div>

                {/* Info row */}
                <div style={{ display: 'flex', gap: 20, fontSize: 13, color: theme.textSecondary, flexWrap: 'wrap' }}>
                  <span>👤 {p.client_name}</span>
                  {p.start_date && <span>📅 {new Date(p.start_date).toLocaleDateString()}</span>}
                  {p.end_date && <span>🏁 {new Date(p.end_date).toLocaleDateString()}</span>}
                  {p.budget > 0 && <span>💰 ${p.budget.toLocaleString()}</span>}
                </div>

                {/* Tags */}
                {p.tags && p.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                    {p.tags.map((tag, i) => (
                      <span key={i} style={{ padding: '2px 10px', borderRadius: 6, fontSize: 11, background: theme.inputBg, color: theme.textSecondary }}>{tag}</span>
                    ))}
                  </div>
                )}

                {/* Expanded */}
                {expanded && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${theme.border}` }}>
                    {p.description && <p style={{ fontSize: 14, color: theme.textSecondary, margin: '0 0 10px' }}>{p.description}</p>}
                    <div style={{ display: 'flex', gap: 20, fontSize: 13, color: theme.textMuted }}>
                      {p.task_count !== undefined && <span>Tasks: {p.task_count}</span>}
                      {p.team_lead && <span>Lead: {p.team_lead}</span>}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} style={{
                      marginTop: 12, padding: '6px 16px', background: theme.redBg, color: theme.red,
                      border: 'none', borderRadius: theme.radiusSm, fontSize: 12, cursor: 'pointer',
                    }}>Delete Project</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div style={modalOverlayStyle} onClick={() => setShowCreate(false)}>
          <div style={{ ...modalContentStyle, width: 520 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 20, fontWeight: 400, color: theme.text, margin: '0 0 24px' }}>New Project</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input style={baseInputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Project name" />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea style={{ ...baseInputStyle, minHeight: 80, resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Project description" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select style={baseInputStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Priority</label>
                  <select style={baseInputStyle} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Client</label>
                <select style={baseInputStyle} value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                  <option value="">— None —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <input type="date" style={baseInputStyle} value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>End Date</label>
                  <input type="date" style={baseInputStyle} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Budget</label>
                <input type="number" style={baseInputStyle} value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} placeholder="0.00" />
              </div>
              <div>
                <label style={labelStyle}>Tags (comma separated)</label>
                <input style={baseInputStyle} value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="frontend, design, urgent" />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 28 }}>
              <button onClick={() => setShowCreate(false)} style={ghostBtnStyle}>Cancel</button>
              <button onClick={handleCreate} disabled={saving || !form.name.trim()} style={{
                ...primaryBtnStyle,
                opacity: saving || !form.name.trim() ? 0.5 : 1,
              }}>{saving ? 'Creating...' : 'Create Project'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
