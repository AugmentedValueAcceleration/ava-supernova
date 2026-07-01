// Shared audit-finding shape + localiser. Findings are computed host-side by
// the one @ava/core/audit engine and sent to the webview; both the audit tab
// (History) and the Command Centre trust-nudge card localise them from
// `kind` + `params` so the copy honours the user's locale (the English
// message/suggestion the engine ships are the fallback).

import { t } from '../i18n';

export type AuditFindingKind = 'auto-fail' | 'retry-loop' | 'dangerous-succeeded';

export interface AuditFinding {
  severity: 'info' | 'warning' | 'critical';
  kind?: AuditFindingKind;
  params?: { tool?: string; pct?: number; failed?: number; total?: number; count?: number; atISO?: string };
  message: string;
  suggestion?: string;
  relatedTools?: string[];
}

/** Localise a host-computed finding from its structured kind/params. Falls
 *  back to the English message/suggestion for any kind we don't have a
 *  template for (forward-compatible with future engine checks). */
export function localizeFinding(f: AuditFinding): { message: string; suggestion?: string } {
  const p = f.params ?? {};
  switch (f.kind) {
    case 'auto-fail':
      return {
        message: t('dash.audit.finding_auto_fail', { tool: p.tool ?? '', pct: p.pct ?? 0, failed: p.failed ?? 0, total: p.total ?? 0 }),
        suggestion: t('dash.audit.finding_auto_fail_hint'),
      };
    case 'retry-loop': {
      const time = p.atISO ? new Date(p.atISO).toLocaleTimeString() : '';
      return {
        message: t('dash.audit.finding_retry', { tool: p.tool ?? '', count: p.count ?? 0, time }),
        suggestion: t('dash.audit.finding_retry_hint'),
      };
    }
    case 'dangerous-succeeded': {
      const n = p.count ?? 0;
      return {
        message: n === 1 ? t('dash.audit.finding_dangerous_one', { n }) : t('dash.audit.finding_dangerous_other', { n }),
        suggestion: t('dash.audit.finding_dangerous_hint'),
      };
    }
    default:
      return { message: f.message, suggestion: f.suggestion };
  }
}
