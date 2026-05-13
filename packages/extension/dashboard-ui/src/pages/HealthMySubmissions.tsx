import { useState } from 'react';
import type { HealthMySubmissions, HealthSubmissionStatus } from '../types/messages';

/**
 * "My submissions" view inside the Health page — the submitter-facing
 * companion to the hub's moderation queue.
 *
 * Each row shows current status (pending / rejected / published) with
 * the operator's review note when rejected (so the submitter knows
 * what to fix on resubmit). Published rows linger for 30 days then
 * drop off the list — they're already in the public catalog and the
 * submitter can find them under Exercises / Recipes from there.
 *
 * Rejected rows stay as a record until the submitter clicks "Clear
 * rejected" — bulk delete with confirmation. Pending and published
 * rows are never affected by Clear.
 */

interface Props {
  data: HealthMySubmissions;
  onRefresh: () => void;
  onContribute: () => void;
  onClearRejected: () => void;
  clearing: boolean;
}

export function HealthMySubmissions({ data, onRefresh, onContribute, onClearRejected, clearing }: Props) {
  const total = data.exercises.length + data.recipes.length;
  const rejectedCount =
    data.exercises.filter(e => e.status === 'rejected').length +
    data.recipes.filter(r => r.status === 'rejected').length;
  const [confirming, setConfirming] = useState(false);

  if (total === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-[13px] text-vscode-descriptionForeground mb-4">
          You haven't submitted anything yet.
        </p>
        <button
          onClick={onContribute}
          className="rounded-md border border-[var(--accent)] bg-[var(--accent)]/15 px-4 py-2 text-[12px] text-[var(--accent)] hover:bg-[var(--accent)]/25 transition cursor-pointer"
        >
          Contribute now
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-vscode-descriptionForeground">
          Pending and recently reviewed contributions. Approved rows stay listed for 30 days, then move into the public catalog.
        </p>
        <div className="flex items-center gap-3 shrink-0">
          {rejectedCount > 0 && (
            <button
              onClick={() => setConfirming(true)}
              disabled={clearing}
              className="text-[11px] text-red-300/90 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-transparent border-none p-0"
            >
              {clearing ? 'Clearing…' : `Clear rejected (${rejectedCount})`}
            </button>
          )}
          <button onClick={onRefresh} className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer">
            Refresh
          </button>
        </div>
      </div>

      {confirming && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-3 flex items-center justify-between gap-3">
          <span className="text-[12px] text-red-300/90 leading-relaxed">
            Permanently delete {rejectedCount} rejected {rejectedCount === 1 ? 'submission' : 'submissions'}? This can't be undone.
          </span>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setConfirming(false)}
              className="rounded-md border border-[rgba(168,85,247,0.18)] bg-transparent px-3 py-1 text-[11px] text-vscode-descriptionForeground hover:text-vscode-foreground transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => { setConfirming(false); onClearRejected(); }}
              className="rounded-md border border-red-400/50 bg-red-500/15 px-3 py-1 text-[11px] text-red-300/90 hover:bg-red-500/25 transition cursor-pointer"
            >
              Clear them
            </button>
          </div>
        </div>
      )}

      {data.exercises.length > 0 && (
        <section>
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-vscode-descriptionForeground mb-2">Exercises ({data.exercises.length})</h3>
          <ul className="space-y-2">
            {data.exercises.map(ex => (
              <SubmissionCard
                key={ex.id}
                name={ex.name}
                meta={`${ex.workout_type} · ${ex.exercise_type}`}
                status={ex.status}
                submittedAt={ex.submitted_at}
                reviewedAt={ex.reviewed_at}
                reviewNotes={ex.review_notes}
              />
            ))}
          </ul>
        </section>
      )}

      {data.recipes.length > 0 && (
        <section>
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-vscode-descriptionForeground mb-2">Recipes ({data.recipes.length})</h3>
          <ul className="space-y-2">
            {data.recipes.map(r => (
              <SubmissionCard
                key={r.id}
                name={r.name}
                meta={r.course ?? '—'}
                status={r.status}
                submittedAt={r.submitted_at}
                reviewedAt={r.reviewed_at}
                reviewNotes={r.review_notes}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SubmissionCard({
  name, meta, status, submittedAt, reviewedAt, reviewNotes,
}: {
  name: string; meta: string; status: HealthSubmissionStatus;
  submittedAt: string | null; reviewedAt: string | null; reviewNotes: string | null;
}) {
  return (
    <li className="rounded-lg border border-vscode-panelBorder bg-vscode-editor-background p-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <div className="text-[14px] text-vscode-foreground leading-snug">{name}</div>
          <div className="text-[10px] text-vscode-descriptionForeground capitalize mt-0.5">{meta}</div>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="text-[10px] text-vscode-descriptionForeground mt-2">
        Submitted {submittedAt ? new Date(submittedAt).toLocaleString() : '—'}
        {reviewedAt && (
          <> · Reviewed {new Date(reviewedAt).toLocaleString()}</>
        )}
      </div>
      {status === 'rejected' && reviewNotes && (
        <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] text-red-300/90 leading-relaxed">
          <strong className="font-medium">Reviewer feedback:</strong> {reviewNotes}
        </div>
      )}
      {status === 'published' && reviewNotes && (
        <div className="mt-3 rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-[12px] text-green-300/90 leading-relaxed">
          <strong className="font-medium">Reviewer note:</strong> {reviewNotes}
        </div>
      )}
    </li>
  );
}

function StatusBadge({ status }: { status: HealthSubmissionStatus }) {
  const label = status === 'pending' ? 'Pending review' : status === 'rejected' ? 'Rejected' : 'Published';
  const colour =
    status === 'pending' ? { bg: 'rgba(249,226,175,0.12)', fg: '#f9e2af' } :
    status === 'rejected' ? { bg: 'rgba(243,139,168,0.12)', fg: '#f38ba8' } :
    { bg: 'rgba(166,227,161,0.12)', fg: '#a6e3a1' };
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider"
      style={{ background: colour.bg, color: colour.fg }}
    >
      {label}
    </span>
  );
}
