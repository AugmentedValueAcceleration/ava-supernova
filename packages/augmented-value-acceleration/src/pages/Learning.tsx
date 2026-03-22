import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Person {
  id: string;
  display_name: string;
  role: string;
  department: string;
  title: string;
  skills: string[];
}

interface TrainingAssignment {
  id: string;
  person_id: string;
  person_name?: string;
  curriculum_name: string;
  status: string;
  progress: number;
  assigned_at: string;
  completed_at: string | null;
  notes: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  not_started: { bg: '#3f3f46', text: '#a1a1aa' },
  in_progress: { bg: '#1e3a5f', text: '#60a5fa' },
  completed: { bg: '#064e3b', text: '#6ee7b7' },
  overdue: { bg: '#7f1d1d', text: '#fca5a5' },
};

/* ── Component ──────────────────────────────────────────────────────────── */

export default function Learning() {
  const [people, setPeople] = useState<Person[]>([]);
  const [assignments, setAssignments] = useState<TrainingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);

  const [form, setForm] = useState({
    person_id: '', curriculum_name: '', notes: '',
  });

  /* ── Fetch ─────────────────────────────────────────────────────────── */

  const fetchData = async () => {
    setLoading(true);
    const [peopleRes, assignRes] = await Promise.all([
      supabase.from('business_people').select('id, display_name, role, department, title, skills').order('display_name'),
      supabase.from('business_training_assignments').select('*').order('assigned_at', { ascending: false }),
    ]);

    const personMap: Record<string, string> = {};
    (peopleRes.data || []).forEach((p: any) => { personMap[p.id] = p.display_name; });
    setPeople((peopleRes.data || []).map((p: any) => ({ ...p, skills: p.skills || [] })));
    setAssignments((assignRes.data || []).map((a: any) => ({
      ...a,
      person_name: personMap[a.person_id] || '—',
    })));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  /* ── Assign ────────────────────────────────────────────────────────── */

  const handleAssign = async () => {
    if (!form.person_id || !form.curriculum_name.trim()) return;
    setSaving(true);
    await supabase.from('business_training_assignments').insert({
      person_id: form.person_id,
      curriculum_name: form.curriculum_name.trim(),
      status: 'not_started',
      progress: 0,
      notes: form.notes.trim() || null,
    });
    setForm({ person_id: '', curriculum_name: '', notes: '' });
    setShowAssign(false);
    setSaving(false);
    fetchData();
  };

  /* ── Update Progress ───────────────────────────────────────────────── */

  const updateProgress = async (id: string, progress: number) => {
    const status = progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started';
    const completed_at = progress >= 100 ? new Date().toISOString() : null;
    await supabase.from('business_training_assignments')
      .update({ progress: Math.min(100, Math.max(0, progress)), status, completed_at })
      .eq('id', id);
    fetchData();
  };

  /* ── Delete ────────────────────────────────────────────────────────── */

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this assignment?')) return;
    await supabase.from('business_training_assignments').delete().eq('id', id);
    fetchData();
  };

  /* ── Derived ───────────────────────────────────────────────────────── */

  const getPersonAssignments = (personId: string) => assignments.filter(a => a.person_id === personId);

  const stats = {
    totalPeople: people.length,
    totalAssignments: assignments.length,
    inProgress: assignments.filter(a => a.status === 'in_progress').length,
    completed: assignments.filter(a => a.status === 'completed').length,
  };

  const suggestedCurriculums = [
    'Ava CLI Fundamentals', 'Agentic Coding with LLMs', 'Security Audit Basics',
    'Team Communication Skills', 'Project Management 101', 'Advanced TypeScript',
    'React Architecture', 'DevOps & CI/CD', 'Python for AI/ML', 'Design Systems',
  ];

  function getInitials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: '#1a1a35', border: '1px solid #1f1f3a',
    borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '40px 48px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      {/* Header */}
      <PageHeader title="Learning" subtitle="Employee training dashboard — powered by Ava's Teach mode" onRefresh={fetchData}>
        <button onClick={() => setShowAssign(true)} style={{
          padding: '10px 24px', background: '#a855f7', color: '#fff', border: 'none',
          borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>+ Assign Training</button>
      </PageHeader>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Team Members', value: stats.totalPeople, icon: '👥', color: '#a855f7' },
          { label: 'Assignments', value: stats.totalAssignments, icon: '📚', color: '#60a5fa' },
          { label: 'In Progress', value: stats.inProgress, icon: '📖', color: '#f59e0b' },
          { label: 'Completed', value: stats.completed, icon: '🎓', color: '#34d399' },
        ].map(s => (
          <div key={s.label} style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: s.color }}>{loading ? '...' : s.value}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Teach Mode Link */}
      <div style={{
        background: 'linear-gradient(135deg, #a855f720 0%, #1a1a3520 100%)',
        border: '1px solid #a855f740', borderRadius: 14, padding: '20px 24px', marginBottom: 32,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <span style={{ fontSize: 32 }}>🎓</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Ava Teach Mode</div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>
            Free AI-powered tutoring for everyone. Assign curriculums to team members and track their learning journey.
            Use <span style={{ color: '#a855f7', fontWeight: 600 }}>??</span> in the CLI or switch to Teach mode in the extension.
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading training data...</div>}

      {/* Empty state */}
      {!loading && people.length === 0 && (
        <div style={{ textAlign: 'center', padding: 80, color: '#6b7280' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>No team members yet</div>
          <div style={{ fontSize: 14 }}>Add people in the People module first, then assign training here</div>
        </div>
      )}

      {/* People + Assignments */}
      {!loading && people.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {people.map(p => {
            const pa = getPersonAssignments(p.id);
            const expanded = expandedPersonId === p.id;
            const completedCount = pa.filter(a => a.status === 'completed').length;
            const avgProgress = pa.length > 0 ? Math.round(pa.reduce((s, a) => s + a.progress, 0) / pa.length) : 0;

            return (
              <div key={p.id} style={{
                background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, overflow: 'hidden',
              }}>
                {/* Person Row */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 16, padding: '18px 24px', cursor: 'pointer',
                }}
                  onClick={() => setExpandedPersonId(expanded ? null : p.id)}
                  onMouseOver={e => e.currentTarget.style.background = '#141430'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{
                    width: 42, height: 42, borderRadius: '50%', background: '#1f1f3a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: '#a855f7', flexShrink: 0,
                  }}>{getInitials(p.display_name)}</div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{p.display_name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{p.title || p.role} {p.department ? `· ${p.department}` : ''}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 13 }}>
                    <span style={{ color: '#6b7280' }}>{pa.length} courses</span>
                    <span style={{ color: '#34d399' }}>{completedCount} done</span>
                    {pa.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 80, height: 6, background: '#1f1f3a', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${avgProgress}%`, height: '100%', background: '#a855f7', borderRadius: 3, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: 12, color: '#a855f7', fontWeight: 600 }}>{avgProgress}%</span>
                      </div>
                    )}
                    <span style={{ color: '#4b5563', fontSize: 16 }}>{expanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded Assignments */}
                {expanded && (
                  <div style={{ padding: '0 24px 20px', borderTop: '1px solid #1f1f3a' }}>
                    {pa.length === 0 && (
                      <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: '#6b7280' }}>
                        No training assigned yet
                      </div>
                    )}
                    {pa.map(a => {
                      const sc = STATUS_COLORS[a.status] || STATUS_COLORS.not_started;
                      return (
                        <div key={a.id} style={{
                          display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0',
                          borderBottom: '1px solid #1a1a35',
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{a.curriculum_name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: sc.bg, color: sc.text }}>{a.status.replace('_', ' ')}</span>
                              {a.notes && <span style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>{a.notes}</span>}
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button onClick={() => updateProgress(a.id, a.progress - 10)} style={{
                              width: 24, height: 24, borderRadius: 6, background: '#1f1f3a', border: 'none',
                              color: '#6b7280', cursor: 'pointer', fontSize: 12,
                            }}>-</button>
                            <div style={{ width: 100, height: 8, background: '#1f1f3a', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{
                                width: `${a.progress}%`, height: '100%', borderRadius: 4, transition: 'width 0.3s',
                                background: a.progress >= 100 ? '#34d399' : '#a855f7',
                              }} />
                            </div>
                            <span style={{ fontSize: 12, color: '#9ca3af', width: 36, textAlign: 'right' }}>{a.progress}%</span>
                            <button onClick={() => updateProgress(a.id, a.progress + 10)} style={{
                              width: 24, height: 24, borderRadius: 6, background: '#1f1f3a', border: 'none',
                              color: '#6b7280', cursor: 'pointer', fontSize: 12,
                            }}>+</button>
                          </div>

                          <button onClick={() => handleDelete(a.id)} style={{
                            padding: '4px 10px', background: '#7f1d1d', color: '#fca5a5', border: 'none',
                            borderRadius: 6, fontSize: 11, cursor: 'pointer',
                          }}>Remove</button>
                        </div>
                      );
                    })}

                    {/* Skills */}
                    {p.skills && p.skills.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Current Skills</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {p.skills.map((s, i) => (
                            <span key={i} style={{ padding: '2px 10px', borderRadius: 6, fontSize: 11, background: '#a855f720', color: '#a855f7' }}>{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assign Training Modal */}
      {showAssign && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowAssign(false)}>
          <div style={{
            background: '#111127', border: '1px solid #1f1f3a', borderRadius: 16,
            padding: 32, width: 480, maxHeight: '85vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 24px' }}>Assign Training</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Team Member *</label>
                <select style={inputStyle} value={form.person_id} onChange={e => setForm({ ...form, person_id: e.target.value })}>
                  <option value="">— Select Person —</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.display_name} ({p.role})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Curriculum *</label>
                <input style={inputStyle} value={form.curriculum_name} onChange={e => setForm({ ...form, curriculum_name: e.target.value })} placeholder="Curriculum name" />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {suggestedCurriculums.map(c => (
                    <button key={c} onClick={() => setForm({ ...form, curriculum_name: c })} style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                      background: form.curriculum_name === c ? '#a855f720' : '#1f1f3a',
                      color: form.curriculum_name === c ? '#a855f7' : '#6b7280',
                      border: 'none',
                    }}>{c}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Notes</label>
                <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 28 }}>
              <button onClick={() => setShowAssign(false)} style={{
                padding: '10px 24px', background: '#1f1f3a', color: '#9ca3af', border: 'none',
                borderRadius: 10, fontSize: 14, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={handleAssign} disabled={saving || !form.person_id || !form.curriculum_name.trim()} style={{
                padding: '10px 24px', background: '#a855f7', color: '#fff', border: 'none',
                borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                opacity: saving || !form.person_id || !form.curriculum_name.trim() ? 0.5 : 1,
              }}>{saving ? 'Assigning...' : 'Assign'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
