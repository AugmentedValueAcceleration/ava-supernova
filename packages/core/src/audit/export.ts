// Export — bundle the audit log + a plain-language methodology + a
// short README into a single artefact the user can hand to their
// compliance team or just keep for personal records. Two output
// formats:
//   - Markdown: human-readable, opens in any editor, good for a
//     quick "what did Ava do today" report
//   - JSON: structured, good for ingest into another tool / SIEM
//
// Returns string blobs so the caller (extension webview / IDE) can
// trigger a save dialog with the right filename + extension. We don't
// directly write to disk here so the same helper works in any host
// (browser-style download, Tauri save dialog, Node fs).

import type { AuditEntry } from './types.js';
import { formatCost } from './cost.js';
import { summarise } from './logger.js';

export interface ExportBundle {
  /** ISO timestamp when the export was generated. */
  generated_at: string;
  /** Format the caller asked for. */
  format: 'markdown' | 'json';
  /** Suggested filename (no path). */
  filename: string;
  /** Mimetype for the save dialog. */
  mimeType: string;
  /** The actual content as a string. */
  content: string;
}

/** Build an exportable bundle from a (filtered) entry list. The caller
 *  decides which entries to include; the export bundler just formats. */
export function buildExport(entries: AuditEntry[], format: 'markdown' | 'json' = 'markdown'): ExportBundle {
  const generated_at = new Date().toISOString();
  const datePart = generated_at.slice(0, 10);

  if (format === 'json') {
    return {
      generated_at,
      format: 'json',
      filename: `ava-audit-${datePart}.json`,
      mimeType: 'application/json',
      content: JSON.stringify({
        generated_at,
        entry_count: entries.length,
        summary: summarise(entries),
        entries,
      }, null, 2),
    };
  }

  // Markdown: human-readable receipt. Suitable for a compliance review
  // or sharing with a manager. Includes summary + full entry list.
  const summary = summarise(entries);
  const lines: string[] = [];
  lines.push(`# Ava Supernova — Audit Export`);
  lines.push('');
  lines.push(`**Generated:** ${generated_at}  `);
  lines.push(`**Entries:** ${summary.total} tool calls  `);
  lines.push(`**Failed:** ${summary.totalFailed}  `);
  if (summary.totalCredits > 0) lines.push(`**Total credits:** ${summary.totalCredits.toLocaleString()}  `);
  if (summary.totalUsd > 0)     lines.push(`**Total estimated USD:** $${summary.totalUsd.toFixed(4)}  `);
  lines.push('');
  lines.push('## Top tool calls by cost');
  lines.push('');
  if (summary.topByCost.length === 0) {
    lines.push('_No cost-attributable calls in this export._');
  } else {
    lines.push('| Tool | Calls | Failed | Credits | USD |');
    lines.push('|------|------:|------:|--------:|----:|');
    for (const t of summary.topByCost) {
      lines.push(`| ${t.toolName} | ${t.count} | ${t.failed} | ${t.credits.toLocaleString()} | ${t.usd > 0 ? '$' + t.usd.toFixed(4) : '—'} |`);
    }
  }
  lines.push('');
  lines.push('## Approval-method breakdown');
  lines.push('');
  lines.push('| Approval | Count | Failed | Fail rate |');
  lines.push('|----------|------:|------:|----------:|');
  for (const a of summary.perApproval) {
    lines.push(`| ${a.approval} | ${a.count} | ${a.failed} | ${(a.failRate * 100).toFixed(1)}% |`);
  }
  lines.push('');
  lines.push('## Full entry log (newest first)');
  lines.push('');
  for (const e of entries) {
    lines.push(`### ${new Date(e.timestamp).toLocaleString()} — ${e.toolName} (${e.status})`);
    lines.push('');
    lines.push(`- **Category:** ${e.category}`);
    lines.push(`- **Risk:** ${e.riskLevel}`);
    lines.push(`- **Approval:** ${e.approvalMethod}`);
    lines.push(`- **Args summary:** ${e.argsSummary}`);
    if (e.cost) lines.push(`- **Cost:** ${formatCost(e.cost)}`);
    if (e.result) {
      lines.push('');
      lines.push('**Result:**');
      lines.push('');
      lines.push('```');
      lines.push(e.result.slice(0, 2000));
      lines.push('```');
    }
    lines.push('');
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## About this report');
  lines.push('');
  lines.push('This is the complete audit log of every tool call Ava made on your machine within the selected filter. No personal data leaves your machine — this file is generated locally from `~/.ava/audit-log.jsonl` and shared only when you explicitly export it.');

  return {
    generated_at,
    format: 'markdown',
    filename: `ava-audit-${datePart}.md`,
    mimeType: 'text/markdown',
    content: lines.join('\n'),
  };
}
