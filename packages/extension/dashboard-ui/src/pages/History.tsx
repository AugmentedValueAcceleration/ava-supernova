import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { t, useLocale, getLocale } from '../i18n';
import { post } from '../App';
import { SectionGroup } from '../components/SectionGroup';
import { UsageBar } from '../components/UsageBar';
import { Select } from '../components/Select';
import { Icon } from '../components/Icon';
import { Skeleton } from '../components/Skeleton';
import type { AccountInfo, SessionStats, UsageHistoryData, ConversationEntry, Page } from '../types/messages';

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

// ─── Shared visual language ──────────────────────────────────────────────────
// One tone system feeds cost, status, risk and approval across all three tabs,
// so the same green (etc.) always means the same thing. Unifies four formerly
// independent colour maps.
type Tone = 'success' | 'warn' | 'danger' | 'info' | 'neutral';

const TONE_TEXT: Record<Tone, string> = {
  success: 'text-emerald-400', warn: 'text-yellow-400', danger: 'text-red-400',
  info: 'text-blue-400', neutral: 'text-[var(--text-muted)]',
};
const TONE_BADGE: Record<Tone, string> = {
  success: 'bg-emerald-500/15 text-emerald-400', warn: 'bg-yellow-500/15 text-yellow-400',
  danger: 'bg-red-500/15 text-red-400', info: 'bg-blue-500/15 text-blue-400',
  neutral: 'bg-white/5 text-[var(--text-muted)]',
};

// Shared interactive-card surface — calm flat base, brand accent on hover only.
// This is the one "clickable row" treatment for standalone cards across tabs.
const INTERACTIVE_CARD = 'rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] transition hover:border-[var(--accent)]/45 hover:shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_16%,transparent)]';

function costTone(cost: number): Tone {
  if (cost < 0.10) return 'success';
  if (cost < 0.50) return 'warn';
  return 'danger';
}
function costColour(cost: number): string {
  return TONE_TEXT[costTone(cost)];
}

// Shared search box — one styled input used by both the Conversations and
// Audit tabs (they previously diverged). `compact` is the audit-toolbar size.
function SearchInput({ value, onChange, placeholder, compact, className }: {
  value: string; onChange: (v: string) => void; placeholder: string; compact?: boolean; className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`rounded-lg border border-[var(--border-card)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--accent)] ${compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-xs'} ${className ?? ''}`}
    />
  );
}

// Shared empty state — one solid-border look (the dashed variant read as
// unfinished), used by every tab.
function EmptyState({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-10 text-center">
      <div className="mb-2 flex justify-center opacity-30">{icon}</div>
      <p className="text-xs text-[var(--text-muted)]">{children}</p>
    </div>
  );
}

// Compact in-section placeholder — keeps every Usage section rendering a
// consistent "nothing yet" card instead of some hiding and some showing zeros,
// so a region header never sits above missing content.
function SectionEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-6 text-center">
      <p className="text-xs text-[var(--text-muted)]">{children}</p>
    </div>
  );
}

// Labelled zone header — orients the two halves of the flattened Usage view
// (This session / All time) now that the sub-toggle is gone.
function UsageRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{label}</span>
        <div className="h-px flex-1 bg-[var(--border-card)]" />
      </div>
      {children}
    </div>
  );
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
  /** Forensic file-change record for file_write / file_edit / document_author. */
  fileMutation?: {
    path: string;
    gitSha?: string;
    bytesBefore?: number;
    bytesAfter?: number;
    sha256Before?: string;
    sha256After?: string;
  };
  /** Integrity verdict vs the file on disk now — set host-side by
   *  annotateIntegrity(). Absent for non-mutation / unverifiable entries. */
  integrity?: 'unchanged' | 'modified' | 'deleted' | 'unverifiable';
}

