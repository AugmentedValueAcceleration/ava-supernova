import { useState } from 'react';

interface SecretGrantPromptProps {
  request: {
    grantId: string;
    label: string;
    reason?: string;
    candidates: Array<{ id: string; label: string; provider?: string; createdAt?: string }>;
  };
  /** Posts secret_grant_response back to the host. secretId='' = denial. */
  onRespond: (secretId: string, alwaysForProject: boolean) => void;
  /** Open the vault management page so the user can add a missing entry. */
  onOpenVault: () => void;
}

/**
 * Modal-style grant prompt rendered when Ava calls secret_request.
 *
 * Shows the requested label + reason and lists vault candidates that match.
 * The user picks one (or denies). Optionally checks "always grant for this
 * project" to auto-grant in future without prompting.
 */
export function SecretGrantPrompt({ request, onRespond, onOpenVault }: SecretGrantPromptProps) {
  const [selectedId, setSelectedId] = useState<string>(request.candidates[0]?.id ?? '');
  const [alwaysForProject, setAlwaysForProject] = useState(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Grant secret access"
      className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--border-card,rgba(168,85,247,0.2))] bg-[var(--bg-card,#1e1e2e)] shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-card,rgba(168,85,247,0.2))]">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--accent,#A855F7)]">
              <path d="M3 5.5v-3a2.5 2.5 0 0 1 5 0v3h.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 1 13V7a1.5 1.5 0 0 1 1.5-1.5H3zm1 0h3v-3a1.5 1.5 0 0 0-3 0v3z"/>
            </svg>
            <span className="text-sm font-bold text-white">Ava is requesting a secret</span>
          </div>
          <p className="mt-2 text-xs text-[var(--text-secondary,#cbd5e1)]">
            <span className="font-semibold">Label:</span> <span className="font-mono">{request.label}</span>
          </p>
          {request.reason && (
            <p className="mt-1 text-xs text-[var(--text-muted,#94a3b8)] italic">
              "{request.reason}"
            </p>
          )}
        </div>

        {/* Candidates */}
        <div className="px-5 py-4 max-h-64 overflow-y-auto">
          {request.candidates.length === 0 ? (
            <div className="text-xs text-[var(--text-muted,#94a3b8)] py-4 text-center">
              No matching entries in your vault.
              <br />
              <button
                onClick={onOpenVault}
                className="mt-2 text-[var(--accent,#A855F7)] underline hover:opacity-80 bg-transparent border-none cursor-pointer text-xs"
              >
                Open the vault to add one
              </button>
            </div>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted,#94a3b8)] mb-2">Choose vault entry</p>
              <div className="flex flex-col gap-1">
                {request.candidates.map((c) => (
                  <label
                    key={c.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition ${
                      selectedId === c.id
                        ? 'border-[var(--accent,#A855F7)] bg-[var(--accent,#A855F7)]/10'
                        : 'border-[var(--border-card,rgba(168,85,247,0.15))] hover:border-[var(--accent,#A855F7)]/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="secret-candidate"
                      value={c.id}
                      checked={selectedId === c.id}
                      onChange={() => setSelectedId(c.id)}
                      className="accent-[var(--accent,#A855F7)]"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate m-0">{c.label}</p>
                      {c.provider && (
                        <p className="text-[10px] text-[var(--text-muted,#94a3b8)] m-0 mt-0.5">{c.provider}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Always-grant + actions */}
        <div className="px-5 py-3 border-t border-[var(--border-card,rgba(168,85,247,0.2))] flex flex-col gap-3">
          {request.candidates.length > 0 && (
            <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary,#cbd5e1)] cursor-pointer">
              <input
                type="checkbox"
                checked={alwaysForProject}
                onChange={(e) => setAlwaysForProject(e.target.checked)}
                className="accent-[var(--accent,#A855F7)]"
              />
              Always grant this entry for the current project (skip future prompts)
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => onRespond('', false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary,#cbd5e1)] border border-[var(--border-card,rgba(168,85,247,0.2))] bg-transparent cursor-pointer hover:bg-white/[0.04] transition"
            >
              Deny
            </button>
            <button
              onClick={() => selectedId && onRespond(selectedId, alwaysForProject)}
              disabled={!selectedId}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[var(--accent,#A855F7)] border-none cursor-pointer hover:opacity-90 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Grant
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
