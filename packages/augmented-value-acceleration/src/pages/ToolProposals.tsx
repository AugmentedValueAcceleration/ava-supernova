import { useEffect, useState, Fragment } from 'react';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { theme, pageStyle, inputStyle as themeInputStyle, cardStyle, statCardStyle, chipStyle, emptyStateStyle } from '../lib/theme';

interface ToolProposal {
  id: string;
  title: string;
  description: string;
  votes: number;
  status: 'pending' | 'approved' | 'rejected' | 'shipped';
  submitted_by: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: theme.yellowBg, text: theme.yellow, label: 'Pending' },
  approved: { bg: theme.blueBg, text: theme.blue, label: 'Approved' },
  rejected: { bg: theme.redBg, text: theme.red, label: 'Rejected' },
  shipped: { bg: theme.greenBg, text: theme.green, label: 'Shipped' },
};

const STATUSES = ['pending', 'approved', 'rejected', 'shipped'] as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ToolProposals() {
  const [proposals, setProposals] = useState<ToolProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tableExists, setTableExists] = useState(true);

  const fetchProposals = async () => {
    setLoading(true);
    try {
      let query = supabase.from('tool_proposals').select('*').order('votes', { ascending: false });
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      const { data, error } = await query;
      if (error && error.message?.includes('does not exist')) {
        setTableExists(false);
        setProposals([]);
      } else {
        setProposals(data || []);
      }
    } catch {
      setTableExists(false);
    }
    setLoading(false);
  };

  useEffect(() => { fetchProposals(); }, [statusFilter]);

  async function updateStatus(id: string, newStatus: string) {
    setActionLoading(id);
    try {
      await supabase.from('tool_proposals').update({ status: newStatus }).eq('id', id);
      await fetchProposals();
    } finally {
      setActionLoading(null);
    }
  }

  const stats = {
    total: proposals.length,
    pending: proposals.filter(p => p.status === 'pending').length,
    approved: proposals.filter(p => p.status === 'approved').length,
    shipped: proposals.filter(p => p.status === 'shipped').length,
  };

  if (!tableExists) {
    return (
      <div style={pageStyle}>
        <PageHeader title="Tool Proposals" subtitle="Community-submitted tool proposals for Ava." />
        <div style={{ ...cardStyle, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128736;</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: theme.textSecondary, marginBottom: 8 }}>Table Not Found</div>
          <div style={{ fontSize: 13, color: theme.textMuted, maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
            The <code style={{ background: theme.inputBg, padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>tool_proposals</code> table
            does not exist yet. Create it in Supabase to enable community tool proposals.
          </div>
          <div style={{ marginTop: 20 }}>
            <code style={{
              display: 'block', textAlign: 'left', background: theme.surfaceBg, border: `1px solid ${theme.border}`,
              borderRadius: 8, padding: 16, fontSize: 11, color: theme.textSecondary, fontFamily: 'monospace',
              whiteSpace: 'pre', maxWidth: 500, margin: '0 auto', overflow: 'auto',
            }}>
{`CREATE TABLE tool_proposals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  votes INT DEFAULT 0,
  status TEXT DEFAULT 'pending',
  submitted_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);`}
            </code>
          </div>
        </div>
      </div>
    );
  }

  const actionBtnStyle = (color: string): React.CSSProperties => ({
    background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6,
    padding: '6px 12px', fontSize: 11, color, cursor: 'pointer',
  });

  return (
    <div style={pageStyle}>
      <PageHeader title="Tool Proposals" subtitle="Community-submitted tool proposals for Ava." onRefresh={fetchProposals} />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Proposals', value: stats.total, color: theme.text },
          { label: 'Pending Review', value: stats.pending, color: theme.yellow },
          { label: 'Approved', value: stats.approved, color: theme.blue },
          { label: 'Shipped', value: stats.shipped, color: theme.green },
        ].map(s => (
          <div key={s.label} style={statCardStyle}>
            <div style={{ fontSize: 11, fontWeight: 500, color: theme.textMuted }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, marginTop: 4 }}>{loading ? '...' : s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <select
          style={{ ...themeInputStyle, width: 'auto', minWidth: 160 }}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_STYLES[s].label}</option>)}
        </select>
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: theme.textMuted, padding: 60 }}>Loading proposals...</div>}

      {/* List */}
      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {proposals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: theme.textMuted }}>
              No tool proposals found.
            </div>
          ) : (
            proposals.map(proposal => {
              const ss = STATUS_STYLES[proposal.status] || STATUS_STYLES.pending;
              const isExpanded = expandedId === proposal.id;

              return (
                <Fragment key={proposal.id}>
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : proposal.id)}
                    style={{
                      ...cardStyle,
                      borderRadius: isExpanded ? '12px 12px 0 0' : 12,
                      padding: '14px 20px', cursor: 'pointer',
                    }}
                    onMouseOver={e => (e.currentTarget.style.borderColor = theme.accentBgStrong)}
                    onMouseOut={e => (e.currentTarget.style.borderColor = theme.border)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        minWidth: 40, padding: '4px 0',
                      }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: theme.accent }}>{proposal.votes}</span>
                        <span style={{ fontSize: 9, color: theme.textMuted }}>votes</span>
                      </div>
                      <span style={chipStyle(ss.bg, ss.text)}>{ss.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 500, color: theme.text, flex: 1 }}>{proposal.title}</span>
                      {proposal.submitted_by && (
                        <span style={{ fontSize: 11, color: theme.textMuted }}>by {proposal.submitted_by}</span>
                      )}
                      <span style={{ fontSize: 11, color: theme.textMuted }}>{formatDate(proposal.created_at)}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{
                      background: theme.surfaceBg, border: `1px solid ${theme.border}`, borderTop: 'none',
                      borderRadius: '0 0 12px 12px', padding: '16px 20px',
                    }}>
                      <p style={{ fontSize: 13, color: theme.textSecondary, margin: '0 0 16px 0', lineHeight: 1.6 }}>
                        {proposal.description}
                      </p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {proposal.status !== 'approved' && (
                          <button onClick={(e) => { e.stopPropagation(); updateStatus(proposal.id, 'approved'); }} disabled={actionLoading === proposal.id} style={{ ...actionBtnStyle(theme.blue), opacity: actionLoading === proposal.id ? 0.5 : 1 }}>
                            Approve
                          </button>
                        )}
                        {proposal.status !== 'rejected' && (
                          <button onClick={(e) => { e.stopPropagation(); updateStatus(proposal.id, 'rejected'); }} disabled={actionLoading === proposal.id} style={{ ...actionBtnStyle(theme.red), opacity: actionLoading === proposal.id ? 0.5 : 1 }}>
                            Reject
                          </button>
                        )}
                        {proposal.status !== 'shipped' && (
                          <button onClick={(e) => { e.stopPropagation(); updateStatus(proposal.id, 'shipped'); }} disabled={actionLoading === proposal.id} style={{ ...actionBtnStyle(theme.green), opacity: actionLoading === proposal.id ? 0.5 : 1 }}>
                            Mark Shipped
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
