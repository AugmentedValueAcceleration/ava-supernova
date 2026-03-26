import * as vscode from 'vscode';
import * as os from 'node:os';
import * as path from 'node:path';
import * as https from 'node:https';
import * as http from 'node:http';

/** Simple JSON GET for use in extension host (no global fetch in Electron) */
function httpGetJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      let raw = '';
      res.on('data', (c: string) => (raw += c));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error(`Invalid JSON from ${url}`)); }
      });
    }).on('error', reject);
  });
}
import { MemoryManager, TaskManager, JournalManager, AVA_HOME, loadPersonality, savePersonality, resetPersonality } from '@ava/core';
import type { Personality } from '@ava/core';
import type { MemoryEntry as CoreMemoryEntry, TaskEntry as CoreTaskEntry, JournalDay } from '@ava/core';
import { getNonce } from '../utils/nonce.js';
import { apiFetch } from '../utils/platform-api.js';
import { sessionStats } from '../session-stats.js';
import type {
  ExtToDashboardMessage,
  DashboardToExtMessage,
  DashboardSettings,
  AccountInfo,
  ConnectionStatus,
  ProviderKeyStatus,
  MemoryEntry,
  UsageLogEntry,
  DashboardTaskEntry,
} from './dashboard-message-types.js';

// ─── Platform API ─────────────────────────────────────────────────────────────

const PLATFORM_KEY_SECRET = 'ava-supernova.platformKey';

// BYOK provider key secrets
const PROVIDER_KEY_SECRETS: Record<string, string> = {
  anthropic: 'ava-supernova.provider.anthropic.apiKey',
  deepseek: 'ava-supernova.provider.deepseek.apiKey',
  kimi: 'ava-supernova.provider.kimi.apiKey',
  glm: 'ava-supernova.provider.glm.apiKey',
  qwen: 'ava-supernova.provider.qwen.apiKey',
  mistral: 'ava-supernova.provider.mistral.apiKey',
};

// Connection credential secret keys
const CONNECTION_SECRETS: Record<string, string[]> = {
  github: ['ava.connection.github.token'],
  email: ['ava.connection.email.host', 'ava.connection.email.port', 'ava.connection.email.user', 'ava.connection.email.pass'],
  slack: ['ava.connection.slack.webhook'],
  discord: ['ava.connection.discord.webhook'],
};

