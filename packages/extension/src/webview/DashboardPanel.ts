import * as vscode from 'vscode';
import * as os from 'node:os';
import * as path from 'node:path';
import * as https from 'node:https';
import * as http from 'node:http';

/** Normalise a Creative Studio asset type to a local-store CreativeKind. */
function normaliseCreativeKind(raw?: string): CreativeKind {
  const k = (raw ?? '').toLowerCase();
  if (k === 'video') return 'video';
  if (k === 'music' || k === 'audio') return 'music';
  if (k === 'voice') return 'voice';
  if (k === 'sfx') return 'sfx';
  return 'image';
}

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
  MemoryManager, TaskManager, migrateGlobalTasksToSubfolder, JournalManager, AVA_HOME,
  resolveLocale,
  listOpenAICompatibleModels,
  loadPersonality, savePersonality, resetPersonality,
  loadDatasetConfig, saveDatasetConfig, configPathFor,
  exportEncryptedBackup, importEncryptedBackup, gatherBundle,
  // Per-type export/import is shared with the IDE — one implementation, in core.
  exportDataType, importDataType, isCoreDataType, NotImportableError,
  type DatasetConfig,
} from '@ava/core';
import type { Personality } from '@ava/core';
import type { MemoryEntry as CoreMemoryEntry, TaskEntry as CoreTaskEntry, JournalDay, JournalEntry, JournalKind } from '@ava/core';
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
  DashboardJournalEntry,
  DashboardJournalDay,
  LibraryPath,
  LibraryPathDetail,
  LibraryPaper,
  PapersTab,
  HealthExerciseSummary,
  HealthExerciseDetail,
  HealthRecipeSummary,
  HealthRecipeDetail,
  HealthTaxonomies,
  CuratedPlanSummary,
  HealthPlanDay,
  CuratedPlanDetail,
  HealthMySubmissions,
  HealthProfile,
  GeneralProfile,
  HealthDailyPlan,
  HealthPlan,
  HealthPlanSummary,
  HealthExerciseDraft,
  HealthRecipeDraft,
  ReleaseNote,
  RoadmapTheme,
} from './dashboard-message-types.js';
import * as healthStore from './health-file-store.js';
import { readGeneralProfile, writeGeneralProfile, emptyGeneralProfile } from './general-file-store.js';
import { readLearnerProfile, writeLearnerProfile } from './learner-file-store.js';
import { deriveProgression, libraryPathToCurriculum, type LearningStore, type LibraryPathInput } from '@ava/core/learning';
import { buildCertificateMarkdown, buildCvMarkdown, renderProgressionPdf } from '@ava/core/learning/export';
import { readLocalCreativeSized, saveLocalCreative, deleteLocalCreative, pruneLocalCreative, renameLocalCreative, copyCreativeToProject, type CreativeKind } from './creative-store.js';
import { scanStorage, reclaimStorage } from './storage-scan.js';

