import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, inputStyle as themeInputStyle, primaryBtnStyle, ghostBtnStyle, modalOverlayStyle, modalContentStyle, labelStyle } from '../lib/theme';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Person {
  id: string;
  display_name: string;
  role: string;
  department: string;
  title: string;
  phone: string;
  timezone: string;
  skills: string[];
  status: string;
  avatar_url: string;
  projects_assigned: string[];
  created_at: string;
}

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin: { bg: theme.redBg, text: theme.red },
  manager: { bg: '#78350f', text: '#fbbf24' },
  member: { bg: '#1e3a5f', text: '#60a5fa' },
  contractor: { bg: '#064e3b', text: '#6ee7b7' },
  intern: { bg: '#3f3f46', text: '#a1a1aa' },
};

const STATUS_INDICATORS: Record<string, { color: string; label: string }> = {
  active: { color: '#34d399', label: 'Active' },
  away: { color: '#f59e0b', label: 'Away' },
  busy: { color: '#ef4444', label: 'Busy' },
  offline: { color: theme.textMuted, label: 'Offline' },
};

/* ── Component ──────────────────────────────────────────────────────────── */

export default function People() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deptFilter, setDeptFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');

  const [form, setForm] = useState({
    display_name: '', role: 'member', department: '', title: '',
    phone: '', timezone: '', skills: '', status: 'active',
  });

  /* ── Fetch ─────────────────────────────────────────────────────────── */

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('business_people').select('*').order('display_name');
    setPeople((data || []).map((p: any) => ({
      ...p,
      skills: p.skills || [],
      projects_assigned: p.projects_assigned || [],
    })));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  /* ── Create ────────────────────────────────────────────────────────── */

  const handleCreate = async () => {
    if (!form.display_name.trim()) return;
    setSaving(true);
    await supabase.from('business_people').insert({
      display_name: form.display_name.trim(),
      role: form.role,
      department: form.department.trim() || null,
      title: form.title.trim() || null,
      phone: form.phone.trim() || null,
      timezone: form.timezone.trim() || null,
      skills: form.skills ? form.skills.split(',').map(s => s.trim()).filter(Boolean) : [],
      status: form.status,
    });
    setForm({ display_name: '', role: 'member', department: '', title: '', phone: '', timezone: '', skills: '', status: 'active' });
    setShowCreate(false);
    setSaving(false);
    fetchData();
  };

  /* ── Delete ────────────────────────────────────────────────────────── */

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this person?')) return;
    await supabase.from('business_people').delete().eq('id', id);
    fetchData();
  };

  /* ── Derived ───────────────────────────────────────────────────────── */

  const departments = [...new Set(people.map(p => p.department).filter(Boolean))].sort();
  const roles = [...new Set(people.map(p => p.role).filter(Boolean))].sort();

  let filtered = people;
  if (deptFilter !== 'all') filtered = filtered.filter(p => p.department === deptFilter);
  if (roleFilter !== 'all') filtered = filtered.filter(p => p.role === roleFilter);

  const stats = {
    total: people.length,
    admins: people.filter(p => p.role === 'admin').length,
    managers: people.filter(p => p.role === 'manager').length,
    members: people.filter(p => p.role === 'member').length,
  };

  function getInitials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: theme.inputBg, border: `1px solid ${theme.border}`,
    borderRadius: 10, color: theme.text, fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '40px 48px', overflowY: 'auto', height: '100%', background: theme.pageBg }}>
      {/* Header */}
      <PageHeader title="People" subtitle="Your team directory" onRefresh={fetchData}>
        <button onClick={() => setShowCreate(true)} style={{
          padding: '10px 24px', background: theme.accent, color: theme.text, border: 'none',
          borderRadius: 10, fontSize: 14, fontWeight: 400, cursor: 'pointer',
        }}>+ Add Person</button>
      </PageHeader>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total Team', value: stats.total, color: theme.accent },
          { label: 'Admins', value: stats.admins, color: theme.red },
          { label: 'Managers', value: stats.managers, color: theme.yellow },
          { label: 'Members', value: stats.members, color: theme.blue },
        ].map(s => (
          <div key={s.label} style={{ background: theme.cardBg, border: 'none', borderRadius: theme.radiusLg, padding: '28px 24px' }}>
            <div style={{ fontSize: 30, fontWeight: 300, color: s.color }}>{loading ? '...' : s.value}</div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 10 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <select style={{ ...inputStyle, width: 'auto', minWidth: 160 }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
          <option value="all">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 'auto', minWidth: 140 }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="all">All Roles</option>
          {roles.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: theme.textMuted, padding: 60 }}>Loading team...</div>}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 80, color: theme.textMuted }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <div style={{ fontSize: 16, fontWeight: 400, color: theme.textSecondary, marginBottom: 8 }}>No team members found</div>
          <div style={{ fontSize: 14 }}>Add your first team member to get started</div>
        </div>
      )}

      {/* Team Grid */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {filtered.map(p => {
            const expanded = expandedId === p.id;
            const rc = ROLE_COLORS[p.role] || ROLE_COLORS.member;
            const si = STATUS_INDICATORS[p.status] || STATUS_INDICATORS.offline;

            return (
              <div key={p.id} style={{
                background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 24,
                cursor: 'pointer', transition: 'border-color 0.2s',
              }}
                onClick={() => setExpandedId(expanded ? null : p.id)}
                onMouseOver={e => e.currentTarget.style.borderColor = theme.accent}
                onMouseOut={e => e.currentTarget.style.borderColor = theme.border}
              >
                {/* Avatar + Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
                  <div style={{ position: 'relative' }}>
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{
                        width: 48, height: 48, borderRadius: '50%', background: theme.border,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, fontWeight: 400, color: theme.accent,
                      }}>{getInitials(p.display_name)}</div>
                    )}
                    <span style={{
                      position: 'absolute', bottom: 0, right: 0, width: 12, height: 12,
                      borderRadius: '50%', background: si.color, border: `2px solid ${theme.surfaceBg}`,
                    }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 400, color: theme.text }}>{p.display_name}</div>
                    {p.title && <div style={{ fontSize: 12, color: theme.textSecondary }}>{p.title}</div>}
                  </div>
                </div>

                {/* Role + Department */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 400, background: rc.bg, color: rc.text }}>{p.role}</span>
                  {p.department && <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, background: theme.border, color: theme.textSecondary }}>{p.department}</span>}
                </div>

                {/* Status line */}
                <div style={{ fontSize: 12, color: si.color, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: si.color }} />
                  {si.label}
                </div>

                {/* Expanded */}
                {expanded && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${theme.border}` }}>
                    <div style={{ fontSize: 12, color: theme.textSecondary, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {p.phone && <span>📞 {p.phone}</span>}
                      {p.timezone && <span>🌍 {p.timezone}</span>}
                    </div>

                    {/* Skills */}
                    {p.skills && p.skills.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 400, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Skills</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {p.skills.map((s, i) => (
                            <span key={i} style={{ padding: '2px 10px', borderRadius: 6, fontSize: 11, background: theme.accentBg, color: theme.accent }}>{s}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Projects Assigned */}
                    {p.projects_assigned && p.projects_assigned.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 400, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Projects</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {p.projects_assigned.map((proj, i) => (
                            <span key={i} style={{ padding: '2px 10px', borderRadius: 6, fontSize: 11, background: theme.border, color: theme.textSecondary }}>{proj}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <button onClick={e => { e.stopPropagation(); handleDelete(p.id); }} style={{
                      padding: '6px 16px', background: theme.redBg, color: theme.red,
                      border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                    }}>Remove</button>
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
            background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 16,
            padding: 32, width: 480, maxHeight: '85vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 20, fontWeight: 400, color: theme.text, margin: '0 0 24px' }}>Add Person</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: theme.textSecondary, display: 'block', marginBottom: 6 }}>Display Name *</label>
                <input style={inputStyle} value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Full name" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: theme.textSecondary, display: 'block', marginBottom: 6 }}>Role</label>
                  <select style={inputStyle} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="member">Member</option>
                    <option value="contractor">Contractor</option>
                    <option value="intern">Intern</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: theme.textSecondary, display: 'block', marginBottom: 6 }}>Status</label>
                  <select style={inputStyle} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Active</option>
                    <option value="away">Away</option>
                    <option value="busy">Busy</option>
                    <option value="offline">Offline</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: theme.textSecondary, display: 'block', marginBottom: 6 }}>Department</label>
                  <input style={inputStyle} value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="Engineering, Design..." />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: theme.textSecondary, display: 'block', marginBottom: 6 }}>Title</label>
                  <input style={inputStyle} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Senior Developer..." />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: theme.textSecondary, display: 'block', marginBottom: 6 }}>Phone</label>
                  <input style={inputStyle} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1234567890" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: theme.textSecondary, display: 'block', marginBottom: 6 }}>Timezone</label>
                  <input style={inputStyle} value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} placeholder="UTC+0, EST, PST..." />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: theme.textSecondary, display: 'block', marginBottom: 6 }}>Skills (comma separated)</label>
                <input style={inputStyle} value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })} placeholder="React, Python, Design..." />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 28 }}>
              <button onClick={() => setShowCreate(false)} style={{
                padding: '10px 24px', background: theme.border, color: theme.textSecondary, border: 'none',
                borderRadius: 10, fontSize: 14, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving || !form.display_name.trim()} style={{
                padding: '10px 24px', background: theme.accent, color: theme.text, border: 'none',
                borderRadius: 10, fontSize: 14, fontWeight: 400, cursor: 'pointer',
                opacity: saving || !form.display_name.trim() ? 0.5 : 1,
              }}>{saving ? 'Adding...' : 'Add Person'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
