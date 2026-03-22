import { useEffect, useState, Fragment } from 'react';
import { supabase } from '../lib/supabase';

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
  free: { bg: 'rgba(107, 114, 128, 0.15)', text: '#9ca3af' },
  pro: { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa' },
  ultra: { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7' },
  enterprise: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24' },
  admin: { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171' },
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
        background: c.bg, color: c.text, fontSize: 10, fontWeight: 700,
        padding: '3px 10px', borderRadius: 10, textTransform: 'capitalize' as const,
      }}>
        {tier}
      </span>
    );
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: '#1a1a35', border: '1px solid #1f1f3a',
    borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '32px 40px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Users</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 24 }}>
        Manage platform users, tiers, and usage.
      </p>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Users', value: stats.total, color: '#fff' },
          { label: 'Free', value: stats.free, color: '#9ca3af' },
          { label: 'Pro', value: stats.pro, color: '#60a5fa' },
          { label: 'Ultra', value: stats.ultra, color: '#a855f7' },
          { label: 'Enterprise', value: stats.enterprise, color: '#fbbf24' },
        ].map(s => (
          <div key={s.label} style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280' }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, marginTop: 4 }}>{loading ? '...' : s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, or ID..."
        />
        <select
          style={{ ...inputStyle, width: 'auto', minWidth: 140 }}
          value={tierFilter}
          onChange={e => setTierFilter(e.target.value)}
        >
          <option value="all">All Tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading users...</div>}

      {/* Table */}
      {!loading && (
        <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1f1f3a' }}>
                {['Name', 'Email', 'Tier', 'Signed Up', 'Last Active', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#6b7280', fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: '#6b7280' }}>
                    No users found.
                  </td>
                </tr>
              ) : (
                filtered.map(user => {
                  const isExpanded = expandedId === user.id;
                  return (
                    <Fragment key={user.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : user.id)}
                        style={{ borderBottom: '1px solid #1f1f3a', cursor: 'pointer' }}
                        onMouseOver={e => (e.currentTarget.style.background = '#1a1a35')}
                        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '10px 16px', color: '#fff', fontWeight: 500 }}>
                          {user.name || 'Unnamed'}
                        </td>
                        <td style={{ padding: '10px 16px', color: '#9ca3af' }}>{user.email}</td>
                        <td style={{ padding: '10px 16px' }}>{tierBadge(user.tier || 'free')}</td>
                        <td style={{ padding: '10px 16px', color: '#6b7280' }}>
                          {user.created_at ? formatDate(user.created_at) : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', color: '#6b7280' }}>
                          {user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : 'Never'}
                        </td>
                        <td style={{ padding: '10px 16px' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <select
                              value={user.tier || 'free'}
                              onChange={e => changeTier(user.id, e.target.value)}
                              disabled={actionLoading === user.id}
                              style={{
                                background: '#1a1a35', border: '1px solid #1f1f3a', borderRadius: 6,
                                padding: '4px 8px', fontSize: 10, color: '#9ca3af', cursor: 'pointer',
                              }}
                            >
                              {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr style={{ borderBottom: '1px solid #1f1f3a', background: '#0a0a1a' }}>
                          <td colSpan={6} style={{ padding: '16px 24px' }}>
                            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
                              <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 10, padding: '12px 16px', minWidth: 120 }}>
                                <div style={{ fontSize: 10, color: '#6b7280' }}>User ID</div>
                                <div style={{ fontSize: 11, color: '#fff', fontFamily: 'monospace', marginTop: 4 }}>{user.id}</div>
                              </div>
                              <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 10, padding: '12px 16px', minWidth: 120 }}>
                                <div style={{ fontSize: 10, color: '#6b7280' }}>Token Usage</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: '#a855f7', marginTop: 4 }}>{user.token_usage?.toLocaleString() || '0'}</div>
                              </div>
                              <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 10, padding: '12px 16px', minWidth: 120 }}>
                                <div style={{ fontSize: 10, color: '#6b7280' }}>Memories</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa', marginTop: 4 }}>{user.memory_count || 0}</div>
                              </div>
                              <div style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 10, padding: '12px 16px', minWidth: 120 }}>
                                <div style={{ fontSize: 10, color: '#6b7280' }}>API Keys</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: '#fbbf24', marginTop: 4 }}>{user.api_key_count || 0}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                onClick={() => resetUsage(user.id)}
                                disabled={actionLoading === user.id}
                                style={{
                                  background: 'none', border: '1px solid #1f1f3a', borderRadius: 6,
                                  padding: '6px 12px', fontSize: 11, color: '#fb923c', cursor: 'pointer',
                                  opacity: actionLoading === user.id ? 0.5 : 1,
                                }}
                              >
                                Reset Usage
                              </button>
                              <button
                                onClick={() => toggleDisable(user.id, user.tier)}
                                disabled={actionLoading === user.id}
                                style={{
                                  background: 'none', border: '1px solid #1f1f3a', borderRadius: 6,
                                  padding: '6px 12px', fontSize: 11,
                                  color: user.tier === 'disabled' ? '#4ade80' : '#f87171',
                                  cursor: 'pointer',
                                  opacity: actionLoading === user.id ? 0.5 : 1,
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
