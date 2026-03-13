import { useState } from 'react';
import { post } from '../App';
import type { AdminToolProposal } from '../types/messages';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-300',
  approved: 'bg-blue-500/15 text-blue-300',
  rejected: 'bg-red-500/15 text-red-300',
  implemented: 'bg-emerald-500/15 text-emerald-300',
};

const RISK_COLORS: Record<string, string> = {
  safe: 'text-emerald-400',
  write: 'text-amber-400',
  dangerous: 'text-red-400',
};

interface AdminProposalsProps {
  proposals: AdminToolProposal[];
  total: number;
  loading: boolean;
}

export function AdminProposals({ proposals, total, loading }: AdminProposalsProps) {
  const [filter, setFilter] = useState<string>('all');
  const [selected, setSelected] = useState<AdminToolProposal | null>(null);
  const [notes, setNotes] = useState('');
  const [rewardAmount, setRewardAmount] = useState(50000);

  function loadFiltered(status: string) {
    setFilter(status);
    post({ type: 'load_admin_proposals', status: status === 'all' ? undefined : status });
  }

  function updateProposal(id: string, status: string, reward?: number) {
    post({
      type: 'admin_update_proposal',
      id,
      status,
      reviewer_notes: notes || undefined,
      reward_tokens: reward,
    });
    setSelected(null);
    setNotes('');
    setTimeout(() => post({ type: 'load_admin_proposals', status: filter === 'all' ? undefined : filter }), 500);
  }

  // Detail view
  if (selected) {
    return (
      <div>
        <button
          onClick={() => { setSelected(null); setNotes(''); }}
          className="mb-4 flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-white"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="mb-4">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-base font-bold">{selected.tool_name}</h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[selected.status]}`}>
              {selected.status}
            </span>
            <span className={`text-[10px] font-medium ${RISK_COLORS[selected.risk_level]}`}>
              {selected.risk_level}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
            <span>{selected.user_name || selected.user_email}</span>
            <span>{selected.vote_count} {selected.vote_count === 1 ? 'vote' : 'votes'}</span>
            <span>{new Date(selected.created_at).toLocaleDateString()}</span>
            {selected.reward_granted && (
              <span className="text-emerald-400">+{selected.reward_tokens.toLocaleString()} tokens</span>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="mb-3 rounded-lg bg-[var(--bg-card)] p-3">
          <p className="mb-1 text-[10px] font-semibold text-[var(--text-muted)]">Description</p>
          <p className="text-xs text-[var(--text-secondary)]">{selected.description}</p>
        </div>

        {/* Justification */}
        <div className="mb-3 rounded-lg bg-[var(--bg-card)] p-3">
          <p className="mb-1 text-[10px] font-semibold text-[var(--text-muted)]">Justification</p>
          <p className="whitespace-pre-wrap text-xs text-[var(--text-secondary)]">{selected.justification}</p>
        </div>

        {/* Task context */}
        {selected.task_context && (
          <div className="mb-3 rounded-lg bg-[var(--bg-card)] p-3">
            <p className="mb-1 text-[10px] font-semibold text-[var(--text-muted)]">Task Context</p>
            <p className="text-xs text-[var(--text-muted)]">{selected.task_context}</p>
          </div>
        )}

        {/* Schema */}
        <div className="mb-4 rounded-lg bg-[var(--bg-card)] p-3">
          <p className="mb-1 text-[10px] font-semibold text-[var(--text-muted)]">Proposed Schema</p>
          <pre className="overflow-auto text-[10px] text-[var(--text-secondary)]">
            {JSON.stringify(selected.proposed_schema, null, 2)}
          </pre>
        </div>

        {/* Actions */}
        {(selected.status === 'pending' || selected.status === 'approved') && (
          <div className="rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reviewer notes..."
              className="mb-3 w-full rounded border border-[var(--border-input)] bg-[var(--bg-input)] p-2 text-xs text-white placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
              rows={2}
            />

            <div className="flex flex-wrap items-center gap-2">
              {selected.status === 'pending' && (
                <>
                  <button
                    onClick={() => updateProposal(selected.id, 'approved')}
                    className="rounded bg-blue-600 px-3 py-1.5 text-[10px] font-medium text-white hover:bg-blue-500"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => updateProposal(selected.id, 'rejected')}
                    className="rounded bg-red-600/20 px-3 py-1.5 text-[10px] font-medium text-red-300 hover:bg-red-600/30"
                  >
                    Reject
                  </button>
                </>
              )}
              {selected.status === 'approved' && (
                <button
                  onClick={() => updateProposal(selected.id, 'implemented')}
                  className="rounded bg-emerald-600 px-3 py-1.5 text-[10px] font-medium text-white hover:bg-emerald-500"
                >
                  Implemented
                </button>
              )}

              {!selected.reward_granted && (
                <>
                  <div className="h-4 w-px bg-[var(--border-card)]" />
                  <input
                    type="number"
                    value={rewardAmount}
                    onChange={(e) => setRewardAmount(Number(e.target.value))}
                    className="w-20 rounded border border-[var(--border-input)] bg-[var(--bg-input)] px-2 py-1 text-[10px] text-white outline-none"
                    min={0}
                    step={10000}
                  />
                  <button
                    onClick={() => updateProposal(selected.id, selected.status, rewardAmount)}
                    className="rounded bg-[var(--accent)] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[var(--accent-hover)]"
                  >
                    Reward
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">Tool Proposals</h2>
          <p className="text-xs text-[var(--text-muted)]">{total} proposals</p>
        </div>
        <button
          onClick={() => loadFiltered(filter)}
          className="rounded bg-[var(--bg-input)] px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-white"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-1">
        {['all', 'pending', 'approved', 'rejected', 'implemented'].map((s) => (
          <button
            key={s}
            onClick={() => loadFiltered(s)}
            className={`rounded px-2.5 py-1 text-[10px] font-medium transition ${
              filter === s
                ? 'bg-[var(--bg-input)] text-white'
                : 'text-[var(--text-muted)] hover:text-white'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-card)] border-t-[var(--accent)]" />
        </div>
      )}

      {!loading && proposals.length === 0 && (
        <p className="py-8 text-center text-xs text-[var(--text-muted)]">No proposals yet</p>
      )}

      {!loading && proposals.length > 0 && (
        <div className="space-y-2">
          {proposals.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-3 text-left transition hover:border-[var(--accent)]/30"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium">{p.tool_name}</span>
                  <span className={`text-[10px] font-medium ${RISK_COLORS[p.risk_level]}`}>{p.risk_level}</span>
                </div>
                <div className="flex items-center gap-2">
                  {p.vote_count > 1 && (
                    <span className="text-[10px] text-[var(--gradient-start)]">{p.vote_count} votes</span>
                  )}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[p.status]}`}>
                    {p.status}
                  </span>
                </div>
              </div>
              <p className="mt-1 line-clamp-1 text-[10px] text-[var(--text-muted)]">{p.description}</p>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                <span>{p.user_name || p.user_email.split('@')[0]}</span>
                <span>{new Date(p.created_at).toLocaleDateString()}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
