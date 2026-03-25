import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle } from '../lib/theme';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface AuditEntry {
  id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_name: string;
  details: string;
  created_at: string;
}

interface RetentionPolicy {
  id: string;
  entity_type: string;
  retention_days: number;
  auto_delete: boolean;
  created_at: string;
  updated_at: string;
}

interface ActivitySummary {
  user_name: string;
  action_count: number;
  last_action: string;
  most_common_action: string;
}

/* ── Tabs ───────────────────────────────────────────────────────────────── */

type Tab = 'audit' | 'export' | 'deletion' | 'retention' | 'activity';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'audit', label: 'Audit Trail', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { id: 'export', label: 'Data Export', icon: 'M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
  { id: 'deletion', label: 'Data Deletion', icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' },
  { id: 'retention', label: 'Retention Policies', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'activity', label: 'Activity Report', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
];

/* ── Component ──────────────────────────────────────────────────────────── */

export default function Compliance() {
  const [tab, setTab] = useState<Tab>('audit');
  const [loading, setLoading] = useState(true);

  /* Audit state */
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditAction, setAuditAction] = useState('all');
  const [auditEntity, setAuditEntity] = useState('all');
  const [auditDateFrom, setAuditDateFrom] = useState('');
  const [auditDateTo, setAuditDateTo] = useState('');

  /* Retention state */
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [newEntityType, setNewEntityType] = useState('');
  const [newRetentionDays, setNewRetentionDays] = useState(90);
  const [savingPolicy, setSavingPolicy] = useState(false);

  /* Activity state */
  const [activitySummary, setActivitySummary] = useState<ActivitySummary[]>([]);

  /* Export/deletion state */
  const [exportEmail, setExportEmail] = useState('');
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [processing, setProcessing] = useState(false);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  /* Stats */
  const [stats, setStats] = useState({ totalActions: 0, usersTracked: 0, exportRequests: 0 });

  /* ── Fetch Audit ─────────────────────────────────────────────────────── */

  const fetchAudit = async () => {
    setLoading(true);
    let query = supabase
      .from('business_audit_log')
      .select('*')
      .order('created_at', { ascending: false });

    if (auditAction !== 'all') query = query.eq('action', auditAction);
    if (auditEntity !== 'all') query = query.eq('entity_type', auditEntity);
    if (auditDateFrom) query = query.gte('created_at', auditDateFrom + 'T00:00:00');
    if (auditDateTo) query = query.lte('created_at', auditDateTo + 'T23:59:59');

    const { data } = await query.limit(500);
    setAuditEntries(data || []);
    setLoading(false);
  };

  /* ── Fetch Retention Policies ────────────────────────────────────────── */

  const fetchPolicies = async () => {
    const { data } = await supabase
      .from('business_retention_policies')
      .select('*')
      .order('entity_type');
    setPolicies(data || []);
  };

  /* ── Fetch Activity Summary ──────────────────────────────────────────── */

  const fetchActivity = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('business_audit_log')
      .select('user_name, action, created_at')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (data && data.length > 0) {
      const userMap: Record<string, { count: number; last: string; actions: Record<string, number> }> = {};
      data.forEach((e: any) => {
        const name = e.user_name || 'System';
        if (!userMap[name]) userMap[name] = { count: 0, last: e.created_at, actions: {} };
        userMap[name].count++;
        userMap[name].actions[e.action] = (userMap[name].actions[e.action] || 0) + 1;
        if (e.created_at > userMap[name].last) userMap[name].last = e.created_at;
      });

      const summary: ActivitySummary[] = Object.entries(userMap).map(([name, info]) => ({
        user_name: name,
        action_count: info.count,
        last_action: info.last,
        most_common_action: Object.entries(info.actions).sort(([, a], [, b]) => b - a)[0]?.[0] || 'unknown',
      })).sort((a, b) => b.action_count - a.action_count);

      setActivitySummary(summary);
    }
    setLoading(false);
  };

  /* ── Fetch Stats ─────────────────────────────────────────────────────── */

  const fetchStats = async () => {
    const [audit, users] = await Promise.all([
      supabase.from('business_audit_log').select('id', { count: 'exact', head: true }),
      supabase.from('business_audit_log').select('user_name'),
    ]);
    const uniqueUsers = new Set((users.data || []).map((u: any) => u.user_name)).size;
    setStats({
      totalActions: audit.count ?? 0,
      usersTracked: uniqueUsers,
      exportRequests: 0,
    });
  };

  const refreshAll = () => { fetchStats(); fetchPolicies(); fetchAudit(); fetchActivity(); };

  /* ── Init ────────────────────────────────────────────────────────────── */

  useEffect(() => {
    fetchStats();
    fetchPolicies();
  }, []);

  useEffect(() => {
    if (tab === 'audit') fetchAudit();
    if (tab === 'activity') fetchActivity();
  }, [tab, auditAction, auditEntity, auditDateFrom, auditDateTo]);

  /* ── Export Handler ──────────────────────────────────────────────────── */

  const handleExport = async () => {
    if (!exportEmail.trim()) return;
    setProcessing(true);
    setActionResult(null);

    try {
      // Fetch all data for the user
      const [memories, messages, audit] = await Promise.all([
        supabase.from('memories').select('*').eq('user_id', exportEmail),
        supabase.from('business_messages').select('*').eq('sender_name', exportEmail),
        supabase.from('business_audit_log').select('*').eq('user_name', exportEmail),
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        user: exportEmail,
        memories: memories.data || [],
        messages: messages.data || [],
        audit_log: audit.data || [],
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-data-export-${exportEmail}-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setActionResult({ type: 'success', message: `Data export completed for ${exportEmail}. File downloaded.` });
      setExportEmail('');
    } catch {
      setActionResult({ type: 'error', message: 'Failed to export user data.' });
    }
    setProcessing(false);
  };

  /* ── Deletion Handler ────────────────────────────────────────────────── */

  const handleDeletion = async () => {
    if (!deleteEmail.trim() || deleteConfirm !== 'DELETE') return;
    setProcessing(true);
    setActionResult(null);

    try {
      await Promise.all([
        supabase.from('memories').delete().eq('user_id', deleteEmail),
        supabase.from('business_messages').delete().eq('sender_name', deleteEmail),
        supabase.from('business_audit_log').delete().eq('user_name', deleteEmail),
        supabase.from('business_team_memories').delete().eq('author_id', deleteEmail),
      ]);

      setActionResult({ type: 'success', message: `All data for ${deleteEmail} has been permanently deleted.` });
      setDeleteEmail('');
      setDeleteConfirm('');
    } catch {
      setActionResult({ type: 'error', message: 'Failed to delete user data.' });
    }
    setProcessing(false);
  };

  /* ── Save Retention Policy ───────────────────────────────────────────── */

  const handleSavePolicy = async () => {
    if (!newEntityType.trim()) return;
    setSavingPolicy(true);
    await supabase.from('business_retention_policies').upsert({
      entity_type: newEntityType.trim(),
      retention_days: newRetentionDays,
      auto_delete: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'entity_type' });
    setNewEntityType('');
    setNewRetentionDays(90);
    setSavingPolicy(false);
    fetchPolicies();
  };

  const handleDeletePolicy = async (id: string) => {
    await supabase.from('business_retention_policies').delete().eq('id', id);
    fetchPolicies();
  };

  const handleTogglePolicy = async (policy: RetentionPolicy) => {
    await supabase.from('business_retention_policies')
      .update({ auto_delete: !policy.auto_delete, updated_at: new Date().toISOString() })
      .eq('id', policy.id);
    fetchPolicies();
  };

  /* ── Derived ─────────────────────────────────────────────────────────── */

  const auditActions = [...new Set(auditEntries.map(e => e.action).filter(Boolean))].sort();
  const auditEntities = [...new Set(auditEntries.map(e => e.entity_type).filter(Boolean))].sort();

  const filteredAudit = auditSearch
    ? auditEntries.filter(e =>
        e.action?.toLowerCase().includes(auditSearch.toLowerCase()) ||
        e.entity_name?.toLowerCase().includes(auditSearch.toLowerCase()) ||
        e.user_name?.toLowerCase().includes(auditSearch.toLowerCase()) ||
        e.details?.toLowerCase().includes(auditSearch.toLowerCase())
      )
    : auditEntries;

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: theme.inputBg, border: `1px solid ${theme.border}`,
    borderRadius: 10, color: theme.text, fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };

  const cardStyle: React.CSSProperties = {
    background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: theme.radiusLg, padding: 24,
  };

  return (
    <div style={pageStyle}>
      {/* Header */}
      <PageHeader title="Compliance" subtitle="GDPR, audit trails, data management and retention" onRefresh={refreshAll} />

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total Actions Logged', value: stats.totalActions.toLocaleString(), color: '#a855f7' },
          { label: 'Users Tracked', value: stats.usersTracked.toLocaleString(), color: '#60a5fa' },
          { label: 'Data Exports', value: stats.exportRequests.toLocaleString(), color: '#34d399' },
        ].map(s => (
          <div key={s.label} style={cardStyle}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 400, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: `1px solid ${theme.border}`, paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setActionResult(null); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 20px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 400,
              background: 'transparent',
              color: tab === t.id ? '#a855f7' : '#6b7280',
              borderBottom: tab === t.id ? '2px solid #a855f7' : '2px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </div>

      {/* Result message */}
      {actionResult && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 24,
          background: actionResult.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${actionResult.type === 'success' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
          color: actionResult.type === 'success' ? '#86efac' : '#fca5a5',
          fontSize: 13,
        }}>{actionResult.message}</div>
      )}

      {/* ── Audit Trail Tab ──────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <input
              style={{ ...inputStyle, flex: 1, minWidth: 200 }}
              value={auditSearch}
              onChange={e => setAuditSearch(e.target.value)}
              placeholder="Search audit trail..."
            />
            <select style={{ ...inputStyle, width: 'auto', minWidth: 140 }} value={auditAction} onChange={e => setAuditAction(e.target.value)}>
              <option value="all">All Actions</option>
              {auditActions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select style={{ ...inputStyle, width: 'auto', minWidth: 140 }} value={auditEntity} onChange={e => setAuditEntity(e.target.value)}>
              <option value="all">All Entities</option>
              {auditEntities.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Date range:</span>
            <input type="date" style={{ ...inputStyle, width: 'auto' }} value={auditDateFrom} onChange={e => setAuditDateFrom(e.target.value)} />
            <span style={{ color: '#6b7280' }}>to</span>
            <input type="date" style={{ ...inputStyle, width: 'auto' }} value={auditDateTo} onChange={e => setAuditDateTo(e.target.value)} />
            {(auditDateFrom || auditDateTo) && (
              <button onClick={() => { setAuditDateFrom(''); setAuditDateTo(''); }} style={{
                padding: '8px 16px', background: theme.inputBg, color: '#9ca3af', border: 'none',
                borderRadius: 8, fontSize: 12, cursor: 'pointer',
              }}>Clear</button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 13, color: '#6b7280' }}>{filteredAudit.length} entries</span>
          </div>

          {/* Audit Table */}
          {loading ? (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading audit trail...</div>
          ) : filteredAudit.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
              <div style={{ fontSize: 16, fontWeight: 400, color: '#9ca3af', marginBottom: 8 }}>No audit entries found</div>
              <div style={{ fontSize: 14 }}>Activity will appear here as the system is used</div>
            </div>
          ) : (
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {['Time', 'User', 'Action', 'Entity', 'Details'].map(h => (
                      <th key={h} style={{
                        padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 400,
                        color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.slice(0, 100).map(entry => (
                    <tr key={entry.id} style={{ borderBottom: `1px solid ${theme.border}` }}
                      onMouseOver={e => (e.currentTarget.style.background = theme.cardBg)}
                      onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '10px 16px', fontSize: 12, color: '#4b5563', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {formatDate(entry.created_at)}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%', background: theme.inputBg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 400, color: '#a855f7', flexShrink: 0,
                          }}>{getInitials(entry.user_name)}</div>
                          <span style={{ fontSize: 13, color: '#d1d5db' }}>{entry.user_name || 'System'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 400,
                          background: entry.action === 'delete' ? '#7f1d1d' : entry.action === 'create' ? '#064e3b' : '#1e3a5f',
                          color: entry.action === 'delete' ? '#fca5a5' : entry.action === 'create' ? '#6ee7b7' : '#60a5fa',
                          textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>{entry.action}</span>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: '#9ca3af' }}>
                        {entry.entity_type} {entry.entity_name && <span style={{ fontWeight: 400, color: '#d1d5db' }}>{entry.entity_name}</span>}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: '#4b5563', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.details || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Data Export Tab ───────────────────────────────────────────── */}
      {tab === 'export' && (
        <div style={{ maxWidth: 600 }}>
          <div style={cardStyle}>
            <h3 style={{ fontSize: 18, fontWeight: 400, color: '#fff', margin: '0 0 8px' }}>GDPR Data Export</h3>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>
              Export all data associated with a user as a JSON file. This fulfils the GDPR right to access (Article 15).
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>User Identifier (email or user ID)</label>
              <input
                style={inputStyle}
                value={exportEmail}
                onChange={e => setExportEmail(e.target.value)}
                placeholder="user@company.com"
              />
            </div>

            <div style={{
              padding: '12px 16px', borderRadius: 8, marginBottom: 20,
              background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.15)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 400, color: '#60a5fa', marginBottom: 4 }}>What gets exported</div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#9ca3af', lineHeight: 1.8 }}>
                <li>Personal memories</li>
                <li>Messages sent</li>
                <li>Audit log entries</li>
              </ul>
            </div>

            <button
              onClick={handleExport}
              disabled={processing || !exportEmail.trim()}
              style={{
                padding: '12px 28px', background: '#a855f7', color: '#fff', border: 'none',
                borderRadius: 10, fontSize: 14, fontWeight: 400, cursor: 'pointer',
                opacity: processing || !exportEmail.trim() ? 0.5 : 1,
              }}
            >{processing ? 'Exporting...' : 'Export User Data'}</button>
          </div>
        </div>
      )}

      {/* ── Data Deletion Tab ────────────────────────────────────────── */}
      {tab === 'deletion' && (
        <div style={{ maxWidth: 600 }}>
          <div style={{ ...cardStyle, borderColor: '#7f1d1d30' }}>
            <h3 style={{ fontSize: 18, fontWeight: 400, color: '#fff', margin: '0 0 8px' }}>GDPR Data Deletion</h3>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>
              Permanently delete all data associated with a user. This fulfils the GDPR right to erasure (Article 17).
              This action cannot be undone.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>User Identifier (email or user ID)</label>
              <input
                style={inputStyle}
                value={deleteEmail}
                onChange={e => setDeleteEmail(e.target.value)}
                placeholder="user@company.com"
              />
            </div>

            <div style={{
              padding: '12px 16px', borderRadius: 8, marginBottom: 20,
              background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 400, color: '#fca5a5', marginBottom: 4 }}>Warning: This is irreversible</div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#9ca3af', lineHeight: 1.8 }}>
                <li>All personal memories will be deleted</li>
                <li>All messages sent by this user will be deleted</li>
                <li>All audit log entries for this user will be deleted</li>
                <li>All team memories authored by this user will be deleted</li>
              </ul>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: '#fca5a5', display: 'block', marginBottom: 6 }}>
                Type DELETE to confirm
              </label>
              <input
                style={{ ...inputStyle, borderColor: deleteConfirm === 'DELETE' ? '#ef4444' : theme.border }}
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
              />
            </div>

            <button
              onClick={handleDeletion}
              disabled={processing || !deleteEmail.trim() || deleteConfirm !== 'DELETE'}
              style={{
                padding: '12px 28px', background: '#dc2626', color: '#fff', border: 'none',
                borderRadius: 10, fontSize: 14, fontWeight: 400, cursor: 'pointer',
                opacity: processing || !deleteEmail.trim() || deleteConfirm !== 'DELETE' ? 0.5 : 1,
              }}
            >{processing ? 'Deleting...' : 'Permanently Delete All Data'}</button>
          </div>
        </div>
      )}

      {/* ── Retention Policies Tab ───────────────────────────────────── */}
      {tab === 'retention' && (
        <div>
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 400, color: '#fff', margin: '0 0 16px' }}>Add Retention Policy</h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Entity Type</label>
                <input
                  style={inputStyle}
                  value={newEntityType}
                  onChange={e => setNewEntityType(e.target.value)}
                  placeholder="e.g. audit_log, messages, memories"
                />
              </div>
              <div style={{ width: 160 }}>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Retention (days)</label>
                <input
                  style={inputStyle}
                  type="number"
                  value={newRetentionDays}
                  onChange={e => setNewRetentionDays(Number(e.target.value))}
                  min={1}
                />
              </div>
              <button
                onClick={handleSavePolicy}
                disabled={savingPolicy || !newEntityType.trim()}
                style={{
                  padding: '10px 24px', background: '#a855f7', color: '#fff', border: 'none',
                  borderRadius: 10, fontSize: 14, fontWeight: 400, cursor: 'pointer',
                  opacity: savingPolicy || !newEntityType.trim() ? 0.5 : 1, whiteSpace: 'nowrap',
                }}
              >{savingPolicy ? 'Saving...' : 'Add Policy'}</button>
            </div>
          </div>

          {/* Existing Policies */}
          {policies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
              <div style={{ fontSize: 16, fontWeight: 400, color: '#9ca3af', marginBottom: 8 }}>No retention policies configured</div>
              <div style={{ fontSize: 14 }}>Add a policy above to automatically manage data retention</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {policies.map(policy => (
                <div key={policy.id} style={{
                  ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px',
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 400, color: '#fff' }}>{policy.entity_type}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      Auto-delete after {policy.retention_days} days
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      onClick={() => handleTogglePolicy(policy)}
                      style={{
                        padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 400, cursor: 'pointer',
                        background: policy.auto_delete ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: policy.auto_delete ? '#86efac' : '#fca5a5',
                        border: `1px solid ${policy.auto_delete ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                      }}
                    >{policy.auto_delete ? 'Active' : 'Paused'}</button>
                    <button
                      onClick={() => handleDeletePolicy(policy.id)}
                      style={{
                        padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                        background: theme.inputBg, color: '#9ca3af', border: 'none',
                      }}
                    >Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Activity Report Tab ──────────────────────────────────────── */}
      {tab === 'activity' && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading activity report...</div>
          ) : activitySummary.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
              <div style={{ fontSize: 16, fontWeight: 400, color: '#9ca3af', marginBottom: 8 }}>No activity data</div>
              <div style={{ fontSize: 14 }}>Activity will appear as the system is used</div>
            </div>
          ) : (
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {['User', 'Total Actions', 'Most Common Action', 'Last Activity'].map(h => (
                      <th key={h} style={{
                        padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 400,
                        color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activitySummary.map(user => (
                    <tr key={user.user_name} style={{ borderBottom: `1px solid ${theme.border}` }}
                      onMouseOver={e => (e.currentTarget.style.background = theme.cardBg)}
                      onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', background: theme.inputBg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 400, color: '#a855f7',
                          }}>{getInitials(user.user_name)}</div>
                          <span style={{ fontSize: 14, fontWeight: 400, color: '#fff' }}>{user.user_name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 400, color: '#a855f7' }}>
                        {user.action_count.toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 400,
                          background: '#1e3a5f', color: '#60a5fa', textTransform: 'uppercase',
                        }}>{user.most_common_action}</span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#4b5563', fontFamily: 'monospace' }}>
                        {formatDate(user.last_action)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
