// Pure audit summary — aggregates a set of entries into totals + per-tool /
// per-approval breakdowns. No fs, no Node deps, so it's safe to import from a
// webview (the IDE renderer builds exports locally). Lives apart from
// logger.ts (which is Node-only) precisely so export.ts stays webview-safe.

import type { AuditEntry } from './types.js';

export interface AuditSummary {
  total: number;
  totalFailed: number;
  totalCredits: number;
  totalUsd: number;
  topByCost: { toolName: string; count: number; failed: number; credits: number; usd: number }[];
  perApproval: { approval: string; count: number; failed: number; failRate: number }[];
}

export function summarise(entries: AuditEntry[]): AuditSummary {
  const byTool = new Map<string, { count: number; failed: number; credits: number; usd: number }>();
  const byApproval = new Map<string, { count: number; failed: number }>();
  let totalCredits = 0;
  let totalUsd = 0;
  let totalFailed = 0;

  for (const e of entries) {
    const tool = byTool.get(e.toolName) ?? { count: 0, failed: 0, credits: 0, usd: 0 };
    tool.count++;
    if (e.status === 'failed' || e.status === 'denied') { tool.failed++; totalFailed++; }
    if (e.cost?.credits) { tool.credits += e.cost.credits; totalCredits += e.cost.credits; }
    if (e.cost?.usd)     { tool.usd     += e.cost.usd;     totalUsd     += e.cost.usd; }
    byTool.set(e.toolName, tool);

    const ap = byApproval.get(e.approvalMethod) ?? { count: 0, failed: 0 };
    ap.count++;
    if (e.status === 'failed' || e.status === 'denied') ap.failed++;
    byApproval.set(e.approvalMethod, ap);
  }

  const topByCost = [...byTool.entries()]
    .map(([name, s]) => ({ toolName: name, ...s }))
    .sort((a, b) => (b.credits + b.usd * 1000) - (a.credits + a.usd * 1000))
    .slice(0, 10);

  return {
    total: entries.length,
    totalFailed,
    totalCredits,
    totalUsd,
    topByCost,
    perApproval: [...byApproval.entries()].map(([approval, s]) => ({
      approval,
      count: s.count,
      failed: s.failed,
      failRate: s.count > 0 ? s.failed / s.count : 0,
    })),
  };
}
