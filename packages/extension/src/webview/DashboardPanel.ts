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
import {
  MemoryManager, TaskManager, JournalManager, AVA_HOME,
  loadPersonality, savePersonality, resetPersonality,
  loadDatasetConfig, saveDatasetConfig, configPathFor,
  type DatasetConfig,
} from '@ava/core';
import type { Personality } from '@ava/core';
import type { MemoryEntry as CoreMemoryEntry, TaskEntry as CoreTaskEntry, JournalDay } from '@ava/core';
import { getNonce } from '../utils/nonce.js';
import { apiFetch } from '../utils/platform-api.js';
import { sessionStats } from '../session-stats.js';
import { setCloudSync, cloudSyncEnabled, dataModeHeader } from './data-mode.js';
import type { AvaViewProvider } from './AvaViewProvider.js';
import type {
  ExtToDashboardMessage,
  DashboardToExtMessage,
  DashboardSettings,
  AccountInfo,
  ConnectionStatus,
  ConversationEntry,
  ProviderKeyStatus,
  MemoryEntry,
  UsageLogEntry,
  DashboardTaskEntry,
  LibraryPath,
  LibraryPathDetail,
  LibraryPaper,
  PapersTab,
  HealthExerciseSummary,
  HealthExerciseDetail,
  HealthRecipeSummary,
  HealthRecipeDetail,
  HealthTaxonomies,
  HealthMySubmissions,
  HealthProfile,
  HealthDailyPlan,
  HealthPlan,
  HealthPlanSummary,
  HealthExerciseDraft,
  HealthRecipeDraft,
  ReleaseNote,
  RoadmapTheme,
} from './dashboard-message-types.js';

