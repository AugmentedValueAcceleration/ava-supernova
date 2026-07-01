// Pattern detection — proactive nudges surfaced in the audit panel
// based on the persistent log. Every check returns 0 or more findings;
// the UI lists them above the audit table so the user sees what's
// actionable without scrolling.
//
// Rules of thumb for adding new patterns:
//   - Must be actionable. "You used 47 tools today" is vanity. "You
//     auto-approve bash but 23% fail" tells the user to tighten a rule.
//   - Run on a slice (last 7 days by default), not the whole corpus —
//     a failure pattern from 6 months ago isn't useful now.
//   - Plain-language message, no jargon. Audience is anyone using Ava,
//     not infra engineers.

import type { AuditEntry } from './types.js';

/** Discriminator for the finding, so surfaces can localise the text
 *  from structured params instead of parsing the English string. */
export type FindingKind = 'auto-fail' | 'retry-loop' | 'dangerous-succeeded';

/** Structured values behind a finding — everything a localised template
 *  needs to render the message without re-deriving anything. */
export interface FindingParams {
  tool?: string;
  /** Auto-approve failure rate, whole percent. */
  pct?: number;
  failed?: number;
  total?: number;
  /** Retry-cluster size / dangerous-call count. */
  count?: number;
  /** ISO timestamp of a retry cluster's first call, for locale-aware time. */
  atISO?: string;
}

export interface Finding {
  /** Severity tier — drives chip colour in the UI. */
  severity: 'info' | 'warning' | 'critical';
  /** What kind of finding this is — the key surfaces localise from. */
  kind: FindingKind;
  /** Structured params for localised rendering (see FindingParams). */
  params: FindingParams;
  /** One-line, plain-language English. Fallback for non-localised
   *  consumers (CLI, export, the IDE which renders English directly). */
  message: string;
  /** Optional follow-up hint — what to do about it (English fallback). */
  suggestion?: string;
  /** Tool name(s) the finding relates to, for "show me these calls" filtering. */
  relatedTools?: string[];
}

export function detectPatterns(entries: AuditEntry[]): Finding[] {
  // Only look at the recent window — older patterns aren't actionable.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recent = entries.filter(e => e.timestamp >= sevenDaysAgo);
  if (recent.length === 0) return [];

  const findings: Finding[] = [];

  // ── Approval policy review ─────────────────────────────────────────
  // If the user auto-approves a tool but it fails > 20% of the time,
  // surface the friction so they can tighten the rule.
  const byTool = new Map<string, { count: number; failed: number; autoCount: number; autoFailed: number }>();
  for (const e of recent) {
    const t = byTool.get(e.toolName) ?? { count: 0, failed: 0, autoCount: 0, autoFailed: 0 };
    t.count++;
    const failed = e.status === 'failed' || e.status === 'denied';
    if (failed) t.failed++;
    if (e.approvalMethod === 'auto') {
      t.autoCount++;
      if (failed) t.autoFailed++;
    }
    byTool.set(e.toolName, t);
  }
  for (const [tool, s] of byTool) {
    if (s.autoCount >= 5 && s.autoFailed / s.autoCount > 0.2) {
      const pct = Math.round((s.autoFailed / s.autoCount) * 100);
      findings.push({
        severity: 'warning',
        kind: 'auto-fail',
        params: { tool, pct, failed: s.autoFailed, total: s.autoCount },
        message: `You auto-approve ${tool} but ${pct}% of those calls fail (${s.autoFailed} of ${s.autoCount} this week).`,
        suggestion: 'Consider tightening the approval rule to first-time, so failures get a second look.',
        relatedTools: [tool],
      });
    }
  }

  // ── Repeated retry pattern ─────────────────────────────────────────
  // Same tool called 3+ times within 60 seconds with the same args
  // hash usually means the model is stuck retrying a failing call.
  const RETRY_WINDOW_MS = 60_000;
  const sortedAsc = [...recent].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let consecutive: AuditEntry[] = [];
  const retryClusters: AuditEntry[][] = [];
  for (const e of sortedAsc) {
    if (consecutive.length === 0) { consecutive.push(e); continue; }
    const last = consecutive[consecutive.length - 1];
    const sameToolSameArgs = last.toolName === e.toolName && last.argsSummary === e.argsSummary;
    const recentEnough = Date.parse(e.timestamp) - Date.parse(last.timestamp) <= RETRY_WINDOW_MS;
    if (sameToolSameArgs && recentEnough) {
      consecutive.push(e);
    } else {
      if (consecutive.length >= 3) retryClusters.push(consecutive);
      consecutive = [e];
    }
  }
  if (consecutive.length >= 3) retryClusters.push(consecutive);
  for (const cluster of retryClusters.slice(0, 3)) {
    const tool = cluster[0].toolName;
    findings.push({
      severity: 'info',
      kind: 'retry-loop',
      params: { tool, count: cluster.length, atISO: cluster[0].timestamp },
      message: `${tool} was called ${cluster.length} times in a row at ${new Date(cluster[0].timestamp).toLocaleTimeString()} — possible retry loop.`,
      suggestion: "Open the row to compare arguments. If they're identical, this is usually a provider hiccup or a stale cache.",
      relatedTools: [tool],
    });
  }

  // ── Dangerous-tool out-of-scope writes ─────────────────────────────
  // Any 'dangerous' risk-level tool that succeeded gets highlighted —
  // the user approved it but it's worth a second look in case it
  // touched something outside expected scope.
  const dangerousSucceeded = recent.filter(e => e.riskLevel === 'dangerous' && e.status === 'success');
  if (dangerousSucceeded.length > 0) {
    findings.push({
      severity: 'critical',
      kind: 'dangerous-succeeded',
      params: { count: dangerousSucceeded.length },
      message: `${dangerousSucceeded.length} dangerous tool call${dangerousSucceeded.length === 1 ? '' : 's'} succeeded this week.`,
      suggestion: 'Review these in the audit table to confirm they touched only what you expected.',
      relatedTools: [...new Set(dangerousSucceeded.map(e => e.toolName))],
    });
  }

  return findings;
}