interface HistoryProps {
  sessionStats: SessionStats | null;
  usageHistory: UsageHistoryData | null;
  mode: 'platform' | 'byok';
  account: AccountInfo | null;
  auditLog?: AuditEntry[];
  auditFindings?: AuditFinding[];
  /** Saved chat conversations from the host. Powers the Conversations
   *  tab — list, search, click-to-resume, delete. Mirrors IDE History
   *  page at DashboardPages.tsx:5807-6060. */
  conversations?: ConversationEntry[];
  /** True once the conversations' first load has landed. */
  loaded: boolean;
  /** Navigate to another dashboard page. Used to jump to chat after a
   *  conversation is clicked, so the loaded thread is actually shown. */
  onNavigate: (page: Page) => void;
}

// ─── Main Component ──────────────────────────────────────────────────────────

// Tabs mirror the IDE History page: Conversations / Usage / Audit. Usage is a
// single scrolling view — the Session summary up top, the All-time history
// below — rather than a nested sub-toggle.
type TopTab = 'conversations' | 'usage' | 'audit';

export function History({ sessionStats, usageHistory, mode, account, auditLog, auditFindings, conversations, loaded, onNavigate }: HistoryProps) {
  useLocale();
  const [activeTab, setActiveTab] = useState<TopTab>(() => {
    const saved = localStorage.getItem('ava-analytics-tab');
    if (saved === 'conversations' || saved === 'usage' || saved === 'audit') return saved;
    return 'conversations';
  });

  const handleTabChange = (tab: TopTab) => {
    setActiveTab(tab);
    localStorage.setItem('ava-analytics-tab', tab);
    if (tab === 'usage' && mode === 'platform') {
      post({ type: 'load_usage_history' });
    }
    if (tab === 'audit') {
      post({ type: 'request_audit_log' });
    }
    if (tab === 'conversations') {
      post({ type: 'load_conversations' });
    }
  };

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-[#cdd6f4]">{t('dash.history.title')}</h1>
        <p className="mt-1.5 text-[13px] text-[#6c7086]">
          {t('dash.history.subtitle')}
        </p>
      </div>

      {/* Top-level tabs — mirrors IDE History at DashboardPages.tsx:5814-5818 */}
      <div className="mb-6 flex gap-1 border-b border-[var(--border-card)]">
        {([
          { id: 'conversations', label: t('dash.history.tab_conversations') },
          { id: 'usage',         label: t('dash.history.tab_usage') },
          { id: 'audit',         label: t('dash.history.tab_audit') },
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
        <ConversationsView conversations={conversations || []} loaded={loaded} onNavigate={onNavigate} />
      )}

      {activeTab === 'usage' && (
        <div className="space-y-8">
          {/* This session — always available (works for BYOK + local). */}
          <UsageRegion label={t('dash.usage.session')}>
            <SessionView stats={sessionStats} />
          </UsageRegion>
          {/* All-time — credits, charts, history (or the connect hint for BYOK). */}
          <UsageRegion label={t('dash.usage.all_time')}>
            <AllTimeView data={usageHistory} mode={mode} account={account} />
          </UsageRegion>
        </div>
      )}

      {activeTab === 'audit' && (
        <AuditView entries={auditLog || []} findings={auditFindings || []} />
      )}
    </div>
  );
}

// ─── Conversations View ─────────────────────────────────────────────────────

function ConversationsView({ conversations, loaded, onNavigate }: { conversations: ConversationEntry[]; loaded: boolean; onNavigate: (page: Page) => void }) {
  useLocale();
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
    // Jump to the chat view so the loaded thread is actually shown —
    // clicking on the History page otherwise loads it silently in the
    // background with no visible change.
    onNavigate('chat');
  };

  const deleteConversation = (id: string) => {
    post({ type: 'delete_conversation', id });
  };

  return (
    <div className="space-y-3">
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('dash.history.search_conversations')}
        className="w-full max-w-sm"
      />

      {!loaded ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} height={58} radius={10} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Icon.chat size={24} />}>
          {search ? t('dash.history.no_match') : t('dash.history.no_conversations')}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(conv => {
            // Tolerate both shapes: HistoryManager.listConversations
            // returns metadata in camelCase (`updatedAt`, no messages
            // array — list endpoints stay slim by design), the cloud
            // /conversations endpoint returns snake_case rows. Read
            // both so neither source renders as a row of empty dots.
            const updated = (conv as any).updatedAt || conv.updated_at || (conv as any).createdAt || (conv as any).created_at || '';
            const date = updated ? new Date(updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            const time = updated ? new Date(updated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
            // Local list rows don't carry messages; cloud rows do. Only
            // surface a count when we actually have one — better silence
            // than "0 messages" lying about a real conversation.
            const msgCount: number | undefined = (conv as any).messageCount ?? (conv.messages?.length || undefined);
            const preview = conv.messages?.find(m => m.role === 'assistant' || (m.role as string) === 'ava')?.content?.slice(0, 120) || '';
            return (
              <div
                key={conv.id}
                onClick={() => loadConversation(conv)}
                className={`cursor-pointer px-4 py-3 ${INTERACTIVE_CARD}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {conv.pinned && <span className="text-[var(--accent)]" title={t('history.pinned')}><Icon.pin size={11} /></span>}
                      <span className="truncate text-sm font-semibold text-[#cdd6f4]">{conv.title || t('dash.chat.untitled')}</span>
                    </div>
                    {preview && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-[var(--text-muted)]">{preview}</p>
                    )}
                    {(date || msgCount !== undefined) && (
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[#585b70]">
                        {date && <span>{date}{time ? ` · ${time}` : ''}</span>}
                        {date && msgCount !== undefined && <span>·</span>}
                        {msgCount !== undefined && (
                          <span>{msgCount === 1 ? t('dash.support.message_count', { count: msgCount }) : t('dash.support.messages_count', { count: msgCount })}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                    title={t('dash.common.delete')}
                    className="shrink-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-[10px] text-[var(--text-muted)] transition hover:border-red-500/30 hover:text-red-400"
                  >
                    {t('dash.common.delete')}
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

// Audit dimensions map onto the shared tone system (TONE_BADGE / TONE_TEXT)
// so a green here is the same green as a low cost or a successful status.
const APPROVAL_TONE: Record<string, Tone> = {
  'auto': 'success', 'first-time': 'info', 'user-approved': 'warn', 'denied': 'danger',
};
const STATUS_TONE: Record<string, Tone> = {
  'success': 'success', 'failed': 'danger', 'denied': 'danger',
};
const RISK_TONE: Record<string, Tone> = {
  'safe': 'success', 'write': 'warn', 'dangerous': 'danger',
};

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  file_ops: 'dash.audit.cat_file_ops', shell: 'dash.audit.cat_shell', git: 'dash.audit.cat_git', web: 'dash.audit.cat_web',
  media: 'dash.audit.cat_media', database: 'dash.audit.cat_database', system: 'dash.audit.cat_system',
  documents: 'dash.audit.cat_documents', memory: 'dash.audit.cat_memory', learning: 'dash.audit.cat_learning',
};

// Pattern finding shape — must match @ava/core/audit/patterns Finding.
// Findings are computed host-side by the shared engine and sent with the
// entries; we localise from `kind` + `params` so the copy honours the
// user's locale (the English message/suggestion are the fallback).
type AuditFindingKind = 'auto-fail' | 'retry-loop' | 'dangerous-succeeded';
interface AuditFinding {
  severity: 'info' | 'warning' | 'critical';
  kind?: AuditFindingKind;
  params?: { tool?: string; pct?: number; failed?: number; total?: number; count?: number; atISO?: string };
  message: string;
  suggestion?: string;
  relatedTools?: string[];
}

// Localise a host-computed finding from its structured kind/params. Falls
// back to the English message/suggestion the engine ships for any kind we
// don't have a template for (forward-compatible with new engine checks).
function localizeFinding(f: AuditFinding): { message: string; suggestion?: string } {
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

function formatAuditCost(cost: AuditEntry['cost']): string {
  if (!cost) return '—';
  if (cost.mode === 'platform' && cost.credits != null) return `${cost.credits} cr`;
  if (cost.mode === 'byok' && cost.usd != null)         return `$${cost.usd.toFixed(cost.usd >= 0.01 ? 4 : 6)}`;
  return '—';
}

// Integrity badge presentation — the same verdict the shared engine computes
// (annotateIntegrity), rendered as a glyph + tint the user can read at a
// glance and localise on hover.
type IntegrityKey = NonNullable<AuditEntry['integrity']>;
const INTEGRITY_META: Record<IntegrityKey, { glyph: string; text: string; badge: string; labelKey: string }> = {
  unchanged:    { glyph: '✓', text: 'text-emerald-400', badge: 'bg-emerald-500/15 text-emerald-400', labelKey: 'dash.audit.integrity_unchanged' },
  modified:     { glyph: '⚠', text: 'text-yellow-400',  badge: 'bg-yellow-500/15 text-yellow-400',  labelKey: 'dash.audit.integrity_modified' },
  deleted:      { glyph: '🗑', text: 'text-red-400',     badge: 'bg-red-500/15 text-red-400',        labelKey: 'dash.audit.integrity_deleted' },
  unverifiable: { glyph: '•', text: 'text-[var(--text-muted)]', badge: 'bg-[var(--bg-input)] text-[var(--text-muted)]', labelKey: 'dash.audit.integrity_unverifiable' },
};

const AUDIT_PAGE_SIZE = 25;

function AuditView({ entries, findings }: { entries: AuditEntry[]; findings: AuditFinding[] }) {
  useLocale();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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
          {findings.map((f, i) => {
            const loc = localizeFinding(f);
            return (
              <div
                key={i}
                className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
                  f.severity === 'critical' ? 'border-red-500/40 bg-red-500/5 text-red-200'
                    : f.severity === 'warning' ? 'border-yellow-500/40 bg-yellow-500/5 text-yellow-100'
                    : 'border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--text-secondary)]'
                }`}
              >
                <div className="font-medium">{loc.message}</div>
                {loc.suggestion && <div className="mt-1 text-[10px] opacity-80">{loc.suggestion}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Search + filter + export controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-2.5">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('dash.audit.filter_placeholder')}
          compact
          className="flex-1 min-w-[160px]"
        />
        <div className="w-[120px] shrink-0">
          <Select
            value={riskFilter}
            onChange={setRiskFilter}
            options={[
              { value: 'all',       label: t('dash.audit.risk_all') },
              { value: 'safe',      label: t('dash.audit.risk_safe') },
              { value: 'write',     label: t('dash.audit.risk_write') },
              { value: 'dangerous', label: t('dash.audit.risk_dangerous') },
            ]}
          />
        </div>
        <div className="w-[120px] shrink-0">
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all',     label: t('dash.audit.status_all') },
              { value: 'success', label: t('dash.audit.status_success') },
              { value: 'failed',  label: t('dash.audit.status_failed') },
              { value: 'denied',  label: t('dash.audit.status_denied') },
            ]}
          />
        </div>
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => exportLog('markdown')}
            title={t('dash.audit.export_md_title')}
            className="rounded-md border border-[var(--border-card)] bg-[var(--bg-input)] px-2.5 py-1 text-[11px] text-[var(--text-primary)] transition hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/30"
          >
            {t('dash.audit.export_md')}
          </button>
          <button
            onClick={() => exportLog('json')}
            title={t('dash.audit.export_json_title')}
            className="rounded-md border border-[var(--border-card)] bg-[var(--bg-input)] px-2.5 py-1 text-[11px] text-[var(--text-primary)] transition hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/30"
          >
            {t('dash.audit.export_json')}
          </button>
        </div>
      </div>

      {/* Cost totals strip — only shown when there's something to attribute. */}
      {(totals.credits > 0 || totals.usd > 0) && (
        <div className="flex gap-4 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] px-3 py-2 text-[11px]">
          {totals.credits > 0 && (
            <span><span className="text-[var(--text-muted)]">{t('dash.audit.credits_label')}</span> <span className="font-semibold text-[var(--text-primary)]">{totals.credits.toLocaleString()}</span></span>
          )}
          {totals.usd > 0 && (
            <span><span className="text-[var(--text-muted)]">{t('dash.audit.byok_estimate_label')}</span> <span className="font-semibold text-[var(--text-primary)]">${totals.usd.toFixed(4)}</span></span>
          )}
          <span className="ml-auto text-[var(--text-muted)]">{t('dash.audit.entries_shown', { shown: filtered.length, total: entries.length })}</span>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <EmptyState icon={<Icon.clipboard size={24} />}>
          {entries.length === 0 ? t('dash.audit.empty_none') : t('dash.audit.empty_filtered')}
        </EmptyState>
      )}

      {/* Entry table */}
      {filtered.length > 0 && (
        <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] overflow-hidden">
          <div className="grid grid-cols-[80px_1fr_80px_60px_90px_70px_60px] gap-2 px-3 py-2 border-b border-[var(--border-card)] text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <span>{t('dash.audit.col_time')}</span>
            <span>{t('dash.audit.col_tool')}</span>
            <span>{t('dash.audit.col_category')}</span>
            <span>{t('dash.audit.col_risk')}</span>
            <span>{t('dash.audit.col_approval')}</span>
            <span className="text-right">{t('dash.audit.col_cost')}</span>
            <span>{t('dash.audit.col_status')}</span>
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
                  <span className="text-white font-medium truncate flex items-center gap-1">
                    <span className="truncate">{entry.toolName}</span>
                    {entry.fileMutation && entry.integrity && (
                      <span className={`shrink-0 text-[10px] ${INTEGRITY_META[entry.integrity].text}`} title={t(INTEGRITY_META[entry.integrity].labelKey)}>
                        {INTEGRITY_META[entry.integrity].glyph}
                      </span>
                    )}
                  </span>
                  <span className="text-[var(--text-secondary)] truncate">{CATEGORY_LABEL_KEYS[entry.category] ? t(CATEGORY_LABEL_KEYS[entry.category]) : entry.category}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium text-center ${TONE_BADGE[RISK_TONE[entry.riskLevel] ?? 'neutral']}`}>{entry.riskLevel}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium text-center ${TONE_BADGE[APPROVAL_TONE[entry.approvalMethod] ?? 'neutral']}`}>{entry.approvalMethod}</span>
                  <span className="text-right font-mono text-[10px] text-[var(--text-secondary)]">{formatAuditCost(entry.cost)}</span>
                  <span className={`text-[10px] font-medium ${TONE_TEXT[STATUS_TONE[entry.status] ?? 'neutral']}`}>{entry.status}</span>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2">
                    {entry.fileMutation && (
                      <div className={`rounded-lg border p-2.5 text-[10px] ${
                        entry.integrity === 'unchanged' ? 'border-emerald-500/30 bg-emerald-500/5'
                          : entry.integrity === 'modified' ? 'border-yellow-500/30 bg-yellow-500/5'
                          : entry.integrity === 'deleted' ? 'border-red-500/30 bg-red-500/5'
                          : 'border-[var(--border-card)] bg-[var(--bg-input)]/50'
                      }`}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[9px]">{t('dash.audit.integrity_title')}</span>
                          {entry.integrity && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${INTEGRITY_META[entry.integrity].badge}`}>
                              {INTEGRITY_META[entry.integrity].glyph} {t(INTEGRITY_META[entry.integrity].labelKey)}
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[var(--text-secondary)] break-all">{entry.fileMutation.path}</div>
                        {entry.fileMutation.sha256After && (
                          <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-[9px] text-[var(--text-muted)]">
                            <span>{t('dash.audit.integrity_hash_after')}</span>
                            <span className="break-all text-[var(--text-secondary)]">{entry.fileMutation.sha256After}</span>
                            {entry.fileMutation.gitSha && (<>
                              <span>{t('dash.audit.integrity_git_sha')}</span>
                              <span className="break-all text-[var(--text-secondary)]">{entry.fileMutation.gitSha}</span>
                            </>)}
                            {typeof entry.fileMutation.bytesAfter === 'number' && (<>
                              <span>{t('dash.audit.integrity_size')}</span>
                              <span className="text-[var(--text-secondary)]">{entry.fileMutation.bytesAfter.toLocaleString()} B</span>
                            </>)}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="rounded-lg bg-[var(--bg-input)]/50 p-2.5 text-[10px] font-mono text-[var(--text-secondary)]">
                      <p className="font-semibold text-[var(--text-muted)] mb-1">{t('dash.audit.arguments')}</p>
                      <pre className="whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                        {entry.fullArgs ? JSON.stringify(entry.fullArgs, null, 2) : entry.argsSummary}
                      </pre>
                    </div>
                    {entry.result && (
                      <div className="rounded-lg bg-[var(--bg-input)]/50 p-2.5 text-[10px] font-mono text-[var(--text-secondary)]">
                        <p className="font-semibold text-[var(--text-muted)] mb-1">{t('dash.audit.result')}</p>
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
                {t('dash.audit.showing_range', { from: pageStart + 1, to: Math.min(pageStart + AUDIT_PAGE_SIZE, filtered.length), total: filtered.length })}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="rounded-md border border-[var(--border-card)] bg-[var(--bg-input)] px-2.5 py-1 text-[11px] text-[var(--text-primary)] transition hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/30 disabled:opacity-40 disabled:cursor-default disabled:hover:bg-[var(--bg-input)] disabled:hover:border-[var(--border-card)]"
                >{t('dash.usage.prev')}</button>
                <span className="min-w-[80px] text-center">{t('health.browse.page_of', { current: safePage + 1, total: totalPages })}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={safePage >= totalPages - 1}
                  className="rounded-md border border-[var(--border-card)] bg-[var(--bg-input)] px-2.5 py-1 text-[11px] text-[var(--text-primary)] transition hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/30 disabled:opacity-40 disabled:cursor-default disabled:hover:bg-[var(--bg-input)] disabled:hover:border-[var(--border-card)]"
                >{t('dash.usage.next')}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
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
            <SectionEmpty>{t('dash.usage.no_usage_session')}</SectionEmpty>
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
      <div className="mb-6">
        <SectionGroup label={t('dash.usage.most_used_models')}>
          {data.topModels.length > 0 ? (
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4 space-y-3">
              {data.topModels.map((m) => {
                const credits = tokensToCredits(m.tokens);
                const pct = (m.tokens / data.topModels[0].tokens) * 100;
                return (
                  <div key={m.model} title={`${formatNumber(m.tokens)} raw tokens`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium truncate mr-3">{m.model}</span>
                      <span className="text-[10px] text-[var(--text-muted)] shrink-0">{t('dash.history.n_credits', { n: credits.toLocaleString() })}</span>
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
          ) : (
            <SectionEmpty>{t('dash.usage.no_usage_period')}</SectionEmpty>
          )}
        </SectionGroup>
      </div>

      {/* Session History */}
      <div className="mb-6">
        <SectionGroup label={t('dash.usage.session_history')} count={data.sessions.length > 0 ? t('dash.usage.sessions_count', { count: data.sessions.length }) : undefined}>
          {data.sessions.length > 0 ? (
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
          ) : (
            <SectionEmpty>{t('dash.usage.no_usage_period')}</SectionEmpty>
          )}
        </SectionGroup>
      </div>
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
