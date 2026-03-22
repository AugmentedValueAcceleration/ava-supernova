import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  due_date: string;
  project_id: string;
  project_name?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface Project {
  id: string;
  name: string;
}

const COLUMNS = [
  { key: 'todo', label: 'To Do', color: '#6b7280' },
  { key: 'in_progress', label: 'In Progress', color: '#a855f7' },
  { key: 'review', label: 'Review', color: '#f59e0b' },
  { key: 'done', label: 'Done', color: '#34d399' },
  { key: 'blocked', label: 'Blocked', color: '#ef4444' },
];

const PRIORITY_DOTS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#60a5fa',
  low: '#6ee7b7',
};

/* ── Component ──────────────────────────────────────────────────────────── */

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projectFilter, setProjectFilter] = useState('all');

  const [form, setForm] = useState({
    title: '', description: '', project_id: '', assignee: '',
    priority: 'medium', status: 'todo', due_date: '', tags: '',
  });

  /* ── Fetch ─────────────────────────────────────────────────────────── */

  const fetchData = async () => {
    setLoading(true);
    const [taskRes, projRes] = await Promise.all([
      supabase.from('business_tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('business_projects').select('id, name'),
    ]);
    const projMap: Record<string, string> = {};
    (projRes.data || []).forEach((p: any) => { projMap[p.id] = p.name; });
    setProjects(projRes.data || []);
    setTasks((taskRes.data || []).map((t: any) => ({
      ...t,
      project_name: projMap[t.project_id] || '—',
      tags: t.tags || [],
    })));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  /* ── Create ────────────────────────────────────────────────────────── */

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await supabase.from('business_tasks').insert({
      title: form.title.trim(),
      description: form.description.trim(),
      status: form.status,
      priority: form.priority,
      assignee: form.assignee.trim() || null,
      due_date: form.due_date || null,
      project_id: form.project_id || null,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    });
    setForm({ title: '', description: '', project_id: '', assignee: '', priority: 'medium', status: 'todo', due_date: '', tags: '' });
    setShowCreate(false);
    setSaving(false);
    fetchData();
  };

  /* ── Move ──────────────────────────────────────────────────────────── */

  const moveTask = async (id: string, newStatus: string) => {
    await supabase.from('business_tasks').update({ status: newStatus }).eq('id', id);
    fetchData();
  };

  /* ── Delete ────────────────────────────────────────────────────────── */

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this task?')) return;
    await supabase.from('business_tasks').delete().eq('id', id);
    fetchData();
  };

  /* ── Derived ───────────────────────────────────────────────────────── */

  const filteredTasks = projectFilter === 'all' ? tasks : tasks.filter(t => t.project_id === projectFilter);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: '#1a1a35', border: '1px solid #1f1f3a',
    borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '40px 48px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: 0 }}>Tasks</h1>
          <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>Kanban board for task management</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select style={{ ...inputStyle, width: 'auto', minWidth: 160 }} value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
            <option value="all">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => setShowCreate(true)} style={{
            padding: '10px 24px', background: '#a855f7', color: '#fff', border: 'none',
            borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>+ New Task</button>
        </div>
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading tasks...</div>}

      {/* Kanban Board */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS.length}, 1fr)`, gap: 16, minHeight: 400 }}>
          {COLUMNS.map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.key);
            return (
              <div key={col.key} style={{ background: '#0d0d22', borderRadius: 14, padding: 16, border: '1px solid #1f1f3a' }}>
                {/* Column header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: `2px solid ${col.color}` }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: col.color }}>{col.label}</span>
                  <span style={{ fontSize: 12, color: '#6b7280', background: '#1f1f3a', borderRadius: 6, padding: '2px 8px' }}>{colTasks.length}</span>
                </div>

                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {colTasks.length === 0 && (
                    <div style={{ fontSize: 12, color: '#4b5563', textAlign: 'center', padding: 20 }}>No tasks</div>
                  )}
                  {colTasks.map(t => {
                    const expanded = expandedId === t.id;
                    const dotColor = PRIORITY_DOTS[t.priority] || '#6b7280';
                    return (
                      <div key={t.id} style={{
                        background: '#111127', border: '1px solid #1f1f3a', borderRadius: 10, padding: 14,
                        cursor: 'pointer', transition: 'border-color 0.2s',
                      }}
                        onClick={() => setExpandedId(expanded ? null : t.id)}
                        onMouseOver={e => e.currentTarget.style.borderColor = '#a855f7'}
                        onMouseOut={e => e.currentTarget.style.borderColor = '#1f1f3a'}
                      >
                        {/* Title row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>{t.title}</span>
                        </div>

                        {/* Meta */}
                        <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {t.assignee && <span>👤 {t.assignee}</span>}
                          {t.due_date && <span>📅 {new Date(t.due_date).toLocaleDateString()}</span>}
                          <span>📁 {t.project_name}</span>
                        </div>

                        {/* Expanded */}
                        {expanded && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #1f1f3a' }}>
                            {t.description && <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 8px' }}>{t.description}</p>}
                            {t.tags && t.tags.length > 0 && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                                {t.tags.map((tag, i) => (
                                  <span key={i} style={{ padding: '1px 8px', borderRadius: 4, fontSize: 10, background: '#1f1f3a', color: '#9ca3af' }}>{tag}</span>
                                ))}
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 8 }}>
                              Created: {new Date(t.created_at).toLocaleString()}
                              {t.updated_at && <span> | Updated: {new Date(t.updated_at).toLocaleString()}</span>}
                            </div>

                            {/* Move buttons */}
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                              {COLUMNS.filter(c => c.key !== t.status).map(c => (
                                <button key={c.key} onClick={e => { e.stopPropagation(); moveTask(t.id, c.key); }} style={{
                                  padding: '3px 10px', background: '#1f1f3a', color: c.color, border: 'none',
                                  borderRadius: 6, fontSize: 10, cursor: 'pointer',
                                }}>→ {c.label}</button>
                              ))}
                            </div>

                            <button onClick={e => { e.stopPropagation(); handleDelete(t.id); }} style={{
                              padding: '4px 12px', background: '#7f1d1d', color: '#fca5a5',
                              border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                            }}>Delete</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
            padding: 32, width: 480, maxHeight: '85vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 24px' }}>New Task</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Title *</label>
                <input style={inputStyle} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Task title" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Description</label>
                <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Task description" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Project</label>
                <select style={inputStyle} value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })}>
                  <option value="">— None —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Assignee</label>
                  <input style={inputStyle} value={form.assignee} onChange={e => setForm({ ...form, assignee: e.target.value })} placeholder="Assignee name" />
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Status</label>
                  <select style={inputStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Due Date</label>
                  <input type="date" style={inputStyle} value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Tags (comma separated)</label>
                <input style={inputStyle} value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="bug, frontend, urgent" />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 28 }}>
              <button onClick={() => setShowCreate(false)} style={{
                padding: '10px 24px', background: '#1f1f3a', color: '#9ca3af', border: 'none',
                borderRadius: 10, fontSize: 14, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving || !form.title.trim()} style={{
                padding: '10px 24px', background: '#a855f7', color: '#fff', border: 'none',
                borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                opacity: saving || !form.title.trim() ? 0.5 : 1,
              }}>{saving ? 'Creating...' : 'Create Task'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
