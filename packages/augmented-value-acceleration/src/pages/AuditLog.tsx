import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface AuditEntry {
  id: string;
  user_name: string;
  user_avatar?: string;
  action: string;
  entity_type: string;
  entity_name: string;
  details: string;
  created_at: string;
}

const ACTION_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  create: { bg: '#064e3b', text: '#6ee7b7', label: 'CREATE' },
  created: { bg: '#064e3b', text: '#6ee7b7', label: 'CREATE' },
  update: { bg: '#1e3a5f', text: '#60a5fa', label: 'UPDATE' },
  updated: { bg: '#1e3a5f', text: '#60a5fa', label: 'UPDATE' },
  delete: { bg: '#7f1d1d', text: '#fca5a5', label: 'DELETE' },
  deleted: { bg: '#7f1d1d', text: '#fca5a5', label: 'DELETE' },
  login: { bg: '#3f3f46', text: '#a1a1aa', label: 'LOGIN' },
  logout: { bg: '#3f3f46', text: '#a1a1aa', label: 'LOGOUT' },
  assign: { bg: '#78350f', text: '#fbbf24', label: 'ASSIGN' },
  upload: { bg: '#1e3a5f', text: '#60a5fa', label: 'UPLOAD' },
};

const ACTION_ICONS: Record<string, string> = {
  create: '➕', created: '➕',
  update: '✏️', updated: '✏️',
  delete: '🗑️', deleted: '🗑️',
  login: '🔑', logout: '🚪',
  assign: '📌', upload: '📤',
};

/* ── Component ──────────────────────────────────────────────────────────── */

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  /* ── Fetch ─────────────────────────────────────────────────────────── */

  const fetchData = async () => {
    setLoading(true);
    let query = supabase.from('business_audit_log').select('*').order('created_at', { ascending: false });

    if (userFilter !== 'all') query = query.eq('user_name', userFilter);
    if (actionFilter !== 'all') query = query.eq('action', actionFilter);
    if (entityFilter !== 'all') query = query.eq('entity_type', entityFilter);
    if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00');
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');

    const { data } = await query.limit(500);
    setEntries(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [userFilter, actionFilter, entityFilter, dateFrom, dateTo]);

  /* ── Derived ───────────────────────────────────────────────────────── */

  const users = [...new Set(entries.map(e => e.user_name).filter(Boolean))].sort();
  const actions = [...new Set(entries.map(e => e.action).filter(Boolean))].sort();
  const entityTypes = [...new Set(entries.map(e => e.entity_type).filter(Boolean))].sort();

  const filtered = search
    ? entries.filter(e =>
        e.action?.toLowerCase().includes(search.toLowerCase()) ||
        e.entity_name?.toLowerCase().includes(search.toLowerCase()) ||
        e.entity_type?.toLowerCase().includes(search.toLowerCase()) ||
        e.user_name?.toLowerCase().includes(search.toLowerCase()) ||
        e.details?.toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  function getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function getActionStyle(action: string): { bg: string; text: string; label: string } {
    const normalized = action?.toLowerCase() || '';
    return ACTION_COLORS[normalized] || { bg: '#3f3f46', text: '#a1a1aa', label: action?.toUpperCase() || '—' };
  }

  function getActionIcon(action: string): string {
    const normalized = action?.toLowerCase() || '';
    return ACTION_ICONS[normalized] || '📋';
  }

  /* ── Group by date ─────────────────────────────────────────────────── */

  const grouped: Record<string, AuditEntry[]> = {};
  filtered.forEach(e => {
    const dateKey = formatDate(e.created_at);
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(e);
  });

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: '#1a1a35', border: '1px solid #1f1f3a',
    borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '40px 48px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: 0 }}>Audit Log</h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>Track all system activity and changes</p>
      </div>

      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <input
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search actions, entities, users..."
        />
        <select style={{ ...inputStyle, width: 'auto', minWidth: 140 }} value={userFilter} onChange={e => setUserFilter(e.target.value)}>
          <option value="all">All Users</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 'auto', minWidth: 140 }} value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
          <option value="all">All Actions</option>
          {actions.map(a => <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 'auto', minWidth: 140 }} value={entityFilter} onChange={e => setEntityFilter(e.target.value)}>
          <option value="all">All Entities</option>
          {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Date Range */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 32, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>Date range:</span>
        <input type="date" style={{ ...inputStyle, width: 'auto' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span style={{ color: '#6b7280' }}>to</span>
        <input type="date" style={{ ...inputStyle, width: 'auto' }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{
            padding: '8px 16px', background: '#1f1f3a', color: '#9ca3af', border: 'none',
            borderRadius: 8, fontSize: 12, cursor: 'pointer',
          }}>Clear</button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#6b7280' }}>{filtered.length} entries</span>
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading audit log...</div>}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 80, color: '#6b7280' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>No audit entries found</div>
          <div style={{ fontSize: 14 }}>Activity will appear here as you use the system</div>
        </div>
      )}

      {/* Timeline */}
      {!loading && Object.keys(grouped).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {Object.entries(grouped).map(([dateLabel, dateEntries]) => (
            <div key={dateLabel}>
              {/* Date header */}
              <div style={{
                fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase',
                letterSpacing: '1px', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #1f1f3a',
              }}>{dateLabel}</div>

              {/* Entries */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dateEntries.map(entry => {
                  const expanded = expandedId === entry.id;
                  const actionStyle = getActionStyle(entry.action);
                  const icon = getActionIcon(entry.action);

                  return (
                    <div key={entry.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 16px',
                      borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s',
                    }}
                      onClick={() => setExpandedId(expanded ? null : entry.id)}
                      onMouseOver={e => e.currentTarget.style.background = '#111127'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Time */}
                      <span style={{ fontSize: 12, color: '#4b5563', width: 70, flexShrink: 0, fontFamily: 'monospace' }}>
                        {formatTime(entry.created_at)}
                      </span>

                      {/* Avatar */}
                      {entry.user_avatar ? (
                        <img src={entry.user_avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', background: '#1f1f3a',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: '#a855f7', flexShrink: 0,
                        }}>{getInitials(entry.user_name)}</div>
                      )}

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{entry.user_name || 'System'}</span>
                          <span style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                            background: actionStyle.bg, color: actionStyle.text, letterSpacing: '0.5px',
                          }}>{icon} {actionStyle.label}</span>
                          <span style={{ fontSize: 13, color: '#9ca3af' }}>
                            {entry.entity_type && <span style={{ color: '#6b7280' }}>{entry.entity_type} </span>}
                            {entry.entity_name && <span style={{ fontWeight: 500 }}>{entry.entity_name}</span>}
                          </span>
                        </div>

                        {/* Expanded details */}
                        {expanded && entry.details && (
                          <div style={{
                            marginTop: 10, padding: '12px 16px', background: '#0d0d22',
                            borderRadius: 8, border: '1px solid #1f1f3a',
                          }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Details</div>
                            <pre style={{
                              fontSize: 12, color: '#9ca3af', margin: 0, whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word', fontFamily: 'monospace', lineHeight: 1.6,
                            }}>{typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
