// Security lens — classify which audited calls actually "left the sandbox",
// i.e. the ones a security-minded user cares to review. Derived entirely from
// data already in the log (category, risk, paths) — no new capture. Surfaced
// as a filter + row badges in the audit view.
//
// Four concerns:
//   network          — the call reached the network (web category tools)
//   out-of-workspace — a file write whose path is outside the current project
//   secret-access    — a call touching a credential/secret-looking path
//   dangerous        — the tool's own risk tier is 'dangerous'
//
// Runs host-side (extension host / IDE sidecar), where the workspace root is
// known, and annotates each entry before it's sent to the webview.

import type { AuditEntry, SecurityConcern } from './types.js';

export type { SecurityConcern };

// Credential / secret-looking path segments. Deliberately broad — a false
// positive just surfaces a row for a second look, which is the point.
const SECRET_RE = /(^|[\\/.])(\.env|secret|credential|id_rsa|id_ed25519|\.pem|\.key|\.ssh|\.aws|\.npmrc|\.pgpass|\.git-credentials|\.netrc|token)([\\/._-]|$)/i;

/** Best-effort path for an entry: the mutation path for writes, else a path
 *  field from the structured args (file reads etc.). */
function entryPath(e: AuditEntry): string | undefined {
  if (e.fileMutation?.path) return e.fileMutation.path;
  const fa = (e.fullArgs ?? {}) as Record<string, unknown>;
  const cand = fa.path ?? fa.file_path ?? fa.filePath ?? fa.file ?? fa.target;
  return typeof cand === 'string' ? cand : undefined;
}

function norm(p: string): string { return p.replace(/\\/g, '/').toLowerCase(); }

function isInside(path: string, root: string): boolean {
  const p = norm(path);
  const r = norm(root).replace(/\/+$/, '');
  if (!r) return true; // no known root → don't flag
  return p === r || p.startsWith(r + '/');
}

/** Which security concerns apply to this entry (empty = nothing notable). */
export function classifySecurity(e: AuditEntry, workspaceRoot?: string): SecurityConcern[] {
  const out: SecurityConcern[] = [];
  if (e.riskLevel === 'dangerous') out.push('dangerous');
  if (e.category === 'web') out.push('network');
  const path = entryPath(e);
  if (path && SECRET_RE.test(path)) out.push('secret-access');
  if (e.fileMutation?.path && workspaceRoot && !isInside(e.fileMutation.path, workspaceRoot)) out.push('out-of-workspace');
  return out;
}

/** Return a NEW array with `security` set on every entry that has ≥1 concern.
 *  Entries with no concern pass through untouched. */
export function annotateSecurity(entries: AuditEntry[], workspaceRoot?: string): AuditEntry[] {
  return entries.map(e => {
    const s = classifySecurity(e, workspaceRoot);
    return s.length ? { ...e, security: s } : e;
  });
}