/** Chat message types that should be forwarded to AvaViewProvider */
const CHAT_MESSAGE_TYPES = new Set([
  'send_message', 'palette_intent', 'tool_confirmation_response', 'switch_model', 'clear_chat',
  'cancel', 'interrupt', 'request_history', 'load_chat_conversation',
  'delete_chat_conversation', 'search_history', 'rename_conversation',
  'pin_conversation', 'export_conversation', 'new_chat', 'compress_context',
  'set_provider_source', 'request_memory', 'save_chat_memory', 'clear_chat_memory',
  'archive_chat_memory', 'restore_chat_memory', 'delete_chat_memory_entry',
  'pong', 'request_today_tasks', 'request_all_tasks', 'toggle_task', 'panel_create_task',
  // grant_secret must reach AvaViewProvider — it owns the SecretAccess working
  // set that resolves {{secret:<id>}} handles at tool-execution time.
  'rate_message', 'save_secrets', 'grant_secret',
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
  tencent: 'ava-supernova.provider.tencent.apiKey',
  nvidia: 'ava-supernova.provider.nvidia.apiKey',
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

  // Design Studio tool bridge — the Design Architect's tools (run in the agent)
  // send a command here; we relay it to the Design Studio webview and resolve
  // when it replies. Keyed by requestId. See requestFromDesign / handleDesignToolResult.
  private designToolPending = new Map<string, {
    resolve: (r: { ok: boolean; data?: unknown; error?: string }) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private designReqSeq = 0;

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
      // The local creative gallery lives under ~/.ava/users/<id>/creative — allow
      // the webview to load those images/videos via asWebviewUri.
      vscode.Uri.file(AVA_HOME),
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

  /** Reveal the dashboard and (re)show the welcome overlay. Used by the
   *  "Ava: Show Welcome Tour" command — non-destructive, works even when the
   *  "show on startup" setting is off. */
  public static showWelcomeTour(extensionUri: vscode.Uri, context: vscode.ExtensionContext, viewProvider?: AvaViewProvider): void {
    const existed = !!DashboardPanel.currentPanel;
    DashboardPanel.show(extensionUri, context, viewProvider);
    // If the panel was already open, post immediately. A freshly-created panel
    // shows the welcome via its init payload (when the setting is on); if the
    // setting is off, the post after webview_ready handles it.
    if (existed) DashboardPanel.currentPanel?.post({ type: 'show_welcome' });
    else DashboardPanel.currentPanel?.queueWelcomeTour();
  }

  /** Show the welcome once the webview signals ready (for freshly-opened panels). */
  private welcomeTourQueued = false;
  private announcementTimer: ReturnType<typeof setInterval> | null = null;

  /** Fetch the hub-set announcement messages (same feed as the website banner)
   *  and push them to the header ticker. Public endpoint, no key; silent on
   *  failure (offline / not signed in → no ticker). */
  private async fetchAnnouncement(): Promise<void> {
    try {
      const res = await fetch('https://ava-supernova.com/api/announcement', { headers: { accept: 'application/json' } });
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: unknown };
      const messages = Array.isArray(data.messages)
        ? data.messages.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
        : [];
      this.post({ type: 'announcement_loaded', messages } as never);
    } catch { /* offline / blocked — no ticker, no noise */ }
  }
  private queueWelcomeTour(): void {
    this.welcomeTourQueued = true;
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
        // Hub-set announcement ticker — same feed as the website banner. Fetch
        // now and refresh every 10 min so hub updates reach users in-app.
        void this.fetchAnnouncement();
        if (!this.announcementTimer) this.announcementTimer = setInterval(() => void this.fetchAnnouncement(), 10 * 60_000);
        // A "Show Welcome Tour" command opened this fresh panel — force-show
        // the overlay now that the webview is ready (covers the setting-off case).
        if (this.welcomeTourQueued) {
          this.welcomeTourQueued = false;
          this.post({ type: 'show_welcome' });
        }
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
        await this.saveLocalModel(msg.baseUrl, msg.modelName, msg.apiKey, msg.modelLabel, msg.models);
        break;

      case 'remove_local_model':
        await this.removeLocalModel();
        break;

      case 'load_local_model':
        await this.loadLocalModel();
        break;

      case 'detect_local_models':
        await this.detectLocalModels(msg.baseUrl, msg.apiKey);
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

      case 'open_portal':
        await this.openPortal();
        break;

      case 'save_settings':
        // Local-first: write to VS Code config only. No cloud push.
        this.saveSettings(msg.settings);
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
        // Persist locally + apply to the registry (was session-only before).
        if ((this.viewProvider as any)?.setSavedCategoryPermission && (msg as any).category && (msg as any).permission) {
          (this.viewProvider as any).setSavedCategoryPermission((msg as any).category, (msg as any).permission);
        }
        break;

      case 'export_audit_log': {
        // Build the exportable bundle and hand it to the user via the
        // VS Code Save-As dialog. Stays entirely on-disk — nothing ever
        // leaves the machine. Format flag chooses Markdown (human) vs
        // JSON (structured / SIEM ingest).
        const fmt = (msg as { format?: 'markdown' | 'json' }).format ?? 'markdown';
        try {
          const { readEntries, annotateIntegrity, buildExport } = require('@ava/core/audit') as typeof import('@ava/core/audit');
          const entries = annotateIntegrity(readEntries({}));
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
        // Verify each file-mutation entry against the file on disk now, and
        // detect proactive-nudge findings — both via the one shared
        // @ava/core/audit engine so the extension + IDE never drift. The
        // webview localises findings from `kind` and renders integrity badges.
        let findings: unknown[] = [];
        try {
          const { annotateIntegrity, annotateSecurity, detectPatterns } = require('@ava/core/audit') as typeof import('@ava/core/audit');
          const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          entries = annotateSecurity(annotateIntegrity(entries as any), wsRoot);
          findings = detectPatterns(entries as any);
        } catch { findings = []; }
        this.post({ type: 'audit_log', entries, findings } as any);
        break;
      }
      case 'request_audit_findings': {
        // Lightweight path for the Command Centre trust-nudge card — computes
        // just the findings (no 1000-entry payload, no integrity hashing).
        let findings: unknown[] = [];
        try {
          const { readEntries, detectPatterns } = require('@ava/core/audit') as typeof import('@ava/core/audit');
          findings = detectPatterns(readEntries({ limit: 1000 }) as any);
        } catch { findings = []; }
        this.post({ type: 'audit_findings', findings } as any);
        break;
      }

      // ─── Design Studio generate lane (shape-as-dial → Qwen → server matte) ──
      case 'asset_forge_generate': {
        const m = msg as any;
        this.handleAssetForgeGenerate(m.body).catch(() => {});
        break;
      }

      // ─── Logo lane: trace a symbol raster → SVG (server vtracer) ────────────
      case 'asset_forge_vectorize': {
        const m = msg as any;
        this.handleAssetForgeVectorize(m.imageUrl, m.mode).catch(() => {});
        break;
      }

      // ─── Logo lane: read a bundled wordmark font off disk → base64 (CSP-free)
      case 'load_logo_font': {
        const m = msg as any;
        void (async () => {
          const file = String(m.file || '').replace(/[^A-Za-z0-9._-]/g, ''); // basename-safe
          try {
            const p = vscode.Uri.joinPath(this.extensionUri, 'dist', 'dashboard', 'fonts', file).fsPath;
            const fs = await import('node:fs/promises');
            const buf = await fs.readFile(p);
            this.post({ type: 'logo_font_loaded', file, success: true, base64: buf.toString('base64') });
          } catch (err) {
            this.post({ type: 'logo_font_loaded', file, success: false, error: err instanceof Error ? err.message : 'font read failed' });
          }
        })();
        break;
      }

      // ─── Design Studio video lane (Wan 2.5 submit + poll, host-proxied) ─────
      case 'asset_forge_video': {
        const m = msg as any;
        this.handleAssetForgeVideo(m.body).catch(() => {});
        break;
      }

      // ─── Design Studio voice lane (Qwen3-TTS synchronous, host-proxied) ─────
      case 'asset_forge_voice': {
        const m = msg as any;
        this.handleAssetForgeVoice(m.body).catch(() => {});
        break;
      }

      // Design Architect tool → canvas: the webview's reply to a requestFromDesign.
      case 'design_tool_result': {
        const m = msg as any;
        this.handleDesignToolResult(m.requestId, { ok: !!m.ok, data: m.data, error: m.error });
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
            // Pass the STRING, not a Uri.
            //
            // vscode.Uri.parse() re-encodes the query, and openExternal then
            // encodes it AGAIN — a long-standing VS Code bug (microsoft/vscode
            // #135949, #83610). It's harmless for simple params, which is why
            // X / Reddit / Hacker News always worked. It destroys a param that
            // itself contains an encoded URL and newlines — i.e. exactly the
            // share-intent `?text=<headline>%0A%0A<url>` that Bluesky and mu
            // take, so the composer opened blank on the site's root.
            //
            // openExternal accepts a string and uses it verbatim; the overload
            // just isn't in the public typings, hence the cast. The `new URL`
            // check above is what keeps this safe.
            vscode.env.openExternal(msg.url as unknown as vscode.Uri);
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
        await this.startSupportConversation(msg.message, msg.category);
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

      case 'clear_all_tasks':
        await this.clearAllTasks();
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

      case 'load_journal_month':
        await this.loadJournalMonth(msg.year, msg.month);
        break;

      case 'load_journal_year':
        await this.loadJournalYear(msg.year);
        break;

      case 'load_journal_summaries':
        await this.loadJournalSummaries(msg.from, msg.to);
        break;

      case 'load_journal_kinds':
        await this.loadJournalKinds();
        break;

      case 'journal_add_entry':
        await this.addJournalEntry(msg);
        break;

      case 'journal_update_entry':
        await this.updateJournalEntry(msg);
        break;

      case 'journal_delete_entry':
        await this.deleteJournalEntryById(msg.date, msg.id);
        break;

      case 'journal_search':
        await this.searchJournal(msg);
        break;

      case 'journal_add_kind':
        await this.mutateJournalKinds((m) => m.addKind({ id: msg.id, label: msg.label, color: msg.color, tracksMood: msg.tracksMood }));
        break;

      case 'journal_update_kind':
        await this.mutateJournalKinds((m) => m.updateKind(msg.id, { label: msg.label, color: msg.color, tracksMood: msg.tracksMood }));
        break;

      case 'journal_delete_kind':
        await this.mutateJournalKinds((m) => m.deleteKind(msg.id));
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

      case 'set_active_course':
        await this.setActiveCourse(msg.id);
        break;

      case 'load_learning_profile':
        await this.loadLearningProfile();
        break;

      case 'save_learning_profile':
        await this.saveLearningProfile(msg.profile);
        break;

      case 'export_certificate':
        await this.exportProgression('certificate', msg.certId);
        break;

      case 'export_cv':
        await this.exportProgression('cv');
        break;

      case 'open_progression_folder': {
        const dir = path.join(this.getUserDataDir(), 'progression');
        try { await (await import('node:fs/promises')).mkdir(dir, { recursive: true }); } catch { /* ignore */ }
        await vscode.env.openExternal(vscode.Uri.file(dir));
        break;
      }

      case 'learning_step_progress':
        await this.persistStepProgress(msg.curriculumId, msg.lessonId, msg.stepId, msg.status, msg.lastAttempt);
        break;

      case 'learning_lesson_complete':
        await this.completeLessonInStore(msg.curriculumId, msg.lessonId, msg.score);
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
        // Local-first: the course CONTENT is public, so build the curriculum
        // locally and write it to ~/.ava/learning.json — BYOK / not-signed-in
        // users can start library courses too. The server fork (learner-count
        // analytics) is a best-effort extra only when signed in. No gate.
        try {
          const res = await fetch(`https://ava-supernova.com/api/learning/library/${msg.id}`);
          const detail = (await res.json()) as (LibraryPathInput & { id?: string }) | null;
          if (!detail || !detail.title) {
            this.post({ type: 'error', message: 'Could not load this course to start it.' });
            break;
          }
          const curriculum = libraryPathToCurriculum(detail);
          const store = await this.readLearningStore();
          store.curriculums.unshift(curriculum);
          const fs = await import('node:fs/promises');
          await fs.mkdir(this.getUserDataDir(), { recursive: true }).catch(() => {});
          await fs.writeFile(path.join(this.getUserDataDir(), 'learning.json'), JSON.stringify(store, null, 2), 'utf-8');
          // Best-effort: bump the public library's learner count when signed in.
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          if (platformKey) {
            apiFetch(`/learning/library/${msg.id}/fork`, { method: 'POST', platformKey }).catch(() => { /* analytics only */ });
          }
          this.post({ type: 'library_path_forked', curriculumId: curriculum.id, title: 'Started!' });
        } catch (err: any) {
          this.post({ type: 'error', message: err?.message || 'Failed to start learning path' });
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
        if (msg.locale && msg.locale !== 'en') params.set('locale', msg.locale);
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
        // Structured filters — collection(s)/diet/flag/cuisine are comma-separated
        // multi-selects; the single `collection` folds into the list for back-compat.
        const collSlugs = [...(msg.collection ? [msg.collection] : []), ...(msg.collections ?? [])];
        if (collSlugs.length) params.set('collection', collSlugs.join(','));
        if (msg.diets?.length) params.set('diet', msg.diets.join(','));
        if (msg.flags?.length) params.set('flag', msg.flags.join(','));
        if (msg.cuisines?.length) params.set('cuisine', msg.cuisines.join(','));
        if (msg.maxTime != null) params.set('max_time', String(msg.maxTime));
        if (msg.sort) params.set('sort', msg.sort);
        if (msg.q && msg.q.trim()) params.set('q', msg.q.trim());
        if (msg.locale && msg.locale !== 'en') params.set('locale', msg.locale);
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
          const exDetailQs = msg.locale && msg.locale !== 'en' ? `?locale=${encodeURIComponent(msg.locale)}` : '';
          const res = await apiFetch(`/health/exercises/${encodeURIComponent(msg.slug)}${exDetailQs}`, {
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
          const recDetailQs = msg.locale && msg.locale !== 'en' ? `?locale=${encodeURIComponent(msg.locale)}` : '';
          const res = await apiFetch(`/health/recipes/${encodeURIComponent(msg.slug)}${recDetailQs}`, {
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

      // ── Ask Ava to change ONE day ────────────────────────────────────
      // Same dual auth as the draft generators: a platform key spends credits,
      // the caller's own provider key spends nothing. It PROPOSES — the reply
      // is a day the operator can accept or discard, never a write.
      case 'generate_health_day': {
        try {
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          const byokKey = await this.secrets.get('ava-supernova.provider.qwen.apiKey');
          const extraHeaders: Record<string, string> = {};
          if (!platformKey && byokKey) extraHeaders['X-BYOK-Key'] = byokKey;
          if (!platformKey && !byokKey) {
            this.post({
              type: 'health_day_generated',
              ok: false,
              error: 'Ava generation needs a platform account or your own provider key in Settings.',
            });
            break;
          }
          const res = await apiFetch('/health/generate/day', {
            platformKey,
            method: 'POST',
            body: {
              type: msg.planType,
              goal: msg.goal,
              profile: msg.profile,
              day: msg.day,
              week: msg.week,
              instruction: msg.instruction,
              date: msg.date,
              ...(byokKey && !platformKey ? { providerApiKey: byokKey } : {}),
            },
            extraHeaders,
            timeoutMs: 120000,
          });
          if (!res.ok) {
            const errorMsg = res.data && typeof res.data === 'object' && 'error' in res.data
              ? String((res.data as { error?: string }).error ?? `HTTP ${res.status}`)
              : `HTTP ${res.status}`;
            this.log(`[health] day assist failed: ${errorMsg}`);
            this.post({ type: 'health_day_generated', ok: false, error: errorMsg });
            break;
          }
          const data = res.data as {
            day?: HealthPlanDay; note?: string; credits_charged?: number; unverifiable_allergens?: string[];
          };
          this.post({
            type: 'health_day_generated',
            ok: true,
            day: data.day,
            note: data.note ?? '',
            credits_charged: data.credits_charged ?? 0,
            unverifiable_allergens: data.unverifiable_allergens ?? [],
          });
        } catch (err) {
          this.post({ type: 'health_day_generated', ok: false, error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }
      // ── Curated plans ────────────────────────────────────────────────
      // The shelf, and one template in full. Read-only and unauthenticated:
      // a starter is public, and gating it behind an account would break the
      // one promise the feature makes — a good week on day one, for free.
      case 'load_curated_plans': {
        try {
          const raw = await httpGetJson('https://ava-supernova.com/api/health/curated-plans') as
            { plans?: CuratedPlanSummary[] } | CuratedPlanSummary[] | null;
          const plans = Array.isArray(raw) ? raw : (raw?.plans ?? []);
          this.log(`[health] curated plans loaded n=${plans.length}`);
          this.post({ type: 'curated_plans_loaded', plans });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          this.log(`[health] curated plans failed: ${error}`);
          this.post({ type: 'curated_plans_failed', error });
        }
        return;
      }
      case 'load_curated_plan': {
        const id = msg.id;
        try {
          const raw = await httpGetJson(
            `https://ava-supernova.com/api/health/curated-plans?id=${encodeURIComponent(id)}`,
          ) as { plan?: CuratedPlanDetail } | CuratedPlanDetail | null;
          const plan = (raw && 'plan' in (raw as object) ? (raw as { plan?: CuratedPlanDetail }).plan : raw as CuratedPlanDetail) ?? null;
          if (!plan || !plan.id) throw new Error('Plan not found');
          this.post({ type: 'curated_plan_loaded', plan });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          this.log(`[health] curated plan ${id} failed: ${error}`);
          this.post({ type: 'curated_plan_failed', id, error });
        }
        return;
      }
      case 'curated_plan_started': {
        // Deliberately silent both ways. A counter must never be the reason
        // somebody's plan fails to start, and there is nothing for the UI to
        // do about it either way.
        try {
          await apiFetch('/health/curated-plans/started', {
            method: 'POST',
            body: JSON.stringify({ id: msg.id }),
            timeoutMs: 5000,
          });
        } catch { /* the start already happened locally */ }
        return;
      }
      case 'load_health_taxonomies': {
        const empty: HealthTaxonomies = { allergens: [], contraindications: [], cuisines: [], diets: [], dietary_flags: [], collections: [] };
        this.log('[health] load taxonomies — start');
        try {
          // Use the Node https helper instead of global fetch — global
          // fetch has been unreliable in some VSCode extension host
          // builds; httpGetJson talks to the same endpoint via Node's
          // native https stack with no extra runtime surface.
          const raw = await httpGetJson('https://ava-supernova.com/api/health/taxonomies') as Partial<HealthTaxonomies> | null;
          // Normalise every axis to an array — older API builds (pre-deploy)
          // don't return `collections`, and a missing field must never crash
          // the filter UI's `.length` reads.
          const data: HealthTaxonomies = {
            allergens: raw?.allergens ?? [],
            contraindications: raw?.contraindications ?? [],
            cuisines: raw?.cuisines ?? [],
            diets: raw?.diets ?? [],
            dietary_flags: raw?.dietary_flags ?? [],
            collections: raw?.collections ?? [],
          };
          this.log(`[health] taxonomies loaded a=${data.allergens.length} c=${data.contraindications.length} cu=${data.cuisines.length} col=${data.collections.length}`);
          this.post({ type: 'health_taxonomies_loaded', taxonomies: data });
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
        await healthStore.writeProfile(this.healthDir(), profile);
        this.post({ type: 'health_profile_saved', profile });
        break;
      }

      case 'load_general_profile': {
        this.post({ type: 'general_profile_loaded', profile: this.getGeneralProfile() });
        break;
      }

      case 'save_general_profile': {
        const profile: GeneralProfile = {
          ...msg.profile,
          schema_version: 1,
          updated_at: new Date().toISOString(),
        };
        await writeGeneralProfile(this.getUserDataDir(), profile);
        this.post({ type: 'general_profile_saved', profile });
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
        await healthStore.writeDailyPlan(this.healthDir(), plan);
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

      case 'load_active_health_plans': {
        this.post({ type: 'active_health_plans_loaded', plans: this.getActiveHealthPlans() });
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
        const params = new URLSearchParams({ limit: '24', offset: String(msg.offset ?? 0) });
        if (msg.q && msg.q.trim()) params.set('q', msg.q.trim());
        if (msg.workoutType) params.set('workout_type', msg.workoutType);
        try {
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          const res = await apiFetch(`/health/exercises?${params.toString()}`, { platformKey, method: 'GET', timeoutMs: 8000 });
          const data = (res.ok ? res.data : {}) as { exercises?: HealthExerciseSummary[]; total?: number };
          this.post({ type: 'plan_exercises_searched', exercises: data.exercises ?? [], total: data.total ?? 0, seq });
        } catch {
          this.post({ type: 'plan_exercises_searched', exercises: [], total: 0, seq });
        }
        break;
      }

      case 'search_plan_recipes': {
        const seq = msg.seq;
        const params = new URLSearchParams({ limit: '24', offset: String(msg.offset ?? 0) });
        if (msg.q && msg.q.trim()) params.set('q', msg.q.trim());
        if (msg.course) params.set('course', msg.course);
        try {
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          const res = await apiFetch(`/health/recipes?${params.toString()}`, { platformKey, method: 'GET', timeoutMs: 8000 });
          const data = (res.ok ? res.data : {}) as { recipes?: HealthRecipeSummary[]; total?: number };
          this.post({ type: 'plan_recipes_searched', recipes: data.recipes ?? [], total: data.total ?? 0, seq });
        } catch {
          this.post({ type: 'plan_recipes_searched', recipes: [], total: 0, seq });
        }
        break;
      }

      case 'load_plan_exercise_detail': {
        const slug = msg.slug;
        try {
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          const res = await apiFetch(`/health/exercises/${encodeURIComponent(slug)}`, { platformKey, method: 'GET', timeoutMs: 8000 });
          const data = (res.ok ? res.data : {}) as { exercise?: HealthExerciseDetail | null };
          this.post({ type: 'plan_exercise_detail_loaded', slug, exercise: data.exercise ?? null });
        } catch {
          this.post({ type: 'plan_exercise_detail_loaded', slug, exercise: null });
        }
        break;
      }

      case 'load_plan_recipe_detail': {
        const slug = msg.slug;
        try {
          const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
          const res = await apiFetch(`/health/recipes/${encodeURIComponent(slug)}`, { platformKey, method: 'GET', timeoutMs: 8000 });
          const data = (res.ok ? res.data : {}) as { recipe?: HealthRecipeDetail | null };
          this.post({ type: 'plan_recipe_detail_loaded', slug, recipe: data.recipe ?? null });
        } catch {
          this.post({ type: 'plan_recipe_detail_loaded', slug, recipe: null });
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
          const general = this.getGeneralProfile();
          const plan = this.getHealthDailyPlan(msg.date);

          // Derive age from DOB so the model sees the current age,
          // not a snapshot from years ago. Body basics come from the general
          // profile now.
          let age: number | null = null;
          if (general.date_of_birth) {
            const dob = new Date(general.date_of_birth);
            const now = new Date();
            if (!Number.isNaN(dob.getTime())) {
              age = now.getFullYear() - dob.getFullYear() - (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
            }
          }

          const context = {
            date: msg.date,
            hour: new Date().getHours(),
            profile: {
              sex: general.sex,
              age_years: age,
              height_cm: general.height_cm,
              weight_kg: general.weight_kg,
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
          await healthStore.writeDailyPlan(this.healthDir(), nextPlan);

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

      case 'load_local_creative':
        await this.loadLocalCreative();
        break;

      case 'delete_local_creative':
        await deleteLocalCreative(this.getUserDataDir(), msg.id);
        await this.loadLocalCreative();
        break;

      case 'rename_local_creative': {
        const renamed = await renameLocalCreative(this.getUserDataDir(), msg.id, msg.title);
        if (renamed) await this.loadLocalCreative();
        break;
      }

      case 'use_creative_in_project': {
        // Copy a Studio asset into the open project. The library lives outside
        // any project, so referencing it from code would only ever work on this
        // machine — the file has to actually come across.
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
          vscode.window.showWarningMessage('Open a project folder first — there\'s nowhere to copy the asset to.');
          break;
        }
        try {
          const copied = await copyCreativeToProject(this.getUserDataDir(), msg.id, folders[0].uri.fsPath);
          if (!copied) {
            vscode.window.showWarningMessage('Could not find that asset to copy.');
            break;
          }
          this.log(`[Creative] Copied asset ${msg.id} -> ${copied.relPath}`);
          // Refresh the project-files view so it shows up immediately.
          await this.loadLibraryFiles();
          const action = await vscode.window.showInformationMessage(
            `Copied to ${copied.relPath}`,
            'Copy path',
            'Reveal',
          );
          if (action === 'Copy path') await vscode.env.clipboard.writeText(copied.relPath);
          else if (action === 'Reveal') await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(copied.absPath));
        } catch (err) {
          const m = err instanceof Error ? err.message : String(err);
          this.log(`[Creative] Copy to project failed: ${m}`);
          vscode.window.showErrorMessage(`Couldn't copy the asset into the project: ${m}`);
        }
        break;
      }

      case 'prune_creative': {
        const removed = await pruneLocalCreative(this.getUserDataDir(), msg.ids);
        this.log(`[Creative] Pruned ${removed} local asset(s)`);
        await this.loadLocalCreative();
        break;
      }

      case 'get_storage_scan': {
        const scan = await scanStorage(AVA_HOME);
        this.post({ type: 'storage_scan_loaded', scan });
        break;
      }

      case 'reclaim_storage': {
        const freed = await reclaimStorage(msg.paths, AVA_HOME);
        this.log(`[Storage] Reclaimed ${(freed / 1_048_576).toFixed(1)} MB`);
        const scan = await scanStorage(AVA_HOME);
        this.post({ type: 'storage_scan_loaded', scan });
        break;
      }

      case 'open_storage_folder': {
        try { await vscode.env.openExternal(vscode.Uri.file(AVA_HOME)); } catch { /* ignore */ }
        break;
      }

      case 'open_creative_folder': {
        const dir = path.join(this.getUserDataDir(), 'creative');
        try { await (await import('node:fs/promises')).mkdir(dir, { recursive: true }); } catch { /* ignore */ }
        await vscode.env.openExternal(vscode.Uri.file(dir));
        break;
      }

      case 'download_cloud_asset':
        await this.downloadCloudAsset(msg.url, msg.filename);
        break;

      case 'save_asset_copy':
        await this.saveAssetCopy(msg.url, msg.filename);
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
        // Creative Studio generated an asset — save it to the account-scoped
        // LOCAL creative gallery (~/.ava/users/<id>/creative). Local-first, no
        // cloud, no workspace required.
        if (msg.url) {
          const kind = normaliseCreativeKind(msg.assetType);
          const saved = await saveLocalCreative(this.getUserDataDir(), {
            url: msg.url,
            kind,
            designType: msg.designType,
            prompt: msg.prompt ?? '',
            title: msg.filename ?? '',
            id: msg.id,   // logo variants pass a shared-prefix id so the Library groups them
          });
          if (saved) {
            this.log(`[Creative] Saved ${kind} locally (${saved.path})`);
            await this.loadLocalCreative();
          } else {
            this.log(`[Creative] Local save failed for ${msg.url}`);
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
      case 'open_tasks_folder': {
        // Open the account-scoped tasks folder on disk — same dir the dashboard
        // TaskManager reads from. Handled locally here (not forwarded to the
        // sidebar) so it works whether or not the chat view is alive.
        try {
          const dir = path.join(this.getUserDataDir(), 'tasks');
          const fs = await import('node:fs/promises');
          await fs.mkdir(dir, { recursive: true }).catch(() => {});
          await vscode.env.openExternal(vscode.Uri.file(dir));
        } catch (err: any) {
          this.post({ type: 'error', message: `Open tasks folder failed: ${err?.message || err}` });
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

      case 'set_welcome_on_startup':
        // The welcome overlay's "Show on startup" checkbox. Persists to the
        // VS Code setting so it also appears (and can be re-enabled) in Settings.
        await vscode.workspace.getConfiguration('ava-supernova').update(
          'preferences.showWelcomeOnStartup', msg.enabled, vscode.ConfigurationTarget.Global,
        );
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

      case 'export_encrypted_backup':
        await this.handleExportEncryptedBackup((msg as { passphrase?: string }).passphrase ?? '');
        break;

      case 'export_readable_all':
        await this.handleExportReadableAll();
        break;

      case 'import_encrypted_backup':
        await this.handleImportEncryptedBackup(
          (msg as { content?: string }).content ?? '',
          (msg as { passphrase?: string }).passphrase ?? '',
          (msg as { overwrite?: boolean }).overwrite,
        );
        break;

      case 'import_data':
        await this.handleImportData((msg as any).dataType, (msg as any).content);
        break;

      case 'import_pick_files': {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectMany: true,
          filters: { 'Ava data': ['json', 'ava-backup'] },
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
    // Persisted Platform/API-Key choice so the NavSidebar toggle renders the
    // host's ACTUAL routing source on load (not just a key-presence guess) —
    // keeps the toggle honest and in sync with the chat-header switch.
    const providerSource = this.context.workspaceState.get<'platform' | 'byok'>('providerSource');

    // Post init with account=null. The webview reads `platformKey` to
    // know the user is signed in but the account snapshot is still
    // loading — surfaces (NavSidebar account block, Billing) show their
    // own loading state until account_updated arrives.
    // Welcome overlay gate — shows on the dashboard on every startup while the
    // "show welcome on startup" preference is on (default true), for everyone
    // regardless of sign-in. The overlay's checkbox + the VS Code setting toggle it.
    const welcomeOnStartup = vscode.workspace.getConfiguration('ava-supernova').get<boolean>('preferences.showWelcomeOnStartup') ?? true;
    this.post({ type: 'init', account: null, connections, settings, providerKeys, locale, platformKey: platformKey || undefined, providerSource, showWelcome: welcomeOnStartup, welcomeOnStartup });

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
            // The journal manager may have been cached against the un-scoped
            // fallback dir (~/.ava) on dashboard mount — drop it so it rebuilds
            // against the scoped dir, or a signed-in user's Ava-written entries
            // (which land under ~/.ava/users/<id>/journal) never appear. Then
            // re-emit this month so a Planner journal opened before the account
            // resolved corrects itself (same fix the health re-emit below does).
            this.journalManager = undefined;
            { const now = new Date(); this.loadJournalMonth(now.getFullYear(), now.getMonth() + 1).catch(() => { /* non-fatal */ }); }
            // Memory load gated on account success — fire-and-forget too.
            this.loadMemories().catch(() => { /* non-fatal */ });
            // Re-emit sync status now the scoped path is known, so a
            // Sync page opened before this resolved corrects its counts.
            this.loadSyncStatus().catch(() => { /* non-fatal */ });
            // Re-emit health data too. It loaded on dashboard mount against the
            // un-scoped fallback dir (~/.ava — empty for signed-in users whose
            // data lives under ~/.ava/users/<id>), so the Command Center, Plans
            // and profile would otherwise show nothing until a manual reload.
            try {
              this.post({ type: 'active_health_plans_loaded', plans: this.getActiveHealthPlans() });
              this.post({ type: 'health_plans_loaded', plans: this.getHealthPlanIndex() });
              this.post({ type: 'health_profile_loaded', profile: this.getHealthProfile() });
              this.post({ type: 'general_profile_loaded', profile: this.getGeneralProfile() });
            } catch { /* non-fatal — surfaces refetch on next navigation */ }
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

    // Settings are LOCAL-FIRST — no cloud pull. They live in your VS Code
    // config and stay on-device (cloud is sunsetting).
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
  // Full local+cloud memory list, sorted, built once per load. The panel pages
  // through it (a 2,500+ memory store froze the webview when posted at once).
  private memoryCache: MemoryEntry[] = [];
  private static readonly MEMORY_PAGE_SIZE = 100;

  private async loadMemories(): Promise<void> {
    this.memoryOffset = 0;
    const byId = new Map<string, MemoryEntry>();

    // LOCAL-FIRST. Read the on-device memory (the v3 graph, via getEntries)
    // so memories show even when the user is local-only — the cloud is opt-in
    // and empty for them, so reading only /memories showed 0 while the local
    // graph held hundreds. Use the AGENT's memory manager when available: it's
    // scoped to the signed-in account dir (~/.ava/users/<id>) where saves land,
    // whereas this panel's own manager defaults to ~/.ava and would miss them.
    try {
      const mgr = (this.viewProvider as unknown as { memoryManager?: MemoryManager }).memoryManager
        ?? this.getMemoryManager();
      const [g, p] = await Promise.all([
        mgr.getEntries('global'),
        mgr.getEntries('project').catch(() => [] as CoreMemoryEntry[]),
      ]);
      for (const e of g) byId.set(e.id, this.coreToDisplayEntry(e, 'global'));
      for (const e of p) byId.set(e.id, this.coreToDisplayEntry(e, 'project'));
    } catch (err) {
      console.error('[Ava] loadMemories local read error:', err);
    }

    // Cloud on top — for signed-in users who DO sync. Local id wins on clash.
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (platformKey) {
      try {
        const res = await apiFetch('/memories?limit=100&offset=0', { platformKey });
        if (res.ok) {
          const body = res.data as { memories?: MemoryEntry[] } | MemoryEntry[];
          const cloud = Array.isArray(body) ? body : (body.memories || []);
          for (const m of cloud) if (m?.id && !byId.has(m.id)) byId.set(m.id, m);
        }
      } catch (err) {
        console.error('[Ava] loadMemories cloud error:', err);
      }
    }

    // Sort newest-first and cache; post only the first page so a large store
    // doesn't freeze the webview. Subsequent pages come via loadMoreMemories.
    const all = [...byId.values()].sort((a, b) =>
      new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
    this.memoryCache = all;
    const page = all.slice(0, DashboardPanel.MEMORY_PAGE_SIZE);
    this.memoryOffset = page.length;
    console.log(`[Ava] loadMemories: ${all.length} memories (local-first), showing first ${page.length}`);
    this.post({ type: 'memories_loaded', memories: page, total: all.length, hasMore: all.length > page.length });
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

  private loadMoreMemories(): void {
    // Page through the cached local+cloud list built in loadMemories — no
    // round-trip, no re-read of the whole graph.
    const page = this.memoryCache.slice(this.memoryOffset, this.memoryOffset + DashboardPanel.MEMORY_PAGE_SIZE);
    this.memoryOffset += page.length;
    this.post({
      type: 'memories_more_loaded',
      memories: page,
      total: this.memoryCache.length,
      hasMore: this.memoryOffset < this.memoryCache.length,
    });
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

    // Clear both UI lists — the Memory page may render either the cloud or the
    // local list depending on account state, so empty both to be sure.
    this.post({ type: 'memories_loaded', memories: [], total: 0, hasMore: false });
    this.post({ type: 'local_memories_loaded', memories: [] });
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
      tencent: Boolean(await this.secrets.get(PROVIDER_KEY_SECRETS.tencent)),
      nvidia: Boolean(await this.secrets.get(PROVIDER_KEY_SECRETS.nvidia)),
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
    models?: string[],
  ): Promise<void> {
    if (baseUrl?.trim()) {
      await this.secrets.store('ava-supernova.provider.local.baseUrl', baseUrl.trim());
    }
    if (modelName?.trim()) {
      await this.secrets.store('ava-supernova.provider.local.modelName', modelName.trim());
    }
    // Enabled-model list (from Detect) — the set surfaced in the picker under
    // "Local". A single manual model name is the fallback (see loadLocalModel).
    const cleanModels = (models ?? []).map((m) => m.trim()).filter(Boolean);
    if (cleanModels.length > 0) {
      await this.secrets.store('ava-supernova.provider.local.models', JSON.stringify(cleanModels));
    } else {
      await this.secrets.delete('ava-supernova.provider.local.models');
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
    await this.secrets.delete('ava-supernova.provider.local.models');
    await this.secrets.delete('ava-supernova.provider.local.apiKey');
    await this.secrets.delete('ava-supernova.provider.local.modelLabel');
    await this.loadLocalModel();
  }

  private async loadLocalModel(): Promise<void> {
    const baseUrl = (await this.secrets.get('ava-supernova.provider.local.baseUrl')) || '';
    const modelName = (await this.secrets.get('ava-supernova.provider.local.modelName')) || '';
    const apiKey = (await this.secrets.get('ava-supernova.provider.local.apiKey')) || '';
    const modelLabel = (await this.secrets.get('ava-supernova.provider.local.modelLabel')) || '';
    let models: string[] = [];
    try {
      const raw = await this.secrets.get('ava-supernova.provider.local.models');
      if (raw) models = (JSON.parse(raw) as string[]).filter((m) => typeof m === 'string');
    } catch { /* corrupt → fall back to single model below */ }
    this.post({ type: 'local_model_loaded', baseUrl, modelName, hasApiKey: !!apiKey, modelLabel, models });
  }

  /** Detect the models an OpenAI-compatible endpoint is serving (GET /models),
   *  host-side so localhost is reachable without webview CORS. */
  private async detectLocalModels(baseUrl: string, apiKey?: string): Promise<void> {
    if (!baseUrl?.trim()) {
      this.post({ type: 'local_models_detected', models: [], error: 'Enter a base URL first.' });
      return;
    }
    try {
      const models = await listOpenAICompatibleModels(baseUrl.trim(), apiKey?.trim() || undefined);
      this.post({ type: 'local_models_detected', models });
    } catch (err) {
      this.post({
        type: 'local_models_detected',
        models: [],
        error: err instanceof Error ? err.message : 'Could not reach that endpoint.',
      });
    }
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
    // handleChatMessage's remap switch keys on 'load_chat_conversation' — NOT
    // 'load_conversation' (that's the already-mapped internal type). Sending
    // the internal type here hit the switch's `default: return` and was
    // silently dropped, so clicking a row in History → Conversations did
    // nothing. Use the dashboard-facing type so it maps + loads.
    await this.viewProvider.handleChatMessage({ type: 'load_chat_conversation', conversationId: id });
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

  private async startSupportConversation(message: string, category?: string | null): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch('/support/conversations', {
        method: 'POST',
        body: { message, platform: 'extension', category: category ?? null },
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

  /** Load the account-scoped LOCAL creative gallery (~/.ava/users/<id>/creative)
   *  and post it to the Assets tab. Local-first — no cloud fetch. Binaries are
   *  served to the webview via asWebviewUri (AVA_HOME is in localResourceRoots). */
  private async loadLocalCreative(): Promise<void> {
    try {
      const items = await readLocalCreativeSized(this.getUserDataDir());
      const assets = items.map((it) => {
        const uri = this.panel.webview.asWebviewUri(vscode.Uri.file(it.absolutePath)).toString();
        return {
          id: it.id,
          asset_type: it.kind,
          design_type: it.designType,
          size_bytes: it.bytes,
          title: it.title || 'Untitled',
          prompt: it.prompt || '',
          url: uri,
          thumbnail_url: it.kind === 'image' ? uri : undefined,
          created_at: it.createdAt,
        };
      });
      this.post({ type: 'local_creative_loaded', assets: assets as never });
    } catch {
      this.post({ type: 'local_creative_loaded', assets: [] });
    }
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
      // Clear both UI lists — the Memory page may render either source.
      this.post({ type: 'local_memories_loaded', memories: [] });
      this.post({ type: 'memories_loaded', memories: [], total: 0, hasMore: false });
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
      const scopedRoot = this.getUserDataDir();
      migrateGlobalTasksToSubfolder(scopedRoot);
      const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      this.taskManager = new TaskManager({ globalDir: path.join(scopedRoot, 'tasks'), projectRoot });
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

  /** Enforce single-active in a curriculums array: if more than one is 'active',
   *  keep the most-recently-updated and pause the rest. Returns true if it changed
   *  anything (so the caller can persist). */
  private healSingleActive(curriculums: Array<{ id: string; status: string; updated_at?: string }>): boolean {
    const actives = curriculums.filter((c) => c.status === 'active');
    if (actives.length <= 1) return false;
    const keep = actives.slice().sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))[0];
    for (const c of actives) if (c.id !== keep.id) c.status = 'paused';
    return true;
  }

  private async loadLearning(): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const learningPath = path.join(this.getUserDataDir(), 'learning.json');
      const raw = await fs.readFile(learningPath, 'utf-8');
      const store = JSON.parse(raw);
      const curriculums = Array.isArray(store.curriculums) ? store.curriculums : [];
      // Self-heal legacy stores that ended up with multiple actives.
      if (this.healSingleActive(curriculums)) {
        try { await fs.writeFile(learningPath, JSON.stringify(store, null, 2), 'utf-8'); } catch { /* best-effort */ }
      }
      this.post({ type: 'learning_loaded', curriculums });
    } catch {
      this.post({ type: 'learning_loaded', curriculums: [] });
    }
  }

  /** Read the LearningStore, derive the earned progression, merge with the
   *  editable learner.json, and post the combined Progression payload. */
  private async loadLearningProfile(): Promise<void> {
    const dir = this.getUserDataDir();
    let progression;
    try {
      const fs = await import('node:fs/promises');
      const raw = await fs.readFile(path.join(dir, 'learning.json'), 'utf-8');
      const store = JSON.parse(raw) as LearningStore;
      if (!store.streaks) store.streaks = { current: 0, longest: 0, lastActiveDate: null };
      if (!Array.isArray(store.curriculums)) store.curriculums = [];
      progression = deriveProgression(store);
    } catch {
      // No learning yet — derive from an empty store so the page renders cleanly.
      progression = deriveProgression({ curriculums: [], streaks: { current: 0, longest: 0, lastActiveDate: null } });
    }
    const profile = readLearnerProfile(dir);
    this.post({ type: 'learning_profile_loaded', payload: { profile, progression } });
  }

  /** Persist the editable learner.json, then re-derive + re-post so the page
   *  reflects edits (and any self→earned graduation) immediately. */
  private async saveLearningProfile(profile: import('./dashboard-message-types.js').LearnerProfile): Promise<void> {
    try {
      await writeLearnerProfile(this.getUserDataDir(), profile);
    } catch {
      this.post({ type: 'error', message: 'Failed to save your profile.' });
    }
    await this.loadLearningProfile();
  }

  /** Read the LearningStore from disk with safe defaults. */
  private async readLearningStore(): Promise<LearningStore> {
    try {
      const fs = await import('node:fs/promises');
      const raw = await fs.readFile(path.join(this.getUserDataDir(), 'learning.json'), 'utf-8');
      const store = JSON.parse(raw) as LearningStore;
      if (!store.streaks) store.streaks = { current: 0, longest: 0, lastActiveDate: null };
      if (!Array.isArray(store.curriculums)) store.curriculums = [];
      return store;
    } catch {
      return { curriculums: [], streaks: { current: 0, longest: 0, lastActiveDate: null } };
    }
  }

  /** Render a certificate or CV to a branded PDF, save it under the local
   *  progression/ folder, and open it. Mirrors the Creative Studio save path. */
  private async exportProgression(kind: 'certificate' | 'cv', certId?: string): Promise<void> {
    try {
      const dir0 = this.getUserDataDir();
      const prog = deriveProgression(await this.readLearningStore());
      const profile = readLearnerProfile(dir0);
      const name = profile.identity.display_name || 'Learner';

      let markdown: string;
      let outDir: string;
      let fileName: string;
      if (kind === 'certificate') {
        const cert = prog.certificates.find((c) => c.id === certId);
        if (!cert) { this.post({ type: 'progression_export_done', kind, ok: false }); return; }
        markdown = buildCertificateMarkdown(cert, name);
        outDir = path.join(dir0, 'progression', 'certificates');
        fileName = `certificate_${cert.subject.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${cert.hash}.pdf`;
      } else {
        const earnedNames = new Set(prog.skills.map((s) => s.name.toLowerCase()));
        markdown = buildCvMarkdown({
          name,
          headline: profile.identity.headline,
          bio: profile.identity.bio,
          progression: prog,
          selfSkills: profile.self.skills.filter((s) => !earnedNames.has(s.trim().toLowerCase())),
          selfAchievements: profile.self.achievements.map((a) => a.title),
        });
        outDir = path.join(dir0, 'progression', 'cv');
        fileName = 'learning_cv.pdf';
      }

      const pdf = await renderProgressionPdf(markdown);
      const fs = await import('node:fs/promises');
      await fs.mkdir(outDir, { recursive: true });
      const file = path.join(outDir, fileName);
      await fs.writeFile(file, pdf);
      await vscode.env.openExternal(vscode.Uri.file(file));
      this.post({ type: 'progression_export_done', kind, ok: true, path: file });
    } catch {
      this.post({ type: 'progression_export_done', kind, ok: false });
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

  /** Make one course the single active one (others active→paused, progress kept).
   *  Completed courses stay completed unless this IS the chosen course. Re-posts
   *  learning_loaded + the progression profile so the UI + Ava's context update. */
  private async setActiveCourse(id: string): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const learningPath = path.join(this.getUserDataDir(), 'learning.json');
      const store = JSON.parse(await fs.readFile(learningPath, 'utf-8'));
      const curriculums = Array.isArray(store.curriculums) ? store.curriculums : [];
      const target = curriculums.find((c: { id: string }) => c.id === id);
      if (!target) return;
      for (const c of curriculums as Array<{ id: string; status: string }>) {
        if (c.status === 'completed' && c.id !== id) continue;
        c.status = c.id === id ? 'active' : 'paused';
      }
      await fs.writeFile(learningPath, JSON.stringify(store, null, 2), 'utf-8');
      this.post({ type: 'learning_loaded', curriculums });
    } catch {
      this.post({ type: 'error', message: 'Failed to set the active course.' });
    }
    await this.loadLearningProfile();
  }

  // ── Interactive lesson player → persist progress to the learning store ──
  // The dashboard player writes back to the same learning.json the core
  // learning tools read, so on her next turn Ava sees per-step progress + the
  // learner's last attempts and can resume them exactly where they left off.

  private async persistStepProgress(
    curriculumId: string,
    lessonId: string,
    stepId: string,
    status: 'attempted' | 'mastered',
    lastAttempt: string | null,
  ): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const learningPath = path.join(this.getUserDataDir(), 'learning.json');
      const store = JSON.parse(await fs.readFile(learningPath, 'utf-8'));
      const lesson = this.locateLesson(store, curriculumId, lessonId);
      const step = lesson?.steps?.find((s: { id: string }) => s.id === stepId);
      if (!step) return;
      step.status = status;
      step.attempts = (step.attempts ?? 0) + 1;
      step.last_attempt = lastAttempt;
      if (lesson.status === 'not_started') {
        lesson.status = 'in_progress';
        lesson.started_at = lesson.started_at ?? new Date().toISOString();
      }
      await fs.writeFile(learningPath, JSON.stringify(store, null, 2), 'utf-8');
    } catch { /* best-effort — local copy is the source of truth */ }
  }

  private async completeLessonInStore(curriculumId: string, lessonId: string, score: number): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const learningPath = path.join(this.getUserDataDir(), 'learning.json');
      const store = JSON.parse(await fs.readFile(learningPath, 'utf-8'));
      const curr = (store.curriculums ?? []).find((c: { id: string }) => c.id === curriculumId);
      const lesson = this.locateLesson(store, curriculumId, lessonId);
      if (!curr || !lesson) return;
      lesson.status = 'completed';
      lesson.score = score;
      lesson.best_score = Math.max(lesson.best_score ?? 0, score);
      lesson.completed_at = new Date().toISOString();
      // Recompute module + curriculum progress so the UI bars + ticks update.
      for (const mod of curr.modules ?? []) {
        const lessons = mod.lessons ?? [];
        if (lessons.length === 0) continue;
        const done = lessons.filter((l: { status: string }) => l.status === 'completed').length;
        mod.progress_percent = Math.round((done / lessons.length) * 100);
        if (mod.progress_percent === 100) mod.status = 'completed';
        else if (done > 0 || lessons.some((l: { status: string }) => l.status === 'in_progress')) {
          mod.status = mod.status === 'locked' ? 'locked' : 'in_progress';
        }
      }
      const mods = curr.modules ?? [];
      if (mods.length > 0) {
        curr.progress_percent = Math.round(
          mods.reduce((s: number, m: { progress_percent?: number }) => s + (m.progress_percent ?? 0), 0) / mods.length,
        );
        if (curr.progress_percent === 100) curr.status = 'completed';
      }
      await fs.writeFile(learningPath, JSON.stringify(store, null, 2), 'utf-8');
      this.post({ type: 'learning_loaded', curriculums: Array.isArray(store.curriculums) ? store.curriculums : [] });
    } catch { /* best-effort */ }
  }

  /** Locate a lesson within the parsed (untyped) learning store JSON. */
  private locateLesson(
    store: { curriculums?: Array<{ id: string; modules?: Array<{ lessons?: Array<{ id: string }> }> }> },
    curriculumId: string,
    lessonId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    const curr = (store.curriculums ?? []).find((c) => c.id === curriculumId);
    for (const mod of curr?.modules ?? []) {
      const lesson = (mod.lessons ?? []).find((l) => l.id === lessonId);
      if (lesson) return lesson;
    }
    return null;
  }

  private async createTask(msg: { title: string; description?: string; priority?: string; category?: string; due_date?: string; recurrence?: string }): Promise<void> {
    try {
      const mgr = this.getTaskManager();
      const entry = await mgr.addTask({
        title: msg.title,
        description: msg.description,
        priority: (msg.priority as CoreTaskEntry['priority']) ?? 'medium',
        category: (msg.category as CoreTaskEntry['category']) ?? 'personal',
        dueDate: msg.due_date,
        recurrence: (msg.recurrence as CoreTaskEntry['recurrence']) ?? 'none',
        // Planner tasks are personal productivity — store them GLOBALLY
        // (~/.ava/tasks.json), not per-workspace. Project scope writes to
        // <workspace>/.ava and, with no workspace open, can't persist or be
        // found again — so every later toggle/complete/delete returned
        // "Task not found". Global persists without a workspace and is where
        // update/delete look first.
        scope: 'global',
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
      await mgr.deleteTask(id);
      // Tell the UI to drop the row whether or not it was in the store — a
      // "not found" just means it's a stale entry the list should stop showing,
      // not an error to surface.
      this.post({ type: 'task_deleted', id });
    } catch {
      this.post({ type: 'error', message: 'Failed to delete task.' });
    }
  }

  /** Wipe EVERY task — the stored ones (global + project, incl. archived and any
   *  hidden by the current filter) AND the in-memory "Ava's Progress" session
   *  tasks — then refresh both lists so nothing lingers. */
  private async clearAllTasks(): Promise<void> {
    try {
      const mgr = this.getTaskManager();
      // Hard-wipe both stores + session in one shot. The previous per-id delete
      // loop couldn't remove flushed `session-*` todos; emptying the arrays does.
      await mgr.clearAllStored();
      await this.loadTasks();
      this.post({ type: 'session_tasks_updated', tasks: this.getSessionTasks() });
    } catch {
      this.post({ type: 'error', message: 'Failed to clear tasks.' });
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

  private journalEntryToDisplay(e: JournalEntry): DashboardJournalEntry {
    return {
      id: e.id,
      author: e.author,
      kind: e.kind,
      title: e.title,
      content: e.content,
      mood: e.mood,
      tags: e.tags,
      created_at: e.createdAt,
      updated_at: e.updatedAt,
    };
  }

  private coreToDisplayDay(day: JournalDay): DashboardJournalDay {
    return { date: day.date, entries: day.entries.map((e) => this.journalEntryToDisplay(e)) };
  }

  private async loadJournalDay(date: string): Promise<void> {
    try {
      const mgr = this.getJournalManager();
      // The dashboard is a READER of entries the agent's separate manager
      // writes — always drop the cached day so we read the latest from disk.
      mgr.invalidateCache(date);
      const day = await mgr.getDay(date);
      this.post({ type: 'journal_day_loaded', day: day ? this.coreToDisplayDay(day) : { date, entries: [] } });
    } catch {
      this.post({ type: 'journal_day_loaded', day: { date, entries: [] } });
    }
  }

  private async loadJournalMonth(year: number, month: number): Promise<void> {
    try {
      const mgr = this.getJournalManager();
      mgr.invalidateCache();
      const entries = await mgr.getMonth(year, month);
      this.post({
        type: 'journal_month_loaded',
        year,
        month,
        entries: entries.map((e) => ({ ...this.journalEntryToDisplay(e), date: e.date })),
      });
    } catch {
      this.post({ type: 'journal_month_loaded', year, month, entries: [] });
    }
  }

  private async loadJournalYear(year: number): Promise<void> {
    try {
      const mgr = this.getJournalManager();
      mgr.invalidateCache();
      const summaries = await mgr.getDaySummaries(`${year}-01-01`, `${year}-12-31`);
      this.post({
        type: 'journal_year_summaries',
        year,
        summaries: summaries.map((s) => ({
          date: s.date,
          count: s.count,
          authors: s.authors,
          dominant_mood: s.dominantMood,
          avg_mood: s.avgMood,
          has_user_entry: s.authors.user,
          has_ava_entry: s.authors.ava,
          mood: s.dominantMood,
        })),
      });
    } catch {
      this.post({ type: 'journal_year_summaries', year, summaries: [] });
    }
  }

  private async loadJournalSummaries(from: string, to: string): Promise<void> {
    try {
      const mgr = this.getJournalManager();
      // Reader — clear cache so calendar dots reflect the agent's latest writes.
      mgr.invalidateCache();
      const summaries = await mgr.getDaySummaries(from, to);
      this.post({
        type: 'journal_summaries_loaded',
        summaries: summaries.map((s) => ({
          date: s.date,
          count: s.count,
          authors: s.authors,
          dominant_mood: s.dominantMood,
          avg_mood: s.avgMood,
          // Legacy fields for the mini-calendar.
          has_user_entry: s.authors.user,
          has_ava_entry: s.authors.ava,
          mood: s.dominantMood,
        })),
      });
    } catch {
      this.post({ type: 'journal_summaries_loaded', summaries: [] });
    }
  }

  private async loadJournalKinds(): Promise<void> {
    try {
      const kinds = await this.getJournalManager().listKinds();
      this.post({ type: 'journal_kinds_loaded', kinds });
    } catch {
      this.post({ type: 'journal_kinds_loaded', kinds: [] });
    }
  }

  private async addJournalEntry(msg: { date: string; author: 'user' | 'ava'; kind: string; content: string; title?: string; mood?: number; tags?: string[] }): Promise<void> {
    try {
      await this.getJournalManager().addEntry(msg.date, {
        author: msg.author,
        kind: msg.kind,
        content: msg.content,
        title: msg.title,
        mood: msg.mood as 1 | 2 | 3 | 4 | 5 | undefined,
        tags: msg.tags,
      });
      this.post({ type: 'journal_changed', date: msg.date });
    } catch {
      this.post({ type: 'error', message: 'Failed to add journal entry.' });
    }
  }

  private async updateJournalEntry(msg: { date: string; id: string; kind?: string; title?: string; content?: string; mood?: number | null; tags?: string[] }): Promise<void> {
    try {
      await this.getJournalManager().updateEntry(msg.date, msg.id, {
        kind: msg.kind,
        title: msg.title,
        content: msg.content,
        mood: msg.mood as 1 | 2 | 3 | 4 | 5 | null | undefined,
        tags: msg.tags,
      });
      this.post({ type: 'journal_changed', date: msg.date });
    } catch {
      this.post({ type: 'error', message: 'Failed to update journal entry.' });
    }
  }

  private async deleteJournalEntryById(date: string, id: string): Promise<void> {
    try {
      await this.getJournalManager().deleteEntry(date, id);
      this.post({ type: 'journal_changed', date });
    } catch {
      this.post({ type: 'error', message: 'Failed to delete journal entry.' });
    }
  }

  private async searchJournal(msg: { query: string; kind?: string; author?: 'user' | 'ava'; from?: string; to?: string }): Promise<void> {
    try {
      const mgr = this.getJournalManager();
      mgr.invalidateCache();
      const hits = await mgr.search(msg.query, { kind: msg.kind, author: msg.author, from: msg.from, to: msg.to });
      this.post({
        type: 'journal_search_results',
        query: msg.query,
        hits: hits.map((h) => ({ date: h.date, entry_id: h.entryId, author: h.author, kind: h.kind, title: h.title, snippet: h.snippet })),
      });
    } catch {
      this.post({ type: 'journal_search_results', query: msg.query, hits: [] });
    }
  }

  private async mutateJournalKinds(fn: (m: JournalManager) => Promise<JournalKind[]>): Promise<void> {
    try {
      const kinds = await fn(this.getJournalManager());
      this.post({ type: 'journal_kinds_loaded', kinds });
    } catch (err) {
      this.post({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update journal kinds.' });
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
   * "Download a copy" for a freshly-generated asset. Unlike downloadCloudAsset
   * (hostname-locked to our storage), this exports the user's OWN generated
   * output — a data: URL (image bytes we already hold) or a remote provider URL
   * (video/voice clip) — to a location they pick via the native Save dialog.
   */
  private async saveAssetCopy(url: string, filename: string): Promise<void> {
    try {
      const safeName = (filename || 'download')
        .replace(/[\\/]/g, '_')
        .replace(/[^a-zA-Z0-9._ -]/g, '_')
        .slice(0, 200) || 'download';

      // Resolve the bytes: decode data: inline, else fetch the remote clip.
      let bytes: Buffer;
      if (url.startsWith('data:')) {
        bytes = Buffer.from(url.split(',')[1] ?? '', 'base64');
      } else {
        let parsed: URL;
        try { parsed = new URL(url); }
        catch { this.post({ type: 'error', message: 'Invalid URL' }); return; }
        if (!/^https?:$/.test(parsed.protocol)) {
          this.post({ type: 'error', message: 'Download blocked: unsupported URL scheme.' });
          return;
        }
        const res = await fetch(url);
        if (!res.ok) { this.post({ type: 'error', message: `Download failed: HTTP ${res.status}` }); return; }
        bytes = Buffer.from(await res.arrayBuffer());
      }

      const os = await import('node:os');
      const dest = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(os.homedir(), 'Downloads', safeName)),
        filters: { 'All Files': ['*'] },
      });
      if (!dest) return; // user cancelled

      const fs = await import('node:fs/promises');
      await fs.writeFile(dest.fsPath, bytes);
      const action = await vscode.window.showInformationMessage(`Saved: ${path.basename(dest.fsPath)}`, 'Reveal');
      if (action === 'Reveal') {
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dest.fsPath));
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
      // Local-first: read the account-scoped personality.json. No cloud pull —
      // Ava's personality lives on-device (cloud is sunsetting).
      const personality = await loadPersonality(this.getUserDataDir());

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
      // Local-first: write the account-scoped personality.json, no cloud push.
      await savePersonality(this.getUserDataDir(), data);
      this.post({ type: 'personality_saved' });
    } catch {
      this.post({ type: 'error', message: 'Failed to save personality.' });
    }
  }

  private async handleResetPersonality(): Promise<void> {
    try {
      const personality = await resetPersonality(this.getUserDataDir());
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
          : t === 'tasks' ? path.join(dataDir, 'tasks', 'tasks.json')
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
          // TaskManager writes { version, lastModified, entries } — reading
          // `.tasks` here always yielded 0, so the count read empty even when it wasn't.
          else if (t === 'tasks') localCount = (parsed.entries ?? parsed.tasks)?.length ?? 0;
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

    // Health profile is its own JSONB row server-side, so it sits outside the
    // file-path loop above. Counts 1 once a profile with real data has been
    // saved, else 0 (the Sync UI disables the push button on a 0 count).
    {
      const stored = healthStore.readProfile(this.healthDir());
      const general = readGeneralProfile(this.getUserDataDir());
      const hasData = (
        (!!stored && stored.schema_version === 1 && (
          stored.goals.primary != null ||
          stored.constraints.allergens.length > 0 || stored.constraints.dietary.length > 0 ||
          stored.constraints.injuries.length > 0 || stored.constraints.equipment_available.length > 0
        )) ||
        (!!general && (
          general.height_cm != null || general.weight_kg != null ||
          general.sex != null || general.date_of_birth != null
        ))
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
          const store = await fs.readFile(path.join(this.getUserDataDir(), 'tasks', 'tasks.json'), 'utf-8')
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
      // Per-category permissions live in globalState (local), not config — read
      // them from the view provider so the Settings list shows the saved state.
      categoryPermissions: (this.viewProvider as any)?.getSavedCategoryPermissions?.() ?? {},
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

  /** Health data dir, account-scoped: `<scopedDir>/health`. */
  private healthDir(): string { return path.join(this.getUserDataDir(), 'health'); }

  /** Read the operator's HealthProfile from `<scopedDir>/health/profile.json`.
   *  Returns the empty scaffold when none saved. Local-first, on-device only.
   *  Body basics now live in the general profile — see getGeneralProfile. */
  private getHealthProfile(): HealthProfile {
    const stored = healthStore.readProfile(this.healthDir());
    if (stored && stored.schema_version === 1) return stored;
    return {
      schema_version: 1,
      updated_at: null,
      goals: { primary: null, weekly_focus: null },
      constraints: { allergens: [], dietary: [], injuries: [], equipment_available: [], minutes_per_day_target: null },
      food: { likes: [], dislikes: [], cuisines: [] },
      schedule: {
        training_window: { start: null, end: null },
        meal_times: { breakfast: null, lunch: null, dinner: null },
        sleep_target: { bedtime: null, wake: null },
      },
    };
  }

  /** Read the account-level GeneralProfile from `<scopedDir>/general.json`.
   *  On first read, seeds it (in memory, then persists in the background) from
   *  any legacy HealthProfile.body so existing users keep their body basics.
   *  Returns the empty scaffold when there's nothing to read or seed from. */
  private getGeneralProfile(): GeneralProfile {
    const scoped = this.getUserDataDir();
    const stored = readGeneralProfile(scoped);
    if (stored) return stored;
    const seeded = emptyGeneralProfile();
    const legacyBody = healthStore.readProfile(this.healthDir())?.body;
    if (legacyBody) {
      seeded.sex = legacyBody.sex;
      seeded.date_of_birth = legacyBody.date_of_birth;
      seeded.height_cm = legacyBody.height_cm;
      seeded.weight_kg = legacyBody.weight_kg;
      seeded.body_fat_pct = legacyBody.body_fat_pct;
      // Persist the migration so it only happens once. Non-destructive — the
      // legacy health.body is left in place, just no longer read.
      writeGeneralProfile(scoped, seeded).catch(() => {});
    }
    return seeded;
  }

  /** Read the daily plan for a given ISO date (YYYY-MM-DD). Returns
   *  the empty scaffold when no plan has been saved yet — the
   *  dashboard renders "no plan yet" placeholders against this. */
  private getHealthDailyPlan(date: string): HealthDailyPlan {
    const stored = healthStore.readDailyPlan(this.healthDir(), date);
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
  // Each plan lives at `<scopedDir>/health/plans/{id}.json`. The library index
  // is derived on demand by listing that dir — never a separate stored list,
  // so it can't drift out of sync with the plans themselves.

  /** IDs of every stored plan, read from the plans/ dir. */
  private getHealthPlanIds(): string[] {
    return healthStore.listPlanIds(this.healthDir());
  }

  /** Read a single plan by id. Returns null when missing or from an
   *  unknown schema version. */
  private getHealthPlan(id: string): HealthPlan | null {
    return healthStore.readPlan(this.healthDir(), id);
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
          duration_days: p.duration_days, start_date: p.start_date, source: p.source, updated_at: p.updated_at,
        });
      }
    }
    return out.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  }

  /** Full data for every ACTIVE, dated plan — feeds the Command Center's
   *  Today / This-week glance. One active plan per type, so this is small. */
  private getActiveHealthPlans(): HealthPlan[] {
    const out: HealthPlan[] = [];
    for (const id of this.getHealthPlanIds()) {
      const p = this.getHealthPlan(id);
      if (p && p.status === 'active' && p.start_date) out.push(p);
    }
    return out;
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
          await healthStore.writePlan(this.healthDir(), { ...other, status: 'archived', updated_at: now });
        }
      }
    }
    const next: HealthPlan = { ...plan, schema_version: 1, updated_at: now };
    await healthStore.writePlan(this.healthDir(), next);
    return this.getHealthPlanIndex();
  }

  /** Delete a plan. Returns the refreshed library index. */
  private async deleteHealthPlan(id: string): Promise<HealthPlanSummary[]> {
    await healthStore.deletePlan(this.healthDir(), id);
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

  // Settings are local-first — VS Code config only. The cloud push/pull
  // (pushSettingsToCloud / pullSettingsFromCloud) was removed with the rest of
  // the cloud-sync surface (cloud sunsets 1 Jul 2026).

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
    // The dashboard journal view renders from the MONTH's entries (+ the year
    // summaries for the heatmap), NOT a single day — so reloading only the day
    // meant a freshly-written entry never appeared in the list. Reload the
    // month that contains `date` (and the year); both invalidate their caches
    // first, so they read the new entry straight off disk. The webview's
    // journal_month_loaded handler points the view at that month, so the entry
    // shows up where it was written.
    const [y, m] = date.split('-').map(Number);
    if (y && m) {
      void this.loadJournalMonth(y, m);
      void this.loadJournalYear(y);
    }
    void this.loadJournalDay(date);
  }

  /** Notify dashboard that session tasks changed (called from AvaViewProvider after todo_write). */
  public notifySessionTasksUpdated(tasks: Array<{ id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }>): void {
    this.post({ type: 'session_tasks_updated', tasks });
  }

  /** Notify dashboard that health plans changed (called from AvaViewProvider
   *  after an Ava-driven plan create/update). Re-posts the plan index so the
   *  Plans-tab calendar shows the new plan live, without a dashboard reload. */
  public notifyHealthPlansUpdated(): void {
    this.post({ type: 'health_plans_loaded', plans: this.getHealthPlanIndex() });
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

  /**
   * The user's effective language, for platform content that is served
   * translated (news, roadmap, releases).
   *
   * `preferences.language` is the setting the user actually chose; `auto`
   * means "follow the editor", which is what vscode.env.language reports.
   * Same resolution AvaViewProvider uses for chat, so the dashboard and the
   * assistant can never disagree about what language you are in.
   */
  private effectiveLocale(): string {
    const setting = vscode.workspace.getConfiguration('ava-supernova').get<string>('preferences.language') ?? 'auto';
    return resolveLocale(setting === 'auto' ? vscode.env.language : setting);
  }

  private async handleLoadNews(category?: string): Promise<void> {
    try {
      const params = new URLSearchParams({ limit: '24' });
      if (category) params.set('category', category);
      // Platform has every article in all supported locales; without this the
      // reader shows English no matter what language the user is running in.
      const locale = this.effectiveLocale();
      if (locale !== 'en') params.set('locale', locale);

      const data = await httpGetJson(`https://ava-supernova.com/api/news?${params}`) as
        { posts?: Array<Record<string, unknown>>; articles?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
      const list = (Array.isArray(data) ? data : ((data as any).posts ?? (data as any).articles ?? [])) as Array<{
        title?: string; category?: string; reading_time?: number; slug?: string; published_at?: string;
        created_at?: string; excerpt?: string | null; priority?: string | null;
        image_url?: string | null;
      }>;

      this.post({
        type: 'news_loaded',
        articles: list.map(a => ({
          title: a.title ?? '',
          category: a.category ?? '',
          reading_time: a.reading_time ?? 0,
          slug: a.slug ?? '',
          date: a.published_at ?? a.created_at ?? '',
          image_url: a.image_url ?? null,
          // The briefing needs both: the standfirst under a lead headline, and
          // the priority that drives the BREAKING strip. They were being dropped
          // here, so the widget could only ever render a flat list of titles.
          excerpt: a.excerpt ?? null,
          priority: a.priority ?? null,
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
      const locale = this.effectiveLocale();
      const qs = locale !== 'en' ? `?locale=${encodeURIComponent(locale)}` : '';
      const data = await httpGetJson(`https://ava-supernova.com/api/news/${encodeURIComponent(slug)}${qs}`) as
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

  /**
   * Design Studio generate lane. Runs the same shape-as-dial pipeline the hub
   * proved: Qwen-Image-edit-max (reference = the shape armature) → server
   * white-threshold matte → transparent PNG. Host-proxied because the webview
   * can't reach the platform (CORS + the key lives in SecretStorage).
   * TODO(design-studio): credit metering before this goes fully user-facing
   * (parity with the hub, which is admin-free, for now).
   */
  /**
   * Design Architect tool → canvas bridge. The design_* tools (running in the
   * agent) call this via sharedState.designControl. We post the command to the
   * Design Studio webview and resolve when it replies with design_tool_result.
   * generate_icon / generate_set are slow (Qwen + matte), so the timeout is
   * generous; reads are quick. If the canvas isn't mounted, nothing replies and
   * we resolve with a clear "open the Studio" message when the timer fires.
   */
  public requestFromDesign(
    command: string,
    args: Record<string, unknown>,
  ): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    const requestId = `dtr-${++this.designReqSeq}`;
    const slow = command === 'generate_icon' || command === 'generate_set' || command === 'generate_image';
    // A set can be many icons back-to-back — scale the ceiling with count.
    const setCount = command === 'generate_set' && Array.isArray(args.shapes) ? (args.shapes as unknown[]).length : 1;
    // Video is async on Wan (1–6 min per clip, ~8-min poll ceiling host-side) —
    // give it the full ceiling so the tool doesn't time out before the clip lands.
    const timeoutMs =
      command === 'generate_video' ? 600_000
      // Logo chains symbol-gen (Qwen) → server vectorize → compose — well past
      // the 12s default, so give it a generous ceiling like the other slow lanes.
      : command === 'generate_logo' ? 240_000
      : command === 'explore_logos' ? 240_000   // renders up to 5 candidates
      : slow ? Math.min(600_000, 90_000 * Math.max(1, setCount))
      : 12_000;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.designToolPending.delete(requestId);
        resolve({ ok: false, error: 'The Design Studio canvas didn\'t respond. Open it in Creative Studio → Design Studio and try again.' });
      }, timeoutMs);
      this.designToolPending.set(requestId, { resolve, timer });
      this.post({ type: 'design_tool', requestId, command, args } as any);
    });
  }

  private handleDesignToolResult(requestId: string, result: { ok: boolean; data?: unknown; error?: string }): void {
    const pending = this.designToolPending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.designToolPending.delete(requestId);
    pending.resolve(result);
  }

  private async handleAssetForgeGenerate(body: { prompt: string; referenceImage?: string; size?: string; negativePrompt?: string; matte?: boolean }): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'asset_forge_result', success: false, error: 'Not connected. Add your account in Settings.' } as any);
      return;
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${platformKey}`,
      'X-Ava-Data-Mode': dataModeHeader(this.context),
    };
    try {
      // 1) Generate — the reference image (the shape silhouette) guides the material.
      const genRes = await fetch('https://ava-supernova.com/api/asset-forge/image', {
        method: 'POST', headers,
        body: JSON.stringify({
          engine: 'qwen', prompt: body.prompt, referenceImage: body.referenceImage,
          size: body.size || '1024*1024', negativePrompt: body.negativePrompt,
        }),
      });
      if (!genRes.ok) {
        const e = (await genRes.json().catch(() => ({}))) as { error?: string };
        this.post({ type: 'asset_forge_result', success: false, error: e.error || `Generation failed (${genRes.status})` } as any);
        return;
      }
      const gen = await genRes.json() as { url?: string };
      if (!gen.url) {
        this.post({ type: 'asset_forge_result', success: false, error: 'No image returned' } as any);
        return;
      }

      // 2) Matte on the server (white-threshold → transparent). Non-fatal: on
      // failure we return the raw generated URL so the result is still usable.
      // The free-form image lane sets matte:false — a photo/illustration/scene
      // must stay full-frame, so we SKIP the matte and return the raw url.
      let dataUrl = gen.url;
      if (body.matte !== false) {
        try {
          const bgRes = await fetch('https://ava-supernova.com/api/asset-forge/remove-bg', {
            method: 'POST', headers, body: JSON.stringify({ imageUrl: gen.url }),
          });
          if (bgRes.ok) {
            const bg = await bgRes.json() as { dataUrl?: string };
            if (bg.dataUrl) dataUrl = bg.dataUrl;
          }
        } catch { /* keep the raw url */ }
      } else {
        // Free-form image (no matte): proxy the remote url to a data URL so the
        // webview can WebP-compress it before saving (canvas can't read a
        // cross-origin url) — and so it lands offline-clean. Non-fatal.
        try {
          const imgRes = await fetch(gen.url);
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            const mime = imgRes.headers.get('content-type') || 'image/png';
            dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
          }
        } catch { /* keep the raw url */ }
      }

      this.post({ type: 'asset_forge_result', success: true, dataUrl, rawUrl: gen.url } as any);
    } catch (err) {
      this.post({ type: 'asset_forge_result', success: false, error: err instanceof Error ? err.message : 'Generation failed' } as any);
    }
  }

  /**
   * Logo lane — proxy a symbol raster to the server vectorizer (vtracer) and
   * hand back a clean SVG. Host-proxied because the webview has no platform key
   * (same reason generation goes through the host).
   */
  private async handleAssetForgeVectorize(imageUrl: string, mode?: 'bw' | 'color'): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'asset_forge_vectorize_result', success: false, error: 'Not connected. Add your account in Settings.' });
      return;
    }
    try {
      const res = await fetch('https://ava-supernova.com/api/asset-forge/vectorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${platformKey}`,
          'X-Ava-Data-Mode': dataModeHeader(this.context),
        },
        body: JSON.stringify({ imageUrl, mode: mode || 'bw' }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        this.post({ type: 'asset_forge_vectorize_result', success: false, error: e.error || `Vectorize failed (${res.status})` });
        return;
      }
      const out = (await res.json()) as { svg?: string };
      if (!out.svg) {
        this.post({ type: 'asset_forge_vectorize_result', success: false, error: 'No SVG returned' });
        return;
      }
      this.post({ type: 'asset_forge_vectorize_result', success: true, svg: out.svg });
    } catch (err) {
      this.post({ type: 'asset_forge_vectorize_result', success: false, error: err instanceof Error ? err.message : 'Vectorize failed' });
    }
  }

  /**
   * Design Studio video lane — mirror of handleAssetForgeGenerate for the async
   * Wan 2.5 pipeline. Submit to POST /api/generate-video (returns a task_id),
   * then poll the status route (reusing pollVideoStatus — the host has no
   * serverless timeout) until the finished clip URL lands, and post it back to
   * the canvas as `asset_forge_video_result`. Auth/headers match the generate
   * lane (platform key + data-mode header).
   */
  private async handleAssetForgeVideo(body: { prompt: string; duration?: number | string; resolution?: string; aspect?: string }): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'asset_forge_video_result', success: false, error: 'Not connected. Add your account in Settings.' } as any);
      return;
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${platformKey}`,
      'X-Ava-Data-Mode': dataModeHeader(this.context),
    };
    try {
      // 1) Submit — the route accepts the job (X-DashScope-Async) and hands back a task_id.
      const submitRes = await fetch('https://ava-supernova.com/api/generate-video', {
        method: 'POST', headers,
        body: JSON.stringify({ prompt: body.prompt, duration: body.duration, resolution: body.resolution, aspect: body.aspect }),
      });
      if (!submitRes.ok) {
        const e = (await submitRes.json().catch(() => ({}))) as { error?: string };
        this.post({ type: 'asset_forge_video_result', success: false, error: e.error || `Video generation failed (${submitRes.status})` } as any);
        return;
      }
      const data = await submitRes.json() as { task_id?: string; url?: string };
      // A synchronous URL (some paths) short-circuits the poll.
      if (data.url) {
        this.post({ type: 'asset_forge_video_result', success: true, url: data.url } as any);
        return;
      }
      if (!data.task_id) {
        this.post({ type: 'asset_forge_video_result', success: false, error: 'No task_id returned' } as any);
        return;
      }
      // 2) Poll until terminal (reuses the existing 5s-cadence / ~8-min-ceiling loop).
      const final = await this.pollVideoStatus(String(data.task_id), platformKey);
      if (final.success) {
        const url = (final.data as { url?: string } | undefined)?.url;
        this.post({ type: 'asset_forge_video_result', success: true, url } as any);
      } else {
        this.post({ type: 'asset_forge_video_result', success: false, error: final.error || 'Video generation failed' } as any);
      }
    } catch (err) {
      this.post({ type: 'asset_forge_video_result', success: false, error: err instanceof Error ? err.message : 'Video generation failed' } as any);
    }
  }

  /**
   * Design Studio voice lane — mirror of handleAssetForgeVideo but SYNCHRONOUS.
   * Qwen3-TTS returns the finished audio URL in a single POST response (no
   * task_id / poll), so we make one request and post the clip straight back to
   * the canvas as `asset_forge_voice_result`. Auth/headers match the other
   * lanes (platform key + data-mode header).
   */
  private async handleAssetForgeVoice(body: { text: string; voice?: string; language_type?: string; instructions?: string }): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'asset_forge_voice_result', success: false, error: 'Not connected. Add your account in Settings.' } as any);
      return;
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${platformKey}`,
      'X-Ava-Data-Mode': dataModeHeader(this.context),
    };
    try {
      const res = await fetch('https://ava-supernova.com/api/generate-voice', {
        method: 'POST', headers,
        body: JSON.stringify({ text: body.text, voice: body.voice, language_type: body.language_type, instructions: body.instructions }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        this.post({ type: 'asset_forge_voice_result', success: false, error: e.error || `Voice generation failed (${res.status})` } as any);
        return;
      }
      const data = await res.json() as { url?: string };
      if (!data.url) {
        this.post({ type: 'asset_forge_voice_result', success: false, error: 'No audio returned' } as any);
        return;
      }
      // Proxy the audio to a data: URL. The Qwen/DashScope url is cross-origin with
      // no CORS headers, which breaks the webview's Web Audio decode (the waveform)
      // and can block playback. A same-origin data: URL always plays + decodes —
      // this is what the previous provider effectively returned.
      let audioUrl = data.url;
      if (/^https?:/i.test(audioUrl)) {
        try {
          const audioRes = await fetch(audioUrl);
          if (audioRes.ok) {
            const buf = Buffer.from(await audioRes.arrayBuffer());
            const mime = audioRes.headers.get('content-type') || 'audio/wav';
            audioUrl = `data:${mime};base64,${buf.toString('base64')}`;
          }
        } catch { /* fall back to the raw url */ }
      }
      this.post({ type: 'asset_forge_voice_result', success: true, url: audioUrl } as any);
    } catch (err) {
      this.post({ type: 'asset_forge_voice_result', success: false, error: err instanceof Error ? err.message : 'Voice generation failed' } as any);
    }
  }

  /**
   * Poll the async video status route until the job finishes. Runs in the
   * extension host (no Vercel 60s cap), on a 5s cadence with an ~8-minute
   * ceiling. Transient poll failures are tolerated — only an explicit
   * `failed` status or the timeout ends the loop. Returns the final status
   * payload ({ url, asset }) so the webview's `data.url` read works
   * unchanged.
   */
  private async pollVideoStatus(
    taskId: string,
    platformKey: string,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const statusUrl = `https://ava-supernova.com/api/generate-video/status/${encodeURIComponent(taskId)}`;
    const intervalMs = 5000;
    const maxAttempts = 96; // ~8 min ceiling — well past a typical Wan clip
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, intervalMs));
      try {
        const res = await fetch(statusUrl, { headers: { 'Authorization': `Bearer ${platformKey}` } });
        if (!res.ok) continue; // transient — keep polling
        const data = await res.json() as { status?: string; url?: string; error?: string };
        if (data?.status === 'success' && data?.url) return { success: true, data };
        if (data?.status === 'failed') return { success: false, error: data?.error || 'Video generation failed' };
        // status === 'processing' — keep going
      } catch {
        // transient network blip — keep polling until the ceiling
      }
    }
    return { success: false, error: 'Video generation timed out' };
  }

  private async handleLoadLatestRelease(): Promise<void> {
    try {
      const data = await httpGetJson('https://ava-supernova.com/api/releases?limit=25') as
        { releases?: Array<{ version: string; title: string; published_at: string; platform?: string }> } | Array<{ version: string; title: string; published_at: string; platform?: string }>;
      const list = Array.isArray(data) ? data : ((data as any).releases ?? []);

      // The Command Centre is the EXTENSION surface, so it must show the latest
      // *extension* release — not whatever shipped most recently across IDE /
      // Hub / core. A bare ?limit=1 was surfacing the IDE's version (e.g.
      // v0.26.2) in the extension's version pill and release-notes widget.
      // Releases with no explicit platform are treated as extension (matches
      // the Releases page). Fall back to the newest of anything if, somehow,
      // no extension release is in the window.
      type Rel = { version: string; title: string; published_at: string; platform?: string };
      const extension = (list as Rel[])
        .filter((r: Rel) => (r.platform || 'extension') === 'extension')
        .sort((a: Rel, b: Rel) => (b.published_at || '').localeCompare(a.published_at || ''));
      const pick: Rel | null = extension[0] ?? (list as Rel[])[0] ?? null;

      this.post({
        type: 'latest_release_loaded',
        release: pick ? { version: pick.version, title: pick.title, published_at: pick.published_at } : null,
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
    if (this.announcementTimer) { clearInterval(this.announcementTimer); this.announcementTimer = null; }
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  // ─── Data Portability ─────────────────────────────────────────────────────

  /** Encrypted full backup (.ava-backup) — seal everything under ~/.ava with a
   *  passphrase (the cryptographic core lives in @ava/core/portability). The
   *  file is opaque; only the passphrase, never sent anywhere, can open it. */
  private async handleExportEncryptedBackup(passphrase: string): Promise<void> {
    if (!passphrase) {
      this.post({ type: 'error', message: 'A passphrase is required to create an encrypted backup.' } as any);
      this.post({ type: 'backup_done', ok: false } as any);
      return;
    }
    try {
      const envelope = await exportEncryptedBackup(this.avaHome, passphrase, {
        source: 'extension',
        scopedDir: this.getUserDataDir(),
      });
      const datePart = new Date().toISOString().slice(0, 10);
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`ava-backup-${datePart}.ava-backup`),
        filters: { 'Ava backup': ['ava-backup'] },
      });
      if (!uri) { this.post({ type: 'backup_done', ok: false } as any); return; }
      const fs = await import('node:fs/promises');
      await fs.writeFile(uri.fsPath, envelope, 'utf-8');
      this.post({ type: 'backup_done', ok: true, message: `Encrypted backup saved to ${uri.fsPath}` } as any);
    } catch (err) {
      this.post({ type: 'error', message: `Backup failed: ${err instanceof Error ? err.message : err}` } as any);
      this.post({ type: 'backup_done', ok: false } as any);
    }
  }

  /** Readable export — the same local data as plain JSON so the user can SEE
   *  exactly what's on their machine. Unencrypted by design (it's for reading),
   *  so we tell them to keep it safe. */
  private async handleExportReadableAll(): Promise<void> {
    try {
      const bundle = await gatherBundle(this.avaHome, {
        source: 'extension',
        scopedDir: this.getUserDataDir(),
      });
      const datePart = new Date().toISOString().slice(0, 10);
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`ava-data-readable-${datePart}.json`),
        filters: { JSON: ['json'] },
      });
      if (!uri) return;
      const fs = await import('node:fs/promises');
      await fs.writeFile(uri.fsPath, JSON.stringify(bundle, null, 2), 'utf-8');
      this.post({ type: 'info', message: `Readable export saved to ${uri.fsPath} — unencrypted, keep it somewhere safe.` } as any);
    } catch (err) {
      this.post({ type: 'error', message: `Export failed: ${err instanceof Error ? err.message : err}` } as any);
    }
  }

  /** Restore an encrypted .ava-backup into ~/.ava. Safe-merge by default
   *  (won't clobber existing files unless overwrite is set). */
  private async handleImportEncryptedBackup(content: string, passphrase: string, overwrite?: boolean): Promise<void> {
    if (!content || !passphrase) {
      this.post({ type: 'backup_imported', ok: false, message: 'Missing backup file or passphrase.' } as any);
      return;
    }
    try {
      const { result } = await importEncryptedBackup(this.avaHome, content, passphrase, {
        overwrite: !!overwrite,
        scopedDir: this.getUserDataDir(),
      });
      this.post({ type: 'backup_imported', ok: true, written: result.written, skipped: result.skipped } as any);
    } catch (err) {
      this.post({ type: 'backup_imported', ok: false, message: err instanceof Error ? err.message : String(err) } as any);
    }
  }

  /** Creative Studio export — a zip of metadata.json + the actual media files
   *  (images/music/video/voice). Binaries aren't JSON-serialisable, so this is
   *  its own path rather than the single-JSON flow. */
  /** Add creative/ (metadata as text, media as raw bytes) to a zip. Returns file count. */
  private async addCreativeToZip(zip: any): Promise<number> {
    const fs = await import('node:fs/promises');
    const creativeDir = path.join(this.getUserDataDir(), 'creative');
    let fileCount = 0;
    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) { await walk(abs); continue; }
        if (!e.isFile()) continue;
        const rel = path.relative(creativeDir, abs).split(path.sep).join('/');
        // JSON metadata as text; media as raw bytes.
        zip.file(`creative/${rel}`, e.name.endsWith('.json')
          ? await fs.readFile(abs, 'utf-8')
          : await fs.readFile(abs));
        fileCount++;
      }
    };
    await walk(creativeDir);
    return fileCount;
  }

  private async handleExportCreativeZip(): Promise<void> {
    const fs = await import('node:fs/promises');
    const JSZip = require('jszip');
    const creativeDir = path.join(this.getUserDataDir(), 'creative');
    try {
      const dirStat = await fs.stat(creativeDir).catch(() => null);
      if (!dirStat?.isDirectory()) {
        this.post({ type: 'error', message: 'No Creative Studio data to export yet.' } as any);
        return;
      }
      const zip = new JSZip();
      const fileCount = await this.addCreativeToZip(zip);
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('ava-creative.zip'),
        filters: { 'ZIP Archive': ['zip'] },
      });
      if (uri) {
        await vscode.workspace.fs.writeFile(uri, zipBuffer);
        vscode.window.showInformationMessage(`Exported Creative Studio (${fileCount} files) to ${uri.fsPath}`);
      }
    } catch (err) {
      this.post({ type: 'error', message: `Export failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  private async handleExportData(dataType: string): Promise<void> {
    // Creative Studio takes the zip path (metadata + binary media).
    if (dataType === 'creative') { await this.handleExportCreativeZip(); return; }

    try {
      let file: { name: string; content: string };

      if (dataType === 'settings') {
        // Surface-specific: settings live in VS Code's config store, not ~/.ava.
        file = {
          name: 'ava-settings.json',
          content: JSON.stringify({ settings: this.readSettings() }, null, 2),
        };
      } else if (isCoreDataType(dataType)) {
        // Everything else is shared with the IDE — one implementation in core,
        // so the two surfaces cannot drift apart again.
        file = await exportDataType(dataType, this.dataRoots());
      } else {
        this.post({ type: 'error', message: `Unknown data type: ${dataType}` });
        return;
      }

      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(file.name),
        // The audit log is newline-delimited JSON — a hard 'json' filter would
        // rename it and quietly imply it parses as one object. It doesn't.
        filters: file.name.endsWith('.jsonl') ? { 'JSON Lines': ['jsonl'] } : { 'JSON': ['json'] },
      });
      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(file.content, 'utf-8'));
        vscode.window.showInformationMessage(`Exported ${dataType} to ${uri.fsPath}`);
      }
    } catch (err) {
      this.post({ type: 'error', message: `Export failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  /** The two roots every export needs: machine-wide + this account's dir. */
  private dataRoots(): { avaHome: string; scopedDir: string } {
    return { avaHome: this.avaHome, scopedDir: this.getUserDataDir() };
  }

  private async handleExportBundle(types: string[]): Promise<void> {
    const JSZip = require('jszip');

    try {
      const zip = new JSZip();

      for (const dataType of types) {
        try {
          if (dataType === 'creative') {
            // Binary media — folded into this zip under creative/.
            await this.addCreativeToZip(zip);
          } else if (dataType === 'settings') {
            zip.file('ava-settings.json', JSON.stringify({ settings: this.readSettings() }, null, 2));
          } else if (isCoreDataType(dataType)) {
            const file = await exportDataType(dataType, this.dataRoots());
            zip.file(file.name, file.content);
          }
        } catch { /* one absent type must not kill the whole export */ }
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
    try {
      let count = 0;

      if (dataType === 'settings') {
        // Settings live in VS Code config — apply the snapshot via saveSettings
        // (handles both the new { settings: {...} } wrapper and a bare object).
        const parsed = JSON.parse(content);
        this.saveSettings((parsed.settings ?? parsed) as DashboardSettings);
        count = 1;
      } else if (isCoreDataType(dataType)) {
        count = await importDataType(dataType, content, this.dataRoots());
      } else {
        this.post({ type: 'error', message: `Unknown data type: ${dataType}` });
        return;
      }

      this.post({ type: 'data_imported' as any, dataType, count });
    } catch (err) {
      // `audit` is deliberately export-only and says so in plain words.
      const message = err instanceof NotImportableError
        ? err.message
        : `Import failed: ${err instanceof Error ? err.message : String(err)}`;
      this.post({ type: 'error', message });
    }
  }

  private getHtml(webview: vscode.Webview): string {
    // Cache-bust the fixed-name entry bundle (index.js/index.css aren't
    // content-hashed) so a rebuild isn't masked by Electron's webview cache.
    const distDir = vscode.Uri.joinPath(this.extensionUri, 'dist', 'dashboard');
    let stamp = '0';
    try {
      stamp = String(Math.floor(require('node:fs').statSync(vscode.Uri.joinPath(distDir, 'index.js').fsPath).mtimeMs));
    } catch { /* file missing during dev */ }
    const scriptUri = `${webview.asWebviewUri(vscode.Uri.joinPath(distDir, 'index.js'))}?v=${stamp}`;
    const styleUri = `${webview.asWebviewUri(vscode.Uri.joinPath(distDir, 'index.css'))}?v=${stamp}`;
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
