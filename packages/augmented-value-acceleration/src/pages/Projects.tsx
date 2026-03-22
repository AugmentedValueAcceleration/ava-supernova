import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/* ── Types ──────────────────────────────────────────────────────────────── */

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
  active: { bg: '#065f46', text: '#34d399' },
  completed: { bg: '#1e3a5f', text: '#60a5fa' },
  paused: { bg: '#78350f', text: '#fbbf24' },
  archived: { bg: '#3f3f46', text: '#a1a1aa' },
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: '#7f1d1d', text: '#fca5a5' },
  high: { bg: '#78350f', text: '#fbbf24' },
  medium: { bg: '#1e3a5f', text: '#60a5fa' },
  low: { bg: '#064e3b', text: '#6ee7b7' },
};

/* ── Component ──────────────────────────────────────────────────────────── */

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

  /* ── Fetch ─────────────────────────────────────────────────────────── */

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

  /* ── Create ────────────────────────────────────────────────────────── */

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

  /* ── Delete ────────────────────────────────────────────────────────── */

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this project?')) return;
    await supabase.from('business_projects').delete().eq('id', id);
    fetchData();
  };

  /* ── Derived ───────────────────────────────────────────────────────── */

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

  /* ── Render ────────────────────────────────────────────────────────── */

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: '#1a1a35', border: '1px solid #1f1f3a',
    borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '40px 48px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: 0 }}>Projects</h1>
          <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>Manage your business projects</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          padding: '10px 24px', background: '#a855f7', color: '#fff', border: 'none',
          borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>+ New Project</button>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total', value: stats.total, icon: '📁', color: '#a855f7' },
          { label: 'Active', value: stats.active, icon: '🚀', color: '#34d399' },
          { label: 'Completed', value: stats.completed, icon: '✅', color: '#60a5fa' },
          { label: 'Paused', value: stats.paused, icon: '⏸️', color: '#fbbf24' },
        ].map(s => (
          <div key={s.label} style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: s.color }}>{loading ? '...' : s.value}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)} style={{
            padding: '8px 18px', borderRadius: 8, border: '1px solid ' + (filter === t.key ? '#a855f7' : '#1f1f3a'),
            background: filter === t.key ? '#a855f720' : '#111127', color: filter === t.key ? '#a855f7' : '#9ca3af',
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading projects...</div>}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 80, color: '#6b7280' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>No projects found</div>
          <div style={{ fontSize: 14 }}>Create your first project to get started</div>
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
                background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 24,
                cursor: 'pointer', transition: 'border-color 0.2s',
              }}
                onClick={() => setExpandedId(expanded ? null : p.id)}
                onMouseOver={e => e.currentTarget.style.borderColor = '#a855f7'}
                onMouseOut={e => e.currentTarget.style.borderColor = '#1f1f3a'}
              >
                {/* Top row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: 0 }}>{p.name}</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.text }}>{p.status}</span>
                    <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: pc.bg, color: pc.text }}>{p.priority}</span>
                  </div>
                </div>

                {/* Info row */}
                <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#9ca3af', flexWrap: 'wrap' }}>
                  <span>👤 {p.client_name}</span>
                  {p.start_date && <span>📅 {new Date(p.start_date).toLocaleDateString()}</span>}
                  {p.end_date && <span>🏁 {new Date(p.end_date).toLocaleDateString()}</span>}
                  {p.budget > 0 && <span>💰 ${p.budget.toLocaleString()}</span>}
                </div>

                {/* Tags */}
                {p.tags && p.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                    {p.tags.map((tag, i) => (
                      <span key={i} style={{ padding: '2px 10px', borderRadius: 6, fontSize: 11, background: '#1f1f3a', color: '#9ca3af' }}>{tag}</span>
                    ))}
                  </div>
                )}

                {/* Expanded */}
                {expanded && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #1f1f3a' }}>
                    {p.description && <p style={{ fontSize: 14, color: '#9ca3af', margin: '0 0 10px' }}>{p.description}</p>}
                    <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#6b7280' }}>
                      {p.task_count !== undefined && <span>Tasks: {p.task_count}</span>}
                      {p.team_lead && <span>Lead: {p.team_lead}</span>}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} style={{
                      marginTop: 12, padding: '6px 16px', background: '#7f1d1d', color: '#fca5a5',
                      border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer',
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
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowCreate(false)}>
          <div style={{
            background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16,
            padding: 32, width: 520, maxHeight: '85vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 24px' }}>New Project</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Name *</label>
                <input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Project name" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Description</label>
                <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Project description" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Status</label>
                  <select style={inputStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Priority</label>
                  <select style={inputStyle} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Client</label>
                <select style={inputStyle} value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                  <option value="">— None —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Start Date</label>
                  <input type="date" style={inputStyle} value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>End Date</label>
                  <input type="date" style={inputStyle} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Budget</label>
                <input type="number" style={inputStyle} value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} placeholder="0.00" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Tags (comma separated)</label>
                <input style={inputStyle} value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="frontend, design, urgent" />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 28 }}>
              <button onClick={() => setShowCreate(false)} style={{
                padding: '10px 24px', background: '#1f1f3a', color: '#9ca3af', border: 'none',
                borderRadius: 10, fontSize: 14, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving || !form.name.trim()} style={{
                padding: '10px 24px', background: '#a855f7', color: '#fff', border: 'none',
                borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                opacity: saving || !form.name.trim() ? 0.5 : 1,
              }}>{saving ? 'Creating...' : 'Create Project'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
