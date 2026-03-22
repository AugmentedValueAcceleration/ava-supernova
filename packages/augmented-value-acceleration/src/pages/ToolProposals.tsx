import { useEffect, useState, Fragment } from 'react';
import { supabase } from '../lib/supabase';

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
  pending: { bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24', label: 'Pending' },
  approved: { bg: 'rgba(59, 130, 246, 0.12)', text: '#60a5fa', label: 'Approved' },
  rejected: { bg: 'rgba(239, 68, 68, 0.12)', text: '#f87171', label: 'Rejected' },
  shipped: { bg: 'rgba(34, 197, 94, 0.12)', text: '#4ade80', label: 'Shipped' },
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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: '#1a1a35', border: '1px solid #1f1f3a',
    borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };

  if (!tableExists) {
    return (
      <div style={{ padding: '32px 40px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Tool Proposals</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 32 }}>
          Community-submitted tool proposals for Ava.
        </p>
        <div style={{
          background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 40,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128736;</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>Table Not Found</div>
          <div style={{ fontSize: 13, color: '#6b7280', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
            The <code style={{ background: '#1a1a35', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>tool_proposals</code> table
            does not exist yet. Create it in Supabase to enable community tool proposals.
          </div>
          <div style={{ marginTop: 20 }}>
            <code style={{
              display: 'block', textAlign: 'left', background: '#0a0a1a', border: '1px solid #1f1f3a',
              borderRadius: 8, padding: 16, fontSize: 11, color: '#9ca3af', fontFamily: 'monospace',
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

  return (
    <div style={{ padding: '32px 40px', overflowY: 'auto', height: '100%', background: '#0a0a1a' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Tool Proposals</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 24 }}>
        Community-submitted tool proposals for Ava.
      </p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Proposals', value: stats.total, color: '#fff' },
          { label: 'Pending Review', value: stats.pending, color: '#fbbf24' },
          { label: 'Approved', value: stats.approved, color: '#60a5fa' },
          { label: 'Shipped', value: stats.shipped, color: '#4ade80' },
        ].map(s => (
          <div key={s.label} style={{ background: '#111127', border: '1px solid #1f1f3a', borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280' }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, marginTop: 4 }}>{loading ? '...' : s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <select
          style={{ ...inputStyle, width: 'auto', minWidth: 160 }}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_STYLES[s].label}</option>)}
        </select>
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading proposals...</div>}

      {/* List */}
      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {proposals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
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
                      background: '#111127', border: '1px solid #1f1f3a',
                      borderRadius: isExpanded ? '14px 14px 0 0' : 14,
                      padding: '14px 20px', cursor: 'pointer',
                    }}
                    onMouseOver={e => (e.currentTarget.style.borderColor = '#2f2f4a')}
                    onMouseOut={e => (e.currentTarget.style.borderColor = '#1f1f3a')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Votes */}
                      <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        minWidth: 40, padding: '4px 0',
                      }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: '#a855f7' }}>{proposal.votes}</span>
                        <span style={{ fontSize: 9, color: '#6b7280' }}>votes</span>
                      </div>

                      <span style={{
                        background: ss.bg, color: ss.text, fontSize: 10, fontWeight: 700,
                        padding: '3px 10px', borderRadius: 10,
                      }}>
                        {ss.label}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#fff', flex: 1 }}>{proposal.title}</span>
                      {proposal.submitted_by && (
                        <span style={{ fontSize: 11, color: '#6b7280' }}>by {proposal.submitted_by}</span>
                      )}
                      <span style={{ fontSize: 11, color: '#4b5563' }}>{formatDate(proposal.created_at)}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{
                      background: '#0d0d22', border: '1px solid #1f1f3a', borderTop: 'none',
                      borderRadius: '0 0 14px 14px', padding: '16px 20px',
                    }}>
                      <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 16px 0', lineHeight: 1.6 }}>
                        {proposal.description}
                      </p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {proposal.status !== 'approved' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); updateStatus(proposal.id, 'approved'); }}
                            disabled={actionLoading === proposal.id}
                            style={{
                              background: 'none', border: '1px solid #1f1f3a', borderRadius: 6,
                              padding: '6px 12px', fontSize: 11, color: '#60a5fa', cursor: 'pointer',
                              opacity: actionLoading === proposal.id ? 0.5 : 1,
                            }}
                          >
                            Approve
                          </button>
                        )}
                        {proposal.status !== 'rejected' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); updateStatus(proposal.id, 'rejected'); }}
                            disabled={actionLoading === proposal.id}
                            style={{
                              background: 'none', border: '1px solid #1f1f3a', borderRadius: 6,
                              padding: '6px 12px', fontSize: 11, color: '#f87171', cursor: 'pointer',
                              opacity: actionLoading === proposal.id ? 0.5 : 1,
                            }}
                          >
                            Reject
                          </button>
                        )}
                        {proposal.status !== 'shipped' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); updateStatus(proposal.id, 'shipped'); }}
                            disabled={actionLoading === proposal.id}
                            style={{
                              background: 'none', border: '1px solid #1f1f3a', borderRadius: 6,
                              padding: '6px 12px', fontSize: 11, color: '#4ade80', cursor: 'pointer',
                              opacity: actionLoading === proposal.id ? 0.5 : 1,
                            }}
                          >
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
