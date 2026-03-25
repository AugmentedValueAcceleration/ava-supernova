import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, inputStyle as baseInputStyle, primaryBtnStyle, ghostBtnStyle, modalOverlayStyle, modalContentStyle, labelStyle } from '../lib/theme';

/* -- Types ----------------------------------------------------------------- */

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
  { key: 'todo', label: 'To Do', color: theme.textMuted },
  { key: 'in_progress', label: 'In Progress', color: theme.accent },
  { key: 'review', label: 'Review', color: theme.yellow },
  { key: 'done', label: 'Done', color: theme.green },
  { key: 'blocked', label: 'Blocked', color: theme.red },
];

const PRIORITY_DOTS: Record<string, string> = {
  critical: theme.red,
  high: theme.yellow,
  medium: theme.blue,
  low: theme.green,
};

/* -- Component ------------------------------------------------------------- */

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

  /* -- Fetch --------------------------------------------------------------- */

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

  /* -- Create -------------------------------------------------------------- */

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

  /* -- Move ---------------------------------------------------------------- */

  const moveTask = async (id: string, newStatus: string) => {
    await supabase.from('business_tasks').update({ status: newStatus }).eq('id', id);
    fetchData();
  };

  /* -- Delete -------------------------------------------------------------- */

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this task?')) return;
    await supabase.from('business_tasks').delete().eq('id', id);
    fetchData();
  };

  /* -- Derived ------------------------------------------------------------- */

  const filteredTasks = projectFilter === 'all' ? tasks : tasks.filter(t => t.project_id === projectFilter);

  return (
    <div style={pageStyle}>
      {/* Header */}
      <PageHeader title="Tasks" subtitle="Kanban board for task management" onRefresh={fetchData}>
        <select style={{ ...baseInputStyle, width: 'auto', minWidth: 160 }} value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => setShowCreate(true)} style={primaryBtnStyle}>+ New Task</button>
      </PageHeader>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: theme.textMuted, padding: 60 }}>Loading tasks...</div>}

      {/* Kanban Board */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS.length}, 1fr)`, gap: 16, minHeight: 400 }}>
          {COLUMNS.map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.key);
            return (
              <div key={col.key} style={{
                background: theme.surfaceBg, borderRadius: theme.radiusLg,
                padding: 16, border: `1px solid ${theme.border}`,
              }}>
                {/* Column header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  marginBottom: 16, paddingBottom: 12, borderBottom: `2px solid ${col.color}`,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 400, color: col.color }}>{col.label}</span>
                  <span style={{
                    fontSize: 12, color: theme.textMuted,
                    background: theme.inputBg, borderRadius: 6, padding: '2px 8px',
                  }}>{colTasks.length}</span>
                </div>

                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {colTasks.length === 0 && (
                    <div style={{ fontSize: 12, color: theme.textMuted, textAlign: 'center', padding: 20, opacity: 0.6 }}>No tasks</div>
                  )}
                  {colTasks.map(t => {
                    const expanded = expandedId === t.id;
                    const dotColor = PRIORITY_DOTS[t.priority] || theme.textMuted;
                    return (
                      <div key={t.id} style={{
                        background: theme.cardBg, border: `1px solid ${theme.border}`,
                        borderRadius: theme.radiusMd, padding: 14,
                        cursor: 'pointer', transition: 'border-color 0.2s',
                      }}
                        onClick={() => setExpandedId(expanded ? null : t.id)}
                        onMouseOver={e => e.currentTarget.style.borderColor = theme.accent}
                        onMouseOut={e => e.currentTarget.style.borderColor = theme.border}
                      >
                        {/* Title row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 400, color: theme.text, lineHeight: 1.3 }}>{t.title}</span>
                        </div>

                        {/* Meta */}
                        <div style={{ fontSize: 11, color: theme.textMuted, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {t.assignee && <span>👤 {t.assignee}</span>}
                          {t.due_date && <span>📅 {new Date(t.due_date).toLocaleDateString()}</span>}
                          <span>📁 {t.project_name}</span>
                        </div>

                        {/* Expanded */}
                        {expanded && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${theme.border}` }}>
                            {t.description && <p style={{ fontSize: 12, color: theme.textSecondary, margin: '0 0 8px' }}>{t.description}</p>}
                            {t.tags && t.tags.length > 0 && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                                {t.tags.map((tag, i) => (
                                  <span key={i} style={{ padding: '1px 8px', borderRadius: 4, fontSize: 10, background: theme.inputBg, color: theme.textSecondary }}>{tag}</span>
                                ))}
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8 }}>
                              Created: {new Date(t.created_at).toLocaleString()}
                              {t.updated_at && <span> | Updated: {new Date(t.updated_at).toLocaleString()}</span>}
                            </div>

                            {/* Move buttons */}
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                              {COLUMNS.filter(c => c.key !== t.status).map(c => (
                                <button key={c.key} onClick={e => { e.stopPropagation(); moveTask(t.id, c.key); }} style={{
                                  padding: '4px 10px', background: theme.inputBg, color: c.color, border: 'none',
                                  borderRadius: 6, fontSize: 10, cursor: 'pointer', fontWeight: 400,
                                }}>→ {c.label}</button>
                              ))}
                            </div>

                            <button onClick={e => { e.stopPropagation(); handleDelete(t.id); }} style={{
                              padding: '4px 12px', background: theme.redBg, color: theme.red,
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
        <div style={modalOverlayStyle} onClick={() => setShowCreate(false)}>
          <div style={{ ...modalContentStyle, width: 480 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 20, fontWeight: 400, color: theme.text, margin: '0 0 24px' }}>New Task</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Title *</label>
                <input style={baseInputStyle} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Task title" />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea style={{ ...baseInputStyle, minHeight: 80, resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Task description" />
              </div>
              <div>
                <label style={labelStyle}>Project</label>
                <select style={baseInputStyle} value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })}>
                  <option value="">— None —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Assignee</label>
                  <input style={baseInputStyle} value={form.assignee} onChange={e => setForm({ ...form, assignee: e.target.value })} placeholder="Assignee name" />
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select style={baseInputStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Due Date</label>
                  <input type="date" style={baseInputStyle} value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Tags (comma separated)</label>
                <input style={baseInputStyle} value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="bug, frontend, urgent" />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 28 }}>
              <button onClick={() => setShowCreate(false)} style={ghostBtnStyle}>Cancel</button>
              <button onClick={handleCreate} disabled={saving || !form.title.trim()} style={{
                ...primaryBtnStyle,
                opacity: saving || !form.title.trim() ? 0.5 : 1,
              }}>{saving ? 'Creating...' : 'Create Task'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