/** Chat message types that should be forwarded to AvaViewProvider */
const CHAT_MESSAGE_TYPES = new Set([
  'send_message', 'tool_confirmation_response', 'switch_model', 'clear_chat',
  'cancel', 'interrupt', 'request_history', 'load_chat_conversation',
  'delete_chat_conversation', 'search_history', 'rename_conversation',
  'pin_conversation', 'export_conversation', 'new_chat', 'compress_context',
  'set_provider_source', 'request_memory', 'save_chat_memory', 'clear_chat_memory',
  'archive_chat_memory', 'restore_chat_memory', 'delete_chat_memory_entry',
  'pong', 'request_today_tasks', 'request_all_tasks', 'toggle_task',
  'rate_message', 'save_secrets',
]);

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
  xiaomi: 'ava-supernova.provider.xiaomi.apiKey',
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
  private readonly context: vscode.ExtensionContext;
  private readonly secrets: vscode.SecretStorage;
  private disposables: vscode.Disposable[] = [];
  private supportPollInterval?: ReturnType<typeof setInterval>;
  private activeSupportConvId?: string;
  private memoryManager?: MemoryManager;
  private taskManager?: TaskManager;
  private journalManager?: JournalManager;
  private viewProvider?: AvaViewProvider;

  // Weather cache (30 minutes)
  private weatherCache: { data: ExtToDashboardMessage & { type: 'weather_loaded' }; timestamp: number } | null = null;
  private static readonly WEATHER_CACHE_TTL = 30 * 60 * 1000;

  // ─── Static factory ────────────────────────────────────────────────────────

  public static show(extensionUri: vscode.Uri, context: vscode.ExtensionContext, viewProvider?: AvaViewProvider): void {
    const column = vscode.ViewColumn.One;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(column);
      return;
    }

    // Webview localResourceRoots — the dashboard bundle root is fixed, but
    // we also need to allow every workspace folder so the Library page can
    // serve images / audio / video that live in the user's project. Without
    // these roots, asWebviewUri() returns a URI the webview will refuse to
    // load and locally-saved videos in particular show as broken (they
    // can't be inlined as base64 — too large).
    const localResourceRoots: vscode.Uri[] = [
      vscode.Uri.joinPath(extensionUri, 'dist', 'dashboard'),
    ];
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of workspaceFolders) {
      localResourceRoots.push(folder.uri);
    }

    const panel = vscode.window.createWebviewPanel(
      DashboardPanel.viewType,
      'Ava Supernova',
      column,
      {
        enableScripts: true,
        localResourceRoots,
        retainContextWhenHidden: true,
      },
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, context, viewProvider);
  }

  // ─── Constructor ───────────────────────────────────────────────────────────

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    viewProvider?: AvaViewProvider,
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.context = context;
    this.secrets = context.secrets;
    this.viewProvider = viewProvider;

    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'AvaSupernovaIcon.png');

    // Register message handler BEFORE setting HTML to catch webview_ready
    this.panel.webview.onDidReceiveMessage(
      (msg: DashboardToExtMessage) => this.handleMessage(msg),
      null,
      this.disposables,
    );

    this.panel.webview.html = this.getHtml(panel.webview);

    // Wire up AvaViewProvider to post chat messages through this panel's webview
    if (viewProvider) {
      viewProvider.setUnifiedWebview((msg) => {
        this.panel.webview.postMessage(msg);
      });
    }

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
    // Forward chat messages to AvaViewProvider
    if (CHAT_MESSAGE_TYPES.has(msg.type) && this.viewProvider) {
      await this.viewProvider.handleChatMessage(msg as unknown as Record<string, unknown>);
      return;
    }

    switch (msg.type) {
      case 'webview_ready': {
        const tReady = Date.now();
        this.log(`[health-perf] HOST recv webview_ready at ${tReady}`);
        await this.sendInit();
        this.log(`[health-perf] HOST sendInit done ${Date.now() - tReady}ms`);
        // Also initialise the chat engine
        if (this.viewProvider) {
          this.viewProvider.initChatForUnifiedPanel().catch((err) => console.error('[Ava] Chat init failed:', err));
        }
        break;
      }

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

      case 'start_sign_in':
        // Delegate to AvaViewProvider's SignInManager. The resulting
        // sign_in_started / sign_in_complete / sign_in_failed events
        // flow back through AvaViewProvider.postMessage, which already
        // forwards to the dashboard via externalPostMessage.
        if (this.viewProvider) {
          await this.viewProvider.startSignInFromDashboard(msg.method);
        } else {
          this.post({
            type: 'sign_in_failed',
            error: 'Dashboard is not connected to an active view provider. Please reload VS Code.',
          });
        }
        break;

      case 'cancel_sign_in':
        this.viewProvider?.cancelSignInFromDashboard();
        break;

      case 'save_provider_key':
        await this.saveProviderKey(msg.provider, msg.apiKey);
        break;

      case 'remove_provider_key':
        await this.removeProviderKey(msg.provider);
        break;

      case 'save_local_model':
        await this.saveLocalModel(msg.baseUrl, msg.modelName, msg.apiKey, msg.modelLabel);
        break;

      case 'remove_local_model':
        await this.removeLocalModel();
        break;

      case 'load_local_model':
        await this.loadLocalModel();
        break;

      case 'load_memories':
        await this.loadMemories();
        // Also send v3 graph stats, contradictions, patterns, and brain
        this.sendGraphData();
        break;

      case 'load_more_memories':
        await this.loadMoreMemories();
        break;

      case 'delete_memory':
        await this.deleteMemory(msg.id);
        break;

      case 'delete_all_memories':
        await this.deleteAllMemories();
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

      case 'open_storage_addon':
        await this.openStorageAddon((msg as { size: '50gb' | '250gb' | '1tb' }).size);
        break;

      case 'open_portal':
        await this.openPortal();
        break;

      case 'save_settings':
        this.saveSettings(msg.settings);
        this.pushSettingsToCloud(msg.settings);
        break;

      case 'dataset:get_config': {
        const cfgPath = configPathFor(path.join(AVA_HOME, 'datasets'));
        const cfg = await loadDatasetConfig(cfgPath);
        this.post({ type: 'dataset:config', config: cfg } as any);
        break;
      }

      case 'dataset:set_config': {
        const cfgPath = configPathFor(path.join(AVA_HOME, 'datasets'));
        const incoming = (msg as { config: DatasetConfig }).config;
        await saveDatasetConfig(cfgPath, incoming);
        this.post({ type: 'dataset:config', config: incoming } as any);
        break;
      }

      case 'set_category_permission':
        if ((this.viewProvider as any)?.toolRegistry && (msg as any).category && (msg as any).permission) {
          (this.viewProvider as any).toolRegistry.setCategoryPermission((msg as any).category, (msg as any).permission);
        }
        break;

      case 'export_audit_log': {
        // Build the exportable bundle and hand it to the user via the
        // VS Code Save-As dialog. Stays entirely on-disk — nothing ever
        // leaves the machine. Format flag chooses Markdown (human) vs
        // JSON (structured / SIEM ingest).
        const fmt = (msg as { format?: 'markdown' | 'json' }).format ?? 'markdown';
        try {
          const { readEntries, buildExport } = require('@ava/core/audit') as typeof import('@ava/core/audit');
          const entries = readEntries({});
          const bundle = buildExport(entries, fmt);
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(bundle.filename),
            filters: fmt === 'json' ? { JSON: ['json'] } : { Markdown: ['md'] },
          });
          if (!uri) break;
          const fs = await import('node:fs/promises');
          await fs.writeFile(uri.fsPath, bundle.content, 'utf-8');
          this.post({ type: 'info', message: `Audit exported to ${uri.fsPath}` } as any);
        } catch (err) {
          this.post({ type: 'error', message: `Audit export failed: ${err instanceof Error ? err.message : err}` } as any);
        }
        break;
      }
      case 'request_audit_log': {
        // Read from the persistent JSONL store first — it includes
        // entries from prior sessions. Fall back to the in-memory
        // recent buffer if the persistent read fails for any reason
        // (first run, fs error, etc.) so the tab is never empty when
        // there's data to show.
        let entries: unknown[] = [];
        try {
          const { readEntries } = require('@ava/core/audit') as typeof import('@ava/core/audit');
          entries = readEntries({ limit: 1000 });
        } catch {
          entries = (this.viewProvider as any)?.auditLog || [];
        }
        if (!entries || entries.length === 0) {
          entries = (this.viewProvider as any)?.auditLog || [];
        }
        this.post({ type: 'audit_log', entries } as any);
        break;
      }

      // ─── Creative Studio generation (proxied through extension host for CORS) ──
      case 'creative_generate': {
        const m = msg as any;
        this.handleCreativeGenerate(m.endpoint, m.body).catch(() => {});
        break;
      }

      case 'open_chat':
        vscode.commands.executeCommand('ava-supernova.openChat');
        break;

      case 'open_docs':
        vscode.commands.executeCommand('ava-supernova.openDocs');
        break;

      case 'open_url': {
        // Validate URL with native URL parser for defence-in-depth
        try {
          const parsed = new URL(msg.url);
          if (parsed.protocol === 'https:') {
            vscode.env.openExternal(vscode.Uri.parse(msg.url));
          }
        } catch {
          // Invalid URL — ignore silently
        }
        break;
      }

      case 'update_name':
        await this.updateName(msg.name);
        break;

      case 'refresh_account':
        await this.refreshAccount();
        break;

      case 'refresh_storage':
        await this.refreshStorage();
        break;

      case 'set_cloud_sync': {
        await setCloudSync(this.context, msg.enabled);
        // Flip each manager's localOnly state immediately so the toggle
        // takes effect without a reload. AvaViewProvider owns the
        // managers, so route through it.
        this.viewProvider?.applyCloudSync(msg.enabled);
        // Re-emit sync status so the dashboard Sync tab activates /
        // deactivates in step with the toggle.
        this.loadSyncStatus().catch(() => { /* non-fatal */ });
        break;
      }

      case 'delete_all_cloud_conversations':
        await this.wipeCloudCategory('/conversations/all', 'chat history');
        break;

      case 'delete_all_cloud_tasks':
        await this.wipeCloudCategory('/tasks/all', 'tasks');
        break;

      case 'delete_all_cloud_journal':
        await this.wipeCloudCategory('/journal/all', 'journal entries');
        break;

      case 'delete_all_cloud_creative':
        await this.wipeCloudCategory('/creative-assets', 'creative assets');
        break;

      case 'load_conversations':
        await this.loadConversations();
        break;

      case 'load_conversation':
        await this.loadConversationIntoChat(msg.id);
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

      // ─── Live chat support ─────────────────────────────────────────────────

      case 'start_support_conversation':
        await this.startSupportConversation(msg.message);
        break;

      case 'send_support_message':
        await this.sendSupportMessage(msg.conversationId, msg.message);
        break;

      case 'load_support_conversations':
        await this.loadSupportConversations();
        break;

      case 'load_support_messages':
        await this.loadSupportMessages(msg.conversationId);
        break;

      case 'mark_support_read':
        await this.markSupportRead(msg.conversationId);
        break;

      case 'clear_support_chat':
        this.stopSupportPolling();
        this.activeSupportConvId = undefined;
        this.post({ type: 'support_chat_cleared' } as any);
        break;

      // ─── BYOK messages ──────────────────────────────────────────────────────

      case 'load_local_memories':
        await this.loadLocalMemories();
        break;

      case 'delete_local_memory':
        await this.deleteLocalMemory(msg.id);
        break;

      case 'delete_all_local_memories':
        await this.deleteAllLocalMemories();
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

      case 'load_task_dates':
        await this.loadTaskDates();
        break;

      case 'delete_curriculum':
        await this.deleteCurriculum(msg.id);
        break;

      // ─── Learning Library messages ─────────────────────────────────────

      case 'load_library_paths': {
        try {
          const params = new URLSearchParams();
          if (msg.search) params.set('search', msg.search);
          if (msg.subject) params.set('subject', msg.subject);
          if (msg.level) params.set('level', msg.level);
          if (msg.sort) params.set('sort', msg.sort);
          params.set('limit', '30');
          const url = `/learning/library?${params.toString()}`;
          // Public endpoint — try with platform key if available, otherwise direct fetch
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          if (platformKey) {
            const res = await apiFetch(url, { platformKey });
            const body = (res.data && typeof res.data === 'object') ? res.data as Record<string, unknown> : {};
            this.post({ type: 'library_paths_loaded', paths: ((body.paths as LibraryPath[] | undefined) ?? []), total: (body.total as number) || 0 });
          } else {
            // Direct public fetch for BYOK users
            const res = await fetch(`https://ava-supernova.com/api${url}`);
            const data = (await res.json()) as { paths?: LibraryPath[]; total?: number };
            this.post({ type: 'library_paths_loaded', paths: data.paths ?? [], total: data.total ?? 0 });
          }
        } catch {
          this.post({ type: 'library_paths_loaded', paths: [], total: 0 });
        }
        break;
      }

      case 'load_library_path_detail': {
        try {
          const res = await fetch(`https://ava-supernova.com/api/learning/library/${msg.id}`);
          const data = (await res.json()) as LibraryPathDetail | null;
          if (data && data.id) {
            this.post({ type: 'library_path_detail_loaded', path: data });
          }
        } catch { /* non-fatal */ }
        break;
      }

      case 'fork_library_path': {
        const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
        if (!platformKey) {
          this.post({ type: 'error', message: 'Connect your Ava account to start learning paths from the library.' });
          break;
        }
        try {
          const res = await apiFetch(`/learning/library/${msg.id}/fork`, { method: 'POST', platformKey });
          const forkData = (res.data ?? {}) as { curriculum_id?: string; message?: string };
          this.post({ type: 'library_path_forked', curriculumId: forkData.curriculum_id ?? '', title: forkData.message || 'Started!' });
        } catch (err: any) {
          this.post({ type: 'error', message: err.message || 'Failed to fork learning path' });
        }
        break;
      }

      case 'publish_to_library': {
        const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
        if (!platformKey) {
          this.post({ type: 'error', message: 'Connect your Ava account to publish learning paths.' });
          break;
        }
        try {
          const res = await apiFetch('/learning/library', { method: 'POST', body: { curriculum_id: msg.curriculumId }, platformKey });
          const pubData = (res.data ?? {}) as { id?: string; status?: string; message?: string };
          this.post({ type: 'library_path_published', pathId: pubData.id ?? '', status: pubData.status ?? '', message: pubData.message ?? '' });
        } catch (err: any) {
          this.post({ type: 'error', message: err.message || 'Failed to publish' });
        }
        break;
      }

      case 'rate_library_path': {
        const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
        if (!platformKey) break;
        try {
          await apiFetch(`/learning/library/${msg.id}/rate`, { method: 'POST', body: { rating: msg.rating }, platformKey });
          this.post({ type: 'library_path_rated', pathId: msg.id, rating: msg.rating });
        } catch { /* non-fatal */ }
        break;
      }

      // ─── Library → Papers ───────────────────────────────────────────────
      // Public endpoints. Direct fetch — no auth needed for browse + search.
      // Read counter is bumped server-side when the user clicks "Read with
      // Ava" via POST /api/papers/[id], but only for stored UUID rows.

      case 'load_papers': {
        // 8s timeout — server typically responds <1s; anything past
        // 8s is a network or routing issue and the user shouldn't wait
        // forever staring at a spinner. Always posts papers_loaded
        // (success OR failure) so the dashboard's loading state clears.
        try {
          const params = new URLSearchParams();
          params.set('tab', msg.tab);
          if (msg.discipline) params.set('discipline', msg.discipline);
          if (msg.limit) params.set('limit', String(msg.limit));
          const url = `https://ava-supernova.com/api/papers/featured?${params.toString()}`;
          this.log(`[papers] load tab=${msg.tab} discipline=${msg.discipline ?? 'all'}`);
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) {
            this.log(`[papers] load failed: HTTP ${res.status}`);
            this.post({ type: 'papers_loaded', tab: msg.tab, papers: [] });
            break;
          }
          const data = (await res.json()) as { papers?: LibraryPaper[]; tab?: PapersTab };
          this.log(`[papers] load ok tab=${msg.tab} count=${data.papers?.length ?? 0}`);
          this.post({ type: 'papers_loaded', tab: data.tab ?? msg.tab, papers: data.papers ?? [] });
        } catch (err) {
          this.log(`[papers] load error: ${err instanceof Error ? err.message : String(err)}`);
          this.post({ type: 'papers_loaded', tab: msg.tab, papers: [] });
        }
        break;
      }

      case 'search_papers': {
        try {
          const params = new URLSearchParams();
          params.set('q', msg.query);
          if (msg.discipline) params.set('discipline', msg.discipline);
          if (msg.sort) params.set('sort', msg.sort);
          params.set('per_page', '25');
          const url = `https://ava-supernova.com/api/papers/search?${params.toString()}`;
          this.log(`[papers] search "${msg.query}"`);
          const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
          if (!res.ok) {
            this.log(`[papers] search failed: HTTP ${res.status}`);
            this.post({ type: 'papers_search_results', query: msg.query, papers: [], total: 0 });
            break;
          }
          const data = (await res.json()) as { papers?: LibraryPaper[]; total?: number };
          this.log(`[papers] search ok "${msg.query}" count=${data.papers?.length ?? 0}`);
          this.post({
            type: 'papers_search_results',
            query: msg.query,
            papers: data.papers ?? [],
            total: data.total ?? (data.papers?.length ?? 0),
          });
        } catch (err) {
          this.log(`[papers] search error: ${err instanceof Error ? err.message : String(err)}`);
          this.post({ type: 'papers_search_results', query: msg.query, papers: [], total: 0 });
        }
        break;
      }

      case 'load_roadmap': {
        // Roadmap fetch — single source of truth on the platform DB.
        // Public endpoint, no auth. Locale picked from VS Code's
        // env language so labels come back translated when the row
        // has a matching translations[locale] key. Always posts
        // `roadmap_loaded` (success OR failure) so the page's
        // loading state clears.
        try {
          const locale = (vscode.env.language || 'en').split('-')[0];
          const url = `https://ava-supernova.com/api/roadmap?locale=${encodeURIComponent(locale)}`;
          this.log(`[roadmap] load locale=${locale}`);
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) {
            this.log(`[roadmap] load failed: HTTP ${res.status}`);
            this.post({ type: 'roadmap_loaded', themes: [] });
            break;
          }
          const data = (await res.json()) as { themes?: RoadmapTheme[] };
          this.log(`[roadmap] load ok themes=${data.themes?.length ?? 0}`);
          this.post({ type: 'roadmap_loaded', themes: data.themes ?? [] });
        } catch (err) {
          this.log(`[roadmap] load error: ${err instanceof Error ? err.message : String(err)}`);
          this.post({ type: 'roadmap_loaded', themes: [] });
        }
        break;
      }

      case 'load_paper_detail': {
        try {
          const res = await fetch(
            `https://ava-supernova.com/api/papers/${encodeURIComponent(msg.id)}`,
            { signal: AbortSignal.timeout(10000) },
          );
          if (!res.ok) {
            this.post({ type: 'paper_detail_loaded', paper: null });
            break;
          }
          const data = (await res.json()) as { paper?: LibraryPaper | null };
          this.post({ type: 'paper_detail_loaded', paper: data.paper ?? null });
        } catch {
          this.post({ type: 'paper_detail_loaded', paper: null });
        }
        break;
      }

      case 'read_paper_with_ava': {
        // Two side-effects: bump read_count for the curated row (silent
        // no-op for live-search papers without a UUID), then drop a
        // Teach-mode user message into the chat that triggers an
        // immediate paper-explanation turn.
        if (msg.paper.id) {
          void fetch(`https://ava-supernova.com/api/papers/${msg.paper.id}`, { method: 'POST' })
            .catch(() => { /* non-fatal */ });
        }
        const ident = msg.paper.arxiv_id
          ? `arxiv:${msg.paper.arxiv_id}`
          : msg.paper.doi
            ? `doi:${msg.paper.doi}`
            : msg.paper.openalex_id
              ? `openalex:${msg.paper.openalex_id}`
              : msg.paper.primary_url ?? msg.paper.title;
        const primer =
          `[Read with Ava]\n\n` +
          `I'd like you to read and explain this scientific paper for me. ` +
          `Use the four-layer pass: 1. What's the question? (one plain-English sentence). ` +
          `2. Why does it matter? (the human stake). ` +
          `3. What did they do? (method, jargon-stripped). ` +
          `4. What did they find — and how confident should I be? (results + caveats specific to this paper's discipline).\n\n` +
          `Paper: **${msg.paper.title}**${msg.paper.year ? ` (${msg.paper.year})` : ''}\n` +
          (msg.paper.authors.length > 0 ? `Authors: ${msg.paper.authors.slice(0, 6).map(a => a.name).join(', ')}${msg.paper.authors.length > 6 ? ', et al.' : ''}\n` : '') +
          `Identifier: \`${ident}\`\n` +
          (msg.paper.primary_url ? `URL: ${msg.paper.primary_url}\n` : '') +
          (msg.paper.retracted ? `\n⚠ This paper is marked as RETRACTED. Surface that to me before discussing findings.\n` : '') +
          `\nFetch the full text via the \`paper_fetch_full_text\` tool first if you need more than the abstract, then walk me through it.`;
        // Hand off to the chat panel: send_message with mode=teach kicks
        // off the turn immediately and switches mode in one step.
        if (this.viewProvider) {
          await this.viewProvider.handleChatMessage({
            type: 'send_message',
            text: primer,
            mode: 'teach',
          });
        }
        break;
      }

      // ─── Health library ─────────────────────────────────────────────────
      // Public RLS-gated endpoints — anonymous read of the curated exercise
      // and recipe libraries. 8s timeout, always-posts-back-on-failure same
      // pattern as the papers handlers above.

      case 'load_health_exercises': {
        const limit = msg.limit ?? 24;
        const offset = msg.offset ?? 0;
        const seq = msg.seq;
        const t0 = Date.now();
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (msg.workoutType) params.set('workout_type', msg.workoutType);
        if (msg.q && msg.q.trim()) params.set('q', msg.q.trim());
        try {
          // Route through apiFetch so auth (when signed in) + X-Ava-Device
          // (always) flow automatically. The server's auth-aware list path
          // returns published + caller's own pending/rejected rows.
          this.log(`[health-perf] HOST recv load_health_exercises seq=${seq} at ${t0}`);
          const tKey = Date.now();
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          this.log(`[health-perf] HOST secrets.get seq=${seq} took ${Date.now() - tKey}ms`);
          this.log(`[health] load exercises seq=${seq} ${params.toString()}`);
          const tFetch = Date.now();
          const res = await apiFetch(`/health/exercises?${params.toString()}`, {
            platformKey,
            method: 'GET',
            timeoutMs: 8000,
          });
          this.log(`[health-perf] HOST apiFetch /health/exercises seq=${seq} took ${Date.now() - tFetch}ms ok=${res.ok} status=${res.status}${res.ok ? '' : ` detail=${typeof res.data === 'string' ? res.data : JSON.stringify(res.data)}`}`);
          if (!res.ok) {
            this.log(`[health] load exercises seq=${seq} failed: HTTP ${res.status}`);
            this.post({ type: 'health_exercises_loaded', exercises: [], total: 0, offset, seq, error: true });
            break;
          }
          const data = res.data as { exercises?: HealthExerciseSummary[]; total?: number };
          this.log(`[health] load exercises seq=${seq} ok count=${data.exercises?.length ?? 0} total=${data.total ?? 0}`);
          this.log(`[health-perf] HOST post health_exercises_loaded seq=${seq} total handler ${Date.now() - t0}ms`);
          this.post({
            type: 'health_exercises_loaded',
            exercises: data.exercises ?? [],
            total: data.total ?? 0,
            offset,
            seq,
          });
        } catch (err) {
          this.log(`[health] load exercises seq=${seq} error: ${err instanceof Error ? err.message : String(err)}`);
          this.post({ type: 'health_exercises_loaded', exercises: [], total: 0, offset, seq, error: true });
        }
        break;
      }

      case 'load_health_recipes': {
        const limit = msg.limit ?? 24;
        const offset = msg.offset ?? 0;
        const seq = msg.seq;
        const t0 = Date.now();
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (msg.course) params.set('course', msg.course);
        if (msg.q && msg.q.trim()) params.set('q', msg.q.trim());
        try {
          this.log(`[health-perf] HOST recv load_health_recipes seq=${seq} at ${t0}`);
          const tKey = Date.now();
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          this.log(`[health-perf] HOST secrets.get seq=${seq} took ${Date.now() - tKey}ms`);
          this.log(`[health] load recipes seq=${seq} ${params.toString()}`);
          const tFetch = Date.now();
          const res = await apiFetch(`/health/recipes?${params.toString()}`, {
            platformKey,
            method: 'GET',
            timeoutMs: 8000,
          });
          this.log(`[health-perf] HOST apiFetch /health/recipes seq=${seq} took ${Date.now() - tFetch}ms ok=${res.ok} status=${res.status}${res.ok ? '' : ` detail=${typeof res.data === 'string' ? res.data : JSON.stringify(res.data)}`}`);
          if (!res.ok) {
            this.log(`[health] load recipes seq=${seq} failed: HTTP ${res.status}`);
            this.post({ type: 'health_recipes_loaded', recipes: [], total: 0, offset, seq, error: true });
            break;
          }
          const data = res.data as { recipes?: HealthRecipeSummary[]; total?: number };
          this.log(`[health] load recipes seq=${seq} ok count=${data.recipes?.length ?? 0} total=${data.total ?? 0}`);
          this.log(`[health-perf] HOST post health_recipes_loaded seq=${seq} total handler ${Date.now() - t0}ms`);
          this.post({
            type: 'health_recipes_loaded',
            recipes: data.recipes ?? [],
            total: data.total ?? 0,
            offset,
            seq,
          });
        } catch (err) {
          this.log(`[health] load recipes seq=${seq} error: ${err instanceof Error ? err.message : String(err)}`);
          this.post({ type: 'health_recipes_loaded', recipes: [], total: 0, offset, seq, error: true });
        }
        break;
      }

      case 'load_health_exercise_detail': {
        try {
          // Route through apiFetch so the auth-aware detail endpoint
          // sees the submitter's identity (sk-ava-... or X-Ava-Device)
          // and returns the row even when it's still status='pending'.
          // Bare fetch was hitting the anon path, which RLS-hides any
          // non-published row — the submitter could never view their
          // own pending submission.
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          this.log(`[health] load exercise detail slug=${msg.slug} (auth=${platformKey ? 'user' : 'anonymous'})`);
          const res = await apiFetch(`/health/exercises/${encodeURIComponent(msg.slug)}`, {
            platformKey,
            method: 'GET',
            timeoutMs: 8000,
          });
          if (!res.ok) {
            this.post({ type: 'health_exercise_detail_loaded', exercise: null });
            break;
          }
          const data = res.data as { exercise?: HealthExerciseDetail | null };
          this.post({ type: 'health_exercise_detail_loaded', exercise: data.exercise ?? null });
        } catch (err) {
          this.log(`[health] load exercise detail error: ${err instanceof Error ? err.message : String(err)}`);
          this.post({ type: 'health_exercise_detail_loaded', exercise: null });
        }
        break;
      }

      case 'load_health_recipe_detail': {
        try {
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          this.log(`[health] load recipe detail slug=${msg.slug} (auth=${platformKey ? 'user' : 'anonymous'})`);
          const res = await apiFetch(`/health/recipes/${encodeURIComponent(msg.slug)}`, {
            platformKey,
            method: 'GET',
            timeoutMs: 8000,
          });
          if (!res.ok) {
            this.post({ type: 'health_recipe_detail_loaded', recipe: null });
            break;
          }
          const data = res.data as { recipe?: HealthRecipeDetail | null };
          this.post({ type: 'health_recipe_detail_loaded', recipe: data.recipe ?? null });
        } catch (err) {
          this.log(`[health] load recipe detail error: ${err instanceof Error ? err.message : String(err)}`);
          this.post({ type: 'health_recipe_detail_loaded', recipe: null });
        }
        break;
      }

      // ─── Health submission flow ────────────────────────────────────────
      // Community contributions. Taxonomies + my-submissions are open
      // public reads (no auth needed on GET /taxonomies; mine requires
      // platformKey). Submission POSTs require platformKey since they
      // write to the catalog as the authenticated user.

      case 'load_health_taxonomies': {
        const empty: HealthTaxonomies = { allergens: [], contraindications: [], cuisines: [], diets: [], dietary_flags: [] };
        this.log('[health] load taxonomies — start');
        try {
          // Use the Node https helper instead of global fetch — global
          // fetch has been unreliable in some VSCode extension host
          // builds; httpGetJson talks to the same endpoint via Node's
          // native https stack with no extra runtime surface.
          const data = await httpGetJson('https://ava-supernova.com/api/health/taxonomies') as HealthTaxonomies;
          this.log(`[health] taxonomies loaded a=${data?.allergens?.length ?? 0} c=${data?.contraindications?.length ?? 0} cu=${data?.cuisines?.length ?? 0}`);
          this.post({ type: 'health_taxonomies_loaded', taxonomies: data ?? empty });
        } catch (err) {
          this.log(`[health] load taxonomies error: ${err instanceof Error ? err.message : String(err)}`);
          this.post({ type: 'health_taxonomies_loaded', taxonomies: empty });
        }
        break;
      }

      case 'submit_health_exercise':
      case 'submit_health_recipe': {
        const kind = msg.type === 'submit_health_exercise' ? 'exercise' : 'recipe';
        try {
          // Auth optional — BYOK / no-account users contribute anonymously
          // via the device-id pseudonym (X-Ava-Device, already attached by
          // apiFetch). Signed-in users get full attribution.
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          this.log(`[health] submit ${kind} (auth=${platformKey ? 'user' : 'anonymous'})`);
          const res = await apiFetch(`/health/submissions/${kind}`, {
            platformKey,
            method: 'POST',
            body: msg.payload,
            timeoutMs: 15000,
          });
          if (!res.ok) {
            const errorMsg = (res.data as { error?: string } | string | null)
              && typeof res.data === 'object'
              ? (res.data as { error?: string }).error ?? `HTTP ${res.status}`
              : `HTTP ${res.status}`;
            this.log(`[health] submit ${kind} failed: ${errorMsg}`);
            this.post({ type: 'health_submission_result', kind, ok: false, error: errorMsg });
            break;
          }
          const sub = (res.data as { submission?: { id: string; slug: string; name: string; status: 'pending' | 'rejected' | 'published' } }).submission;
          this.post({ type: 'health_submission_result', kind, ok: true, submission: sub });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          this.log(`[health] submit ${kind} error: ${errorMsg}`);
          this.post({ type: 'health_submission_result', kind, ok: false, error: errorMsg });
        }
        break;
      }

      case 'generate_health_exercise_draft':
      case 'generate_health_recipe_draft': {
        const kind = msg.type === 'generate_health_exercise_draft' ? 'exercise' : 'recipe';
        try {
          // Two auth paths:
          //  - Platform user: send platformKey → server uses platform Qwen
          //    key + deducts 2 credits.
          //  - BYOK / no-account: send the user's BYOK provider + key via
          //    X-BYOK-* headers → server proxies the LLM call using their
          //    key, no credit deduction.
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          const byokProvider = await this.secrets.get('ava-supernova.provider.qwen.apiKey').then(k => k ? 'qwen' : null);
          const byokKey = byokProvider ? await this.secrets.get(`ava-supernova.provider.${byokProvider}.apiKey`) : null;
          const extraHeaders: Record<string, string> = {};
          if (!platformKey && byokProvider && byokKey) {
            extraHeaders['X-BYOK-Provider'] = byokProvider;
            extraHeaders['X-BYOK-Key'] = byokKey;
          }
          if (!platformKey && !byokKey) {
            this.post({
              type: kind === 'exercise' ? 'health_exercise_draft_generated' : 'health_recipe_draft_generated',
              ok: false,
              error: 'Ava generation needs a platform account or a BYOK provider key in Settings.',
            });
            break;
          }
          this.log(`[health] generate ${kind} draft (auth=${platformKey ? 'user' : `byok:${byokProvider}`})`);
          const res = await apiFetch(`/health/generate/${kind}`, {
            platformKey,
            method: 'POST',
            body: msg.intake,
            extraHeaders,
            // Three full skill versions × steps + equipment + diets + flags
            // can push the recipe generation well past 120s. Aligned with the
            // recipe route's 300s maxDuration (Vercel Pro ceiling) so neither
            // side gives up first. Exercise drafts will finish much sooner —
            // they don't need this much headroom, but using the same timeout
            // keeps the message handler simple.
            timeoutMs: 300000,
          });
          if (!res.ok) {
            // Format error so the operator sees the actual reason, not
            // just "HTTP 0". `res.data` is a string for network / timeout
            // failures and an object with `error` for server-emitted
            // failures.
            const errorMsg = res.data && typeof res.data === 'object' && 'error' in res.data
              ? String((res.data as { error?: string }).error ?? `HTTP ${res.status}`)
              : typeof res.data === 'string' && res.data
                ? `HTTP ${res.status} — ${res.data}`
                : `HTTP ${res.status}`;
            this.log(`[health] generate ${kind} failed: ${errorMsg}`);
            this.post({
              type: kind === 'exercise' ? 'health_exercise_draft_generated' : 'health_recipe_draft_generated',
              ok: false,
              error: errorMsg,
            });
            break;
          }
          const draft = (res.data as { draft?: HealthExerciseDraft | HealthRecipeDraft }).draft;
          if (!draft) {
            this.post({
              type: kind === 'exercise' ? 'health_exercise_draft_generated' : 'health_recipe_draft_generated',
              ok: false,
              error: 'Generation returned no draft',
            });
            break;
          }
          if (kind === 'exercise') {
            this.post({ type: 'health_exercise_draft_generated', ok: true, draft: draft as HealthExerciseDraft });
          } else {
            this.post({ type: 'health_recipe_draft_generated', ok: true, draft: draft as HealthRecipeDraft });
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          this.log(`[health] generate ${kind} error: ${errorMsg}`);
          this.post({
            type: kind === 'exercise' ? 'health_exercise_draft_generated' : 'health_recipe_draft_generated',
            ok: false,
            error: errorMsg,
          });
        }
        break;
      }

      case 'load_my_health_submissions': {
        try {
          // Anonymous users get device-id-scoped results (X-Ava-Device
          // header is always sent by apiFetch). Signed-in users get the
          // union of their account + device-id rows.
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          this.log(`[health] load my submissions (auth=${platformKey ? 'user' : 'anonymous'})`);
          const res = await apiFetch('/health/submissions/mine', {
            platformKey,
            method: 'GET',
            timeoutMs: 8000,
          });
          if (!res.ok) {
            this.log(`[health] load my submissions failed: HTTP ${res.status}`);
            this.post({ type: 'health_my_submissions_loaded', data: { exercises: [], recipes: [] } });
            break;
          }
          const data = res.data as HealthMySubmissions;
          this.post({ type: 'health_my_submissions_loaded', data });
        } catch (err) {
          this.log(`[health] load my submissions error: ${err instanceof Error ? err.message : String(err)}`);
          this.post({ type: 'health_my_submissions_loaded', data: { exercises: [], recipes: [] } });
        }
        break;
      }

      case 'clear_my_rejected_health_submissions': {
        try {
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          this.log(`[health] clear rejected submissions (auth=${platformKey ? 'user' : 'anonymous'})`);
          const res = await apiFetch('/health/submissions/mine', {
            platformKey,
            method: 'DELETE',
            timeoutMs: 8000,
          });
          if (!res.ok) {
            const errorMsg = res.data && typeof res.data === 'object' && 'error' in res.data
              ? String((res.data as { error?: string }).error ?? `HTTP ${res.status}`)
              : `HTTP ${res.status}`;
            this.log(`[health] clear rejected failed: ${errorMsg}`);
            this.post({ type: 'health_my_submissions_cleared', ok: false, error: errorMsg });
            break;
          }
          const data = res.data as { exercises_cleared?: number; recipes_cleared?: number };
          this.post({
            type: 'health_my_submissions_cleared',
            ok: true,
            exercises_cleared: data.exercises_cleared ?? 0,
            recipes_cleared: data.recipes_cleared ?? 0,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          this.log(`[health] clear rejected error: ${errorMsg}`);
          this.post({ type: 'health_my_submissions_cleared', ok: false, error: errorMsg });
        }
        break;
      }

      // ─── Health profile (Profile tab on the Health page) ─────────────
      // Local-first via globalState. Connected accounts can opt each
      // category into cloud sync via privacy.sync_* flags — server
      // sync is layered on later; for now everything is on-device.

      case 'load_health_profile': {
        const profile = this.getHealthProfile();
        this.post({ type: 'health_profile_loaded', profile });
        break;
      }

      case 'save_health_profile': {
        const profile: HealthProfile = {
          ...msg.profile,
          schema_version: 1,
          updated_at: new Date().toISOString(),
        };
        await this.context.globalState.update('ava.healthProfile', profile);
        this.post({ type: 'health_profile_saved', profile });
        break;
      }

      case 'load_health_daily_plan': {
        const plan = this.getHealthDailyPlan(msg.date);
        this.post({ type: 'health_daily_plan_loaded', plan });
        break;
      }

      case 'save_health_daily_plan': {
        const plan: HealthDailyPlan = {
          ...msg.plan,
          schema_version: 1,
          updated_at: new Date().toISOString(),
        };
        await this.context.globalState.update(`ava.healthPlan.${plan.date}`, plan);
        this.post({ type: 'health_daily_plan_saved', plan });
        break;
      }

      // ── Multi-week Plans ───────────────────────────────────────────
      case 'load_health_plans': {
        this.post({ type: 'health_plans_loaded', plans: this.getHealthPlanIndex() });
        break;
      }

      case 'load_health_plan': {
        this.post({ type: 'health_plan_loaded', plan: this.getHealthPlan(msg.id) });
        break;
      }

      case 'save_health_plan': {
        const plans = await this.saveHealthPlan(msg.plan);
        const saved = this.getHealthPlan(msg.plan.id);
        if (saved) this.post({ type: 'health_plan_saved', plan: saved, plans });
        break;
      }

      case 'delete_health_plan': {
        const plans = await this.deleteHealthPlan(msg.id);
        this.post({ type: 'health_plan_deleted', id: msg.id, plans });
        break;
      }

      // Catalog search for the plan editor's "+ Add" picker. Reuses the
      // public catalog endpoints; a small page is enough for a picker.
      case 'search_plan_exercises': {
        const seq = msg.seq;
        const params = new URLSearchParams({ limit: '12', offset: '0' });
        if (msg.q && msg.q.trim()) params.set('q', msg.q.trim());
        try {
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          const res = await apiFetch(`/health/exercises?${params.toString()}`, { platformKey, method: 'GET', timeoutMs: 8000 });
          const data = (res.ok ? res.data : {}) as { exercises?: HealthExerciseSummary[] };
          this.post({ type: 'plan_exercises_searched', exercises: data.exercises ?? [], seq });
        } catch {
          this.post({ type: 'plan_exercises_searched', exercises: [], seq });
        }
        break;
      }

      case 'search_plan_recipes': {
        const seq = msg.seq;
        const params = new URLSearchParams({ limit: '12', offset: '0' });
        if (msg.q && msg.q.trim()) params.set('q', msg.q.trim());
        try {
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          const res = await apiFetch(`/health/recipes?${params.toString()}`, { platformKey, method: 'GET', timeoutMs: 8000 });
          const data = (res.ok ? res.data : {}) as { recipes?: HealthRecipeSummary[] };
          this.post({ type: 'plan_recipes_searched', recipes: data.recipes ?? [], seq });
        } catch {
          this.post({ type: 'plan_recipes_searched', recipes: [], seq });
        }
        break;
      }

      case 'generate_health_morning_brief': {
        // Ava writes the morning brief paragraph from a snapshot of
        // the operator's profile + today's log. Snapshot is sent
        // over the wire to /api/health/morning-brief — the profile
        // itself stays local. Dual auth: sk-ava-... user (deducts 1
        // credit) OR BYOK Qwen header (caller's own key).
        try {
          const profile = this.getHealthProfile();
          const plan = this.getHealthDailyPlan(msg.date);

          // Derive age from DOB so the model sees the current age,
          // not a snapshot from years ago.
          let age: number | null = null;
          if (profile.body.date_of_birth) {
            const dob = new Date(profile.body.date_of_birth);
            const now = new Date();
            if (!Number.isNaN(dob.getTime())) {
              age = now.getFullYear() - dob.getFullYear() - (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
            }
          }

          const context = {
            date: msg.date,
            hour: new Date().getHours(),
            profile: {
              sex: profile.body.sex,
              age_years: age,
              height_cm: profile.body.height_cm,
              weight_kg: profile.body.weight_kg,
              primary_goal: profile.goals.primary,
              weekly_focus: profile.goals.weekly_focus,
              allergens: profile.constraints.allergens,
              dietary: profile.constraints.dietary,
              injuries: profile.constraints.injuries,
              equipment_available: profile.constraints.equipment_available,
              minutes_per_day_target: profile.constraints.minutes_per_day_target,
              training_window: profile.schedule.training_window,
              meal_times: profile.schedule.meal_times,
              sleep_target: profile.schedule.sleep_target,
            },
            log: {
              meals_logged: plan.log.meals.length,
              water_ml: plan.log.water_ml,
              sleep_hours: plan.log.sleep_hours,
              mood: plan.log.mood,
            },
          };

          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          const byokProvider = await this.secrets.get('ava-supernova.provider.qwen.apiKey').then(k => k ? 'qwen' : null);
          const byokKey = byokProvider ? await this.secrets.get(`ava-supernova.provider.${byokProvider}.apiKey`) : null;
          const extraHeaders: Record<string, string> = {};
          if (!platformKey && byokProvider && byokKey) {
            extraHeaders['X-BYOK-Provider'] = byokProvider;
            extraHeaders['X-BYOK-Key'] = byokKey;
          }
          if (!platformKey && !byokKey) {
            this.post({ type: 'health_morning_brief_generated', ok: false, error: 'Brief generation needs a platform account or a BYOK provider key in Settings.' });
            break;
          }

          this.log(`[health] generate morning brief (auth=${platformKey ? 'user' : `byok:${byokProvider}`})`);
          const res = await apiFetch('/health/morning-brief', {
            platformKey,
            method: 'POST',
            body: { context },
            extraHeaders,
            // 120s — matches the route's maxDuration. Equal-to-server
            // timeouts caused false "HTTP 0" failures; the server now
            // has 120s headroom and the client waits the same.
            timeoutMs: 120000,
          });
          if (!res.ok) {
            // res.data is an object with `error` for server-emitted
            // failures, but a plain STRING for network / timeout
            // failures ("timeout after 120000ms"). Surface the real
            // reason instead of a bare "HTTP 0".
            const errorMsg = res.data && typeof res.data === 'object' && 'error' in res.data
              ? String((res.data as { error?: string }).error ?? `HTTP ${res.status}`)
              : typeof res.data === 'string' && res.data
                ? `HTTP ${res.status} — ${res.data}`
                : `HTTP ${res.status}`;
            this.log(`[health] generate morning brief failed: ${errorMsg}`);
            this.post({ type: 'health_morning_brief_generated', ok: false, error: errorMsg });
            break;
          }
          const brief = (res.data as { brief?: string }).brief;
          if (!brief) {
            this.post({ type: 'health_morning_brief_generated', ok: false, error: 'Empty brief returned' });
            break;
          }

          // Persist the new brief onto today's plan locally so the
          // dashboard mirrors what the API produced. updated_at
          // stamps on save.
          const nextPlan: HealthDailyPlan = {
            ...plan,
            morning_brief: brief,
            schema_version: 1,
            updated_at: new Date().toISOString(),
          };
          await this.context.globalState.update(`ava.healthPlan.${msg.date}`, nextPlan);

          this.post({ type: 'health_daily_plan_saved', plan: nextPlan });
          this.post({ type: 'health_morning_brief_generated', ok: true, brief });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          this.log(`[health] generate morning brief error: ${errorMsg}`);
          this.post({ type: 'health_morning_brief_generated', ok: false, error: errorMsg });
        }
        break;
      }

      // ─── Sync messages ──────────────────────────────────────────────────

      case 'load_sync_status':
        await this.loadSyncStatus();
        break;

      case 'load_sync_prefs':
        this.post({ type: 'sync_prefs_loaded', prefs: this.getSyncPrefs() });
        break;

      case 'set_sync_pref':
        await this.setSyncPref(msg.dataType, msg.enabled);
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

      case 'load_cloud_assets':
        await this.loadCloudAssets();
        break;

      case 'download_cloud_asset':
        await this.downloadCloudAsset(msg.url, msg.filename);
        break;

      case 'delete_cloud_asset':
        await this.deleteCloudAsset(msg.id);
        break;

      case 'delete_library_image':
        await this.deleteLibraryImage(msg.path);
        break;

      case 'open_library_image':
        await this.openLibraryImage(msg.path);
        break;

      case 'download_asset': {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && msg.path) {
          const fs = await import('node:fs/promises');
          const projectRoot = workspaceFolders[0].uri.fsPath;
          const sourcePath = path.resolve(projectRoot, msg.path);
          const fileName = path.basename(sourcePath);
          const dest = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(require('os').homedir(), 'Downloads', fileName)),
            filters: { 'All Files': ['*'] },
          });
          if (dest) {
            try {
              await fs.copyFile(sourcePath, dest.fsPath);
              vscode.window.showInformationMessage(`Saved to ${dest.fsPath}`);
            } catch (err: any) {
              this.post({ type: 'error', message: `Download failed: ${err.message}` });
            }
          }
        }
        break;
      }
      case 'save_creative_to_disk': {
        // Creative Studio generated an asset — download URL and save to project
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && msg.url && msg.filename) {
          const fs = await import('node:fs/promises');
          const projectRoot = workspaceFolders[0].uri.fsPath;
          const savePath = path.join(projectRoot, msg.filename);
          try {
            await fs.mkdir(path.dirname(savePath), { recursive: true });
            // Download the URL
            const res = await fetch(msg.url);
            if (res.ok) {
              const buf = Buffer.from(await res.arrayBuffer());
              await fs.writeFile(savePath, buf);
              this.log(`[Creative] Saved ${msg.assetType} to ${msg.filename} (${(buf.length / 1024).toFixed(1)} KB)`);
              // Refresh library so it shows up
              await this.loadLibraryFiles();
            } else {
              this.log(`[Creative] Failed to download ${msg.url}: ${res.status}`);
            }
          } catch (err: any) {
            this.log(`[Creative] Save to disk failed: ${err.message}`);
          }
        }
        break;
      }
      case 'create_blank_document': {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          this.post({ type: 'error', message: 'Open a workspace folder first — documents need somewhere to live.' });
          break;
        }
        const name = await vscode.window.showInputBox({
          prompt: `Name for the new .${msg.format} file`,
          value: 'untitled',
          validateInput: (v) => v.trim() ? null : 'Enter a filename',
        });
        if (!name?.trim()) break;
        const filename = `${name.trim()}.${msg.format}`;
        {
          const fs = await import('node:fs/promises');
          const projectRoot = workspaceFolders[0].uri.fsPath;
          const docsDir = path.join(projectRoot, 'documents');
          const filePath = path.join(docsDir, filename);
          try {
            await fs.mkdir(docsDir, { recursive: true });
            const ext = path.extname(filename).toLowerCase();
            if (ext === '.docx') {
              try {
                const { Document, Packer, Paragraph } = await import('docx');
                const doc = new Document({ sections: [{ children: [new Paragraph({ text: '' })] }] });
                const buf = await Packer.toBuffer(doc);
                await fs.writeFile(filePath, buf);
              } catch (e) {
                console.warn('[ava] docx create failed, writing empty file:', e);
                await fs.writeFile(filePath, '');
              }
            } else if (ext === '.xlsx') {
              try {
                const ExcelJS = await import('exceljs');
                const wb = new ExcelJS.default.Workbook();
                wb.addWorksheet('Sheet1');
                await wb.xlsx.writeFile(filePath);
              } catch (e) {
                console.warn('[ava] exceljs create failed, writing empty file:', e);
                await fs.writeFile(filePath, '');
              }
            } else if (ext === '.csv') {
              await fs.writeFile(filePath, 'Column1,Column2,Column3\n');
            } else if (ext === '.md') {
              await fs.writeFile(filePath, `# ${path.basename(filename, ext)}\n\n`);
            } else if (ext === '.pdf') {
              try {
                const PDFDocument = (await import('pdfkit')).default;
                await new Promise<void>((resolve, reject) => {
                  const doc = new PDFDocument();
                  const chunks: Buffer[] = [];
                  doc.on('data', (c: Buffer) => chunks.push(c));
                  doc.on('end', async () => {
                    await fs.writeFile(filePath, Buffer.concat(chunks));
                    resolve();
                  });
                  doc.on('error', reject);
                  doc.text(' ');
                  doc.end();
                });
              } catch (e) {
                console.warn('[ava] pdfkit create failed, writing empty file:', e);
                await fs.writeFile(filePath, '');
              }
            } else {
              await fs.writeFile(filePath, '');
            }
            this.post({ type: 'info', message: `Created documents/${filename}` });
            // Register in Creative Studio's local asset store so the Library
            // tab shows it immediately (same flow generate_image / _music /
            // _video use). Type picks up the filter bucket.
            const assetType: 'document' | 'spreadsheet' = msg.format === 'xlsx' ? 'spreadsheet' : 'document';
            this.post({
              type: 'creative_asset_created',
              asset: {
                type: assetType,
                path: `documents/${filename}`,
                absolutePath: filePath,
                prompt: '',
                size: 0,
              },
            } as any);
            await this.loadLibraryFiles();
            // Cloud side — if Data Mode includes cloud and user is signed
            // in, upload the file so it shows on the cloud Library tab too.
            // Fire-and-forget so we don't hold up the UI.
            void this.uploadDocumentToCloud(filePath, filename, msg.format, assetType, '');
          } catch (err: any) {
            this.post({ type: 'error', message: `Failed to create document: ${err.message}` });
          }
        }
        break;
      }
      case 'create_from_template': {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          this.post({ type: 'error', message: 'Open a workspace folder first — documents need somewhere to live.' });
          break;
        }
        // toolRegistry lives on the view provider — the dashboard panel
        // doesn't own one of its own. Earlier code referenced
        // `this.toolRegistry` which was always undefined, so clicks on the
        // template buttons broke silently.
        const toolRegistry = (this.viewProvider as any)?.toolRegistry;
        if (!toolRegistry) {
          this.post({ type: 'error', message: 'Tool registry not ready yet — open the Ava chat panel once, then try again.' });
          break;
        }
        const name = await vscode.window.showInputBox({
          prompt: `Name for the new ${msg.template.replace('_', ' ')} document`,
          value: msg.template,
          validateInput: (v) => v.trim() ? null : 'Enter a filename',
        });
        if (!name?.trim()) break;
        const filename = `${name.trim()}.docx`;
        const projectRoot = workspaceFolders[0].uri.fsPath;
        const filePath = path.join('documents', filename);
        try {
          const tool = toolRegistry.getTool('document_manage');
          if (!tool) {
            this.post({ type: 'error', message: 'document_manage tool not available.' });
            break;
          }
          {
            await tool.execute({
              action: 'from_template',
              template: msg.template,
              file_path: filePath,
              format: 'docx',
            }, { cwd: projectRoot, sharedState: {} });
            this.post({ type: 'info', message: `Created documents/${filename} from ${msg.template} template` });
            // Register in Creative Studio's local asset store (templates are
            // always .docx so type is always 'document').
            const absPath = path.join(projectRoot, filePath);
            this.post({
              type: 'creative_asset_created',
              asset: {
                type: 'document',
                path: filePath,
                absolutePath: absPath,
                prompt: msg.template,
                size: 0,
              },
            } as any);
            await this.loadLibraryFiles();
            // Cloud side — same fire-and-forget upload as blank docs. Template
            // output is always .docx so format/assetType are fixed.
            void this.uploadDocumentToCloud(absPath, filename, 'docx', 'document', msg.template);
          }
        } catch (err: any) {
          this.post({ type: 'error', message: `Failed to create from template: ${err.message}` });
        }
        break;
      }
      case 'reveal_in_explorer': {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || !msg.path) break;
        const projectRoot = workspaceFolders[0].uri.fsPath;
        const fullPath = path.resolve(projectRoot, msg.path);
        const home = process.env.HOME || process.env.USERPROFILE || '';
        if (!fullPath.toLowerCase().startsWith(projectRoot.toLowerCase()) &&
            !(home && fullPath.toLowerCase().startsWith(home.toLowerCase()))) {
          this.post({ type: 'error', message: 'Invalid path: access restricted to workspace and home directory.' });
          break;
        }
        try {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(fullPath));
        } catch (err: any) {
          this.post({ type: 'error', message: `Reveal failed: ${err?.message || err}` });
        }
        break;
      }
      case 'open_external': {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
          const projectRoot = workspaceFolders[0].uri.fsPath;
          const fullPath = path.resolve(projectRoot, msg.path);
          // Prevent path traversal — must stay within workspace or home
          const home = process.env.HOME || process.env.USERPROFILE || '';
          if (!fullPath.toLowerCase().startsWith(projectRoot.toLowerCase()) &&
              !(home && fullPath.toLowerCase().startsWith(home.toLowerCase()))) {
            this.post({ type: 'error', message: 'Invalid path: access restricted to workspace and home directory.' });
            break;
          }
          // Prefer LibreOffice / OpenOffice for office documents — keeps the
          // open-source story intact. Falls back to OS default (which may be
          // Word/Excel) when neither is installed.
          const ext = path.extname(fullPath).toLowerCase();
          const officeExts = new Set(['.docx', '.doc', '.odt', '.xlsx', '.xls', '.ods', '.csv', '.pptx', '.ppt', '.odp', '.pdf']);
          let opened = false;
          if (officeExts.has(ext)) {
            const soffice = await this.findLibreOfficeBinary();
            if (soffice) {
              try {
                const cp = await import('node:child_process');
                cp.spawn(soffice, [fullPath], { detached: true, stdio: 'ignore' }).unref();
                opened = true;
              } catch { /* fall through to system default */ }
            }
          }
          if (!opened) {
            await vscode.env.openExternal(vscode.Uri.file(fullPath));
          }
        }
        break;
      }

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

      case 'load_news_article':
        await this.handleLoadNewsArticle((msg as any).slug);
        break;

      case 'load_latest_release':
        await this.handleLoadLatestRelease();
        break;

      case 'export_data':
        if ((msg as any).dataType === 'bundle') {
          await this.handleExportBundle((msg as any).types || []);
        } else {
          await this.handleExportData((msg as any).dataType);
        }
        break;

      case 'export_full_account_data': {
        // GDPR Article 20 — full cloud-stored data dump via the
        // /api/export-my-data endpoint. Auth-gated server-side; the
        // host just proxies (we have the platform key in SecretStorage)
        // and hands the JSON back to the webview which triggers a
        // browser download via Blob + a-tag click.
        try {
          // Read directly from VS Code SecretStorage — same key the
          // rest of the host uses for authenticated platform calls.
          const ctx = (this.viewProvider as unknown as { context: vscode.ExtensionContext }).context;
          const platformKey = await ctx?.secrets.get('ava-supernova.platformKey');
          if (!platformKey) {
            this.post({ type: 'error', message: 'Connect a platform account first to export your cloud-stored data.' } as any);
            break;
          }
          const res = await fetch('https://ava-supernova.com/api/export-my-data', {
            method: 'GET',
            headers: { Authorization: `Bearer ${platformKey}` },
          });
          if (!res.ok) {
            const body = await res.text();
            this.post({ type: 'error', message: `Export failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}` } as any);
            break;
          }
          const content = await res.text();
          const datePart = new Date().toISOString().slice(0, 10);
          const filename = `ava-supernova-data-export-${datePart}.json`;
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(filename),
            filters: { JSON: ['json'] },
          });
          if (!uri) break;
          const fs = await import('node:fs/promises');
          await fs.writeFile(uri.fsPath, content, 'utf-8');
          this.post({ type: 'info', message: `Exported your cloud-stored data to ${uri.fsPath}` } as any);
        } catch (err) {
          this.post({ type: 'error', message: `Export failed: ${err instanceof Error ? err.message : err}` } as any);
        }
        break;
      }

      case 'import_data':
        await this.handleImportData((msg as any).dataType, (msg as any).content);
        break;

      case 'import_pick_files': {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectMany: true,
          filters: { 'JSON': ['json'] },
          openLabel: 'Import',
        });
        if (uris && uris.length > 0) {
          const fs = await import('node:fs/promises');
          const files: Array<{ name: string; content: string; size: number }> = [];
          for (const uri of uris) {
            try {
              const content = await fs.readFile(uri.fsPath, 'utf-8');
              const stat = await fs.stat(uri.fsPath);
              files.push({
                name: uri.fsPath.split(/[/\\]/).pop() || 'unknown.json',
                content,
                size: stat.size,
              });
            } catch { /* skip unreadable */ }
          }
          this.post({ type: 'import_files_picked' as any, files });
        }
        break;
      }

    }
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  private async sendInit(): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    const connections = await this.getConnectionStatus();

    // Read settings + provider keys from local storage first so the
    // dashboard can render immediately. Account fetch + cloud syncs
    // race independently and post update messages when they return.
    // Previously we awaited fetchAccount + pullSettingsFromCloud in-line
    // which made the dashboard hang for 2-3 minutes on slow networks
    // because the platform request had no timeout.
    const settings = this.readSettings();
    const providerKeys = await this.getProviderKeyStatus();
    const locale = vscode.workspace.getConfiguration('ava-supernova').get<string>('preferences.language') ?? 'auto';

    // Post init with account=null. The webview reads `platformKey` to
    // know the user is signed in but the account snapshot is still
    // loading — surfaces (NavSidebar account block, Billing) show their
    // own loading state until account_updated arrives.
    this.post({ type: 'init', account: null, connections, settings, providerKeys, locale, platformKey: platformKey || undefined });

    // Background account fetch — fire-and-forget. Posts account_updated
    // when the platform responds (or times out at 10s). The dashboard
    // shows a loading skeleton in account-dependent surfaces while we
    // wait, then drops it the moment the snapshot arrives.
    if (platformKey) {
      this.fetchAccount(platformKey)
        .then((account) => {
          this.post({ type: 'account_updated', account });
          if (account) {
            // Own the account-scoped data dir the moment the account
            // resolves — don't depend on the chat view having scoped
            // first. Without this, sync status read the un-scoped dir
            // and reported 0 local items for signed-in users.
            this.accountScopedDir = path.join(AVA_HOME, 'users', account.id);
            // Memory load gated on account success — fire-and-forget too.
            this.loadMemories().catch(() => { /* non-fatal */ });
            // Re-emit sync status now the scoped path is known, so a
            // Sync page opened before this resolved corrects its counts.
            this.loadSyncStatus().catch(() => { /* non-fatal */ });
          }
        })
        .catch(() => {
          // fetchAccount swallows errors → returns null. This catch is
          // belt-and-braces for unexpected throws.
          this.post({ type: 'account_updated', account: null });
        });
    } else {
      // BYOK user — no account fetch needed. Load local memories +
      // session stats so the Memory + Usage panels render with data.
      this.loadLocalMemories().catch(() => { /* non-fatal */ });
      this.post({ type: 'session_stats_loaded', stats: sessionStats.getStats() });
    }

    // Background cloud-settings sync — fire-and-forget. Posts a
    // settings_updated event when the remote copy is newer than the
    // local one, otherwise silent. Never blocks initial render.
    if (
      platformKey
      && cloudSyncEnabled(this.context)
      && this.isSyncEnabled('settings')
    ) {
      this.pullSettingsFromCloud(platformKey).catch(() => { /* non-fatal */ });
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

  /** Triggers /api/usage/recalculate-storage so the server re-sums the
   *  user's memories, conversations, tasks, journal, and creative assets
   *  into usage.storage_gb_used before refreshing the account snapshot.
   *  Without this call the storage bar only updates when the nightly
   *  pg_cron fires, which makes the Billing tab look permanently at
   *  0 MB for active users between cron runs. Best-effort — server
   *  failures never surface to the user, they just see the cached value. */
  private async refreshStorage(): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;
    try {
      await apiFetch('/usage/recalculate-storage', { method: 'POST', platformKey });
    } catch {
      // Non-fatal — fall through to whatever the account-info endpoint returns.
    }
    await this.refreshAccount();
  }

  /** Shared helper for the Cloud Management "Clear all X from cloud"
   *  buttons. DELETE the given path on the platform, surface the result
   *  to the webview as a clear_result message, then recalculate storage
   *  and push a fresh account snapshot so totals drop immediately.
   *
   *  Intentionally does NOT touch local data — these buttons wipe the
   *  cloud copy only. Users re-upload by re-enabling sync. */
  private async wipeCloudCategory(path: string, humanName: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'error', message: `Sign in to clear ${humanName} from the cloud.` });
      return;
    }
    try {
      const res = await apiFetch(path, { method: 'DELETE', platformKey });
      if (!res.ok) {
        this.post({ type: 'error', message: `Failed to clear ${humanName} (${res.status})` });
        return;
      }
      this.post({ type: 'info', message: `Cleared all ${humanName} from the cloud.` });
    } catch (err) {
      this.post({ type: 'error', message: `Failed to clear ${humanName}: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }
    // Refresh the storage snapshot so the UI reflects the drop.
    await this.refreshStorage();
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
    if (!platformKey) {
      console.log('[Ava] loadMemories: no platform key');
      return;
    }

    try {
      this.memoryOffset = 0;
      const res = await apiFetch('/memories?limit=100&offset=0', { platformKey });
      console.log('[Ava] loadMemories response:', res.status, 'ok:', res.ok);
      if (res.ok) {
        const body = res.data as { memories?: never[]; total?: number; hasMore?: boolean } | never[];
        const memories = Array.isArray(body) ? body : (body.memories || []);
        const total = Array.isArray(body) ? memories.length : (body.total || memories.length);
        const hasMore = Array.isArray(body) ? false : (body.hasMore || false);
        console.log(`[Ava] loadMemories: got ${memories.length} memories, total=${total}, hasMore=${hasMore}`);
        this.memoryOffset = memories.length;
        this.post({ type: 'memories_loaded', memories, total, hasMore });
      }
    } catch (err) {
      console.error('[Ava] loadMemories error:', err);
    }
  }

  /** Send v3 graph stats, contradictions, patterns, and brain to the dashboard. */
  private sendGraphData(): void {
    try {
      const mm = this.getMemoryManager() as any;
      if (!mm?.getGraphStats) return;

      // Graph stats for both scopes
      const globalStats = mm.getGraphStats('global');
      if (globalStats) this.post({ type: 'graph_stats', scope: 'global', stats: globalStats });

      const projectStats = mm.getGraphStats('project');
      if (projectStats) this.post({ type: 'graph_stats', scope: 'project', stats: projectStats });

      // Contradictions (project scope — most relevant)
      const contradictions = mm.getContradictions?.('project') ?? [];
      if (contradictions.length > 0) {
        this.post({ type: 'contradictions_loaded', contradictions });
      }

      // Procedural patterns
      const patterns = (mm.getProceduralPatterns?.('project') ?? []).map((p: any) => ({
        id: p.id,
        taskType: p.taskType,
        toolSequence: p.toolSequence,
        observationCount: p.observationCount,
        confidence: p.confidence,
        crystallised: p.crystallised,
        lastObservedAt: p.lastObservedAt,
      }));
      if (patterns.length > 0) {
        this.post({ type: 'patterns_loaded', patterns });
      }

      // Project brain
      const brain = mm.getProjectBrain?.();
      this.post({
        type: 'project_brain_loaded',
        brain: brain ? {
          brief: brain.brief,
          stack: brain.stack,
          keyDecisions: brain.keyDecisions,
          confidenceAvg: brain.confidenceAvg,
          nodeCount: brain.nodeCount,
          lastSessionDate: brain.lastSessionDate,
        } : null,
      });
    } catch {
      // Non-critical — dashboard still shows basic memory list without graph data
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

  private async deleteAllMemories(): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);

    // Step 1: Delete ALL platform memories FIRST — loop until remaining is 0
    if (platformKey) {
      let totalDeleted = 0;
      try {
        for (let i = 0; i < 100; i++) {
          const res = await apiFetch('/memories', { method: 'DELETE', platformKey });
          if (!res.ok) {
            this.post({ type: 'error', message: `Delete failed: ${res.status}` });
            break;
          }
          const data = res.data as { remaining?: number; deleted?: number };
          totalDeleted += data?.deleted ?? 0;
          console.log(`[Ava] Delete batch ${i + 1}: deleted=${data?.deleted}, remaining=${data?.remaining}, total=${totalDeleted}`);
          if (data?.remaining === 0 || data?.deleted === 0) break;
        }
      } catch (err) {
        this.post({ type: 'error', message: `Failed: ${err instanceof Error ? err.message : String(err)}` });
      }
    }

    // Step 2: THEN clear all local files — so sync can't re-upload
    try {
      const mgr = this.getMemoryManager();
      await mgr.clearEverything();
    } catch { /* best-effort */ }

    // Step 3: Reset the AvaViewProvider's memory manager so it doesn't re-sync cached entries
    if (this.viewProvider) {
      try {
        console.log('[Ava] Resetting AvaViewProvider memory manager...');
        await (this.viewProvider as any).resetMemoryManager();
        console.log('[Ava] AvaViewProvider memory manager reset complete.');
      } catch (err) {
        console.error('[Ava] Failed to reset AvaViewProvider memory manager:', err);
      }
    } else {
      console.log('[Ava] No viewProvider reference — cannot reset AvaViewProvider memory manager');
    }

    this.post({ type: 'memories_loaded', memories: [], total: 0, hasMore: false });
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
        this.post({ type: 'memory_upserted', memory: res.data as any });
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
        this.post({ type: 'memory_upserted', memory: res.data as any });
      } else {
        this.post({ type: 'error', message: `Failed to ${archived ? 'archive' : 'restore'} memory.` });
      }
    } catch {
      this.post({ type: 'error', message: `Failed to ${archived ? 'archive' : 'restore'} memory.` });
    }
  }

  // ─── Connections ───────────────────────────────────────────────────────────

  private async getConnectionStatus(): Promise<ConnectionStatus> {
    // SecretStorage reads run in parallel — sequential awaits used to add
    // ~50-100ms to every dashboard open. The 4 services are independent.
    const services = ['github', 'email', 'slack', 'discord'] as const;
    const results = await Promise.all(services.map(async (service) => {
      const secrets = CONNECTION_SECRETS[service] ?? [];
      const first = secrets[0] ? await this.secrets.get(secrets[0]) : undefined;
      return [service, Boolean(first)] as const;
    }));
    const status = { github: false, email: false, slack: false, discord: false } as ConnectionStatus;
    for (const [service, present] of results) status[service] = present;
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
        period: { credits_used: number; credits_limit: number | null; free_credits_used: number; free_credits_limit: number; requests_count: number };
        tier: string;
        isUnlimited: boolean;
        daily: Array<{ date: string; tokens: number }>;
        models: Array<{ model: string; total_tokens: number; request_count: number }>;
        totals: { tokens: number; requests: number; active_days: number };
      };

      // Unified balance — sum free pool + subscription pool so the All-Time
      // Credit Balance card matches the single bar shown on Billing / Usage
      // tabs. Backend still burns free first then overflows, but the UI
      // presents one number.
      const balance = {
        used: summary.period.free_credits_used + summary.period.credits_used,
        limit: summary.period.free_credits_limit + (summary.period.credits_limit ?? 0),
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

  private async openStorageAddon(size: '50gb' | '250gb' | '1tb'): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'error', message: 'Please connect your account first.' });
      return;
    }

    try {
      const res = await apiFetch('/billing/checkout', { method: 'POST', body: { storage_addon: size }, platformKey });
      if (res.ok && typeof res.data === 'object' && res.data && 'url' in res.data) {
        const uri = vscode.Uri.parse((res.data as { url: string }).url);
        if (uri.scheme !== 'https') { this.post({ type: 'error', message: 'Invalid checkout URL.' }); return; }
        vscode.env.openExternal(uri);
      } else {
        this.post({ type: 'error', message: 'Failed to create storage checkout session.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to create storage checkout session.' });
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
      xiaomi: Boolean(await this.secrets.get(PROVIDER_KEY_SECRETS.xiaomi)),
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

  // ─── Local / custom OpenAI-compatible model ───────────────────────────────
  // Ollama, LM Studio, vLLM, or any other server that speaks the OpenAI Chat
  // Completions API. Four SecretStorage entries; AvaViewProvider reads them
  // at session init and registers a GenericProvider with a one-entry models
  // list pointing at whatever the operator has running locally.

  private async saveLocalModel(
    baseUrl: string,
    modelName: string,
    apiKey?: string,
    modelLabel?: string,
  ): Promise<void> {
    if (baseUrl?.trim()) {
      await this.secrets.store('ava-supernova.provider.local.baseUrl', baseUrl.trim());
    }
    if (modelName?.trim()) {
      await this.secrets.store('ava-supernova.provider.local.modelName', modelName.trim());
    }
    // Empty apiKey is meaningful — it removes any prior value rather than
    // leaving stale auth in storage.
    if (apiKey && apiKey.trim()) {
      await this.secrets.store('ava-supernova.provider.local.apiKey', apiKey.trim());
    } else {
      await this.secrets.delete('ava-supernova.provider.local.apiKey');
    }
    if (modelLabel && modelLabel.trim()) {
      await this.secrets.store('ava-supernova.provider.local.modelLabel', modelLabel.trim());
    } else {
      await this.secrets.delete('ava-supernova.provider.local.modelLabel');
    }
    await this.loadLocalModel();
  }

  private async removeLocalModel(): Promise<void> {
    await this.secrets.delete('ava-supernova.provider.local.baseUrl');
    await this.secrets.delete('ava-supernova.provider.local.modelName');
    await this.secrets.delete('ava-supernova.provider.local.apiKey');
    await this.secrets.delete('ava-supernova.provider.local.modelLabel');
    await this.loadLocalModel();
  }

  private async loadLocalModel(): Promise<void> {
    const baseUrl = (await this.secrets.get('ava-supernova.provider.local.baseUrl')) || '';
    const modelName = (await this.secrets.get('ava-supernova.provider.local.modelName')) || '';
    const apiKey = (await this.secrets.get('ava-supernova.provider.local.apiKey')) || '';
    const modelLabel = (await this.secrets.get('ava-supernova.provider.local.modelLabel')) || '';
    this.post({ type: 'local_model_loaded', baseUrl, modelName, hasApiKey: !!apiKey, modelLabel });
  }

  // ─── Conversations (History) ────────────────────────────────────────────────

  private async loadConversations(): Promise<void> {
    // Local-only. Chat history is E2E + local by design — conversations
    // are written to ~/.ava/ on every turn and the cloud is never
    // queried. The legacy cloud-merge path was removed: it pulled stale
    // residue from earlier-version syncs back into the list and made
    // deletions appear to "come back" because cloud rows survived a
    // local unlink. Use the "Wipe legacy cloud history" button on the
    // Conversations tab to one-shot-clean any old cloud rows.
    const conversations = this.viewProvider
      ? await this.viewProvider.listLocalConversations()
      : [];
    // listLocalConversations returns unknown[] because the type lives in
    // core and the dashboard ConversationEntry shape is webview-local;
    // they're structurally compatible (id/title/updatedAt/pinned), so a
    // narrow cast at this single boundary keeps the rest of the
    // pipeline type-clean without leaking the dashboard type into core.
    this.post({ type: 'conversations_loaded', conversations: conversations as ConversationEntry[] });
  }

  /** Load a saved conversation into the chat panel.
   *  Called when the operator clicks a row in History → Conversations.
   *  Reuses AvaViewProvider's existing chat-side handler so the message
   *  thread restores exactly as it does from the chat-panel sidebar.
   *  Mirrors the IDE flow at DashboardPages.tsx:6002 (which uses a
   *  localStorage signal — not portable across VS Code webview origins,
   *  hence the host-mediated route here). */
  private async loadConversationIntoChat(id: string): Promise<void> {
    if (!this.viewProvider) return;
    await this.viewProvider.handleChatMessage({ type: 'load_conversation', conversationId: id });
  }

  private async deleteConversation(id: string): Promise<void> {
    // Local-only delete. Chat history is local by design — the row the
    // user clicks is a local file (`~/.ava/<id>.json`); unlink and
    // signal the UI. Any cloud residue from earlier-version syncs is
    // cleaned with the "Wipe legacy cloud history" button.
    if (!this.viewProvider) {
      this.post({ type: 'error', message: 'Failed to delete conversation.' });
      return;
    }
    try {
      await this.viewProvider.deleteLocalConversation(id);
      this.post({ type: 'conversation_deleted', id });
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
      this.post({ type: 'tickets_loaded', tickets: res.ok ? (res.data as any[]) : [] });
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
        this.post({ type: 'ticket_created', ticket: res.data as any });
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

  // ─── Live Chat Support ───────────────────────────────────────────────────

  private async startSupportConversation(message: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch('/support/conversations', {
        method: 'POST',
        body: { message, platform: 'extension' },
        platformKey,
      });
      if (res.ok) {
        const data = res.data as { conversation: any };
        this.post({ type: 'support_conversation_started', conversation: data.conversation } as any);
        // Load messages for the new conversation (includes Ava's response)
        setTimeout(() => this.loadSupportMessages(data.conversation.id), 1500);
        // Refresh conversation list
        this.loadSupportConversations();
      } else {
        this.post({ type: 'error', message: 'Failed to start conversation.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to start conversation.' });
    }
  }

  private async sendSupportMessage(conversationId: string, message: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch(`/support/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { message },
        platformKey,
      });
      if (res.ok) {
        const data = res.data as { message: any };
        this.post({ type: 'support_message_sent', conversationId, message: data.message } as any);
        // Reload messages to get Ava's response
        setTimeout(() => this.loadSupportMessages(conversationId), 1500);
      } else {
        this.post({ type: 'error', message: 'Failed to send message.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to send message.' });
    }
  }

  private async loadSupportConversations(): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'support_conversations_loaded', conversations: [] } as any);
      return;
    }

    try {
      const res = await apiFetch('/support/conversations', { platformKey });
      if (res.ok) {
        const data = res.data as { conversations: any[] };
        this.post({ type: 'support_conversations_loaded', conversations: data.conversations } as any);

        // Calculate total unread for badge
        const totalUnread = data.conversations.reduce((sum: number, c: any) => sum + (c.unread_user || 0), 0);
        this.post({ type: 'support_unread_count', count: totalUnread } as any);
      }
    } catch {
      this.post({ type: 'support_conversations_loaded', conversations: [] } as any);
    }
  }

  private async loadSupportMessages(conversationId: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch(`/support/conversations/${conversationId}/messages`, { platformKey });
      if (res.ok) {
        const data = res.data as { messages: any[] };
        this.post({ type: 'support_messages_loaded', conversationId, messages: data.messages } as any);
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to load messages.' });
    }

    // Start polling for this conversation
    this.activeSupportConvId = conversationId;
    this.stopSupportPolling();
    this.supportPollInterval = setInterval(() => {
      if (this.activeSupportConvId) {
        this.loadSupportMessagesQuiet(this.activeSupportConvId);
      }
    }, 10_000);
  }

  private async loadSupportMessagesQuiet(conversationId: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;
    try {
      const res = await apiFetch(`/support/conversations/${conversationId}/messages`, { platformKey });
      if (res.ok) {
        const data = res.data as { messages: any[] };
        this.post({ type: 'support_messages_loaded', conversationId, messages: data.messages } as any);
      }
    } catch { /* silent */ }
    // Also refresh conversation list for unread counts
    this.loadSupportConversations();
  }

  private stopSupportPolling(): void {
    if (this.supportPollInterval) {
      clearInterval(this.supportPollInterval);
      this.supportPollInterval = undefined;
    }
  }

  private async markSupportRead(conversationId: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      await apiFetch(`/support/conversations/${conversationId}/read`, {
        method: 'POST',
        platformKey,
      });
      // Refresh conversations to update unread counts
      this.loadSupportConversations();
    } catch {
      // Non-critical
    }
  }

  // ─── User Data Directory ────────────────────────────────────────────────────
  //
  // All DashboardPanel data reads/writes go through this helper. It resolves to
  // the account-scoped directory (`AVA_HOME/users/<account-id>/`) when a platform
  // account is connected, and falls back to `AVA_HOME` for BYOK/no-account users.
  //
  // This used to be hardcoded to `AVA_HOME` in 15 different places, which meant
  // account-connected users saw the wrong data everywhere in the dashboard — the
  // sync tab showed zero memories while the memory page correctly showed the real
  // (account-scoped) count. The fix is to route everything through this single
  // getter.

  /** Account-scoped dir resolved from this panel's OWN account fetch — set
   *  the moment fetchAccount returns in initializeData. Preferred over the
   *  chat view provider's copy: the chat view may not have scoped yet, and
   *  that ordering race made loadSyncStatus read the un-scoped `~/.ava` and
   *  report 0 local items even though the data was safe under `users/<id>/`. */
  private accountScopedDir: string | null = null;

  private getUserDataDir(): string {
    return this.accountScopedDir ?? this.viewProvider?.getAccountScopedDir() ?? AVA_HOME;
  }

  // ─── Local Memories (BYOK) ──────────────────────────────────────────────────

  private getMemoryManager(): MemoryManager {
    if (!this.memoryManager) {
      const globalDir = this.getUserDataDir();
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

  private async deleteAllLocalMemories(): Promise<void> {
    try {
      const mgr = this.getMemoryManager();
      await mgr.clearAll('global');
      await mgr.clearAll('project');
      this.post({ type: 'local_memories_loaded', memories: [] });
    } catch {
      this.post({ type: 'error', message: 'Failed to delete all memories.' });
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
      const globalDir = this.getUserDataDir();
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

  private async loadTaskDates(): Promise<void> {
    try {
      const mgr = this.getTaskManager();
      const tasks = await mgr.listTasks();
      const dates = tasks
        .filter(t => t.dueDate && t.status !== 'done' && t.status !== 'archived')
        .map(t => t.dueDate!.slice(0, 10));
      this.post({ type: 'task_dates_loaded', dates });
    } catch {
      this.post({ type: 'task_dates_loaded', dates: [] });
    }
  }

  private async loadLearning(): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const learningPath = path.join(this.getUserDataDir(), 'learning.json');
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
      const learningPath = path.join(this.getUserDataDir(), 'learning.json');
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
      const globalDir = this.getUserDataDir();
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
      const releases = await new Promise<ReleaseNote[]>((resolve) => {
        https.get('https://ava-supernova.com/api/releases', (res) => {
          let raw = '';
          res.on('data', (chunk: string) => (raw += chunk));
          res.on('end', () => {
            try {
              const data = JSON.parse(raw);
              resolve(Array.isArray(data) ? (data as ReleaseNote[]) : []);
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

  /**
   * Upload a locally-created document to the cloud Creative Studio library
   * when Data Mode is Cloud or Both. Fire-and-forget from the caller's POV
   * — failures surface as a toast but never roll back the local file.
   *
   * Mirrors the behaviour the generate_* tools get for free from the
   * platform's generation API; for blank/templated docs we do the upload
   * client-side because there's no generation round-trip.
   */
  private async uploadDocumentToCloud(
    filePath: string,
    filename: string,
    format: 'docx' | 'xlsx' | 'csv' | 'md' | 'pdf',
    assetType: 'document' | 'spreadsheet',
    prompt: string,
  ): Promise<void> {
    if (!cloudSyncEnabled(this.context)) return;
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return; // not signed in — cloud is opt-in, silently skip

    const CONTENT_TYPES: Record<string, string> = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv',
      md: 'text/markdown',
      pdf: 'application/pdf',
    };

    try {
      const fs = await import('node:fs/promises');
      const buffer = await fs.readFile(filePath);
      if (buffer.length === 0) {
        // Almost always means the office binary dep (docx/exceljs/pdfkit)
        // failed to load and the local writer fell through to an empty
        // placeholder. No point uploading garbage — tell the user loudly so
        // they notice, instead of silently putting 0-byte files in cloud.
        this.post({
          type: 'error',
          message: `Local file was written empty — ${path.basename(filePath)} has 0 bytes. Office deps (docx/exceljs/pdfkit) may not be loading. Check the Extension Host console for details.`,
        });
        return;
      }
      const contentBase64 = buffer.toString('base64');
      const res = await apiFetch('/creative-assets', {
        method: 'POST',
        platformKey,
        body: {
          filename,
          contentType: CONTENT_TYPES[format],
          contentBase64,
          assetType,
          title: filename,
          prompt,
        },
      });
      if (!res.ok) {
        const d = res.data as { error?: string; details?: string };
        const msg = d?.error || `HTTP ${res.status}`;
        const details = d?.details ? ` — ${d.details}` : '';
        this.post({ type: 'error', message: `Cloud upload failed (${msg}${details}). Local file saved.` });
      }
    } catch (err: any) {
      this.post({ type: 'error', message: `Cloud upload failed: ${err?.message || err}. Local file saved.` });
    }
  }

  /**
   * Locate a LibreOffice (soffice) or OpenOffice binary on disk. Returns the
   * absolute path if found, else null. Caches the result for the session so
   * we don't stat the same paths repeatedly.
   *
   * We prefer LibreOffice / OpenOffice because they're the open-source
   * office suites — aligns with the project's open-source stance instead
   * of handing documents straight to Word / Excel via the OS default.
   */
  private cachedOfficeBinary: string | null | undefined;
  private async findLibreOfficeBinary(): Promise<string | null> {
    if (this.cachedOfficeBinary !== undefined) return this.cachedOfficeBinary;

    const fs = await import('node:fs/promises');
    const candidates: string[] = [];
    if (process.platform === 'win32') {
      const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
      const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
      candidates.push(
        path.join(pf, 'LibreOffice', 'program', 'soffice.exe'),
        path.join(pfx86, 'LibreOffice', 'program', 'soffice.exe'),
        path.join(pf, 'OpenOffice 4', 'program', 'soffice.exe'),
        path.join(pfx86, 'OpenOffice 4', 'program', 'soffice.exe'),
      );
    } else if (process.platform === 'darwin') {
      candidates.push(
        '/Applications/LibreOffice.app/Contents/MacOS/soffice',
        '/Applications/OpenOffice.app/Contents/MacOS/soffice',
      );
    } else {
      candidates.push(
        '/usr/bin/soffice', '/usr/bin/libreoffice',
        '/usr/local/bin/soffice', '/usr/local/bin/libreoffice',
        '/snap/bin/libreoffice',
      );
    }

    for (const c of candidates) {
      try {
        await fs.access(c);
        this.cachedOfficeBinary = c;
        return c;
      } catch { /* not found, try next */ }
    }
    this.cachedOfficeBinary = null;
    return null;
  }

  // ─── Library (project files — images, documents, spreadsheets) ─

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
      const creativeDir = path.join(projectRoot, '.ava', 'creative');
      const publicDir = path.join(projectRoot, 'public');
      const srcAssetsDir = path.join(projectRoot, 'src', 'assets');
      const assetsDir = path.join(projectRoot, 'assets');
      const staticDir = path.join(projectRoot, 'static');
      const mediaDir = path.join(projectRoot, 'media');

      const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp']);
      const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov']);
      const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a']);
      const DOCUMENT_EXTENSIONS = new Set(['.docx', '.doc', '.pdf', '.txt', '.md', '.rtf']);
      const SPREADSHEET_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);

      type FileType = 'image' | 'video' | 'audio' | 'document' | 'spreadsheet';

      const getFileType = (ext: string): FileType | null => {
        if (IMAGE_EXTENSIONS.has(ext)) return 'image';
        if (VIDEO_EXTENSIONS.has(ext)) return 'video';
        if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
        if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';
        if (SPREADSHEET_EXTENSIONS.has(ext)) return 'spreadsheet';
        return null;
      };

      const ALL_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS, ...DOCUMENT_EXTENSIONS, ...SPREADSHEET_EXTENSIONS]);

      const files: Array<{ path: string; name: string; folder: string; size: number; modified: string; fileType: FileType; dataUri?: string; webviewUri?: string }> = [];

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
            // Skip node_modules, .git, etc. — but allow .ava for creative assets
            if ((entry.name.startsWith('.') && entry.name !== '.ava') || entry.name === 'node_modules') continue;
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

            // asWebviewUri returns a vscode-webview-resource:// URL that
            // the webview can load directly without having to inline the
            // bytes as a data URI. Streams from disk → no size cap, no
            // base64 overhead, video works at any size. Replaces the
            // earlier "video: skip (too large for base64)" path which
            // left every locally-saved video silently broken.
            const webviewUri = this.panel.webview.asWebviewUri(vscode.Uri.file(fullPath)).toString();

            const item: typeof files[number] = {
              path: relativePath,
              name: entry.name,
              folder: relativeFolder || (dir === imagesDir ? 'images' : 'documents'),
              size: stat.size,
              modified: stat.mtime.toISOString(),
              fileType,
              webviewUri,
            };

            files.push(item);
          }
        }
      };

      // Check if primary folders exist
      const imagesDirExists = await fs.access(imagesDir).then(() => true).catch(() => false);
      const docsDirExists = await fs.access(docsDir).then(() => true).catch(() => false);
      const hasFolders = imagesDirExists || docsDirExists;

      // Scan all standard asset directories
      const scanDirs = [imagesDir, docsDir, creativeDir, publicDir, srcAssetsDir, assetsDir, staticDir, mediaDir];
      const scanned = new Set<string>();
      for (const dir of scanDirs) {
        // Avoid scanning the same directory twice (e.g. if assets/ and src/assets/ resolve to the same path)
        const resolved = path.resolve(dir);
        if (scanned.has(resolved)) continue;
        scanned.add(resolved);
        await scan(dir);
      }

      // Sort newest first
      files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

      this.post({ type: 'library_loaded', images: files, projectRoot, hasFolder: hasFolders });
    } catch {
      this.post({ type: 'library_loaded', images: [], projectRoot: '' });
    }
  }

  /**
   * Fetch the user's cloud-synced creative assets from the platform and
   * post them to the dashboard. Powers the unified Library's Assets and
   * Documents tabs.
   *
   * Returns an empty list (not an error) when the user isn't signed in —
   * the Library handles the empty state gracefully and we don't want a
   * missing platform key to surface as a red error banner.
   */
  private async loadCloudAssets(): Promise<void> {
    try {
      const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
      if (!platformKey) {
        this.post({ type: 'cloud_assets_loaded', assets: [] });
        return;
      }
      const res = await apiFetch('/creative-assets', { platformKey });
      if (!res.ok) {
        this.post({ type: 'cloud_assets_error', message: `HTTP ${res.status}` });
        return;
      }
      const data = res.data as { assets?: unknown[] } | undefined;
      const assets = Array.isArray(data?.assets) ? data.assets : [];
      this.post({ type: 'cloud_assets_loaded', assets: assets as never });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.post({ type: 'cloud_assets_error', message });
    }
  }

  /**
   * Silently fetch a cloud creative asset and write it to the user's
   * Downloads folder. Powers the Library's cloud Download button —
   * bypasses the browser entirely so:
   *
   *   1. VS Code never prompts "Do you want Code to open the external
   *      website?" with the raw Supabase URL visible
   *   2. The file lands in Downloads without the user having to click
   *      through a picker or wait for a browser tab to open
   *   3. The bucket stays behind our extension — users see infrastructure
   *      URLs only if they explicitly choose Copy URL in the preview
   *
   * Host-side fetch means we can also show a native toast on completion
   * with a Reveal action.
   *
   * Defence in depth: only allows hostnames that look like Supabase
   * storage or our own domain, so a compromised webview can't coerce
   * the host into fetching arbitrary URLs (SSRF).
   */
  private async downloadCloudAsset(url: string, filename: string): Promise<void> {
    try {
      // Validate hostname — must be Supabase storage or ava-supernova.com.
      let parsed: URL;
      try { parsed = new URL(url); }
      catch { this.post({ type: 'error', message: 'Invalid URL' }); return; }
      const host = parsed.hostname.toLowerCase();
      const allowed = /\.supabase\.co$/.test(host) || host === 'ava-supernova.com';
      if (!allowed) {
        this.post({ type: 'error', message: 'Download blocked: URL not on an allowed host.' });
        return;
      }

      // Sanitise filename — strip path components, restrict character set,
      // fall back to a generic name if empty after cleaning.
      const safeName = filename
        .replace(/[\\/]/g, '_')
        .replace(/[^a-zA-Z0-9._ -]/g, '_')
        .slice(0, 200) || 'download';

      const fs = await import('node:fs/promises');
      const os = await import('node:os');
      const downloadsDir = path.join(os.homedir(), 'Downloads');
      await fs.mkdir(downloadsDir, { recursive: true });

      // Avoid overwriting existing files by suffixing " (N)" before the
      // extension. Same convention browsers use.
      const extIdx = safeName.lastIndexOf('.');
      const baseName = extIdx > 0 ? safeName.slice(0, extIdx) : safeName;
      const ext = extIdx > 0 ? safeName.slice(extIdx) : '';
      let savePath = path.join(downloadsDir, safeName);
      let counter = 1;
      while (true) {
        const exists = await fs.access(savePath).then(() => true).catch(() => false);
        if (!exists) break;
        savePath = path.join(downloadsDir, `${baseName} (${counter})${ext}`);
        counter++;
        if (counter > 100) break; // sanity stop
      }

      // Fetch the file.
      const res = await fetch(url);
      if (!res.ok) {
        this.post({ type: 'error', message: `Download failed: HTTP ${res.status}` });
        return;
      }
      const arrayBuffer = await res.arrayBuffer();
      await fs.writeFile(savePath, Buffer.from(arrayBuffer));

      // Friendly toast with Reveal — revealFileInOS is the same command
      // used elsewhere for the Reveal button on local files.
      const action = await vscode.window.showInformationMessage(
        `Downloaded: ${path.basename(savePath)}`,
        'Reveal',
      );
      if (action === 'Reveal') {
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(savePath));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.post({ type: 'error', message: `Download failed: ${message}` });
    }
  }

  /**
   * Remove a cloud creative asset — deletes both the row in
   * creative_assets and the backing blob in the creative-media bucket
   * (the DELETE /api/creative-assets/[id] route now handles both).
   * Ownership is enforced server-side via the auth.userId filter, so
   * one user can't wipe another's assets even if they guess an ID.
   *
   * On success, echoes a cloud_asset_deleted event so the dashboard
   * can prune its local list without a full refetch.
   */
  private async deleteCloudAsset(id: string): Promise<void> {
    try {
      const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
      if (!platformKey) {
        this.post({ type: 'error', message: 'Sign in to manage cloud assets.' });
        return;
      }
      const res = await apiFetch(`/creative-assets/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        platformKey,
      });
      if (!res.ok) {
        this.post({ type: 'error', message: `Delete failed: HTTP ${res.status}` });
        return;
      }
      this.post({ type: 'cloud_asset_deleted', id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.post({ type: 'error', message: `Delete failed: ${message}` });
    }
  }

  private async deleteLibraryImage(relativePath: string): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) return;

      const projectRoot = workspaceFolders[0].uri.fsPath;
      const fullPath = path.resolve(projectRoot, relativePath);
      // Prevent path traversal — ensure resolved path stays within workspace
      if (!fullPath.toLowerCase().startsWith(projectRoot.toLowerCase() + path.sep) && fullPath.toLowerCase() !== projectRoot.toLowerCase()) {
        this.post({ type: 'error', message: 'Invalid path: access restricted to workspace.' });
        return;
      }
      await fs.unlink(fullPath);
      this.post({ type: 'library_image_deleted', path: relativePath });
    } catch (err) {
      this.post({ type: 'error', message: `Failed to delete image: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  private async openLibraryImage(relativePath: string): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const projectRoot = workspaceFolders[0].uri.fsPath;
    const fullPath = path.resolve(projectRoot, relativePath);
    // Prevent path traversal — ensure resolved path stays within workspace
    if (!fullPath.toLowerCase().startsWith(projectRoot.toLowerCase() + path.sep) && fullPath.toLowerCase() !== projectRoot.toLowerCase()) {
      this.post({ type: 'error', message: 'Invalid path: access restricted to workspace.' });
      return;
    }
    const uri = vscode.Uri.file(fullPath);
    await vscode.commands.executeCommand('vscode.open', uri);
  }

  // ─── Personality ──────────────────────────────────────────────────────────

  private async handleLoadPersonality(): Promise<void> {
    try {
      const avaDir = path.join(os.homedir(), '.ava');
      let personality = await loadPersonality(avaDir);

      // Prefer cloud copy when signed in — write-through to local so subsequent
      // offline loads stay coherent.
      const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
      if (platformKey) {
        try {
          const res = await apiFetch('/settings', { platformKey });
          if (res.ok && res.data && typeof res.data === 'object') {
            const remote = (res.data as { personality?: Personality | null }).personality;
            if (remote && typeof remote === 'object') {
              personality = { ...personality, ...remote };
              await savePersonality(avaDir, personality).catch(() => {});
            }
          }
        } catch { /* offline — fall back to local */ }
      }

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
      this.pushPersonalityToCloud(data);
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
      this.pushPersonalityToCloud(personality);
    } catch {
      this.post({ type: 'error', message: 'Failed to reset personality.' });
    }
  }

  /** Fire-and-forget push to /api/settings (uses the dedicated personality column). */
  private async pushPersonalityToCloud(personality: Personality): Promise<void> {
    try {
      // Data Mode is the hard gate; the per-category sync pref narrows.
      // Previously this only checked isSyncEnabled, so choosing "Local"
      // in the chat header still pushed personality to the cloud whenever
      // the user edited Ava's style — a silent leak.
      if (!cloudSyncEnabled(this.context)) return;
      if (!this.isSyncEnabled('personality')) return;
      const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
      if (!platformKey) return;
      await apiFetch('/settings', { platformKey, method: 'POST', body: { personality } });
    } catch { /* best-effort */ }
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
      const raw = await fs.readFile(path.join(this.getUserDataDir(), 'sync-state.json'), 'utf-8');
      return JSON.parse(raw);
    } catch { return {}; }
  }


  private async saveSyncState(dataType: string, count: number): Promise<void> {
    const fs = await import('node:fs/promises');
    const state = await this.loadSyncState();
    state[dataType] = { syncedCount: count, syncedAt: new Date().toISOString() };
    await fs.writeFile(path.join(this.getUserDataDir(), 'sync-state.json'), JSON.stringify(state, null, 2));
  }

  private async loadSyncStatus(): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    const fs = await import('node:fs/promises');
    const syncState = await this.loadSyncState();
    const data: Record<string, { available: boolean; lastSynced: string | null; localCount: number; syncedCount: number; newCount: number }> = {};

    const dataDir = this.getUserDataDir();
    const types = ['memory', 'tasks', 'journal', 'learning', 'history', 'settings', 'personality'] as const;
    for (const t of types) {
      let localCount = 0;
      try {
        const filePath = t === 'memory' ? path.join(dataDir, 'memory.json')
          : t === 'tasks' ? path.join(dataDir, 'tasks.json')
          : t === 'journal' ? path.join(dataDir, 'journal')
          : t === 'learning' ? path.join(dataDir, 'learning.json')
          : t === 'history' ? path.join(dataDir, 'history')
          : t === 'personality' ? path.join(dataDir, 'personality.json')
          : path.join(dataDir, 'config.json');

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

    // Health profile lives in globalState, not a data file — so it sits
    // outside the file-path loop above. Counts 1 once a profile with
    // real data has been saved, else 0 (the Sync UI disables the push
    // button on a 0 count, so an untouched profile never offers sync).
    {
      const stored = this.context.globalState.get<HealthProfile | null>('ava.healthProfile') ?? null;
      const hasData = !!stored && stored.schema_version === 1 && (
        stored.body.height_cm != null || stored.body.weight_kg != null ||
        stored.body.sex != null || stored.body.date_of_birth != null ||
        stored.goals.primary != null
      );
      const localCount = hasData ? 1 : 0;
      const synced = syncState['health_profile'];
      const syncedCount = synced?.syncedCount ?? 0;
      data['health_profile'] = {
        available: !!platformKey,
        lastSynced: synced?.syncedAt ?? null,
        localCount,
        syncedCount,
        newCount: Math.max(0, localCount - syncedCount),
      };
    }

    this.post({ type: 'sync_status', data });
  }

  /** Turn an apiFetch result into a human reason. apiFetch reports
   *  status 0 for a timeout / network error (data carries the detail);
   *  any other non-2xx is a real HTTP status, with the server's error
   *  body when it sent one. Without this every sync failure collapsed
   *  to a blind "Failed to sync X" — undiagnosable. */
  private syncFailReason(res: { status: number; data: unknown }): string {
    if (res.status === 0) {
      return typeof res.data === 'string' ? res.data : 'network error';
    }
    const detail = typeof res.data === 'string'
      ? res.data
      : (res.data as { error?: string } | null)?.error ?? '';
    return `HTTP ${res.status}${detail ? ` — ${detail}` : ''}`;
  }

  private async pushToCloud(dataType: string): Promise<void> {
    // Defence in depth: the UI already gates this on Data Mode before
    // firing push_to_cloud, but any future caller (internal retries,
    // scheduled sync, a tool that wants to force-push) needs the
    // gate here too so Local mode stays truly local no matter what.
    if (!cloudSyncEnabled(this.context)) {
      this.post({ type: 'sync_error', dataType, message: 'Data Mode is Local — cloud sync is disabled. Switch to Cloud or Both in the chat header.' });
      return;
    }
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'sync_error', dataType, message: 'No platform account connected. Connect an account first.' });
      return;
    }
    if (!this.isSyncEnabled(dataType)) {
      this.post({ type: 'sync_error', dataType, message: 'Sync is disabled for this data type. Enable it in the Sync page.' });
      return;
    }

    this.post({ type: 'sync_started', dataType });
    const fs = await import('node:fs/promises');

    try {
      switch (dataType) {
        case 'memory': {
          const { PlatformMemorySync } = await import('@ava/core');
          const sync = new PlatformMemorySync('https://ava-supernova.com/api', platformKey);
          const store = await fs.readFile(path.join(this.getUserDataDir(), 'memory.json'), 'utf-8')
            .then(JSON.parse).catch(() => ({ entries: [] }));
          const entries = store.entries || [];
          await sync.pushEntries('global', entries);
          await this.saveSyncState('memory', entries.length);
          this.post({ type: 'sync_completed', dataType, count: entries.length });
          await this.loadSyncStatus();
          break;
        }

        case 'tasks': {
          const store = await fs.readFile(path.join(this.getUserDataDir(), 'tasks.json'), 'utf-8')
            .then(JSON.parse).catch(() => ({ tasks: [] }));
          const tasks = store.tasks || [];
          const res = await apiFetch('/tasks/sync', {
            platformKey,
            method: 'POST',
            body: { tasks },
          });
          if (!res.ok) throw new Error(`Failed to sync tasks — ${this.syncFailReason(res)}`);
          await this.saveSyncState('tasks', tasks.length);
          this.post({ type: 'sync_completed', dataType, count: tasks.length });
          await this.loadSyncStatus();
          break;
        }

        case 'journal': {
          const journalDir = path.join(this.getUserDataDir(), 'journal');
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
          const store = await fs.readFile(path.join(this.getUserDataDir(), 'learning.json'), 'utf-8')
            .then(JSON.parse).catch(() => ({ curriculums: [] }));
          const curriculums = store.curriculums || [];
          const res = await apiFetch('/learning/sync', {
            platformKey,
            method: 'POST',
            body: { curriculums },
          });
          if (!res.ok) throw new Error(`Failed to sync learning data — ${this.syncFailReason(res)}`);
          await this.saveSyncState('learning', curriculums.length);
          this.post({ type: 'sync_completed', dataType, count: curriculums.length });
          await this.loadSyncStatus();
          break;
        }

        case 'history': {
          const historyDir = path.join(this.getUserDataDir(), 'history');
          const files = await fs.readdir(historyDir).catch(() => []);
          let synced = 0;
          // Sync one conversation at a time to avoid payload size limits
          for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
              const raw = await fs.readFile(path.join(historyDir, file), 'utf-8');
              const conv = JSON.parse(raw);
              // Truncate messages to last 50 to keep payload manageable
              if (conv.messages && conv.messages.length > 50) {
                conv.messages = conv.messages.slice(-50);
              }
              const res = await apiFetch('/history/sync', {
                platformKey,
                method: 'POST',
                body: { conversations: [conv] },
              });
              if (res.ok) synced++;
            } catch { /* skip malformed */ }
          }
          await this.saveSyncState('history', synced);
          this.post({ type: 'sync_completed', dataType, count: synced });
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
          if (!res.ok) throw new Error(`Failed to sync settings — ${this.syncFailReason(res)}`);
          await this.saveSyncState('settings', 1);
          this.post({ type: 'sync_completed', dataType, count: 1 });
          await this.loadSyncStatus();
          break;
        }

        case 'personality': {
          const avaDir = path.join(os.homedir(), '.ava');
          const personality = await loadPersonality(avaDir);
          const res = await apiFetch('/settings', {
            platformKey,
            method: 'POST',
            body: { personality },
          });
          if (!res.ok) throw new Error(`Failed to sync personality — ${this.syncFailReason(res)}`);
          await this.saveSyncState('personality', 1);
          this.post({ type: 'sync_completed', dataType, count: 1 });
          await this.loadSyncStatus();
          break;
        }

        case 'learnings': {
          // Push local self-improvement entries to the shared global pool
          const siPath = path.join(this.avaHome, 'self-improvement.json');
          let siRaw: string;
          try {
            siRaw = await fs.readFile(siPath, 'utf-8');
          } catch {
            this.post({ type: 'sync_completed', dataType, count: 0 });
            break;
          }
          const siData = JSON.parse(siRaw);
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

        case 'health_profile': {
          // Single-doc push, mirroring `settings` — the whole profile
          // is one JSONB row per user on the platform.
          const profile = this.getHealthProfile();
          const res = await apiFetch('/health/profile/sync', {
            platformKey,
            method: 'POST',
            body: { profile },
          });
          if (!res.ok) throw new Error(`Failed to sync health profile — ${this.syncFailReason(res)}`);
          await this.saveSyncState('health_profile', 1);
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
      loopPreventionEnabled: cfg.get<boolean>('loopPrevention.enabled') ?? true,
    };
  }

  private saveSettings(settings: DashboardSettings): void {
    const cfg = vscode.workspace.getConfiguration('ava-supernova');
    cfg.update('preferences.language', settings.language, vscode.ConfigurationTarget.Global);
    cfg.update('preferences.permissionMode', settings.permissionMode, vscode.ConfigurationTarget.Global);
    cfg.update('preferences.temperature', settings.temperature, vscode.ConfigurationTarget.Global);
    cfg.update('preferences.maxTokens', settings.maxTokens, vscode.ConfigurationTarget.Global);
    // Guard: MiniMax is reserved for Creative Studio — never as the chat coordinator.
    // Reject Dashboard writes that would stamp a MiniMax model as the active chat model.
    if (settings.activeModel && settings.activeModel.toLowerCase().includes('minimax')) {
      console.warn(`[DashboardPanel] Refusing activeModel="${settings.activeModel}" — MiniMax is Creative Studio only`);
    } else {
      cfg.update('activeModel', settings.activeModel, vscode.ConfigurationTarget.Global);
    }
    cfg.update('preferences.autoMemory', settings.autoMemory, vscode.ConfigurationTarget.Global);
    cfg.update('preferences.memoryLocalOnly', settings.memoryLocalOnly, vscode.ConfigurationTarget.Global);
    cfg.update('contributeSharedLearning', settings.contributeSharedLearning, vscode.ConfigurationTarget.Global);
    cfg.update('preferences.streamResponses', settings.streamResponses, vscode.ConfigurationTarget.Global);
    cfg.update('loopPrevention.enabled', settings.loopPreventionEnabled, vscode.ConfigurationTarget.Global);
  }

  // ─── Health profile ────────────────────────────────────────────────────────

  /** Read the operator's HealthProfile from globalState. Returns the empty
   *  scaffold (all fields null / arrays empty) when no profile has been
   *  saved yet. Local-first by design — works fully for BYOK / no-account
   *  users; cloud sync is managed by the existing Sync tab as a single
   *  `health_profile` category, not by per-section flags here. */
  private getHealthProfile(): HealthProfile {
    const stored = this.context.globalState.get<HealthProfile | null>('ava.healthProfile') ?? null;
    if (stored && stored.schema_version === 1) return stored;
    return {
      schema_version: 1,
      updated_at: null,
      body: { sex: null, date_of_birth: null, height_cm: null, weight_kg: null, body_fat_pct: null },
      goals: { primary: null, weekly_focus: null },
      constraints: { allergens: [], dietary: [], injuries: [], equipment_available: [], minutes_per_day_target: null },
      schedule: {
        training_window: { start: null, end: null },
        meal_times: { breakfast: null, lunch: null, dinner: null },
        sleep_target: { bedtime: null, wake: null },
      },
    };
  }

  /** Read the daily plan for a given ISO date (YYYY-MM-DD). Returns
   *  the empty scaffold when no plan has been saved yet — the
   *  dashboard renders "no plan yet" placeholders against this. */
  private getHealthDailyPlan(date: string): HealthDailyPlan {
    const stored = this.context.globalState.get<HealthDailyPlan | null>(`ava.healthPlan.${date}`) ?? null;
    if (stored && stored.schema_version === 1 && stored.date === date) return stored;
    return {
      schema_version: 1,
      date,
      morning_brief: null,
      brief_reasoning: null,
      items: [],
      log: { meals: [], water_ml: 0, sleep_hours: null, mood: null },
      updated_at: null,
    };
  }

  // ─── Multi-week Plans store ────────────────────────────────────────────────
  // Each plan lives at `ava.plan.{id}` in globalState. The library index
  // is derived on demand by scanning globalState keys — never a separate
  // stored list, so it can't drift out of sync with the plans themselves.

  private static readonly PLAN_KEY_PREFIX = 'ava.plan.';
  private healthPlanKey(id: string): string { return `${DashboardPanel.PLAN_KEY_PREFIX}${id}`; }

  /** IDs of every stored plan, read from the globalState key set. */
  private getHealthPlanIds(): string[] {
    return this.context.globalState
      .keys()
      .filter((k) => k.startsWith(DashboardPanel.PLAN_KEY_PREFIX))
      .map((k) => k.slice(DashboardPanel.PLAN_KEY_PREFIX.length));
  }

  /** Read a single plan by id. Returns null when missing or from an
   *  unknown schema version. */
  private getHealthPlan(id: string): HealthPlan | null {
    const stored = this.context.globalState.get<HealthPlan | null>(this.healthPlanKey(id)) ?? null;
    return stored && stored.schema_version === 1 ? stored : null;
  }

  /** Lightweight summaries for the Plans library grid, most recently
   *  touched first. Derived live from the stored plans. */
  private getHealthPlanIndex(): HealthPlanSummary[] {
    const out: HealthPlanSummary[] = [];
    for (const id of this.getHealthPlanIds()) {
      const p = this.getHealthPlan(id);
      if (p) {
        out.push({
          id: p.id, type: p.type, title: p.title, status: p.status,
          duration_days: p.duration_days, source: p.source, updated_at: p.updated_at,
        });
      }
    }
    return out.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  }

  /** Upsert a plan, stamping updated_at. Activating a plan archives any
   *  other active plan of the same type — one active plan per type feeds
   *  the daily dashboard. Returns the refreshed library index. */
  private async saveHealthPlan(plan: HealthPlan): Promise<HealthPlanSummary[]> {
    const now = new Date().toISOString();
    if (plan.status === 'active') {
      for (const id of this.getHealthPlanIds()) {
        if (id === plan.id) continue;
        const other = this.getHealthPlan(id);
        if (other && other.type === plan.type && other.status === 'active') {
          await this.context.globalState.update(
            this.healthPlanKey(id), { ...other, status: 'archived', updated_at: now },
          );
        }
      }
    }
    const next: HealthPlan = { ...plan, schema_version: 1, updated_at: now };
    await this.context.globalState.update(this.healthPlanKey(next.id), next);
    return this.getHealthPlanIndex();
  }

  /** Delete a plan. Returns the refreshed library index. */
  private async deleteHealthPlan(id: string): Promise<HealthPlanSummary[]> {
    await this.context.globalState.update(this.healthPlanKey(id), undefined);
    return this.getHealthPlanIndex();
  }

  // ─── Sync preferences ──────────────────────────────────────────────────────

  /** Read all sync prefs from globalState. Defaults: everything ON except `learnings`. */
  private getSyncPrefs(): Record<string, boolean> {
    const stored = this.context.globalState.get<Record<string, boolean>>('ava.syncPrefs') ?? {};
    const keys = ['memory', 'tasks', 'journal', 'learning', 'history', 'settings', 'personality', 'learnings', 'generations', 'health_profile'] as const;
    // Default ON, except the two opt-in categories: `learnings` (shares
    // to a global pool) and `health_profile` (the most sensitive data
    // in the product — cloud backup is an explicit choice, never a
    // default).
    const optInOnly = new Set(['learnings', 'health_profile']);
    const out: Record<string, boolean> = {};
    for (const k of keys) {
      out[k] = stored[k] ?? !optInOnly.has(k);
    }
    return out;
  }

  private isSyncEnabled(dataType: string): boolean {
    return this.getSyncPrefs()[dataType] ?? true;
  }

  /** Persist a sync pref + apply it live to the manager (where applicable). */
  private async setSyncPref(
    dataType: 'memory' | 'tasks' | 'journal' | 'learning' | 'history' | 'settings' | 'personality' | 'learnings' | 'generations' | 'health_profile',
    enabled: boolean,
  ): Promise<void> {
    const stored = this.context.globalState.get<Record<string, boolean>>('ava.syncPrefs') ?? {};
    stored[dataType] = enabled;
    await this.context.globalState.update('ava.syncPrefs', stored);
    // Apply live to the manager so existing instances respect the change without restart.
    this.viewProvider?.applySyncPref(dataType, enabled);
    this.post({ type: 'sync_prefs_loaded', prefs: this.getSyncPrefs() });
  }

  /** Fire-and-forget push of current settings to /api/settings/sync. */
  private async pushSettingsToCloud(settings: DashboardSettings): Promise<void> {
    try {
      // Data Mode hard gate first, then the per-category sync pref.
      if (!cloudSyncEnabled(this.context)) return;
      if (!this.isSyncEnabled('settings')) return;
      const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
      if (!platformKey) return;
      const res = await apiFetch('/settings/sync', {
        platformKey,
        method: 'POST',
        body: { settings },
      });
      if (res.ok) {
        await this.context.globalState.update('ava.lastSettingsPushAt', new Date().toISOString());
      }
    } catch { /* best-effort */ }
  }

  /** Pull cloud settings; apply locally when cloud is newer than our last push. */
  private async pullSettingsFromCloud(platformKey: string): Promise<void> {
    try {
      const res = await apiFetch('/settings/sync', { platformKey });
      if (!res.ok || !res.data || typeof res.data !== 'object') return;
      const { settings, updated_at } = res.data as { settings?: Partial<DashboardSettings> | null; updated_at?: string };
      if (!settings || typeof settings !== 'object') return;

      const lastPush = this.context.globalState.get<string>('ava.lastSettingsPushAt');
      if (lastPush && updated_at && updated_at <= lastPush) return; // local is newer or same

      const current = this.readSettings();
      const merged: DashboardSettings = { ...current, ...settings };
      this.saveSettings(merged);
      // Avoid an immediate echo back to the cloud — record this as our new baseline.
      if (updated_at) await this.context.globalState.update('ava.lastSettingsPushAt', updated_at);
    } catch { /* offline — keep local */ }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  public post(msg: ExtToDashboardMessage): void {
    this.panel.webview.postMessage(msg);
  }

  /** Lightweight dashboard-side logger. Other code paths still call `console.log` directly;
   *  `this.log(...)` is provided for call sites that preferred the instance form. */
  private log(msg: string): void {
    // Route through the view provider's "Ava Supernova" output channel
    // when available, so dashboard logs land in the same visible channel
    // as the chat host. Falls back to console.log (Extension Host log)
    // when the panel is opened without a view provider.
    if (this.viewProvider) {
      this.viewProvider.logToChannel(`[DashboardPanel] ${msg}`);
    } else {
      console.log(`[DashboardPanel] ${msg}`);
    }
  }

  /** User-scoped ~/.ava directory. Reads the account-scoped subdir when a
   *  platform account is connected (via the owning view provider), otherwise
   *  falls back to AVA_HOME so BYOK/no-account users still write somewhere. */
  private get avaHome(): string {
    return this.viewProvider?.getAccountScopedDir() ?? AVA_HOME;
  }

  /** Platform API helper bound to the dashboard's secret store. Used by a
   *  handful of sync paths that need a raw Response (e.g. POST /learnings).
   *  Returns a Response-like object so callers can still check `.ok`. */
  private async platformFetch(
    endpointPath: string,
    init: { method?: string; body?: string; headers?: Record<string, string> } = {},
  ): Promise<{ ok: boolean; status: number }> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    const url = `https://ava-supernova.com/api${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`;
    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(platformKey ? { Authorization: `Bearer ${platformKey}` } : {}),
        ...(init.headers ?? {}),
      },
      body: init.body,
    });
    return { ok: res.ok, status: res.status };
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

  private async handleLoadNewsArticle(slug: string): Promise<void> {
    if (!slug) {
      this.post({ type: 'news_article_loaded', post: null, related: [] });
      return;
    }
    // Send loading state immediately
    this.post({ type: 'news_article_loaded', post: null, related: [], loading: true });
    try {
      const data = await httpGetJson(`https://ava-supernova.com/api/news/${encodeURIComponent(slug)}`) as
        { post?: Record<string, unknown>; related?: Array<Record<string, unknown>> };
      this.post({
        type: 'news_article_loaded',
        post: data.post ?? null,
        related: data.related ?? [],
      });
    } catch {
      this.post({ type: 'news_article_loaded', post: null, related: [] });
    }
  }

  private async handleCreativeGenerate(endpoint: string, body: Record<string, unknown>): Promise<void> {
    try {
      const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
      if (!platformKey) {
        this.post({ type: 'creative_result', success: false, error: 'Not connected. Add your account in Settings.' } as any);
        return;
      }
      // Cloud-sync hard gate — when sync is off the server skips the
      // Storage bucket upload + creative_assets insert and returns a
      // short-lived provider URL. The client is expected to save to
      // disk before the URL expires (see Creative Studio local save path).
      const res = await fetch(`https://ava-supernova.com/api/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${platformKey}`,
          'X-Ava-Data-Mode': dataModeHeader(this.context),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({ error: `Request failed (${res.status})` }))) as { error?: string };
        this.post({ type: 'creative_result', success: false, error: errData.error || `Request failed (${res.status})` } as any);
        return;
      }
      const data = await res.json();
      this.post({ type: 'creative_result', success: true, data } as any);
    } catch (err) {
      this.post({ type: 'creative_result', success: false, error: err instanceof Error ? err.message : 'Generation failed' } as any);
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

  // ─── Data Portability ─────────────────────────────────────────────────────

  private async handleExportData(dataType: string): Promise<void> {
    const fs = await import('node:fs/promises');
    const avaDir = this.getUserDataDir();

    try {
      let content = '';
      let filename = '';

      switch (dataType) {
        case 'memory': {
          const raw = await fs.readFile(path.join(avaDir, 'memory.json'), 'utf-8');
          content = raw;
          filename = 'ava-memory.json';
          break;
        }
        case 'tasks': {
          const raw = await fs.readFile(path.join(avaDir, 'tasks.json'), 'utf-8');
          content = raw;
          filename = 'ava-tasks.json';
          break;
        }
        case 'journal': {
          const journalDir = path.join(avaDir, 'journal');
          const files = await fs.readdir(journalDir).catch(() => []);
          const entries: unknown[] = [];
          for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
              const raw = await fs.readFile(path.join(journalDir, file), 'utf-8');
              entries.push(JSON.parse(raw));
            } catch { /* skip */ }
          }
          content = JSON.stringify({ journal: entries }, null, 2);
          filename = 'ava-journal.json';
          break;
        }
        case 'learning': {
          const raw = await fs.readFile(path.join(avaDir, 'learning.json'), 'utf-8');
          content = raw;
          filename = 'ava-learning.json';
          break;
        }
        case 'history': {
          const histDir = path.join(avaDir, 'history');
          const files = await fs.readdir(histDir).catch(() => []);
          const convos: unknown[] = [];
          for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
              const raw = await fs.readFile(path.join(histDir, file), 'utf-8');
              convos.push(JSON.parse(raw));
            } catch { /* skip */ }
          }
          content = JSON.stringify({ conversations: convos }, null, 2);
          filename = 'ava-history.json';
          break;
        }
        case 'settings': {
          const raw = await fs.readFile(path.join(avaDir, 'config.json'), 'utf-8');
          content = raw;
          filename = 'ava-settings.json';
          break;
        }
        case 'personality': {
          const raw = await fs.readFile(path.join(avaDir, 'personality.json'), 'utf-8');
          content = raw;
          filename = 'ava-personality.json';
          break;
        }
        default:
          this.post({ type: 'error', message: `Unknown data type: ${dataType}` });
          return;
      }

      // Use VS Code's native save dialog — webviews can't trigger downloads
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(filename),
        filters: { 'JSON': ['json'] },
      });
      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
        vscode.window.showInformationMessage(`Exported ${dataType} to ${uri.fsPath}`);
      }
    } catch (err) {
      this.post({ type: 'error', message: `Export failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  private async handleExportBundle(types: string[]): Promise<void> {
    const fs = await import('node:fs/promises');
    const JSZip = require('jszip');
    const avaDir = this.getUserDataDir();

    try {
      const zip = new JSZip();

      for (const dataType of types) {
        try {
          switch (dataType) {
            case 'memory':
              zip.file('ava-memory.json', await fs.readFile(path.join(avaDir, 'memory.json'), 'utf-8'));
              break;
            case 'tasks':
              zip.file('ava-tasks.json', await fs.readFile(path.join(avaDir, 'tasks.json'), 'utf-8'));
              break;
            case 'journal': {
              const journalDir = path.join(avaDir, 'journal');
              const files = await fs.readdir(journalDir).catch(() => []);
              const entries: unknown[] = [];
              for (const file of files) {
                if (!file.endsWith('.json')) continue;
                try { entries.push(JSON.parse(await fs.readFile(path.join(journalDir, file), 'utf-8'))); } catch { /* skip */ }
              }
              zip.file('ava-journal.json', JSON.stringify({ journal: entries }, null, 2));
              break;
            }
            case 'learning':
              zip.file('ava-learning.json', await fs.readFile(path.join(avaDir, 'learning.json'), 'utf-8'));
              break;
            case 'history': {
              const histDir = path.join(avaDir, 'history');
              const files = await fs.readdir(histDir).catch(() => []);
              const convos: unknown[] = [];
              for (const file of files) {
                if (!file.endsWith('.json')) continue;
                try { convos.push(JSON.parse(await fs.readFile(path.join(histDir, file), 'utf-8'))); } catch { /* skip */ }
              }
              zip.file('ava-history.json', JSON.stringify({ conversations: convos }, null, 2));
              break;
            }
            case 'settings':
              zip.file('ava-settings.json', await fs.readFile(path.join(avaDir, 'config.json'), 'utf-8'));
              break;
            case 'personality':
              zip.file('ava-personality.json', await fs.readFile(path.join(avaDir, 'personality.json'), 'utf-8'));
              break;
          }
        } catch { /* skip missing files */ }
      }

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('ava-data-export.zip'),
        filters: { 'ZIP Archive': ['zip'] },
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(uri, zipBuffer);
        vscode.window.showInformationMessage(`Exported ${types.length} data types to ${uri.fsPath}`);
      }
    } catch (err) {
      this.post({ type: 'error', message: `Export failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  private async handleImportData(dataType: string, content: string): Promise<void> {
    const fs = await import('node:fs/promises');
    const avaDir = this.getUserDataDir();

    try {
      let count = 0;

      switch (dataType) {
        case 'memory': {
          await fs.writeFile(path.join(avaDir, 'memory.json'), content, 'utf-8');
          const data = JSON.parse(content);
          count = data.entries?.length || 0;
          break;
        }
        case 'tasks': {
          await fs.writeFile(path.join(avaDir, 'tasks.json'), content, 'utf-8');
          const data = JSON.parse(content);
          count = data.tasks?.length || 0;
          break;
        }
        case 'journal': {
          const data = JSON.parse(content);
          const entries = data.journal || [];
          const journalDir = path.join(avaDir, 'journal');
          await fs.mkdir(journalDir, { recursive: true });
          for (const entry of entries) {
            if (entry.date) {
              await fs.writeFile(path.join(journalDir, `${entry.date}.json`), JSON.stringify(entry, null, 2), 'utf-8');
              count++;
            }
          }
          break;
        }
        case 'learning': {
          await fs.writeFile(path.join(avaDir, 'learning.json'), content, 'utf-8');
          const data = JSON.parse(content);
          count = data.curriculums?.length || 0;
          break;
        }
        case 'history': {
          const data = JSON.parse(content);
          const convos = data.conversations || [];
          const histDir = path.join(avaDir, 'history');
          await fs.mkdir(histDir, { recursive: true });
          for (const conv of convos) {
            if (conv.id) {
              await fs.writeFile(path.join(histDir, `${conv.id}.json`), JSON.stringify(conv, null, 2), 'utf-8');
              count++;
            }
          }
          break;
        }
        case 'settings': {
          await fs.writeFile(path.join(avaDir, 'config.json'), content, 'utf-8');
          count = 1;
          break;
        }
        case 'personality': {
          await fs.writeFile(path.join(avaDir, 'personality.json'), content, 'utf-8');
          count = 1;
          break;
        }
        default:
          this.post({ type: 'error', message: `Unknown data type: ${dataType}` });
          return;
      }

      this.post({ type: 'data_imported' as any, dataType, count });
    } catch (err) {
      this.post({ type: 'error', message: `Import failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'dashboard', 'index.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'dashboard', 'index.css'),
    );
    const iconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'dashboard', 'icon.png'),
    );
    // Ava's preset chat avatar — must be an absolute webview-resource://
    // URL or the <img> tag refuses to load it. Read from #root dataset
    // by the dashboard's MessageBubble at render time.
    const avaAvatarUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'dashboard', 'ava-avatar.jpeg'),
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
                 connect-src https://ava-supernova.com https://*.supabase.co;
                 img-src ${webview.cspSource} data: https: vscode-resource:;
                 media-src ${webview.cspSource} data: https: blob:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Ava | Dashboard</title>
</head>
<body>
  <div id="root" data-icon-uri="${iconUri}" data-ava-avatar-uri="${avaAvatarUri}"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
