import { useEffect, useState, Fragment } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, inputStyle as baseInputStyle, tableHeaderStyle, tableCellStyle } from '../lib/theme';

interface User {
  id: string;
  email: string;
  name: string | null;
  tier: string;
  created_at: string;
  last_sign_in_at: string | null;
  token_usage?: number;
  memory_count?: number;
  api_key_count?: number;
}

const TIERS = ['free', 'pro', 'ultra', 'enterprise', 'admin'] as const;

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  free: { bg: 'rgba(108, 112, 134, 0.12)', text: theme.textSecondary },
  pro: { bg: theme.blueBg, text: theme.blue },
  ultra: { bg: theme.accentBg, text: theme.accent },
  enterprise: { bg: theme.yellowBg, text: theme.yellow },
  admin: { bg: theme.redBg, text: theme.red },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      let query = supabase.from('users').select('*').order('created_at', { ascending: false });
      if (tierFilter !== 'all') query = query.eq('tier', tierFilter);
      const { data } = await query.limit(500);
      setUsers(data || []);
    } catch {
      // silent
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, [tierFilter]);

  const filtered = search
    ? users.filter(u =>
        u.name?.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase()) ||
        u.id?.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const stats = {
    total: users.length,
    free: users.filter(u => u.tier === 'free').length,
    pro: users.filter(u => u.tier === 'pro').length,
    ultra: users.filter(u => u.tier === 'ultra').length,
    enterprise: users.filter(u => u.tier === 'enterprise').length,
  };

  async function changeTier(userId: string, newTier: string) {
    setActionLoading(userId);
    try {
      await supabase.from('users').update({ tier: newTier }).eq('id', userId);
      await fetchUsers();
    } finally {
      setActionLoading(null);
    }
  }

  async function resetUsage(userId: string) {
    setActionLoading(userId);
    try {
      await supabase.from('usage').update({ tokens_used: 0, request_count: 0 }).eq('user_id', userId);
      await fetchUsers();
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleDisable(userId: string, currentTier: string) {
    setActionLoading(userId);
    try {
      const newTier = currentTier === 'disabled' ? 'free' : 'disabled';
      await supabase.from('users').update({ tier: newTier }).eq('id', userId);
      await fetchUsers();
    } finally {
      setActionLoading(null);
    }
  }

  const tierBadge = (tier: string) => {
    const c = TIER_COLORS[tier] || TIER_COLORS.free;
    return (
      <span style={{
        background: c.bg, color: c.text, fontSize: 11, fontWeight: 400,
        padding: '3px 10px', borderRadius: 9999, textTransform: 'capitalize' as const,
      }}>
        {tier}
      </span>
    );
  };

  return (
    <div style={pageStyle}>
      <PageHeader title="Users" subtitle="Manage platform users, tiers, and usage." onRefresh={fetchUsers} />

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 20, marginBottom: theme.sectionGap }}>
        {[
          { label: 'Total Users', value: stats.total, color: theme.text },
          { label: 'Free', value: stats.free, color: theme.textSecondary },
          { label: 'Pro', value: stats.pro, color: theme.blue },
          { label: 'Ultra', value: stats.ultra, color: theme.accent },
          { label: 'Enterprise', value: stats.enterprise, color: theme.yellow },
        ].map(s => (
          <div key={s.label} style={{
            background: theme.cardBg, border: 'none',
            borderRadius: theme.radiusLg, padding: '28px 24px',
          }}>
            <div style={{ fontSize: 30, fontWeight: 300, color: s.color }}>{loading ? '...' : s.value}</div>
            <div style={{ fontSize: 12, fontWeight: 400, color: theme.textMuted, marginTop: 10 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <input
          style={{ ...baseInputStyle, flex: 1 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, or ID..."
        />
        <select
          style={{ ...baseInputStyle, width: 'auto', minWidth: 140 }}
          value={tierFilter}
          onChange={e => setTierFilter(e.target.value)}
        >
          <option value="all">All Tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: theme.textMuted, padding: 60 }}>Loading users...</div>}

      {/* Table */}
      {!loading && (
        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: theme.radiusLg, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {['Name', 'Email', 'Tier', 'Signed Up', 'Last Active', 'Actions'].map(h => (
                  <th key={h} style={tableHeaderStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}>👤</div>
                    <div style={{ fontSize: 14, color: theme.textSecondary }}>No users found.</div>
                  </td>
                </tr>
              ) : (
                filtered.map(user => {
                  const isExpanded = expandedId === user.id;
                  return (
                    <Fragment key={user.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : user.id)}
                        style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', transition: 'background 0.15s' }}
                        onMouseOver={e => (e.currentTarget.style.background = theme.hoverBg)}
                        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ ...tableCellStyle, color: theme.text, fontWeight: 400 }}>
                          {user.name || 'Unnamed'}
                        </td>
                        <td style={{ ...tableCellStyle, color: theme.textSecondary }}>{user.email}</td>
                        <td style={tableCellStyle}>{tierBadge(user.tier || 'free')}</td>
                        <td style={{ ...tableCellStyle, color: theme.textMuted }}>
                          {user.created_at ? formatDate(user.created_at) : '—'}
                        </td>
                        <td style={{ ...tableCellStyle, color: theme.textMuted }}>
                          {user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : 'Never'}
                        </td>
                        <td style={tableCellStyle} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <select
                              value={user.tier || 'free'}
                              onChange={e => changeTier(user.id, e.target.value)}
                              disabled={actionLoading === user.id}
                              style={{
                                background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 6,
                                padding: '4px 8px', fontSize: 11, color: theme.textSecondary, cursor: 'pointer',
                              }}
                            >
                              {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr style={{ borderBottom: `1px solid ${theme.border}`, background: theme.surfaceBg }}>
                          <td colSpan={6} style={{ padding: '20px 24px' }}>
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                              <div style={{
                                background: theme.cardBg, border: `1px solid ${theme.border}`,
                                borderRadius: theme.radiusMd, padding: '14px 18px', minWidth: 130,
                              }}>
                                <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 4 }}>User ID</div>
                                <div style={{ fontSize: 11, color: theme.text, fontFamily: 'monospace' }}>{user.id}</div>
                              </div>
                              <div style={{
                                background: theme.cardBg, border: `1px solid ${theme.border}`,
                                borderRadius: theme.radiusMd, padding: '14px 18px', minWidth: 130,
                              }}>
                                <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 4 }}>Token Usage</div>
                                <div style={{ fontSize: 20, fontWeight: 400, color: theme.accent }}>{user.token_usage?.toLocaleString() || '0'}</div>
                              </div>
                              <div style={{
                                background: theme.cardBg, border: `1px solid ${theme.border}`,
                                borderRadius: theme.radiusMd, padding: '14px 18px', minWidth: 130,
                              }}>
                                <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 4 }}>Memories</div>
                                <div style={{ fontSize: 20, fontWeight: 400, color: theme.blue }}>{user.memory_count || 0}</div>
                              </div>
                              <div style={{
                                background: theme.cardBg, border: `1px solid ${theme.border}`,
                                borderRadius: theme.radiusMd, padding: '14px 18px', minWidth: 130,
                              }}>
                                <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 4 }}>API Keys</div>
                                <div style={{ fontSize: 20, fontWeight: 400, color: theme.yellow }}>{user.api_key_count || 0}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                onClick={() => resetUsage(user.id)}
                                disabled={actionLoading === user.id}
                                style={{
                                  background: 'none', border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
                                  padding: '8px 14px', fontSize: 12, color: theme.orange, cursor: 'pointer',
                                  opacity: actionLoading === user.id ? 0.5 : 1, transition: 'border-color 0.2s',
                                }}
                              >
                                Reset Usage
                              </button>
                              <button
                                onClick={() => toggleDisable(user.id, user.tier)}
                                disabled={actionLoading === user.id}
                                style={{
                                  background: 'none', border: `1px solid ${theme.border}`, borderRadius: theme.radiusSm,
                                  padding: '8px 14px', fontSize: 12,
                                  color: user.tier === 'disabled' ? theme.green : theme.red,
                                  cursor: 'pointer',
                                  opacity: actionLoading === user.id ? 0.5 : 1, transition: 'border-color 0.2s',
                                }}
                              >
                                {user.tier === 'disabled' ? 'Enable Account' : 'Disable Account'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
