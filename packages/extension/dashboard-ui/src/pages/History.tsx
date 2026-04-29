import { useState, useMemo, useEffect } from 'react';
import { t, useLocale, getLocale } from '../i18n';
import { post } from '../App';
import { SectionGroup } from '../components/SectionGroup';
import { UsageBar } from '../components/UsageBar';
import type { AccountInfo, SessionStats, UsageHistoryData, ConversationEntry } from '../types/messages';

// ─── Model pricing (per 1M tokens) ──────────────────────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'qwen-turbo-latest': { input: 0.05, output: 0.40 },
  'qwen-plus-latest': { input: 0.20, output: 1.20 },
  'qwen3-235b-a22b': { input: 0.20, output: 1.20 },
  'qwq-plus': { input: 0.20, output: 1.20 },
  'qwen-max-latest': { input: 0.80, output: 3.20 },
};

const DEFAULT_PRICING = { input: 0.20, output: 1.20 };

function estimateCost(inputTokens: number, outputTokens: number, model: string): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '0';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(Math.round(v));
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  return `${hours}h ${remaining}m`;
}

function costColour(cost: number): string {
  if (cost < 0.10) return 'text-emerald-400';
  if (cost < 0.50) return 'text-yellow-400';
  if (cost < 1.00) return 'text-orange-400';
  return 'text-red-400';
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface AuditEntry {
  timestamp: string;
  toolName: string;
  category: string;
  riskLevel: string;
  approvalMethod: string;
  status: string;
  argsSummary: string;
  fullArgs?: Record<string, unknown>;
  result?: string;
  /** Cost record — present on entries written by the persistent
   *  logger, absent on legacy in-memory-only entries. */
  cost?: {
    mode: 'platform' | 'byok';
    credits?: number;
    usd?: number;
    tokens?: { input: number; output: number };
    provider?: string;
    model?: string;
  };
}

interface HistoryProps {
  sessionStats: SessionStats | null;
  usageHistory: UsageHistoryData | null;
  mode: 'platform' | 'byok';
  account: AccountInfo | null;
  auditLog?: AuditEntry[];
  /** Saved chat conversations from the host. Powers the Conversations
   *  tab — list, search, click-to-resume, delete. Mirrors IDE History
   *  page at DashboardPages.tsx:5807-6060. */
  conversations?: ConversationEntry[];
}

// ─── Main Component ──────────────────────────────────────────────────────────

// Tabs mirror the IDE History page at DashboardPages.tsx:5814-5818:
// Conversations / Usage / Audit. The Usage tab nests the existing Session
// + All-time views under a sub-toggle so we keep both views without
// drifting from the IDE's three-tab top-level shape.
type TopTab = 'conversations' | 'usage' | 'audit';
type UsageSubTab = 'session' | 'alltime';

export function History({ sessionStats, usageHistory, mode, account, auditLog, conversations }: HistoryProps) {
  useLocale();
  const [activeTab, setActiveTab] = useState<TopTab>(() => {
    const saved = localStorage.getItem('ava-analytics-tab');
    if (saved === 'conversations' || saved === 'usage' || saved === 'audit') return saved;
    return 'conversations';
  });
  const [usageSubTab, setUsageSubTab] = useState<UsageSubTab>(() => {
    const saved = localStorage.getItem('ava-analytics-usage-subtab');
    return (saved === 'alltime' && mode === 'platform') ? 'alltime' : 'session';
  });

  const handleTabChange = (tab: TopTab) => {
    setActiveTab(tab);
    localStorage.setItem('ava-analytics-tab', tab);
    if (tab === 'usage' && usageSubTab === 'alltime' && mode === 'platform') {
      post({ type: 'load_usage_history' });
    }
    if (tab === 'audit') {
      post({ type: 'request_audit_log' });
    }
    if (tab === 'conversations') {
      post({ type: 'load_conversations' });
    }
  };

  const handleUsageSubChange = (sub: UsageSubTab) => {
    setUsageSubTab(sub);
    localStorage.setItem('ava-analytics-usage-subtab', sub);
    if (sub === 'alltime' && mode === 'platform') {
      post({ type: 'load_usage_history' });
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">History</h1>
        <p className="mt-1.5 text-[13px] text-[#6c7086]">
          Conversations, credits, and tool-call audit
        </p>
      </div>

      {/* Top-level tabs — mirrors IDE History at DashboardPages.tsx:5814-5818 */}
      <div className="mb-6 flex gap-1 border-b border-[var(--border-card)]">
        {([
          { id: 'conversations', label: 'Conversations' },
          { id: 'usage',         label: 'Usage' },
          { id: 'audit',         label: 'Audit' },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-xs font-medium transition border-x-0 border-t-0 bg-transparent cursor-pointer ${
              activeTab === tab.id
                ? 'border-[var(--accent)] text-[var(--accent)] font-semibold'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'conversations' && (
        <ConversationsView conversations={conversations || []} />
      )}

      {activeTab === 'usage' && (
        <>
          {/* Usage sub-toggle — Session vs All-time. */}
          <div className="mb-4 flex gap-1 border-b border-[var(--border-card)]">
            {([
              { id: 'session', label: t('dash.usage.session') },
              { id: 'alltime', label: t('dash.usage.all_time') },
            ] as const).map(sub => (
              <button
                key={sub.id}
                onClick={() => handleUsageSubChange(sub.id)}
                className={`-mb-px border-b-2 px-3 py-1.5 text-[11px] font-medium transition border-x-0 border-t-0 bg-transparent cursor-pointer ${
                  usageSubTab === sub.id
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {sub.label}
              </button>
            ))}
          </div>
          {usageSubTab === 'session' ? (
            <SessionView stats={sessionStats} />
          ) : (
            <AllTimeView data={usageHistory} mode={mode} account={account} />
          )}
        </>
      )}

      {activeTab === 'audit' && (
        <AuditView entries={auditLog || []} />
      )}
    </div>
  );
}

// ─── Conversations View ─────────────────────────────────────────────────────

function ConversationsView({ conversations }: { conversations: ConversationEntry[] }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const sorted = [...conversations].sort((a, b) => {
      // Pinned first, then most-recently-updated.
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(c => (c.title || '').toLowerCase().includes(q));
  }, [conversations, search]);

  const loadConversation = (conv: ConversationEntry) => {
    post({ type: 'load_conversation', id: conv.id });
  };

  const deleteConversation = (id: string) => {
    post({ type: 'delete_conversation', id });
  };

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search conversations…"
        className="w-full max-w-sm rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
      />

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-card)] bg-[var(--bg-card)] p-12 text-center">
          <div className="mb-2 text-2xl opacity-30">💬</div>
          <p className="text-xs text-[var(--text-muted)]">
            {search ? 'No conversations match your search.' : 'No conversations yet. Start chatting with Ava!'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(conv => {
            const msgCount = conv.messages?.length || 0;
            const date = conv.updated_at ? new Date(conv.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            const time = conv.updated_at ? new Date(conv.updated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
            const preview = conv.messages?.find(m => m.role === 'assistant' || m.role === 'ava')?.content?.slice(0, 120) || '';
            return (
              <div
                key={conv.id}
                onClick={() => loadConversation(conv)}
                className="cursor-pointer rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] px-4 py-3 transition hover:border-[var(--accent)]/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {conv.pinned && <span className="text-[10px] text-[var(--accent)]" title="Pinned">📌</span>}
                      <span className="truncate text-sm font-semibold text-[#cdd6f4]">{conv.title || 'Untitled'}</span>
                    </div>
                    {preview && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-[var(--text-muted)]">{preview}</p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[#585b70]">
                      <span>{date} · {time}</span>
                      <span>·</span>
                      <span>{msgCount} {msgCount === 1 ? 'message' : 'messages'}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                    title="Delete"
                    className="shrink-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-[10px] text-[var(--text-muted)] transition hover:border-red-500/30 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Audit View ─────────────────────────────────────────────────────────────

const APPROVAL_COLORS: Record<string, string> = {
  'auto': 'bg-emerald-500/15 text-emerald-400',
  'first-time': 'bg-blue-500/15 text-blue-400',
  'user-approved': 'bg-yellow-500/15 text-yellow-400',
  'denied': 'bg-red-500/15 text-red-400',
};

const STATUS_COLORS: Record<string, string> = {
  'success': 'text-emerald-400',
  'failed': 'text-red-400',
  'denied': 'text-red-400',
};

const RISK_COLORS: Record<string, string> = {
  'safe': 'bg-emerald-500/15 text-emerald-400',
  'write': 'bg-yellow-500/15 text-yellow-400',
  'dangerous': 'bg-red-500/15 text-red-400',
};

const CATEGORY_LABELS: Record<string, string> = {
  file_ops: 'File Ops', shell: 'Shell', git: 'Git', web: 'Web',
  media: 'Media', database: 'Database', system: 'System',
  documents: 'Documents', memory: 'Memory', learning: 'Learning',
};

// Pattern finding shape — must match @ava/core/audit/patterns Finding.
// Imported here as a structural type so we don't need a full
// @ava/core/audit dependency in dashboard-ui at runtime.
interface AuditFinding {
  severity: 'info' | 'warning' | 'critical';
  message: string;
  suggestion?: string;
  relatedTools?: string[];
}

function formatAuditCost(cost: AuditEntry['cost']): string {
  if (!cost) return '—';
  if (cost.mode === 'platform' && cost.credits != null) return `${cost.credits} cr`;
  if (cost.mode === 'byok' && cost.usd != null)         return `$${cost.usd.toFixed(cost.usd >= 0.01 ? 4 : 6)}`;
  return '—';
}

const AUDIT_PAGE_SIZE = 25;

function AuditView({ entries }: { entries: AuditEntry[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Patterns are computed inline so the audit view can stay
  // self-contained — no extra round-trip to the host. Keep this
  // simple: only the three checks the core helper does, mirrored
  // here so the UI works even before the host upgrade rolls out.
  const findings: AuditFinding[] = useMemo(() => detectClientSidePatterns(entries), [entries]);

  // Apply filters in memory — corpus is already capped at 1000
  // entries by the host, so this is fast.
  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (search && !e.toolName.toLowerCase().includes(search.toLowerCase()) && !e.argsSummary.toLowerCase().includes(search.toLowerCase())) return false;
      if (riskFilter !== 'all' && e.riskLevel !== riskFilter) return false;
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      return true;
    });
  }, [entries, search, riskFilter, statusFilter]);

  // Pagination — audit logs grow fast (host caps at 1000); rendering
  // the full filtered list at once was janky. 25/page matches the IDE
  // audit view. Page resets to 0 whenever filters change so the user
  // isn't stranded on an empty page after narrowing the result set.
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [search, riskFilter, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / AUDIT_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * AUDIT_PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + AUDIT_PAGE_SIZE);

  // Cost totals — split across both billing modes so a user with
  // mixed-mode history sees both numbers honestly.
  const totals = useMemo(() => {
    let credits = 0, usd = 0;
    for (const e of filtered) {
      if (e.cost?.credits) credits += e.cost.credits;
      if (e.cost?.usd) usd += e.cost.usd;
    }
    return { credits, usd };
  }, [filtered]);

  const exportLog = (format: 'markdown' | 'json') => {
    post({ type: 'export_audit_log', format } as { type: 'export_audit_log'; format: 'markdown' | 'json' });
  };

  return (
    <div className="space-y-3">
      {/* Pattern findings — surfaced above the table because they're
          actionable nudges the user otherwise wouldn't think to look for. */}
      {findings.length > 0 && (
        <div className="space-y-2">
          {findings.map((f, i) => (
            <div
              key={i}
              className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
                f.severity === 'critical' ? 'border-red-500/40 bg-red-500/5 text-red-200'
                  : f.severity === 'warning' ? 'border-yellow-500/40 bg-yellow-500/5 text-yellow-100'
                  : 'border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-secondary)]'
              }`}
            >
              <div className="font-medium">{f.message}</div>
              {f.suggestion && <div className="mt-1 text-[10px] opacity-80">{f.suggestion}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Search + filter + export controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-2.5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by tool name or argument…"
          className="flex-1 min-w-[160px] rounded-md border border-[var(--border-card)] bg-[var(--bg-input)] px-2 py-1 text-[11px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
        />
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          className="rounded-md border border-[var(--border-card)] bg-[var(--bg-input)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none"
        >
          <option value="all">All risk</option>
          <option value="safe">Safe</option>
          <option value="write">Write</option>
          <option value="dangerous">Dangerous</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-[var(--border-card)] bg-[var(--bg-input)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none"
        >
          <option value="all">All status</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="denied">Denied</option>
        </select>
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => exportLog('markdown')}
            title="Export the filtered audit log as a Markdown report — auditable, human-readable, never leaves your machine."
            className="rounded-md border border-[var(--border-card)] bg-[var(--bg-input)] px-2.5 py-1 text-[11px] text-[var(--text-primary)] transition hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/30"
          >
            Export .md
          </button>
          <button
            onClick={() => exportLog('json')}
            title="Export the filtered audit log as JSON — for SIEM ingest or programmatic analysis."
            className="rounded-md border border-[var(--border-card)] bg-[var(--bg-input)] px-2.5 py-1 text-[11px] text-[var(--text-primary)] transition hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/30"
          >
            Export .json
          </button>
        </div>
      </div>

      {/* Cost totals strip — only shown when there's something to attribute. */}
      {(totals.credits > 0 || totals.usd > 0) && (
        <div className="flex gap-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] px-3 py-2 text-[11px]">
          {totals.credits > 0 && (
            <span><span className="text-[var(--text-muted)]">Credits:</span> <span className="font-semibold text-[var(--text-primary)]">{totals.credits.toLocaleString()}</span></span>
          )}
          {totals.usd > 0 && (
            <span><span className="text-[var(--text-muted)]">BYOK estimate:</span> <span className="font-semibold text-[var(--text-primary)]">${totals.usd.toFixed(4)}</span></span>
          )}
          <span className="ml-auto text-[var(--text-muted)]">{filtered.length} of {entries.length} entries shown</span>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center">
          <span className="block text-2xl opacity-30 mb-2">📋</span>
          <p className="text-xs text-[var(--text-muted)]">
            {entries.length === 0 ? 'No tool calls recorded yet.' : 'No entries match your filters.'}
          </p>
        </div>
      )}

      {/* Entry table */}
      {filtered.length > 0 && (
        <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] overflow-hidden">
          <div className="grid grid-cols-[80px_1fr_80px_60px_90px_70px_60px] gap-2 px-3 py-2 border-b border-[var(--border-card)] text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <span>Time</span>
            <span>Tool</span>
            <span>Category</span>
            <span>Risk</span>
            <span>Approval</span>
            <span className="text-right">Cost</span>
            <span>Status</span>
          </div>
          {paged.map((entry, localI) => {
            // Use the absolute filtered index so expandedIdx stays
            // stable across page changes (a user expanding a row on
            // page 1, flipping to page 2, then back, sees their row
            // still open).
            const i = pageStart + localI;
            const time = new Date(entry.timestamp).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            const isExpanded = expandedIdx === i;
            return (
              <div key={i}>
                <button
                  onClick={() => setExpandedIdx(isExpanded ? null : i)}
                  className="grid grid-cols-[80px_1fr_80px_60px_90px_70px_60px] gap-2 w-full px-3 py-2 text-left text-[11px] border-none bg-transparent cursor-pointer hover:bg-[var(--bg-input)]/30 transition"
                >
                  <span className="text-[var(--text-muted)] font-mono text-[10px]">{time}</span>
                  <span className="text-white font-medium truncate">{entry.toolName}</span>
                  <span className="text-[var(--text-secondary)]">{CATEGORY_LABELS[entry.category] || entry.category}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium text-center ${RISK_COLORS[entry.riskLevel] || ''}`}>{entry.riskLevel}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium text-center ${APPROVAL_COLORS[entry.approvalMethod] || ''}`}>{entry.approvalMethod}</span>
                  <span className="text-right font-mono text-[10px] text-[var(--text-secondary)]">{formatAuditCost(entry.cost)}</span>
                  <span className={`text-[10px] font-medium ${STATUS_COLORS[entry.status] || 'text-[var(--text-muted)]'}`}>{entry.status}</span>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2">
                    <div className="rounded-lg bg-[var(--bg-input)]/50 p-2.5 text-[10px] font-mono text-[var(--text-secondary)]">
                      <p className="font-semibold text-[var(--text-muted)] mb-1">Arguments</p>
                      <pre className="whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                        {entry.fullArgs ? JSON.stringify(entry.fullArgs, null, 2) : entry.argsSummary}
                      </pre>
                    </div>
                    {entry.result && (
                      <div className="rounded-lg bg-[var(--bg-input)]/50 p-2.5 text-[10px] font-mono text-[var(--text-secondary)]">
                        <p className="font-semibold text-[var(--text-muted)] mb-1">Result</p>
                        <pre className="whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{entry.result}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {/* Pagination footer — only renders when there's more than
              one page worth of filtered entries. Showing it on a 5-row
              filter result would just be noise. */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[var(--border-card)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
              <span>
                Showing {pageStart + 1}–{Math.min(pageStart + AUDIT_PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="rounded-md border border-[var(--border-card)] bg-[var(--bg-input)] px-2.5 py-1 text-[11px] text-[var(--text-primary)] transition hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/30 disabled:opacity-40 disabled:cursor-default disabled:hover:bg-[var(--bg-input)] disabled:hover:border-[var(--border-card)]"
                >Prev</button>
                <span className="min-w-[80px] text-center">Page {safePage + 1} of {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={safePage >= totalPages - 1}
                  className="rounded-md border border-[var(--border-card)] bg-[var(--bg-input)] px-2.5 py-1 text-[11px] text-[var(--text-primary)] transition hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/30 disabled:opacity-40 disabled:cursor-default disabled:hover:bg-[var(--bg-input)] disabled:hover:border-[var(--border-card)]"
                >Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Lightweight client-side mirror of @ava/core/audit/patterns. Kept here
// so the audit view doesn't need a runtime dep on the core audit module
// (which is Node-only and won't bundle into the dashboard-ui webview).
function detectClientSidePatterns(entries: AuditEntry[]): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recent = entries.filter(e => e.timestamp >= sevenDaysAgo);
  if (recent.length === 0) return [];

  const byTool = new Map<string, { auto: number; autoFailed: number }>();
  for (const e of recent) {
    if (e.approvalMethod !== 'auto') continue;
    const t = byTool.get(e.toolName) ?? { auto: 0, autoFailed: 0 };
    t.auto++;
    if (e.status === 'failed' || e.status === 'denied') t.autoFailed++;
    byTool.set(e.toolName, t);
  }
  for (const [tool, s] of byTool) {
    if (s.auto >= 5 && s.autoFailed / s.auto > 0.2) {
      findings.push({
        severity: 'warning',
        message: `You auto-approve ${tool} but ${Math.round((s.autoFailed / s.auto) * 100)}% of those calls fail (${s.autoFailed} of ${s.auto} this week).`,
        suggestion: 'Consider tightening the approval rule to first-time, so failures get a second look.',
        relatedTools: [tool],
      });
    }
  }

  const dangerousSucceeded = recent.filter(e => e.riskLevel === 'dangerous' && e.status === 'success');
  if (dangerousSucceeded.length > 0) {
    findings.push({
      severity: 'critical',
      message: `${dangerousSucceeded.length} dangerous tool call${dangerousSucceeded.length === 1 ? '' : 's'} succeeded this week.`,
      suggestion: 'Review these in the audit table to confirm they touched only what you expected.',
      relatedTools: [...new Set(dangerousSucceeded.map(e => e.toolName))],
    });
  }

  return findings;
}

// ─── Session View ────────────────────────────────────────────────────────────

function SessionView({ stats }: { stats: SessionStats | null }) {
  const totalTokens = stats ? stats.total_input_tokens + stats.total_output_tokens : 0;
  const breakdown = stats?.model_breakdown ?? [];
  const maxTotal = breakdown.length > 0 ? Math.max(...breakdown.map(m => m.input_tokens + m.output_tokens)) : 1;
  const sessionDuration = stats ? timeSince(stats.session_start) : '--';

  const totalCost = useMemo(() => {
    if (!stats) return 0;
    return stats.model_breakdown.reduce((sum, m) => sum + estimateCost(m.input_tokens, m.output_tokens, m.model), 0);
  }, [stats]);

  return (
    <>
      {/* Summary Cards */}
      <div className="mb-6">
        <SectionGroup label={t('dash.usage.session_summary')}>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={t('dash.usage.input_tokens')} value={formatNumber(stats?.total_input_tokens ?? 0)} />
            <StatCard label={t('dash.usage.output_tokens')} value={formatNumber(stats?.total_output_tokens ?? 0)} />
            <StatCard label={t('dash.usage.total_tokens')} value={formatNumber(totalTokens)} highlight />
            <StatCard label={t('dash.usage.messages')} value={String(stats?.messages ?? 0)} />
            <StatCard label={t('dash.usage.tool_calls')} value={String(stats?.tool_calls ?? 0)} />
            <StatCard label={t('dash.usage.duration')} value={sessionDuration} sub={stats ? t('dash.usage.since', { time: new Date(stats.session_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) }) : undefined} />
          </div>
        </SectionGroup>
      </div>

      {/* Cost Estimate */}
      <div className="mb-6">
        <SectionGroup label={t('dash.usage.estimated_cost')}>
          <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${costColour(totalCost)}`}>
                ${totalCost.toFixed(4)}
              </span>
              <span className="text-xs text-[var(--text-muted)]">{t('dash.usage.this_session')}</span>
            </div>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              {t('dash.usage.cost_note')}
            </p>
          </div>
        </SectionGroup>
      </div>

      {/* Model Breakdown */}
      <div className="mb-6">
        <SectionGroup label={t('dash.usage.models_used')}>
          {breakdown.length > 0 ? (
            <div className="space-y-2">
              {breakdown.map((m) => {
                const total = m.input_tokens + m.output_tokens;
                const pct = (total / maxTotal) * 100;
                const cost = estimateCost(m.input_tokens, m.output_tokens, m.model);
                return (
                  <div key={`${m.provider}:${m.model}`} className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium">{m.model}</span>
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-medium ${costColour(cost)}`}>${cost.toFixed(4)}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {m.requests} {m.requests === 1 ? t('dash.usage.req') : t('dash.usage.reqs')}
                        </span>
                      </div>
                    </div>
                    <div className="mb-2 h-2 overflow-hidden rounded-full bg-[var(--bg-input)]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-3 text-[10px] text-[var(--text-muted)]">
                      <span>{t('status.in')}: {formatNumber(m.input_tokens)}</span>
                      <span>{t('status.out')}: {formatNumber(m.output_tokens)}</span>
                      <span>{t('status.total')}: {formatNumber(total)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-6 text-center">
              <p className="text-xs text-[var(--text-muted)]">{t('dash.usage.no_usage_session')}</p>
            </div>
          )}
        </SectionGroup>
      </div>
    </>
  );
}

// ─── All-Time View ───────────────────────────────────────────────────────────

function AllTimeView({ data, mode, account }: { data: UsageHistoryData | null; mode: 'platform' | 'byok'; account: AccountInfo | null }) {
  const [expandedSession, setExpandedSession] = useState<number | null>(null);

  if (mode === 'byok' || !account) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-card)] bg-[var(--bg-card)] p-8 text-center">
        <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">
          {t('dash.usage.connect_hint')}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {t('dash.usage.session_tab_hint')}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-card)] border-t-[var(--accent)]" />
      </div>
    );
  }

  // Tokens-to-credits conversion ratio. The server returns historical
  // aggregates as raw token totals (legacy /usage/summary contract) but
  // the user thinks and budgets in credits, so we convert client-side.
  // Anchored to the user's actual billing ratio: balance.used credits ÷
  // monthTotal tokens for the same period gives the exact tokens/credit
  // rate that produced their current balance, so the chart numbers
  // line up exactly with what the Credit Balance card shows. Falls back
  // to TOKENS_PER_BRACKET (16K) when no monthTotal is available — that's
  // the same constant @ava/core/billing uses for credit-per-turn math.
  const TOKENS_PER_CREDIT_FALLBACK = 16_000;
  const tokensPerCredit = data.balance && data.balance.used > 0 && data.monthTotal > 0
    ? data.monthTotal / data.balance.used
    : TOKENS_PER_CREDIT_FALLBACK;
  const tokensToCredits = (tokens: number): number => Math.round(tokens / tokensPerCredit);

  // Pre-converted aggregates for the cards + chart. Original token
  // values stay available via data.* if a future view needs them.
  const monthCredits = tokensToCredits(data.monthTotal);
  const lastMonthCredits = tokensToCredits(data.lastMonthTotal);
  const avgSessionCredits = tokensToCredits(data.avgPerSession);
  const dailyCredits = data.daily.map(d => ({ ...d, credits: tokensToCredits(d.tokens) }));

  // Forecast calculation — credits per day → days remaining at current pace.
  const daysWithUsage = dailyCredits.filter(d => d.credits > 0).length;
  const avgDailyCredits = daysWithUsage > 0 ? dailyCredits.reduce((s, d) => s + d.credits, 0) / daysWithUsage : 0;
  const remaining = data.balance ? Math.max(0, data.balance.limit - data.balance.used) : 0;
  const forecastDays = avgDailyCredits > 0 ? Math.floor(remaining / avgDailyCredits) : null;

  // Month comparison — credits-vs-credits, same percentage either way.
  const monthChange = lastMonthCredits > 0
    ? ((monthCredits - lastMonthCredits) / lastMonthCredits * 100).toFixed(0)
    : null;

  // Daily chart max — credits, drives bar heights.
  const dailyMax = Math.max(...dailyCredits.map(d => d.credits), 1);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      {/* Credit Balance Bar — billing-facing surface. The underlying
          field name on the wire is still `tokens_*` for backwards-compat
          but the values now reflect credits per the credits-redesign.
          Section label uses an i18n key with a literal fallback so the
          rename works even on locales that haven't translated the new
          key yet. */}
      {data.balance && (
        <div className="mb-6">
          <SectionGroup label={t('dash.usage.credit_balance') !== 'dash.usage.credit_balance' ? t('dash.usage.credit_balance') : 'Credit Balance'}>
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-5">
              {data.balance.tier === 'admin' ? (
                <>
                  <div className="mb-2 flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">{t('dash.usage.admin_tier')}</span>
                    <span className="font-medium text-[var(--gradient-start)]">{t('dash.usage.unlimited')}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-[var(--bg-input)]">
                    <div className="h-full w-full rounded-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]" />
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-2 flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">
                      {t('dash.usage.used_of', { used: formatNumber(data.balance.used), limit: formatNumber(data.balance.limit) })}
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {((data.balance.used / data.balance.limit) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <UsageBar used={data.balance.used} limit={data.balance.limit} />
                </>
              )}
              {forecastDays !== null && data.balance.tier !== 'admin' && (
                <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                  {t('dash.usage.estimated_remaining', { days: forecastDays, days_label: forecastDays === 1 ? t('dash.usage.day') : t('dash.usage.days') })}
                </p>
              )}
            </div>
          </SectionGroup>
        </div>
      )}

      {/* Overview — credits. Same unit as the Credit Balance card so
          the numbers connect. Tokens-per-credit ratio is anchored to
          the user's actual billing rate (see tokensPerCredit derivation
          above) so This Month here always agrees with the credits used
          in the balance bar. Hover any value to see the underlying
          token aggregate the conversion came from. */}
      <div className="mb-6">
        <SectionGroup label={t('dash.usage.overview')}>
          <div className="grid grid-cols-4 gap-3">
            <StatCard
              label={t('dash.usage.this_month')}
              value={monthCredits.toLocaleString()}
              sub={monthChange !== null ? `${Number(monthChange) >= 0 ? '+' : ''}${monthChange}% ${t('dash.usage.vs_last')}` : t('dash.usage.first_month')}
              title={`${formatNumber(data.monthTotal)} raw tokens`}
            />
            <StatCard
              label={t('dash.usage.last_month')}
              value={lastMonthCredits.toLocaleString()}
              title={`${formatNumber(data.lastMonthTotal)} raw tokens`}
            />
            <StatCard
              label={t('dash.usage.avg_session')}
              value={avgSessionCredits.toLocaleString()}
              title={`${formatNumber(data.avgPerSession)} raw tokens`}
            />
            <StatCard label={t('dash.usage.total_sessions')} value={String(data.totalSessions)} />
          </div>
        </SectionGroup>
      </div>

      {/* Daily Usage Chart — credits by day, anchored to the same
          tokens-per-credit ratio used by the Overview cards. Bar height
          is proportional to credits; tooltip shows credits with the
          underlying token count in parentheses for transparency. */}
      <div className="mb-6">
        <SectionGroup label={t('dash.usage.daily_usage')}>
          <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4">
            <div className="flex items-end gap-1" style={{ height: 120 }}>
              {dailyCredits.map((d) => {
                const heightPct = dailyMax > 0 ? (d.credits / dailyMax) * 100 : 0;
                const isToday = d.date === today;
                const dayLabel = new Date(d.date + 'T00:00:00').toLocaleDateString(getLocale(), { day: 'numeric' });

                return (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${d.credits.toLocaleString()} credits (${formatNumber(d.tokens)} tokens)`}>
                    <div className="w-full flex items-end" style={{ height: 90 }}>
                      <div
                        className={`w-full rounded-t transition-all ${
                          isToday
                            ? 'bg-[var(--accent)]'
                            : d.credits > 0
                              ? 'bg-gradient-to-t from-[var(--gradient-start)] to-[var(--gradient-end)] opacity-70'
                              : 'bg-[var(--bg-input)]'
                        }`}
                        style={{ height: `${Math.max(heightPct, d.credits > 0 ? 4 : 2)}%`, minHeight: 2 }}
                      />
                    </div>
                    <span className={`text-[8px] ${isToday ? 'text-[var(--accent)] font-bold' : 'text-[var(--text-muted)]'}`}>
                      {dayLabel}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[8px] text-[var(--text-muted)]">
              <span>{data.daily[0]?.date ? new Date(data.daily[0].date + 'T00:00:00').toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' }) : ''}</span>
              <span>{t('dash.usage.today')}</span>
            </div>
          </div>
        </SectionGroup>
      </div>

      {/* Most Used Models */}
      {data.topModels.length > 0 && (
        <div className="mb-6">
          <SectionGroup label={t('dash.usage.most_used_models')}>
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 space-y-3">
              {data.topModels.map((m) => {
                const credits = tokensToCredits(m.tokens);
                const pct = (m.tokens / data.topModels[0].tokens) * 100;
                return (
                  <div key={m.model} title={`${formatNumber(m.tokens)} raw tokens`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium truncate mr-3">{m.model}</span>
                      <span className="text-[10px] text-[var(--text-muted)] shrink-0">{credits.toLocaleString()} credits</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-input)]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionGroup>
        </div>
      )}

      {/* Session History */}
      {data.sessions.length > 0 && (
        <div className="mb-6">
          <SectionGroup label={t('dash.usage.session_history')} count={t('dash.usage.sessions_count', { count: data.sessions.length })}>
            <div className="rounded-xl border border-[var(--border-card)] overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-6 gap-2 bg-[var(--bg-card)] px-4 py-2 border-b border-[var(--border-card)]">
                <span className="text-[10px] font-medium text-[var(--text-muted)]">{t('dash.usage.date')}</span>
                <span className="text-[10px] font-medium text-[var(--text-muted)]">{t('dash.usage.duration')}</span>
                <span className="text-[10px] font-medium text-[var(--text-muted)] text-right">{t('dash.usage.messages')}</span>
                <span className="text-[10px] font-medium text-[var(--text-muted)] text-right">{t('dash.usage.tokens')}</span>
                <span className="text-[10px] font-medium text-[var(--text-muted)]">{t('dash.usage.model')}</span>
                <span className="text-[10px] font-medium text-[var(--text-muted)] text-right">{t('dash.usage.cost')}</span>
              </div>

              {/* Rows */}
              <div className="max-h-80 overflow-y-auto">
                {data.sessions.map((s, i) => (
                  <div key={i}>
                    <div
                      className="grid grid-cols-6 gap-2 px-4 py-2.5 cursor-pointer transition hover:bg-[var(--bg-input)]/50 bg-[var(--bg-card)]/50 border-b border-[var(--border-card)] last:border-b-0"
                      onClick={() => setExpandedSession(expandedSession === i ? null : i)}
                    >
                      <span className="text-xs text-[var(--text-secondary)]">
                        {new Date(s.date + 'T00:00:00').toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{s.duration}</span>
                      <span className="text-xs text-[var(--text-muted)] text-right">{s.messages}</span>
                      <span className="text-xs font-mono text-[var(--text-secondary)] text-right">{formatNumber(s.tokens)}</span>
                      <span className="text-xs text-[var(--text-muted)] truncate" title={s.model}>{s.model}</span>
                      <span className={`text-xs font-mono text-right ${costColour(s.cost)}`}>${s.cost.toFixed(3)}</span>
                    </div>
                    {expandedSession === i && (
                      <div className="px-4 py-3 bg-[var(--bg-input)]/30 border-b border-[var(--border-card)]">
                        <div className="grid grid-cols-3 gap-3 text-[10px]">
                          <div>
                            <span className="text-[var(--text-muted)]">{t('dash.usage.date')}: </span>
                            <span className="text-[var(--text-secondary)]">{s.date}</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">{t('dash.usage.duration')}: </span>
                            <span className="text-[var(--text-secondary)]">{s.duration}</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">{t('dash.usage.primary_model')}: </span>
                            <span className="text-[var(--text-secondary)]">{s.model}</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">{t('dash.usage.messages')}: </span>
                            <span className="text-[var(--text-secondary)]">{s.messages}</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">{t('dash.usage.tokens')}: </span>
                            <span className="text-[var(--text-secondary)]">{s.tokens.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">{t('dash.usage.est_cost')}: </span>
                            <span className={costColour(s.cost)}>${s.cost.toFixed(4)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </SectionGroup>
        </div>
      )}
    </>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, highlight, title }: { label: string; value: string; sub?: string; highlight?: boolean; title?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4" title={title}>
      <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
      <p className={`mt-1 text-lg font-bold ${highlight ? 'bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] bg-clip-text text-transparent' : ''}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}