// ─── DashboardPanel ───────────────────────────────────────────────────────────

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  private static readonly viewType = 'ava-supernova.dashboard';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly secrets: vscode.SecretStorage;
  private disposables: vscode.Disposable[] = [];
  private memoryManager?: MemoryManager;
  private taskManager?: TaskManager;
  private journalManager?: JournalManager;

  // Weather cache (30 minutes)
  private weatherCache: { data: ExtToDashboardMessage & { type: 'weather_loaded' }; timestamp: number } | null = null;
  private static readonly WEATHER_CACHE_TTL = 30 * 60 * 1000;

  // ─── Static factory ────────────────────────────────────────────────────────

  public static show(extensionUri: vscode.Uri, context: vscode.ExtensionContext): void {
    const column = vscode.ViewColumn.One;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DashboardPanel.viewType,
      'Ava | Dashboard',
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'dashboard')],
        retainContextWhenHidden: true,
      },
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, context);
  }

  // ─── Constructor ───────────────────────────────────────────────────────────

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.secrets = context.secrets;

    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'AvaSupernovaIcon.png');
    this.panel.webview.html = this.getHtml(panel.webview);

    // Register message handler BEFORE setting HTML to catch webview_ready
    this.panel.webview.onDidReceiveMessage(
      (msg: DashboardToExtMessage) => this.handleMessage(msg),
      null,
      this.disposables,
    );

    // Re-fetch account data when the panel becomes visible again
    this.panel.onDidChangeViewState(
      () => {
        if (this.panel.visible) {
          this.refreshAccount();
        }
      },
      null,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  // ─── Message handler ───────────────────────────────────────────────────────

  private async handleMessage(msg: DashboardToExtMessage): Promise<void> {
    switch (msg.type) {
      case 'webview_ready':
        await this.sendInit();
        break;

      case 'connect_account':
        await this.connectAccount(msg.key);
        break;

      case 'disconnect_account':
        await this.secrets.delete(PLATFORM_KEY_SECRET);
        this.post({ type: 'account_updated', account: null });
        break;

      case 'skip_account':
        // No-op on host — webview manages its own BYOK state
        break;

      case 'save_provider_key':
        await this.saveProviderKey(msg.provider, msg.apiKey);
        break;

      case 'remove_provider_key':
        await this.removeProviderKey(msg.provider);
        break;

      case 'load_memories':
        await this.loadMemories();
        break;

      case 'load_more_memories':
        await this.loadMoreMemories();
        break;

      case 'delete_memory':
        await this.deleteMemory(msg.id);
        break;

      case 'upsert_memory':
        await this.upsertMemory(msg);
        break;

      case 'archive_memory':
        await this.archiveMemory(msg.id, true);
        break;

      case 'restore_memory':
        await this.archiveMemory(msg.id, false);
        break;

      case 'save_connection':
        await this.saveConnection(msg.service, msg.credentials);
        break;

      case 'remove_connection':
        await this.removeConnection(msg.service);
        break;

      case 'load_usage_logs':
        await this.loadUsageLogs(msg.period);
        break;

      case 'open_checkout':
        await this.openCheckout(msg.plan);
        break;

      case 'open_topup':
        await this.openTopup(msg.package);
        break;

      case 'open_portal':
        await this.openPortal();
        break;

      case 'save_settings':
        this.saveSettings(msg.settings);
        break;

      case 'open_chat':
        vscode.commands.executeCommand('ava-supernova.openChat');
        break;

      case 'open_url': {
        const uri = vscode.Uri.parse(msg.url);
        if (uri.scheme === 'https') {
          vscode.env.openExternal(uri);
        }
        break;
      }

      case 'update_name':
        await this.updateName(msg.name);
        break;

      case 'refresh_account':
        await this.refreshAccount();
        break;

      case 'load_conversations':
        await this.loadConversations();
        break;

      case 'delete_conversation':
        await this.deleteConversation(msg.id);
        break;

      case 'toggle_pin_conversation':
        await this.togglePinConversation(msg.id);
        break;

      case 'load_tickets':
        await this.loadTickets();
        break;

      case 'create_support_ticket':
        await this.createSupportTicket(msg.subject, msg.message);
        break;

      case 'reply_support_ticket':
        await this.replySupportTicket(msg.ticketId, msg.message);
        break;

      // ─── Admin messages ──────────────────────────────────────────────────────

      case 'load_admin_tickets':
        await this.loadAdminTickets(msg.status);
        break;

      case 'admin_reply_ticket':
        await this.adminReplyTicket(msg.ticketId, msg.message);
        break;

      case 'admin_update_ticket':
        await this.adminUpdateTicket(msg.ticketId, msg.status);
        break;

      case 'load_admin_proposals':
        await this.loadAdminProposals(msg.status);
        break;

      case 'admin_update_proposal':
        await this.adminUpdateProposal(msg.id, msg.status, msg.reviewer_notes, msg.reward_tokens);
        break;

      // ─── BYOK messages ──────────────────────────────────────────────────────

      case 'load_local_memories':
        await this.loadLocalMemories();
        break;

      case 'delete_local_memory':
        await this.deleteLocalMemory(msg.id);
        break;

      case 'upsert_local_memory':
        await this.upsertLocalMemory(msg);
        break;

      case 'archive_local_memory':
        await this.archiveLocalMemory(msg.id, true);
        break;

      case 'restore_local_memory':
        await this.archiveLocalMemory(msg.id, false);
        break;

      case 'load_session_stats':
        this.post({ type: 'session_stats_loaded', stats: sessionStats.getStats() });
        break;

      case 'load_session_tasks':
        this.post({ type: 'session_tasks_updated', tasks: this.getSessionTasks() });
        break;

      case 'load_usage_history':
        await this.loadUsageHistory();
        break;

      case 'send_byok_support': {
        const mailto = `mailto:support@ava-supernova.com?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.message + '\n\nFrom: ' + msg.email)}`;
        await vscode.env.openExternal(vscode.Uri.parse(mailto));
        this.post({ type: 'byok_support_sent', success: true, message: 'Opening your email client...' });
        break;
      }

      // ─── Task messages ──────────────────────────────────────────────────────

      case 'load_tasks':
        await this.loadTasks();
        break;

      case 'create_task':
        await this.createTask(msg);
        break;

      case 'update_task':
        await this.updateTaskEntry(msg);
        break;

      case 'delete_task':
        await this.deleteTaskEntry(msg.id);
        break;

      case 'complete_task':
        await this.completeTaskEntry(msg.id);
        break;

      case 'archive_task':
        await this.archiveTaskEntry(msg.id);
        break;

      case 'restore_task':
        await this.restoreTaskEntry(msg.id);
        break;

      // ─── Journal messages ────────────────────────────────────────────────────

      case 'load_journal_day':
        await this.loadJournalDay(msg.date);
        break;

      case 'load_journal_summaries':
        await this.loadJournalSummaries(msg.from, msg.to);
        break;

      case 'save_journal_user_entry':
        await this.saveJournalUserEntry(msg.date, msg.content, msg.mood, msg.tags);
        break;

      case 'delete_journal_user_entry':
        await this.deleteJournalEntry(msg.date, 'user');
        break;

      case 'delete_journal_ava_entry':
        await this.deleteJournalEntry(msg.date, 'ava');
        break;

      // ─── Learning messages ─────────────────────────────────────────────────

      case 'load_learning':
        await this.loadLearning();
        break;

      case 'delete_curriculum':
        await this.deleteCurriculum(msg.id);
        break;

      // ─── Sync messages ──────────────────────────────────────────────────

      case 'load_sync_status':
        await this.loadSyncStatus();
        break;

      case 'load_releases':
        await this.loadReleases();
        break;

      case 'set_working_hours':
        // Save working hours to workspace state + globalState for the agent
        this.context.globalState.update('ava.workingHours', { start: msg.start, end: msg.end });
        break;

      case 'push_to_cloud':
        await this.pushToCloud(msg.dataType);
        break;

      case 'load_library':
        await this.loadLibraryFiles();
        break;

      case 'delete_library_image':
        await this.deleteLibraryImage(msg.path);
        break;

      case 'open_library_image':
        await this.openLibraryImage(msg.path);
        break;

      case 'open_external':
        await vscode.env.openExternal(vscode.Uri.file(msg.path));
        break;

      // ─── Personality messages ──────────────────────────────────────────────────

      case 'load_personality':
        await this.handleLoadPersonality();
        break;

      case 'save_personality':
        await this.handleSavePersonality(msg.personality as Personality);
        break;

      case 'reset_personality':
        await this.handleResetPersonality();
        break;

      // ─── Avatar messages ─────────────────────────────────────────────────────────

      case 'save_avatar':
        await this.saveAvatar(msg.data, msg.mimeType);
        break;

      case 'remove_avatar':
        await this.removeAvatar();
        break;

      case 'load_avatar':
        await this.loadAvatar();
        break;

      // ─── Overview widget messages ───────────────────────────────────────────────

      case 'load_weather':
        await this.handleLoadWeather();
        break;

      case 'load_news':
        await this.handleLoadNews(msg.category);
        break;

      case 'load_latest_release':
        await this.handleLoadLatestRelease();
        break;

    }
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  private async sendInit(): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    const account = platformKey ? await this.fetchAccount(platformKey) : null;
    const connections = await this.getConnectionStatus();
    const settings = this.readSettings();
    const providerKeys = await this.getProviderKeyStatus();
    const locale = vscode.workspace.getConfiguration('ava-supernova').get<string>('preferences.language') ?? 'auto';

    this.post({ type: 'init', account, connections, settings, providerKeys, locale });

    if (account) {
      // Platform user — load memories from API
      await this.loadMemories();
    } else {
      // BYOK user — load local memories and session stats
      await this.loadLocalMemories();
      this.post({ type: 'session_stats_loaded', stats: sessionStats.getStats() });
    }
  }

  // ─── Account ───────────────────────────────────────────────────────────────

  private async connectAccount(key: string): Promise<void> {
    if (!key.startsWith('sk-ava-')) {
      this.post({ type: 'error', message: 'Invalid platform key. Keys start with sk-ava-' });
      return;
    }

    const account = await this.fetchAccount(key);
    if (!account) {
      this.post({ type: 'error', message: 'Could not verify key. Check it is correct and try again.' });
      return;
    }

    await this.secrets.store(PLATFORM_KEY_SECRET, key);
    this.post({ type: 'account_updated', account });
    await this.loadMemories();
  }

  private async fetchAccount(platformKey: string): Promise<AccountInfo | null> {
    try {
      const res = await apiFetch('/account-info', { platformKey });
      if (!res.ok) return null;
      return res.data as AccountInfo;
    } catch {
      return null;
    }
  }

  private async refreshAccount(): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;
    const account = await this.fetchAccount(platformKey);
    if (account) {
      this.post({ type: 'account_updated', account });
    }
  }

  private async updateName(name: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;
    try {
      const res = await apiFetch('/account-info', { method: 'PATCH', body: { name }, platformKey });
      if (res.ok) {
        // Re-fetch account to get updated data and push to webview
        const account = await this.fetchAccount(platformKey);
        if (account) {
          this.post({ type: 'account_updated', account });
        }
      } else {
        this.post({ type: 'error', message: 'Failed to update name.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to update name.' });
    }
  }

  // ─── Memories ──────────────────────────────────────────────────────────────

  private memoryOffset = 0;

  private async loadMemories(): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      this.memoryOffset = 0;
      const res = await apiFetch('/memories?limit=100&offset=0', { platformKey });
      if (res.ok) {
        const body = res.data as { memories?: never[]; total?: number; hasMore?: boolean } | never[];
        const memories = Array.isArray(body) ? body : (body.memories || []);
        const total = Array.isArray(body) ? memories.length : (body.total || memories.length);
        const hasMore = Array.isArray(body) ? false : (body.hasMore || false);
        this.memoryOffset = memories.length;
        this.post({ type: 'memories_loaded', memories, total, hasMore });
      }
    } catch {
      // Non-fatal: just leave memories empty
    }
  }

  private async loadMoreMemories(): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch(`/memories?limit=100&offset=${this.memoryOffset}`, { platformKey });
      if (res.ok) {
        const body = res.data as { memories?: never[]; total?: number; hasMore?: boolean } | never[];
        const memories = Array.isArray(body) ? body : (body.memories || []);
        const total = Array.isArray(body) ? memories.length : (body.total || memories.length);
        const hasMore = Array.isArray(body) ? false : (body.hasMore || false);
        this.memoryOffset += memories.length;
        this.post({ type: 'memories_more_loaded', memories, total, hasMore });
      }
    } catch {
      // silent
    }
  }

  private async deleteMemory(id: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch(`/memories/${id}`, { method: 'DELETE', platformKey });
      if (res.ok) {
        this.post({ type: 'memory_deleted', id });
      } else {
        this.post({ type: 'error', message: 'Failed to delete memory.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to delete memory.' });
    }
  }

  private async upsertMemory(msg: Extract<DashboardToExtMessage, { type: 'upsert_memory' }>): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const path = msg.id ? `/memories/${msg.id}` : '/memories';
      const method = msg.id ? 'PATCH' : 'POST';
      const body = msg.id
        ? { content: msg.content }
        : { scope: msg.scope ?? 'global', key: msg.key ?? '', content: msg.content, category: msg.category ?? null };

      const res = await apiFetch(path, { method, body, platformKey });
      if (res.ok) {
        this.post({ type: 'memory_upserted', memory: res.data as never });
      } else {
        this.post({ type: 'error', message: 'Failed to save memory.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to save memory.' });
    }
  }

  private async archiveMemory(id: string, archived: boolean): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch(`/memories/${id}`, { method: 'PATCH', body: { archived }, platformKey });
      if (res.ok) {
        this.post({ type: 'memory_upserted', memory: res.data as never });
      } else {
        this.post({ type: 'error', message: `Failed to ${archived ? 'archive' : 'restore'} memory.` });
      }
    } catch {
      this.post({ type: 'error', message: `Failed to ${archived ? 'archive' : 'restore'} memory.` });
    }
  }

  // ─── Connections ───────────────────────────────────────────────────────────

  private async getConnectionStatus(): Promise<ConnectionStatus> {
    const status: ConnectionStatus = { github: false, email: false, slack: false, discord: false };
    for (const service of Object.keys(status) as Array<keyof ConnectionStatus>) {
      const secrets = CONNECTION_SECRETS[service] ?? [];
      const first = secrets[0] ? await this.secrets.get(secrets[0]) : undefined;
      status[service] = Boolean(first);
    }
    return status;
  }

  private async saveConnection(
    service: 'github' | 'email' | 'slack' | 'discord',
    credentials: Record<string, string>,
  ): Promise<void> {
    const secretKeys = CONNECTION_SECRETS[service] ?? [];

    // Empty credentials = disconnect
    if (Object.keys(credentials).length === 0) {
      for (const key of secretKeys) {
        await this.secrets.delete(key);
      }
      this.post({ type: 'connection_removed', service });
      return;
    }

    // Store each field in SecretStorage
    for (const key of secretKeys) {
      const field = key.split('.').pop() ?? key; // e.g. "token", "host", "pass"
      const val = credentials[field];
      if (val) {
        await this.secrets.store(key, val);
      }
    }

    this.post({ type: 'connection_saved', service });
  }

  private async removeConnection(service: string): Promise<void> {
    const secretKeys = CONNECTION_SECRETS[service] ?? [];
    for (const key of secretKeys) {
      await this.secrets.delete(key);
    }
    this.post({ type: 'connection_removed', service });
  }

  // ─── Usage Logs ──────────────────────────────────────────────────────────

  private async loadUsageLogs(period: '7d' | '30d' | 'all'): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch(`/usage-logs?period=${period}`, { platformKey });
      if (res.ok && typeof res.data === 'object' && res.data && 'logs' in res.data) {
        this.post({ type: 'usage_logs_loaded', logs: (res.data as { logs: UsageLogEntry[] }).logs });
      } else {
        this.post({ type: 'usage_logs_loaded', logs: [] });
      }
    } catch {
      this.post({ type: 'usage_logs_loaded', logs: [] });
    }
  }

  // ─── Usage History (All-Time Analytics) ──────────────────────────────────────

  private async loadUsageHistory(): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'usage_history_loaded', data: null });
      return;
    }

    try {
      // Use unified usage summary API — single source of truth
      const res = await apiFetch('/usage/summary', { platformKey });
      if (!res.ok || !res.data) {
        this.post({ type: 'usage_history_loaded', data: null });
        return;
      }

      const summary = res.data as {
        period: { tokens_used: number; tokens_limit: number | null; free_tokens_used: number; free_tokens_limit: number; requests_count: number };
        tier: string;
        isUnlimited: boolean;
        daily: Array<{ date: string; tokens: number }>;
        models: Array<{ model: string; total_tokens: number; request_count: number }>;
        totals: { tokens: number; requests: number; active_days: number };
      };

      const balance = {
        used: summary.period.tokens_used + summary.period.free_tokens_used,
        limit: (summary.period.tokens_limit ?? 0) + summary.period.free_tokens_limit,
        tier: summary.tier,
      };

      // Pad daily to 14 days
      const daily: Array<{ date: string; tokens: number }> = [];
      const dailyMap: Record<string, number> = {};
      for (const d of summary.daily) dailyMap[d.date] = d.tokens;
      const now = new Date();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        daily.push({ date: dateStr, tokens: dailyMap[dateStr] ?? 0 });
      }

      const topModels = summary.models.map(m => ({ model: m.model, tokens: m.total_tokens }));
      const monthTotal = summary.totals.tokens;

      this.post({
        type: 'usage_history_loaded',
        data: {
          balance,
          daily,
          sessions: [],
          monthTotal,
          lastMonthTotal: 0,
          topModels,
          avgPerSession: 0,
          totalSessions: summary.totals.requests,
        },
      });
    } catch {
      this.post({ type: 'usage_history_loaded', data: null });
    }
  }

  // ─── Billing ───────────────────────────────────────────────────────────────

  private async openCheckout(plan: 'pro' | 'ultra'): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'error', message: 'Please connect your account first.' });
      return;
    }

    try {
      const res = await apiFetch('/billing/checkout', { method: 'POST', body: { plan }, platformKey });
      if (res.ok && typeof res.data === 'object' && res.data && 'url' in res.data) {
        const uri = vscode.Uri.parse((res.data as { url: string }).url);
        if (uri.scheme !== 'https') { this.post({ type: 'error', message: 'Invalid checkout URL.' }); return; }
        vscode.env.openExternal(uri);
      } else {
        this.post({ type: 'error', message: 'Failed to create checkout session.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to create checkout session.' });
    }
  }

  private async openTopup(pkg: 'starter' | 'standard' | 'pro_pack'): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'error', message: 'Please connect your account first.' });
      return;
    }

    try {
      const res = await apiFetch('/billing/topup', { method: 'POST', body: { package: pkg }, platformKey });
      if (res.ok && typeof res.data === 'object' && res.data && 'url' in res.data) {
        const uri = vscode.Uri.parse((res.data as { url: string }).url);
        if (uri.scheme !== 'https') { this.post({ type: 'error', message: 'Invalid top-up URL.' }); return; }
        vscode.env.openExternal(uri);
      } else {
        this.post({ type: 'error', message: 'Failed to create top-up session.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to create top-up session.' });
    }
  }

  private async openPortal(): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'error', message: 'Please connect your account first.' });
      return;
    }

    try {
      const res = await apiFetch('/billing/portal', { method: 'POST', platformKey });
      if (res.ok && typeof res.data === 'object' && res.data && 'url' in res.data) {
        const uri = vscode.Uri.parse((res.data as { url: string }).url);
        if (uri.scheme !== 'https') { this.post({ type: 'error', message: 'Invalid portal URL.' }); return; }
        vscode.env.openExternal(uri);
      } else {
        this.post({ type: 'error', message: 'Failed to open billing portal.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to open billing portal.' });
    }
  }

  // ─── Provider Keys ────────────────────────────────────────────────────────

  private async getProviderKeyStatus(): Promise<ProviderKeyStatus> {
    return {
      anthropic: Boolean(await this.secrets.get(PROVIDER_KEY_SECRETS.anthropic)),
      deepseek: Boolean(await this.secrets.get(PROVIDER_KEY_SECRETS.deepseek)),
      kimi: Boolean(await this.secrets.get(PROVIDER_KEY_SECRETS.kimi)),
      glm: Boolean(await this.secrets.get(PROVIDER_KEY_SECRETS.glm)),
      qwen: Boolean(await this.secrets.get(PROVIDER_KEY_SECRETS.qwen)),
      mistral: Boolean(await this.secrets.get(PROVIDER_KEY_SECRETS.mistral)),
    };
  }

  private async saveProviderKey(
    provider: string,
    apiKey: string,
  ): Promise<void> {
    const secretKey = PROVIDER_KEY_SECRETS[provider];
    if (secretKey) {
      await this.secrets.store(secretKey, apiKey);
    }
    this.post({ type: 'provider_keys_updated', providerKeys: await this.getProviderKeyStatus() });
  }

  private async removeProviderKey(
    provider: string,
  ): Promise<void> {
    const secretKey = PROVIDER_KEY_SECRETS[provider];
    if (secretKey) {
      await this.secrets.delete(secretKey);
    }
    this.post({ type: 'provider_keys_updated', providerKeys: await this.getProviderKeyStatus() });
  }

  // ─── Conversations (History) ────────────────────────────────────────────────

  private async loadConversations(): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'conversations_loaded', conversations: [] });
      return;
    }

    try {
      const res = await apiFetch('/conversations', { platformKey });
      this.post({ type: 'conversations_loaded', conversations: res.ok ? (res.data as never[]) : [] });
    } catch {
      this.post({ type: 'conversations_loaded', conversations: [] });
    }
  }

  private async deleteConversation(id: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch(`/conversations/${id}`, { method: 'DELETE', platformKey });
      if (res.ok) {
        this.post({ type: 'conversation_deleted', id });
      } else {
        this.post({ type: 'error', message: 'Failed to delete conversation.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to delete conversation.' });
    }
  }

  private async togglePinConversation(id: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch(`/conversations/${id}/pin`, { method: 'POST', platformKey });
      if (res.ok) {
        const data = res.data as { pinned: boolean };
        this.post({ type: 'conversation_pinned', id, pinned: data.pinned });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to update conversation.' });
    }
  }

  // ─── Support Tickets ──────────────────────────────────────────────────────

  private async loadTickets(): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'tickets_loaded', tickets: [] });
      return;
    }

    try {
      const res = await apiFetch('/support', { platformKey });
      this.post({ type: 'tickets_loaded', tickets: res.ok ? (res.data as never[]) : [] });
    } catch {
      this.post({ type: 'tickets_loaded', tickets: [] });
    }
  }

  private async createSupportTicket(subject: string, message: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch('/support', {
        method: 'POST',
        body: { subject, message, source: 'dashboard' },
        platformKey,
      });
      if (res.ok) {
        this.post({ type: 'ticket_created', ticket: res.data as never });
      } else {
        this.post({ type: 'error', message: 'Failed to create ticket.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to create ticket.' });
    }
  }

  private async replySupportTicket(ticketId: string, message: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch(`/support/${ticketId}/reply`, {
        method: 'POST',
        body: { message },
        platformKey,
      });
      if (res.ok) {
        this.post({ type: 'ticket_reply_sent', ticketId });
      } else {
        this.post({ type: 'error', message: 'Failed to send reply.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to send reply.' });
    }
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  private async loadAdminTickets(status?: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'admin_tickets_loaded', tickets: [], total: 0 });
      return;
    }

    try {
      const params = status ? `?status=${status}` : '';
      const res = await apiFetch(`/admin/support${params}`, { platformKey });
      if (res.ok) {
        const data = res.data as { tickets: never[]; total: number };
        this.post({ type: 'admin_tickets_loaded', tickets: data.tickets || [], total: data.total || 0 });
      } else {
        this.post({ type: 'admin_tickets_loaded', tickets: [], total: 0 });
      }
    } catch {
      this.post({ type: 'admin_tickets_loaded', tickets: [], total: 0 });
    }
  }

  private async adminReplyTicket(ticketId: string, message: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch(`/admin/support/${ticketId}/reply`, {
        method: 'POST',
        body: { message },
        platformKey,
      });
      if (!res.ok) {
        this.post({ type: 'error', message: 'Failed to send admin reply.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to send admin reply.' });
    }
  }

  private async adminUpdateTicket(ticketId: string, status: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      await apiFetch(`/admin/support/${ticketId}`, {
        method: 'PATCH',
        body: { status },
        platformKey,
      });
    } catch {
      this.post({ type: 'error', message: 'Failed to update ticket.' });
    }
  }

  private async loadAdminProposals(status?: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'admin_proposals_loaded', proposals: [], total: 0 });
      return;
    }

    try {
      const params = status ? `?status=${status}` : '';
      const res = await apiFetch(`/admin/tool-proposals${params}`, { platformKey });
      if (res.ok) {
        const data = res.data as { proposals: never[]; total: number };
        this.post({ type: 'admin_proposals_loaded', proposals: data.proposals || [], total: data.total || 0 });
      } else {
        this.post({ type: 'admin_proposals_loaded', proposals: [], total: 0 });
      }
    } catch {
      this.post({ type: 'admin_proposals_loaded', proposals: [], total: 0 });
    }
  }

  private async adminUpdateProposal(id: string, status: string, reviewerNotes?: string, rewardTokens?: number): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch('/admin/tool-proposals', {
        method: 'PATCH',
        body: { id, status, reviewer_notes: reviewerNotes, reward_tokens: rewardTokens },
        platformKey,
      });
      if (res.ok) {
        this.post({ type: 'admin_proposal_updated' });
      } else {
        this.post({ type: 'error', message: 'Failed to update proposal.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to update proposal.' });
    }
  }

  // ─── Local Memories (BYOK) ──────────────────────────────────────────────────

  private getMemoryManager(): MemoryManager {
    if (!this.memoryManager) {
      const globalDir = AVA_HOME ?? path.join(os.homedir(), '.ava');
      const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      this.memoryManager = new MemoryManager({ globalDir, projectRoot });
    }
    return this.memoryManager;
  }

  private coreToDisplayEntry(entry: CoreMemoryEntry, scope: 'global' | 'project'): MemoryEntry {
    return {
      id: entry.id,
      scope,
      project_id: null,
      key: entry.content.slice(0, 50).replace(/\n/g, ' '),
      content: entry.content,
      category: entry.category,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
      last_recalled_at: entry.lastRecalledAt ?? null,
      recall_count: entry.recallCount,
      tags: entry.tags,
      archived: entry.archived,
      archived_at: entry.archivedAt ?? null,
      branch: entry.branch ?? null,
      directory_scope: entry.directoryScope ?? null,
    };
  }

  private async loadLocalMemories(): Promise<void> {
    try {
      const mgr = this.getMemoryManager();
      const globalStore = await mgr.loadGlobalStore();
      const projectStore = await mgr.loadProjectStore();

      const memories: MemoryEntry[] = [
        ...globalStore.entries.map(e => this.coreToDisplayEntry(e, 'global')),
        ...(projectStore?.entries ?? []).map(e => this.coreToDisplayEntry(e, 'project')),
      ];

      this.post({ type: 'local_memories_loaded', memories });
    } catch {
      this.post({ type: 'local_memories_loaded', memories: [] });
    }
  }

  private async deleteLocalMemory(id: string): Promise<void> {
    try {
      const mgr = this.getMemoryManager();
      // Try global first, then project
      const deleted = await mgr.deleteEntry('global', id) || await mgr.deleteEntry('project', id);
      if (deleted) {
        this.post({ type: 'local_memory_deleted', id });
      } else {
        this.post({ type: 'error', message: 'Memory not found.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to delete memory.' });
    }
  }

  private async upsertLocalMemory(msg: { id?: string; content: string; category?: string | null }): Promise<void> {
    try {
      const mgr = this.getMemoryManager();
      if (msg.id) {
        const updated = await mgr.updateEntry('global', msg.id, { content: msg.content })
          ?? await mgr.updateEntry('project', msg.id, { content: msg.content });
        if (updated) {
          this.post({ type: 'local_memory_upserted', memory: this.coreToDisplayEntry(updated, 'global') });
        } else {
          this.post({ type: 'error', message: 'Memory not found.' });
        }
      } else {
        const entry = await mgr.saveEntry({
          scope: 'global',
          content: msg.content,
          category: (msg.category as CoreMemoryEntry['category']) ?? 'general',
        });
        this.post({ type: 'local_memory_upserted', memory: this.coreToDisplayEntry(entry, 'global') });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to save memory.' });
    }
  }

  private async archiveLocalMemory(id: string, archived: boolean): Promise<void> {
    try {
      const mgr = this.getMemoryManager();
      // Load stores and find the entry
      const globalStore = await mgr.loadGlobalStore();
      let entry = globalStore.entries.find(e => e.id === id);
      let scope: 'global' | 'project' = 'global';

      if (!entry) {
        const projectStore = await mgr.loadProjectStore();
        entry = projectStore?.entries.find(e => e.id === id);
        scope = 'project';
      }

      if (!entry) {
        this.post({ type: 'error', message: 'Memory not found.' });
        return;
      }

      // Toggle archived state and trigger save via updateEntry
      entry.archived = archived;
      entry.archivedAt = archived ? new Date().toISOString() : null;
      await mgr.updateEntry(scope, id, { content: entry.content });
      this.post({ type: 'local_memory_upserted', memory: this.coreToDisplayEntry(entry, scope) });
    } catch {
      this.post({ type: 'error', message: `Failed to ${archived ? 'archive' : 'restore'} memory.` });
    }
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  private getSessionTasks(): Array<{ id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }> {
    try {
      const mgr = this.getTaskManager();
      return mgr.getSessionTasks().map(t => ({
        id: t.id,
        title: t.title,
        status: t.status === 'done' ? 'completed' as const : t.status === 'in-progress' ? 'in_progress' as const : 'pending' as const,
      }));
    } catch {
      return [];
    }
  }

  private getTaskManager(): TaskManager {
    if (!this.taskManager) {
      const globalDir = AVA_HOME ?? path.join(os.homedir(), '.ava');
      const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      this.taskManager = new TaskManager({ globalDir, projectRoot });
    }
    return this.taskManager;
  }

  private coreToDisplayTask(entry: CoreTaskEntry): DashboardTaskEntry {
    return {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      priority: entry.priority,
      status: entry.status,
      due_date: entry.dueDate,
      category: entry.category,
      source: entry.source,
      project: entry.project,
      recurrence: entry.recurrence,
      subtasks: entry.subtasks,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
      completed_at: entry.completedAt,
    };
  }

  private async loadTasks(): Promise<void> {
    try {
      const mgr = this.getTaskManager();
      const tasks = await mgr.listTasks({ includeArchived: true });
      this.post({ type: 'tasks_loaded', tasks: tasks.map(t => this.coreToDisplayTask(t)) });
    } catch {
      this.post({ type: 'tasks_loaded', tasks: [] });
    }
  }

  private async loadLearning(): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const learningPath = path.join(AVA_HOME, 'learning.json');
      const raw = await fs.readFile(learningPath, 'utf-8');
      const store = JSON.parse(raw);
      const curriculums = Array.isArray(store.curriculums) ? store.curriculums : [];
      this.post({ type: 'learning_loaded', curriculums });
    } catch {
      this.post({ type: 'learning_loaded', curriculums: [] });
    }
  }

  private async deleteCurriculum(id: string): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const learningPath = path.join(AVA_HOME, 'learning.json');
      const raw = await fs.readFile(learningPath, 'utf-8');
      const store = JSON.parse(raw);
      if (Array.isArray(store.curriculums)) {
        store.curriculums = store.curriculums.filter((c: { id: string }) => c.id !== id);
        await fs.writeFile(learningPath, JSON.stringify(store, null, 2), 'utf-8');
      }
      this.post({ type: 'curriculum_deleted', id });
    } catch {
      this.post({ type: 'error', message: 'Failed to delete curriculum.' });
    }
  }

  private async createTask(msg: { title: string; description?: string; priority?: string; category?: string; due_date?: string; recurrence?: string }): Promise<void> {
    try {
      const mgr = this.getTaskManager();
      const entry = await mgr.addTask({
        title: msg.title,
        description: msg.description,
        priority: (msg.priority as CoreTaskEntry['priority']) ?? 'medium',
        category: (msg.category as CoreTaskEntry['category']) ?? 'coding',
        dueDate: msg.due_date,
        recurrence: (msg.recurrence as CoreTaskEntry['recurrence']) ?? 'none',
        scope: 'project',
      });
      this.post({ type: 'task_upserted', task: this.coreToDisplayTask(entry) });
    } catch {
      this.post({ type: 'error', message: 'Failed to create task.' });
    }
  }

  private async updateTaskEntry(msg: { id: string; title?: string; description?: string; priority?: string; status?: string; category?: string; due_date?: string; recurrence?: string; subtasks?: { id: string; title: string; done: boolean }[] }): Promise<void> {
    try {
      const mgr = this.getTaskManager();
      const updates: Record<string, unknown> = {};
      if (msg.title !== undefined) updates.title = msg.title;
      if (msg.description !== undefined) updates.description = msg.description;
      if (msg.priority !== undefined) updates.priority = msg.priority;
      if (msg.status !== undefined) updates.status = msg.status;
      if (msg.category !== undefined) updates.category = msg.category;
      if (msg.due_date !== undefined) updates.dueDate = msg.due_date;
      if (msg.recurrence !== undefined) updates.recurrence = msg.recurrence;
      if (msg.subtasks !== undefined) updates.subtasks = msg.subtasks;

      const entry = await mgr.updateTask(msg.id, updates as Parameters<TaskManager['updateTask']>[1]);
      if (entry) {
        this.post({ type: 'task_upserted', task: this.coreToDisplayTask(entry) });
      } else {
        this.post({ type: 'error', message: 'Task not found.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to update task.' });
    }
  }

  private async deleteTaskEntry(id: string): Promise<void> {
    try {
      const mgr = this.getTaskManager();
      const deleted = await mgr.deleteTask(id);
      if (deleted) {
        this.post({ type: 'task_deleted', id });
      } else {
        this.post({ type: 'error', message: 'Task not found.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to delete task.' });
    }
  }

  private async completeTaskEntry(id: string): Promise<void> {
    try {
      const mgr = this.getTaskManager();
      const entry = await mgr.completeTask(id);
      if (entry) {
        this.post({ type: 'task_upserted', task: this.coreToDisplayTask(entry) });
      } else {
        this.post({ type: 'error', message: 'Task not found.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to complete task.' });
    }
  }

  private async archiveTaskEntry(id: string): Promise<void> {
    try {
      const mgr = this.getTaskManager();
      const entry = await mgr.archiveTask(id);
      if (entry) {
        this.post({ type: 'task_upserted', task: this.coreToDisplayTask(entry) });
      } else {
        this.post({ type: 'error', message: 'Task not found.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to archive task.' });
    }
  }

  private async restoreTaskEntry(id: string): Promise<void> {
    try {
      const mgr = this.getTaskManager();
      const entry = await mgr.restoreTask(id);
      if (entry) {
        this.post({ type: 'task_upserted', task: this.coreToDisplayTask(entry) });
      } else {
        this.post({ type: 'error', message: 'Task not found.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to restore task.' });
    }
  }

  // ─── Journal ───────────────────────────────────────────────────────────────

  private getJournalManager(): JournalManager {
    if (!this.journalManager) {
      const globalDir = AVA_HOME ?? path.join(os.homedir(), '.ava');
      const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      this.journalManager = new JournalManager({ globalDir, projectRoot });
    }
    return this.journalManager;
  }

  private coreToDisplayDay(day: JournalDay) {
    return {
      date: day.date,
      user_entry: day.userEntry ? {
        content: day.userEntry.content,
        mood: day.userEntry.mood,
        tags: day.userEntry.tags,
        created_at: day.userEntry.createdAt,
        updated_at: day.userEntry.updatedAt,
      } : null,
      ava_entry: day.avaEntry ? {
        content: day.avaEntry.content,
        mood: day.avaEntry.mood,
        tags: day.avaEntry.tags,
        created_at: day.avaEntry.createdAt,
        updated_at: day.avaEntry.updatedAt,
      } : null,
    };
  }

  private async loadJournalDay(date: string): Promise<void> {
    try {
      const mgr = this.getJournalManager();
      const day = await mgr.getDay(date);
      if (day) {
        this.post({ type: 'journal_day_loaded', day: this.coreToDisplayDay(day) });
      } else {
        this.post({ type: 'journal_day_loaded', day: { date, user_entry: null, ava_entry: null } });
      }
    } catch {
      this.post({ type: 'journal_day_loaded', day: { date, user_entry: null, ava_entry: null } });
    }
  }

  private async loadJournalSummaries(from: string, to: string): Promise<void> {
    try {
      const mgr = this.getJournalManager();
      const summaries = await mgr.getDaySummaries(from, to);
      this.post({
        type: 'journal_summaries_loaded',
        summaries: summaries.map(s => ({
          date: s.date,
          has_user_entry: s.hasUserEntry,
          has_ava_entry: s.hasAvaEntry,
          mood: s.mood,
        })),
      });
    } catch {
      this.post({ type: 'journal_summaries_loaded', summaries: [] });
    }
  }

  private async saveJournalUserEntry(date: string, content: string, mood?: number, tags?: string[]): Promise<void> {
    try {
      const mgr = this.getJournalManager();
      const day = await mgr.writeUserEntry(date, content, mood as 1 | 2 | 3 | 4 | 5 | undefined, tags);
      this.post({ type: 'journal_day_updated', day: this.coreToDisplayDay(day) });
    } catch {
      this.post({ type: 'error', message: 'Failed to save journal entry.' });
    }
  }

  private async deleteJournalEntry(date: string, target: 'user' | 'ava'): Promise<void> {
    try {
      const mgr = this.getJournalManager();
      const day = target === 'user'
        ? await mgr.deleteUserEntry(date)
        : await mgr.deleteAvaEntry(date);
      this.post({ type: 'journal_day_updated', day: this.coreToDisplayDay(day) });
    } catch {
      this.post({ type: 'error', message: `Failed to delete ${target} journal entry.` });
    }
  }

  // ─── Cloud Sync (user-initiated push) ──────────────────────────────────────

  private async loadReleases(): Promise<void> {
    try {
      const https = await import('node:https');
      const releases = await new Promise<unknown[]>((resolve) => {
        https.get('https://ava-supernova.com/api/releases', (res) => {
          let raw = '';
          res.on('data', (chunk: string) => (raw += chunk));
          res.on('end', () => {
            try {
              const data = JSON.parse(raw);
              resolve(Array.isArray(data) ? data : []);
            } catch {
              resolve([]);
            }
          });
        }).on('error', () => resolve([]));
      });
      this.post({ type: 'releases_loaded', releases });
    } catch {
      this.post({ type: 'releases_loaded', releases: [] });
    }
  }

  // ─── Library (project files — images, documents, spreadsheets, presentations) ─

  private async loadLibraryFiles(): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        this.post({ type: 'library_loaded', images: [], projectRoot: '' });
        return;
      }

      const projectRoot = workspaceFolders[0].uri.fsPath;
      const imagesDir = path.join(projectRoot, 'images');
      const docsDir = path.join(projectRoot, 'documents');

      const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp']);
      const DOCUMENT_EXTENSIONS = new Set(['.docx', '.doc', '.pdf', '.txt', '.md', '.rtf']);
      const SPREADSHEET_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);
      const PRESENTATION_EXTENSIONS = new Set(['.pptx', '.ppt']);

      type FileType = 'image' | 'document' | 'spreadsheet' | 'presentation';

      const getFileType = (ext: string): FileType | null => {
        if (IMAGE_EXTENSIONS.has(ext)) return 'image';
        if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';
        if (SPREADSHEET_EXTENSIONS.has(ext)) return 'spreadsheet';
        if (PRESENTATION_EXTENSIONS.has(ext)) return 'presentation';
        return null;
      };

      const ALL_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS, ...SPREADSHEET_EXTENSIONS, ...PRESENTATION_EXTENSIONS]);

      const files: Array<{ path: string; name: string; folder: string; size: number; modified: string; fileType: FileType; dataUri?: string }> = [];

      // Recursive scan
      const scan = async (dir: string) => {
        let entries;
        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          return; // Directory doesn't exist or not readable
        }

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            // Skip node_modules, .git, etc.
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            await scan(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (!ALL_EXTENSIONS.has(ext)) continue;

            const fileType = getFileType(ext);
            if (!fileType) continue;

            const stat = await fs.stat(fullPath).catch(() => null);
            if (!stat) continue;

            const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');
            const relativeFolder = path.relative(projectRoot, dir).replace(/\\/g, '/');

            const item: typeof files[number] = {
              path: relativePath,
              name: entry.name,
              folder: relativeFolder || (dir === imagesDir ? 'images' : 'documents'),
              size: stat.size,
              modified: stat.mtime.toISOString(),
              fileType,
            };

            // Only send base64 data for images (with 5MB limit)
            if (fileType === 'image') {
              if (stat.size > 5 * 1024 * 1024) continue;
              const fileBuffer = await fs.readFile(fullPath);
              const mimeTypes: Record<string, string> = {
                '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
                '.ico': 'image/x-icon', '.bmp': 'image/bmp',
              };
              const mime = mimeTypes[ext] || 'image/png';
              item.dataUri = `data:${mime};base64,${fileBuffer.toString('base64')}`;
            }

            files.push(item);
          }
        }
      };

      // Check if folders exist
      const imagesDirExists = await fs.access(imagesDir).then(() => true).catch(() => false);
      const docsDirExists = await fs.access(docsDir).then(() => true).catch(() => false);
      const hasFolders = imagesDirExists || docsDirExists;

      // Scan both images/ and documents/ directories
      await scan(imagesDir);
      await scan(docsDir);

      // Sort newest first
      files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

      this.post({ type: 'library_loaded', images: files, projectRoot, hasFolder: hasFolders });
    } catch {
      this.post({ type: 'library_loaded', images: [], projectRoot: '' });
    }
  }

  private async deleteLibraryImage(relativePath: string): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) return;

      const fullPath = path.join(workspaceFolders[0].uri.fsPath, relativePath);
      await fs.unlink(fullPath);
      this.post({ type: 'library_image_deleted', path: relativePath });
    } catch (err) {
      this.post({ type: 'error', message: `Failed to delete image: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  private async openLibraryImage(relativePath: string): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const fullPath = path.join(workspaceFolders[0].uri.fsPath, relativePath);
    const uri = vscode.Uri.file(fullPath);
    await vscode.commands.executeCommand('vscode.open', uri);
  }

  // ─── Personality ──────────────────────────────────────────────────────────

  private async handleLoadPersonality(): Promise<void> {
    try {
      const avaDir = path.join(os.homedir(), '.ava');
      const personality = await loadPersonality(avaDir);
      this.post({
        type: 'personality_loaded',
        personality: {
          name: personality.name,
          pronouns: personality.pronouns,
          tone: personality.tone,
          energy: personality.energy,
          style: personality.style,
          description: personality.description || '',
        },
      });
    } catch {
      this.post({ type: 'error', message: 'Failed to load personality.' });
    }
  }

  private async handleSavePersonality(data: Personality): Promise<void> {
    try {
      const avaDir = path.join(os.homedir(), '.ava');
      await savePersonality(avaDir, data);
      this.post({ type: 'personality_saved' });
    } catch {
      this.post({ type: 'error', message: 'Failed to save personality.' });
    }
  }

  private async handleResetPersonality(): Promise<void> {
    try {
      const avaDir = path.join(os.homedir(), '.ava');
      const personality = await resetPersonality(avaDir);
      this.post({
        type: 'personality_reset',
        personality: {
          name: personality.name,
          pronouns: personality.pronouns,
          tone: personality.tone,
          energy: personality.energy,
          style: personality.style,
          description: personality.description || '',
        },
      });
    } catch {
      this.post({ type: 'error', message: 'Failed to reset personality.' });
    }
  }

  // ─── Avatar (local file in ~/.ava/) ──────────────────────────────────────────

  private async saveAvatar(dataUrl: string, _mimeType: string): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const avaDir = path.join(os.homedir(), '.ava');
      await fs.mkdir(avaDir, { recursive: true });
      // Save data URL as-is (small file, base64 is fine for local)
      await fs.writeFile(path.join(avaDir, 'avatar.dat'), dataUrl, 'utf-8');
      this.post({ type: 'avatar_saved', dataUrl });
    } catch {
      this.post({ type: 'error', message: 'Failed to save avatar.' });
    }
  }

  private async removeAvatar(): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      await fs.unlink(path.join(os.homedir(), '.ava', 'avatar.dat')).catch(() => {});
      this.post({ type: 'avatar_removed' });
    } catch {
      this.post({ type: 'error', message: 'Failed to remove avatar.' });
    }
  }

  private async loadAvatar(): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const dataUrl = await fs.readFile(path.join(os.homedir(), '.ava', 'avatar.dat'), 'utf-8');
      if (dataUrl.startsWith('data:image/')) {
        this.post({ type: 'avatar_loaded', dataUrl });
      }
    } catch {
      // No avatar file — silent
    }
  }

  private async loadSyncState(): Promise<Record<string, { syncedCount: number; syncedAt: string }>> {
    const fs = await import('node:fs/promises');
    try {
      const raw = await fs.readFile(path.join(AVA_HOME, 'sync-state.json'), 'utf-8');
      return JSON.parse(raw);
    } catch { return {}; }
  }

  private async saveSyncState(dataType: string, count: number): Promise<void> {
    const fs = await import('node:fs/promises');
    const state = await this.loadSyncState();
    state[dataType] = { syncedCount: count, syncedAt: new Date().toISOString() };
    await fs.writeFile(path.join(AVA_HOME, 'sync-state.json'), JSON.stringify(state, null, 2));
  }

  private async loadSyncStatus(): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    const fs = await import('node:fs/promises');
    const syncState = await this.loadSyncState();
    const data: Record<string, { available: boolean; lastSynced: string | null; localCount: number; syncedCount: number; newCount: number }> = {};

    const types = ['memory', 'tasks', 'journal', 'learning', 'history', 'settings', 'personality'] as const;
    for (const t of types) {
      let localCount = 0;
      try {
        const filePath = t === 'memory' ? path.join(AVA_HOME, 'memory.json')
          : t === 'tasks' ? path.join(AVA_HOME, 'tasks.json')
          : t === 'journal' ? path.join(AVA_HOME, 'journal')
          : t === 'learning' ? path.join(AVA_HOME, 'learning.json')
          : t === 'history' ? path.join(AVA_HOME, 'history')
          : t === 'personality' ? path.join(AVA_HOME, 'personality.json')
          : path.join(AVA_HOME, 'config.json');

        if (t === 'journal' || t === 'history') {
          const entries = await fs.readdir(filePath).catch(() => []);
          localCount = entries.filter((f: string) => f.endsWith('.json')).length;
        } else {
          const raw = await fs.readFile(filePath, 'utf-8');
          const parsed = JSON.parse(raw);
          if (t === 'memory') localCount = parsed.entries?.length ?? 0;
          else if (t === 'tasks') localCount = parsed.tasks?.length ?? 0;
          else if (t === 'learning') localCount = parsed.curriculums?.length ?? 0;
          else localCount = 1;
        }
      } catch { /* file doesn't exist yet */ }

      const synced = syncState[t];
      const syncedCount = synced?.syncedCount ?? 0;
      const newCount = Math.max(0, localCount - syncedCount);

      data[t] = {
        available: !!platformKey,
        lastSynced: synced?.syncedAt ?? null,
        localCount,
        syncedCount,
        newCount,
      };
    }

    this.post({ type: 'sync_status', data });
  }

  private async pushToCloud(dataType: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'sync_error', dataType, message: 'No platform account connected. Connect an account first.' });
      return;
    }

    this.post({ type: 'sync_started', dataType });
    const fs = await import('node:fs/promises');

    try {
      switch (dataType) {
        case 'memory': {
          const { PlatformMemorySync } = await import('@ava/core');
          const sync = new PlatformMemorySync('https://ava-supernova.com/api', platformKey);
          const raw = await fs.readFile(path.join(AVA_HOME, 'memory.json'), 'utf-8');
          const store = JSON.parse(raw);
          const entries = store.entries || [];
          await sync.pushEntries('global', entries);
          await this.saveSyncState('memory', entries.length);
          this.post({ type: 'sync_completed', dataType, count: entries.length });
          await this.loadSyncStatus();
          break;
        }

        case 'tasks': {
          const raw = await fs.readFile(path.join(AVA_HOME, 'tasks.json'), 'utf-8');
          const store = JSON.parse(raw);
          const tasks = store.tasks || [];
          const res = await apiFetch('/tasks/sync', {
            platformKey,
            method: 'POST',
            body: { tasks },
          });
          if (!res.ok) throw new Error('Failed to sync tasks');
          await this.saveSyncState('tasks', tasks.length);
          this.post({ type: 'sync_completed', dataType, count: tasks.length });
          await this.loadSyncStatus();
          break;
        }

        case 'journal': {
          const journalDir = path.join(AVA_HOME, 'journal');
          const files = await fs.readdir(journalDir).catch(() => []);
          let count = 0;
          for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
              const raw = await fs.readFile(path.join(journalDir, file), 'utf-8');
              const day = JSON.parse(raw);
              await apiFetch('/journal', {
                platformKey,
                method: 'POST',
                body: {
                  date: day.date,
                  user_content: day.userEntry?.content ?? null,
                  user_mood: day.userEntry?.mood ?? null,
                  user_tags: day.userEntry?.tags ?? [],
                  ava_content: day.avaEntry?.content ?? null,
                  ava_tags: day.avaEntry?.tags ?? [],
                },
              });
              count++;
            } catch { /* skip malformed */ }
          }
          await this.saveSyncState('journal', count);
          this.post({ type: 'sync_completed', dataType, count });
          await this.loadSyncStatus();
          break;
        }

        case 'learning': {
          const raw = await fs.readFile(path.join(AVA_HOME, 'learning.json'), 'utf-8');
          const store = JSON.parse(raw);
          const curriculums = store.curriculums || [];
          const res = await apiFetch('/learning/sync', {
            platformKey,
            method: 'POST',
            body: { curriculums },
          });
          if (!res.ok) throw new Error('Failed to sync learning data');
          await this.saveSyncState('learning', curriculums.length);
          this.post({ type: 'sync_completed', dataType, count: curriculums.length });
          await this.loadSyncStatus();
          break;
        }

        case 'history': {
          const historyDir = path.join(AVA_HOME, 'history');
          const files = await fs.readdir(historyDir).catch(() => []);
          const conversations = [];
          for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
              const raw = await fs.readFile(path.join(historyDir, file), 'utf-8');
              conversations.push(JSON.parse(raw));
            } catch { /* skip */ }
          }
          const res = await apiFetch('/history/sync', {
            platformKey,
            method: 'POST',
            body: { conversations },
          });
          if (!res.ok) throw new Error('Failed to sync chat history');
          await this.saveSyncState('history', conversations.length);
          this.post({ type: 'sync_completed', dataType, count: conversations.length });
          await this.loadSyncStatus();
          break;
        }

        case 'settings': {
          const settings = this.readSettings();
          const res = await apiFetch('/settings/sync', {
            platformKey,
            method: 'POST',
            body: { settings },
          });
          if (!res.ok) throw new Error('Failed to sync settings');
          await this.saveSyncState('settings', 1);
          this.post({ type: 'sync_completed', dataType, count: 1 });
          await this.loadSyncStatus();
          break;
        }

        case 'personality': {
          const avaDir = path.join(os.homedir(), '.ava');
          const personality = await loadPersonality(avaDir);
          const res = await apiFetch('/settings/sync', {
            platformKey,
            method: 'POST',
            body: { settings: { personality } },
          });
          if (!res.ok) throw new Error('Failed to sync personality');
          await this.saveSyncState('personality', 1);
          this.post({ type: 'sync_completed', dataType, count: 1 });
          await this.loadSyncStatus();
          break;
        }

        case 'learnings': {
          // Push local self-improvement entries to the shared global pool
          const siPath = path.join(this.avaHome, 'self-improvement.json');
          if (!fs.existsSync(siPath)) {
            this.post({ type: 'sync_completed', dataType, count: 0 });
            break;
          }
          const siData = JSON.parse(fs.readFileSync(siPath, 'utf-8'));
          const entries: any[] = Array.isArray(siData) ? siData : (siData.entries || []);
          // Only share safe types (no preferences, no code)
          const shareable = entries.filter((e: any) =>
            ['technique', 'tool-fix', 'error-recovery', 'pattern'].includes(e.type) &&
            e.confidence >= 0.5
          );
          let pushed = 0;
          for (const entry of shareable) {
            try {
              const res = await this.platformFetch('/learnings', {
                method: 'POST',
                body: JSON.stringify({
                  type: entry.type,
                  category: entry.category,
                  context: entry.context,
                  learned: entry.learned?.slice(0, 1000),
                  confidence: entry.confidence,
                }),
              });
              if (res.ok) pushed++;
            } catch { /* skip individual failures */ }
          }
          await this.saveSyncState('learnings', pushed);
          this.post({ type: 'sync_completed', dataType, count: pushed });
          await this.loadSyncStatus();
          break;
        }

        case 'profile': {
          // Upload local avatar to Supabase Storage + update users.avatar_url
          const avatarPath = path.join(os.homedir(), '.ava', 'avatar.dat');
          const avatarData = await fs.readFile(avatarPath, 'utf-8');
          if (!avatarData.startsWith('data:image/')) {
            this.post({ type: 'sync_error', dataType, message: 'No local avatar to sync.' });
            break;
          }
          // Parse data URL → binary
          const [header, base64] = avatarData.split(',');
          const mimeMatch = header.match(/data:(image\/\w+)/);
          const mime = mimeMatch?.[1] || 'image/png';
          const ext = mime.split('/')[1] || 'png';
          const buffer = Buffer.from(base64, 'base64');

          // Get user ID
          const { data: keyRow } = await apiFetch('/account-info', { platformKey });
          const userId = keyRow?.id;
          if (!userId) throw new Error('Could not determine user ID');

          // Upload via platform API (base64 body)
          const uploadRes = await apiFetch('/avatar/upload', {
            platformKey,
            method: 'POST',
            body: { avatar: avatarData, extension: ext },
          });
          if (!uploadRes.ok) {
            // Fallback: update avatar_url with data URL encoded (not ideal but works)
            // In practice, the platform should have an /avatar/upload endpoint
            // For now, just update the avatar_url directly
            throw new Error('Avatar sync not yet supported on the platform API');
          }
          await this.saveSyncState('profile', 1);
          this.post({ type: 'sync_completed', dataType, count: 1 });
          await this.loadSyncStatus();
          break;
        }

        default:
          this.post({ type: 'sync_error', dataType, message: `Unknown data type: ${dataType}` });
      }
    } catch (err) {
      this.post({ type: 'sync_error', dataType, message: err instanceof Error ? err.message : String(err) });
    }
  }

  // ─── Settings ──────────────────────────────────────────────────────────────

  private readSettings(): DashboardSettings {
    const cfg = vscode.workspace.getConfiguration('ava-supernova');
    return {
      language: cfg.get<string>('preferences.language') ?? 'auto',
      permissionMode: (cfg.get<string>('preferences.permissionMode') ?? 'strict') as DashboardSettings['permissionMode'],
      temperature: cfg.get<number>('preferences.temperature') ?? 0.7,
      maxTokens: cfg.get<number>('preferences.maxTokens') ?? 8192,
      activeModel: cfg.get<string>('activeModel') ?? '',
      autoMemory: cfg.get<boolean>('preferences.autoMemory') ?? true,
      memoryLocalOnly: cfg.get<boolean>('preferences.memoryLocalOnly') ?? false,
      contributeSharedLearning: cfg.get<boolean>('contributeSharedLearning') ?? false,
      streamResponses: cfg.get<boolean>('preferences.streamResponses') ?? true,
    };
  }

  private saveSettings(settings: DashboardSettings): void {
    const cfg = vscode.workspace.getConfiguration('ava-supernova');
    cfg.update('preferences.language', settings.language, vscode.ConfigurationTarget.Global);
    cfg.update('preferences.permissionMode', settings.permissionMode, vscode.ConfigurationTarget.Global);
    cfg.update('preferences.temperature', settings.temperature, vscode.ConfigurationTarget.Global);
    cfg.update('preferences.maxTokens', settings.maxTokens, vscode.ConfigurationTarget.Global);
    cfg.update('activeModel', settings.activeModel, vscode.ConfigurationTarget.Global);
    cfg.update('preferences.autoMemory', settings.autoMemory, vscode.ConfigurationTarget.Global);
    cfg.update('preferences.memoryLocalOnly', settings.memoryLocalOnly, vscode.ConfigurationTarget.Global);
    cfg.update('contributeSharedLearning', settings.contributeSharedLearning, vscode.ConfigurationTarget.Global);
    cfg.update('preferences.streamResponses', settings.streamResponses, vscode.ConfigurationTarget.Global);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private post(msg: ExtToDashboardMessage): void {
    this.panel.webview.postMessage(msg);
  }

  /** Notify dashboard that journal data changed (called from AvaViewProvider). */
  public notifyJournalUpdated(date: string): void {
    this.loadJournalDay(date);
  }

  /** Notify dashboard that session tasks changed (called from AvaViewProvider after todo_write). */
  public notifySessionTasksUpdated(tasks: Array<{ id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }>): void {
    this.post({ type: 'session_tasks_updated', tasks });
  }

  // ─── Overview Widgets (Weather, News, Release) ─────────────────────────────

  private static mapWmoCondition(code: number): { condition: string; emoji: string } {
    if (code === 0) return { condition: 'Clear', emoji: '\u2600\uFE0F' };
    if (code >= 1 && code <= 3) return { condition: 'Partly Cloudy', emoji: '\u26C5' };
    if (code >= 45 && code <= 48) return { condition: 'Foggy', emoji: '\uD83C\uDF2B\uFE0F' };
    if (code >= 51 && code <= 57) return { condition: 'Drizzle', emoji: '\uD83C\uDF27\uFE0F' };
    if (code >= 61 && code <= 67) return { condition: 'Rain', emoji: '\uD83C\uDF27\uFE0F' };
    if (code >= 71 && code <= 77) return { condition: 'Snow', emoji: '\u2744\uFE0F' };
    if (code >= 80 && code <= 82) return { condition: 'Showers', emoji: '\uD83C\uDF26\uFE0F' };
    if (code >= 95 && code <= 99) return { condition: 'Thunderstorm', emoji: '\u26C8\uFE0F' };
    return { condition: 'Cloudy', emoji: '\u2601\uFE0F' };
  }

  private async handleLoadWeather(): Promise<void> {
    // Return cached data if fresh
    if (this.weatherCache && Date.now() - this.weatherCache.timestamp < DashboardPanel.WEATHER_CACHE_TTL) {
      this.post(this.weatherCache.data);
      return;
    }

    try {
      // Step 1: Get location from IP (ipwho.is — free, HTTPS, no key)
      const geo = await httpGetJson('https://ipwho.is/') as { latitude: number; longitude: number; city: string; country: string; success: boolean };
      if (!geo.success || !geo.latitude) { this.post({ type: 'weather_loaded', data: null }); return; }

      // Step 2: Fetch weather from Open-Meteo
      const lat = geo.latitude;
      const lon = geo.longitude;
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`;
      const weather = await httpGetJson(weatherUrl) as {
        current: { temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number };
        daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
      };

      const currentCondition = DashboardPanel.mapWmoCondition(weather.current.weather_code);
      const location = `${geo.city}, ${geo.country}`;

      const forecast = weather.daily.time.map((date, i) => {
        const d = new Date(date + 'T00:00:00');
        const dayCondition = DashboardPanel.mapWmoCondition(weather.daily.weather_code[i]);
        return {
          date,
          day: i === 0 ? 'Today' : d.toLocaleDateString('en', { weekday: 'short' }),
          max_c: Math.round(weather.daily.temperature_2m_max[i]),
          min_c: Math.round(weather.daily.temperature_2m_min[i]),
          condition: dayCondition.condition,
          emoji: dayCondition.emoji,
        };
      });

      const msg: ExtToDashboardMessage & { type: 'weather_loaded' } = {
        type: 'weather_loaded',
        data: {
          location,
          temp_c: Math.round(weather.current.temperature_2m),
          condition: currentCondition.condition,
          emoji: currentCondition.emoji,
          humidity: weather.current.relative_humidity_2m,
          wind_kmph: Math.round(weather.current.wind_speed_10m),
          forecast,
        },
      };

      this.weatherCache = { data: msg, timestamp: Date.now() };
      this.post(msg);
    } catch (err) {
      console.error('[Dashboard] Weather fetch failed:', err);
      this.post({ type: 'weather_loaded', data: null });
    }
  }

  private async handleLoadNews(category?: string): Promise<void> {
    try {
      const params = new URLSearchParams({ limit: '5' });
      if (category) params.set('category', category);

      const data = await httpGetJson(`https://ava-supernova.com/api/news?${params}`) as
        { posts?: Array<Record<string, unknown>>; articles?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
      const list = (Array.isArray(data) ? data : ((data as any).posts ?? (data as any).articles ?? [])) as Array<{
        title?: string; category?: string; reading_time?: number; slug?: string; published_at?: string;
      }>;

      this.post({
        type: 'news_loaded',
        articles: list.map(a => ({
          title: a.title ?? '',
          category: a.category ?? '',
          reading_time: a.reading_time ?? 0,
          slug: a.slug ?? '',
          date: a.published_at ?? '',
        })),
      });
    } catch {
      this.post({ type: 'news_loaded', articles: [] });
    }
  }

  private async handleLoadLatestRelease(): Promise<void> {
    try {
      const data = await httpGetJson('https://ava-supernova.com/api/releases?limit=1') as
        { releases?: Array<{ version: string; title: string; published_at: string }> } | Array<{ version: string; title: string; published_at: string }>;
      const list = Array.isArray(data) ? data : ((data as any).releases ?? []);

      this.post({
        type: 'latest_release_loaded',
        release: list.length > 0 ? { version: list[0].version, title: list[0].title, published_at: list[0].published_at } : null,
      });
    } catch {
      this.post({ type: 'latest_release_loaded', release: null });
    }
  }

  private static onDisposeCallback: (() => void) | undefined;

  static onDidDispose(callback: () => void): void {
    DashboardPanel.onDisposeCallback = callback;
  }

  private dispose(): void {
    DashboardPanel.currentPanel = undefined;
    DashboardPanel.onDisposeCallback?.();
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'dashboard', 'index.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'dashboard', 'index.css'),
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${webview.cspSource} 'unsafe-inline';
                 script-src 'nonce-${nonce}';
                 connect-src https: http:;
                 img-src ${webview.cspSource} data: https: vscode-resource:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Ava | Dashboard</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
