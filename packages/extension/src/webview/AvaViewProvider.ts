import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  Agent,
  Conversation,
  ToolRegistry,
  ProviderRegistry,
  PlatformProvider,
  GenericProvider,
  HistoryManager,
  MemoryManager,
  TaskManager,
  migrateGlobalTasksToSubfolder,
  PlatformTaskSyncImpl,
  JournalManager,
  ProviderHealthTracker,
  ResilientProvider,
  AVA_HOME,
  getChatModePrefix,
  getTeachModePrefix,
  getSecurityModePrefix,
  getPlanModePrefix,
  getBrainstormModePrefix,
  getWriteModePrefix,
  getHealthRoomPrefix,
  killBackgroundProcesses,
  detectProjectRoot,
  loadProjectInstructions,
  loadDecisionsState,
  setLocaleSync,
  resolveLocale,
  Conductor,
  AutoCoordinator,
  MemoryAgent,
  IntentClassifier,
  resolveCoordinatorModel,
  BriefingEngine,
  EventDetector,
  addLearning,
  loadSelfImprovementStore,
  saveSelfImprovementStore,
  getRelevantLearnings,
  GenerationManager,
  haltIntent,
  createEmbeddingServiceFromConfig,
  HEALTH_PROFILE_FIELDS,
  humaniseSlug,
  summariseCookingTime,
} from '@ava/core';
import type { AgentEvent, ConductorEvent, Provider, ModelDefinition, ContentPart, PermissionMode, Message, AssistantMessage } from '@ava/core';
import { creditsFor } from '@ava/core/billing/credits';
import type { ExtToWebviewMessage, WebviewToExtMessage, AvaMode, ProviderSource, PlatformStatus, PaletteTool } from './message-types.js';
import { buildPaletteDirective } from './palette-directives.js';
import { ExtensionHealthPlanStore } from './health-plan-store-impl.js';
import { migrateHealthFromGlobalState, readProfile, writeProfile, emptyHealthProfile, listPlanIds, readPlan } from './health-file-store.js';
import { readGeneralProfile, writeGeneralProfile, emptyGeneralProfile } from './general-file-store.js';
import type { AccountInfo } from './dashboard-message-types.js';
import { DashboardPanel } from './DashboardPanel.js';
import { SecretAccess } from '../secrets/secret-access.js';
import { DocumentPreviewPanel } from './DocumentPreviewPanel.js';
import { getNonce } from '../utils/nonce.js';
import { apiFetch } from '../utils/platform-api.js';
import { sessionStats } from '../session-stats.js';
import {
  logTo,
  readPermissionMode,
  deriveErrorInfo as deriveErrorInfoFn,
  formatToolSummary as formatToolSummaryFn,
  getLearningContext as getLearningContextFn,
} from './helpers.js';
import { StatusBar, type StatusBarState } from './status-bar.js';
import { buildCurrentSystemPrompt as buildCurrentSystemPromptFn } from './system-prompt-builder.js';
import { HistoryCoordinator } from './history-coordinator.js';
import { setCloudSync, cloudSyncEnabled } from './data-mode.js';

// ── Profile-fill value helpers (health_profile_ask) ──────────────────────────
// Shared between buildProfileFieldPayload (read current) and applyProfileField
// (coerce + save). The field shape comes from the core HEALTH_PROFILE_FIELDS
// registry; these turn the card's answer into the stored value and back.
type ProfileFieldShape = { control: string; asArray?: boolean; unit?: string; options?: Array<{ value: string; labelKey?: string }> };

function getByPath(obj: any, path: string): unknown {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setByPath(obj: any, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}
// The cooking-time grid arrives as { by_day: { '0'–'6': { breakfast, lunch,
// dinner } } } with tiers '15'|'30'|'60'|'60+' or null. Normalise: keep only
// valid day keys + tiers, and drop days where every meal is unset.
const COOK_TIERS = new Set(['15', '30', '60', '60+']);
function coerceCookingGrid(raw: unknown): { by_day: Record<string, { breakfast: string | null; lunch: string | null; dinner: string | null }> } {
  const out: Record<string, { breakfast: string | null; lunch: string | null; dinner: string | null }> = {};
  const byDay = (raw as any)?.by_day;
  if (byDay && typeof byDay === 'object') {
    for (const key of Object.keys(byDay)) {
      if (!/^[0-6]$/.test(key)) continue;
      const d = byDay[key] ?? {};
      const tier = (v: unknown) => (typeof v === 'string' && COOK_TIERS.has(v) ? v : null);
      const day = { breakfast: tier(d.breakfast), lunch: tier(d.lunch), dinner: tier(d.dinner) };
      if (day.breakfast || day.lunch || day.dinner) out[key] = day;
    }
  }
  return { by_day: out };
}
function coerceProfileFieldValue(def: ProfileFieldShape, raw: unknown): unknown {
  switch (def.control) {
    case 'number': {
      if (raw === '' || raw == null) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'multiselect':
      return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
    case 'cooking_grid':
      return coerceCookingGrid(raw);
    case 'text': {
      if (def.asArray) {
        const s = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join('\n') : '';
        return s.split('\n').map((x) => x.trim()).filter(Boolean);
      }
      return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    }
    case 'select':
    case 'date':
    default:
      return typeof raw === 'string' && raw ? raw : null;
  }
}
function describeProfileValue(def: ProfileFieldShape, value: unknown): string {
  if (value == null || (Array.isArray(value) && value.length === 0)) return 'none';
  if (def.control === 'cooking_grid') {
    const s = summariseCookingTime(value as any);
    return s ? s.replace(/^Cooking time[^:]*:\s*/, '').replace(/\.$/, '') : 'none';
  }
  if (Array.isArray(value)) return value.map((v) => humaniseSlug(String(v))).join(', ');
  if (def.control === 'number' && def.unit) return `${value} ${def.unit}`;
  if (def.control === 'select') return humaniseSlug(String(value));
  return String(value);
}

export class AvaViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ava-supernova.chatView';
  private static readonly SILENT_TOOLS = new Set(['detect_language']);

  private view?: vscode.WebviewView;
  private panel?: vscode.WebviewPanel;
  private agent?: Agent;
  /** Shared state object mirrored by the running Agent / AutoCoordinator /
   *  Conductor. Keeping a reference on the provider lets us flip per-turn
   *  flags (e.g. `conductorSynthesizedThisTurn` for the orchestration-gate
   *  dedupe) without re-threading the object through more signatures. */
  private sharedState?: Record<string, unknown>;
  private activeModelDef?: ModelDefinition;
  /** One-shot guard for the transient-platform-failure auto-retry: when the
   *  account check or the stored model can't resolve because the platform is
   *  unreachable, we schedule a single delayed re-init instead of (the old
   *  bug) overwriting the user's stored model choice or deleting their key. */
  private platformRetryScheduled = false;
  /** True once we've told the user about the current transient-failure window —
   *  the 60s auto-retry loop must not re-post the same notice every cycle.
   *  Reset when a session init succeeds. */
  private transientNotified = false;
  private conversation?: Conversation;
  /** Second conversation thread — the focused "Ava Health & Fitness" room.
   *  Same Ava: shares memoryManager, health profile, tools and model with the
   *  main chat, but keeps its OWN message history so health planning never
   *  lands in the main thread (and the health dataset collects clean). The
   *  main chat and this lane both live in the dashboard webview; outbound
   *  events are tagged via activeLane so each surface renders only its own. */
  private healthConversation?: Conversation;
  /** The focused Learning room's threads — ONE per course (keyed by course id,
   *  or '__lobby__' before a course exists). Each course keeps its own saved
   *  conversation, so switching the active course loads the right thread. Runs in
   *  Teach mode; keeps learning turns out of the main thread. */
  private learningConversations = new Map<string, Conversation>();
  /** Which surface the in-flight turn belongs to. Set at the top of
   *  handleUserMessage and read by postMessage to stamp outbound events so the
   *  right surface (main chat vs Ava room) renders them. One run pipeline (the
   *  isRunning guard) → no concurrency, so a scalar is safe. */
  private activeLane: 'main' | 'health' | 'learning' = 'main';
  private toolRegistry?: ToolRegistry;
  private providerRegistry: ProviderRegistry;
  private healthTracker: ProviderHealthTracker;
  private historyManager!: HistoryManager;
  private isRunning = false;
  private runAbortController?: AbortController;
  private pendingConfirmations = new Map<string, { resolve: (result: boolean | string) => void; toolName: string; args?: Record<string, unknown> }>();
  // Pending secret-grant prompts. Keyed by grantId; resolves when the webview
  // posts secret_grant_response. Resolves with null on denial.
  private pendingGrants = new Map<string, { resolve: (granted: { id: string; label: string } | null) => void; label: string }>();
  // Audit log — in-memory, cleared on new session
  private auditLog: Array<{ timestamp: string; toolName: string; category: string; riskLevel: string; approvalMethod: string; status: string; argsSummary: string; fullArgs?: Record<string, unknown>; result?: string }> = [];
  private settingsListener?: vscode.Disposable;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly outputChannel: vscode.OutputChannel;
  private readonly statusBar: StatusBar;
  private history!: HistoryCoordinator;
  private projectRoot?: string;
  private projectInstructions?: string;
  private decisionsState?: import('@ava/core').DecisionsState;
  private signInManager?: import('./sign-in-manager.js').SignInManager;
  /**
   * Ava's working set of granted secrets — populated by user grants from the
   * vault, scoped to the current chat session, wiped on new_chat. Used by
   * tools (slice 2+) to fetch secret values by id without exposing the full
   * vault. Source of truth is VSCode SecretStorage; this is just the runtime
   * capability surface.
   */
  public readonly secretAccess = new SecretAccess();
  private memoryManager?: MemoryManager;
  private taskManager?: TaskManager;
  private journalManager?: JournalManager;
  private generationManager?: import('@ava/core').GenerationManager;
  private conductor?: Conductor;
  private autoCoordinator?: AutoCoordinator | null;
  private memoryAgent?: MemoryAgent;
  private intentClassifier?: IntentClassifier;
  private briefingEngine?: BriefingEngine;
  private eventDetector?: EventDetector;
  private tickInterval?: ReturnType<typeof setInterval>;
  private tickEngine?: import('@ava/core').TickEngine;
  private projectContextReady?: Promise<void>;
  private currentLocale = 'en';
  private panelStateCallback?: (isOpen: boolean) => void;
  private cachedAccount: AccountInfo | null = null;
  private accountScopedDir: string = AVA_HOME; // scoped per account when connected

  /**
   * Public getter for the account-scoped data directory — used by DashboardPanel
   * and other companion panels to read/write user data from the correct location.
   *
   * When a platform account is connected: `AVA_HOME/users/<account-id>/`.
   * When no account is connected (BYOK or fresh install): `AVA_HOME`.
   *
   * All data reads/writes that touch user memory, tasks, journal, learning,
   * history, personality, sync-state, or config must go through this getter
   * rather than using AVA_HOME directly.
   */
  public getAccountScopedDir(): string {
    return this.accountScopedDir;
  }

  /**
   * One-time migration of legacy chat transcripts from the old unscoped
   * `~/.ava/history` into the account-scoped `<scopedDir>/history`. History
   * was the one data type that wasn't account-scoped, which meant (a) two
   * accounts on one machine shared transcripts, and (b) the scoped export read
   * an empty dir and exported zero conversations. Runs only when the legacy
   * dir has transcripts and the scoped dir has none yet — idempotent.
   */
  /**
   * One-time move of a single legacy file from the unscoped `~/.ava/<name>`
   * into the account-scoped `<scopedDir>/<name>`. No-op if the legacy file is
   * absent or the scoped one already exists. Used for personality.json, which
   * was stored unscoped while everything else moved to per-account dirs.
   */
  private async migrateFileToScopedDir(name: string, scopedDir: string): Promise<void> {
    if (scopedDir === AVA_HOME) return;
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const legacy = path.join(AVA_HOME, name);
      const scoped = path.join(scopedDir, name);
      const fsSync = await import('node:fs');
      if (!fsSync.existsSync(legacy) || fsSync.existsSync(scoped)) return;
      await fs.mkdir(scopedDir, { recursive: true });
      try {
        await fs.rename(legacy, scoped);
      } catch {
        await fs.writeFile(scoped, await fs.readFile(legacy, 'utf-8'), 'utf-8');
        await fs.unlink(legacy).catch(() => {});
      }
      this.log(`[migrate] moved ${name} into the account-scoped dir`);
    } catch (err) {
      this.log(`[migrate] ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async migrateHistoryToScopedDir(scopedDir: string): Promise<void> {
    if (scopedDir === AVA_HOME) return;
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const legacyDir = path.join(AVA_HOME, 'history');
      const scopedHistory = path.join(scopedDir, 'history');
      const legacyJson = (await fs.readdir(legacyDir).catch(() => [] as string[])).filter(f => f.endsWith('.json'));
      if (legacyJson.length === 0) return;
      const scopedJson = (await fs.readdir(scopedHistory).catch(() => [] as string[])).filter(f => f.endsWith('.json'));
      if (scopedJson.length > 0) return; // already migrated
      await fs.mkdir(scopedHistory, { recursive: true });
      let moved = 0;
      for (const f of legacyJson) {
        const from = path.join(legacyDir, f);
        const to = path.join(scopedHistory, f);
        try {
          await fs.rename(from, to);
        } catch {
          // Cross-device or locked — fall back to copy + unlink.
          try {
            await fs.writeFile(to, await fs.readFile(from, 'utf-8'), 'utf-8');
            await fs.unlink(from).catch(() => {});
          } catch { continue; }
        }
        moved++;
      }
      this.log(`[history-migrate] moved ${moved} conversation(s) into the account-scoped dir`);
    } catch (err) {
      this.log(`[history-migrate] failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Handle a vscode://.../auth callback from the website, delegating to the
   * SignInManager. Called by the UriHandler registered in extension.ts.
   * Returns true if the URI was consumed by a pending sign-in, false if
   * it was for a different or stale attempt.
   */
  public async handleSignInCallback(uri: vscode.Uri): Promise<boolean> {
    if (!this.signInManager) {
      // Manager hasn't finished async import yet — wait briefly then retry
      await new Promise(r => setTimeout(r, 100));
    }
    if (!this.signInManager) return false;
    return this.signInManager.handleCallback(uri);
  }

  /**
   * Public entry points for DashboardPanel to delegate sign-in actions.
   * The dashboard has its own ConnectAccount screen (separate webview
   * from the chat panel), but both use the same underlying SignInManager
   * instance so events flow through to both surfaces automatically via
   * externalPostMessage.
   */
  public async startSignInFromDashboard(method: 'github' | 'email'): Promise<void> {
    if (!this.signInManager) {
      // Wait briefly for the async import to complete — guards the
      // edge case where the dashboard opens before the manager is ready.
      await new Promise(r => setTimeout(r, 100));
    }
    if (!this.signInManager) {
      // Still not ready — report a failure event to keep the UI moving
      this.postMessage({
        type: 'sign_in_failed',
        error: 'Sign-in manager not ready yet. Please try again.',
      } as any);
      return;
    }
    try {
      await this.signInManager.startSignIn(method);
    } catch (err) {
      this.log(`startSignInFromDashboard failed: ${err instanceof Error ? err.message : String(err)}`);
      // SignInManager already emitted sign_in_failed — no need to post again
    }
  }

  public cancelSignInFromDashboard(): void {
    this.signInManager?.cancelSignIn();
  }

  /** Local-conversation list used by the dashboard's History tab.
   *  Mirror of what `request_history` returns to the chat webview, but
   *  callable directly so DashboardPanel.loadConversations can merge
   *  local + cloud instead of bailing to empty when there's no
   *  platformKey. Local-first by design — conversations are saved to
   *  ~/.ava/ on every turn regardless of cloud sync status. */
  public async listLocalConversations(): Promise<unknown[]> {
    try {
      return await this.historyManager.listConversations(false);
    } catch {
      return [];
    }
  }

  /** Delete a conversation from local ~/.ava/ storage. Used by the
   *  Dashboard's History page so deletes survive a reload — the
   *  cloud-only delete path used to leave the local file in place
   *  and the conversation reappeared on next list. Routes through
   *  the same history-coordinator the chat-panel uses, so active-
   *  conversation reset and chat_cleared signalling still fire. */
  public async deleteLocalConversation(conversationId: string): Promise<void> {
    await this.history.delete(conversationId);
  }
  private providerSource: ProviderSource = 'byok';
  private enabledModelIds: Set<string> | null = null;
  private heartbeatInterval?: ReturnType<typeof setInterval>;
  private missedPongs = 0;

  /** External webview callback — used by DashboardPanel in unified mode */
  private externalPostMessage?: (msg: ExtToWebviewMessage) => void;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.providerRegistry = new ProviderRegistry();
    this.healthTracker = new ProviderHealthTracker();
    this.outputChannel = vscode.window.createOutputChannel('Ava Supernova');
    this.statusBar = new StatusBar('ava-supernova.switchModel');

    // Sign-in manager — owns the OAuth device authorization flow for the
    // extension. Created eagerly so the URI handler in extension.ts can
    // delegate to it as soon as VS Code routes a vscode://...auth callback.
    void (async () => {
      const { SignInManager } = await import('./sign-in-manager.js');
      this.signInManager = new SignInManager(this.context);
      // Forward sign-in events to the webview so the UI can update state.
      this.signInManager.onEvent((event) => {
        this.postMessage(event as any);
      });
      // Resume a sign-in that was in flight when the extension host last
      // reloaded — restarts the polling loop so a browser authorization that
      // happened (or happens) during the reload still completes.
      this.signInManager.resumePendingSignIn();
    })();

    // Detect project and load instructions (also creates historyManager)
    // Store the promise so initializeSession can await it before using managers
    this.projectContextReady = this.refreshProjectContext();

    // Re-detect project when workspace folders change (tracked for disposal)
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.onWorkspaceChanged();
      }),
    );

    // Re-initialize when platform key is added or removed (dashboard connect/disconnect)
    this.disposables.push(
      this.context.secrets.onDidChange(async (e) => {
        try {
          if (e.key === 'ava-supernova.platformKey') {
            this.cachedAccount = null;
            this.accountScopedDir = AVA_HOME; // Reset to default until new account verified
            // Clear chat, conversation, and last ID so stale data doesn't reload
            this.conversation = new Conversation();
            this.setLastConversationId(undefined);
            this.postMessage({ type: 'chat_cleared' });
            await this.refreshProjectContext();
            await this.initializeSession();
            // Pull latest memories from cloud after sign-in
            if (this.memoryManager) {
              this.memoryManager.pullLatest('global').catch(() => {});
              this.memoryManager.pullLatest('project').catch(() => {});
            }
          }
          // Refresh model list when any BYOK key changes
          if (e.key.startsWith('ava-supernova.provider.')) {
            await this.initializeSession();
          }
        } catch (err) {
          this.log(`Secret change handler failed: ${err}`);
        }
      }),
    );
  }

  private async refreshProjectContext(): Promise<void> {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    this.projectRoot = detectProjectRoot(cwd) ?? undefined;

    // Set up memory — LOCAL-ONLY, always. Memory is never wired to the cloud
    // (no PlatformMemorySync, no push, no pull): local-first is sacred here and
    // cloud storage of user data is being sunset. Matches the IDE.
    const platformKey = await this.context.secrets.get('ava-supernova.platformKey');

    // History is local-only, always. No sync, no pull, no cloud knob.
    // Cloud residue from earlier-version syncs is wiped via the
    // dashboard's "Wipe legacy cloud history" button.
    // Account-scoped like memory/tasks/journal: transcripts live under the
    // scoped dir so they're isolated per account AND land where the scoped
    // export reads them (this.accountScopedDir is AVA_HOME until sign-in,
    // then re-created scoped in the account block below).
    this.historyManager = new HistoryManager(this.projectRoot, this.accountScopedDir);
    this.historyManager.init();
    this.history = new HistoryCoordinator({
      context: this.context,
      historyManager: this.historyManager,
      postMessage: (m) => this.postMessage(m),
      getConversation: () => this.conversation,
      setConversation: (c) => { this.conversation = c; },
      reflectOutgoing: () => this.reflectOutgoingSession(this.conversation),
      buildSystemPrompt: () => this.buildCurrentSystemPrompt(),
      // Refresh the context bar whenever a conversation is loaded /
      // restored. Without this the bar stays at "awaiting first turn"
      // on a chat with real content until the user sends another message.
      emitContextUsage: () => this.emitContextUsageFromCurrent(),
    });

    const syncPrefs = this.context.globalState.get<Record<string, boolean>>('ava.syncPrefs') ?? {};
    const cloudAllowed = cloudSyncEnabled(this.context);
    // No sync object is wired in, and localOnly is forced true — so even a
    // Data-Mode flip can never push or pull memories. Memory stays on-device.
    this.memoryManager = new MemoryManager({ globalDir: AVA_HOME, projectRoot: this.projectRoot, localOnly: true, embeddingService: this.resolveEmbeddingService() });

    // ── One-time memory reset for v0.37.0 ─────────────────────────────────
    // The memory extraction system was fundamentally improved: broadened
    // patterns, approval capture, design-decision capture, scope guidance,
    // project knowledge brief. Old memories were extracted under narrow
    // rules that missed most signals and often mis-scoped project knowledge
    // to global. A clean start gives every user better recall quality from
    // day one on the new system. This fires exactly once per extension
    // install, then sets a flag so it never runs again.
    const MEMORY_RESET_FLAG = 'ava.memoryResetV037';
    if (!this.context.globalState.get<boolean>(MEMORY_RESET_FLAG)) {
      try {
        this.log('[memory-reset] v0.37.0 one-time memory reset — clearing local memory stores');
        // Clear both global and project memory stores
        const fs = await import('node:fs/promises');
        const path = await import('node:path');

        // Clear account-scoped memory (where most memories live for platform users)
        const accountDir = this.accountScopedDir;
        const accountMemPath = path.join(accountDir, 'memory.json');
        try { await fs.writeFile(accountMemPath, JSON.stringify({ version: 2, entries: [], lastModified: new Date().toISOString() }), 'utf-8'); } catch { /* file may not exist */ }

        // Clear root-level memory (fallback/legacy path)
        const rootMemPath = path.join(AVA_HOME, 'memory.json');
        try { await fs.writeFile(rootMemPath, JSON.stringify({ version: 2, entries: [], lastModified: new Date().toISOString() }), 'utf-8'); } catch { /* file may not exist */ }

        // Clear project-scoped memory if a project is open
        if (this.projectRoot) {
          const projectMemPath = path.join(this.projectRoot, '.ava', 'memory.json');
          try { await fs.writeFile(projectMemPath, JSON.stringify({ version: 2, entries: [], lastModified: new Date().toISOString() }), 'utf-8'); } catch { /* file may not exist */ }
        }

        // Set the flag so this never runs again
        await this.context.globalState.update(MEMORY_RESET_FLAG, true);
        this.log('[memory-reset] v0.37.0 memory reset complete — improved extraction system takes over');

        // Show a brief info message so the user knows what happened
        vscode.window.showInformationMessage(
          'Ava Supernova — Memory upgraded. Your improved memory system will rebuild as you work.',
        );
      } catch (err) {
        this.log(`[memory-reset] Failed: ${err instanceof Error ? err.message : String(err)}`);
        // Set the flag even on failure so we don't retry on every session start
        await this.context.globalState.update(MEMORY_RESET_FLAG, true);
      }
    }

    // Set up tasks with optional platform sync (same pattern as memory).
    // TaskManager and JournalManager default localOnly to true, so we
    // have to explicitly opt in to sync here — matching how memory is
    // wired via a preferences toggle and defaulting to on when the
    // user has a platformKey present.
    let taskSync: PlatformTaskSyncImpl | undefined;
    if (platformKey) {
      taskSync = new PlatformTaskSyncImpl('https://ava-supernova.com/api', platformKey);
    }
    // Tasks are LOCAL-FIRST by default (cloud is sunsetting). Tasks live
    // on-device; cloud sync only if the user explicitly opts in. Default →
    // local. Gates both push (on save) and the pull below.
    const taskLocalOnly = (vscode.workspace.getConfiguration('ava-supernova').get<boolean>('preferences.taskLocalOnly') ?? true)
      || syncPrefs.tasks === false
      || !cloudAllowed;
    migrateGlobalTasksToSubfolder(AVA_HOME);
    this.taskManager = new TaskManager({ globalDir: join(AVA_HOME, 'tasks'), projectRoot: this.projectRoot, sync: taskSync, localOnly: taskLocalOnly });
    if (taskSync && !taskLocalOnly) {
      // Pull on session start so tasks made on device A show up on B.
      this.taskManager.pullLatest().catch(() => {});
    }
    // Reminders fire host-side, independent of the panel being open.
    this.startReminderScheduler();

    // Journal is fully local — entries live on-device only and never sync to
    // the cloud. Download/transfer is handled by the local export system.
    this.journalManager = new JournalManager({ globalDir: AVA_HOME, projectRoot: this.projectRoot });

    // Generation manager — persists across page navigation, tracks creative jobs
    this.generationManager = new GenerationManager();
    this.generationManager.load().catch(() => {});
    this.generationManager.onUpdate((jobs) => {
      const active = jobs.filter(j => j.status !== 'complete' && j.status !== 'failed');
      if (active.length > 0) {
        this.updateStatusBar('generating', `Generating ${active.length} asset${active.length !== 1 ? 's' : ''}...`);
      }
      // Send to webview so it can show progress anywhere
      this.postMessage({ type: 'generation_progress', jobs: active } as any);
    });

    this.projectInstructions = this.projectRoot
      ? (await loadProjectInstructions(this.projectRoot)) ?? undefined
      : undefined;
    this.decisionsState = this.projectRoot
      ? await loadDecisionsState(this.projectRoot)
      : undefined;
    await this.memoryManager.loadAll(this.projectInstructions);
  }

  private async onWorkspaceChanged(): Promise<void> {
    // Cancel any in-progress agent run
    if (this.isRunning && this.runAbortController) {
      this.log('Workspace change: aborting current run');
      this.runAbortController.abort();
      killBackgroundProcesses();
    }

    // Reject pending tool confirmations so the agent loop unblocks
    for (const [id, pending] of this.pendingConfirmations) {
      pending.resolve(false);
      this.pendingConfirmations.delete(id);
    }

    // Clear session permissions and audit (new workspace = new trust boundary)
    this.toolRegistry?.resetSessionFirstTime();
    this.auditLog = [];

    // Save current conversation before switching
    if (this.conversation) {
      await this.historyManager.saveConversation(this.conversation);
      // Reflect the outgoing session into THIS project's memory before
      // refreshProjectContext rebuilds the agent for the new project.
      this.reflectOutgoingSession(this.conversation);
    }

    await this.refreshProjectContext();

    // Start fresh for the new project
    this.conversation = new Conversation();
    this.conversation.setSystemPrompt(await this.buildCurrentSystemPrompt());
    this.setLastConversationId(undefined);
    this.postMessage({ type: 'chat_cleared' });

    // Notify user of workspace switch
    const folderName = vscode.workspace.workspaceFolders?.[0]?.name ?? 'unknown';
    this.postMessage({
      type: 'system_message',
      content: `Workspace changed to ${folderName} — previous session ended`,
    } as ExtToWebviewMessage);

    // Re-initialize the agent with new project context
    await this.initializeSession();
    this.log(`Workspace changed — project root: ${this.projectRoot ?? 'none'}`);
  }

  private log(message: string): void {
    logTo(this.outputChannel, message);
  }

  /** Public log into the "Ava Supernova" output channel. Lets sibling
   *  components (e.g. DashboardPanel) write to the same visible channel
   *  instead of console.log, which only reaches the Extension Host log. */
  public logToChannel(message: string): void {
    logTo(this.outputChannel, message);
  }

  /** Report token usage to the platform API and update webview with pool state */
  private async reportUsageToPlatform(usage: { prompt_tokens: number; completion_tokens: number }): Promise<void> {
    try {
      const platformKey = await this.context.secrets.get('ava-supernova.platformKey');
      if (!platformKey) return;

      const isByok = this.providerSource !== 'platform';

      // BYOK users: no usage reporting — their tokens, their provider, nothing to track
      // Platform users: always report — platform tokens must be deducted
      if (isByok) return;

      const res = await apiFetch('/usage', {
        method: 'POST',
        platformKey,
        body: {
          model: this.activeModelDef?.id ?? 'unknown',
          provider: this.activeModelDef?.provider ?? 'unknown',
          input_tokens: usage.prompt_tokens,
          output_tokens: usage.completion_tokens,
          byok: isByok,
        },
      });

      if (res.ok && res.data && typeof res.data === 'object') {
        const data = res.data as {
          free_credits_used: number;
          free_credits_limit: number;
          credits_used: number;
          credits_limit: number | null;
          warning?: string;
          warning_pct?: number;
          warning_message?: string;
        };

        this.log(`Usage reported — free: ${data.free_credits_used}/${data.free_credits_limit}, sub: ${data.credits_used}/${data.credits_limit}`);

        // Keep cached account in sync so future init messages don't revert the display
        if (this.cachedAccount?.usage) {
          this.cachedAccount.usage.free_credits_used = data.free_credits_used ?? 0;
          this.cachedAccount.usage.credits_used = data.credits_used ?? 0;
        }

        this.postMessage({
          type: 'platform_status',
          connected: true,
          tier: this.cachedAccount?.tier ?? null,
          freeTokensUsed: data.free_credits_used,
          freeTokensLimit: data.free_credits_limit,
          subTokensUsed: data.credits_used,
          subTokensLimit: data.credits_limit,
          warning: (data.warning as 'none' | 'approaching' | 'critical' | 'exhausted') || 'none',
          warningPct: data.warning_pct || 0,
          warningMessage: data.warning_message || '',
        });
      } else {
        this.log(`Usage reporting returned non-ok: status=${res.status}, data=${JSON.stringify(res.data)}`);
      }
    } catch (err) {
      this.log(`Usage reporting failed (non-blocking): ${err}`);
    }
  }

  // ── Sidebar View ───────────────────────────────────────────────────────────

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    this.setupWebview(webviewView.webview);

    this.disposables.push(
      webviewView.onDidChangeVisibility(async () => {
        if (webviewView.visible) {
          this.startHeartbeat();
          await this.initializeSession();
        } else {
          this.stopHeartbeat();
        }
      }),
    );

    this.disposables.push(
      webviewView.onDidDispose(() => {
        this.stopHeartbeat();
        this.view = undefined;
      }),
    );

    this.startHeartbeat();

    this.ensureSettingsListener();
  }

  // ── Editor Panel ───────────────────────────────────────────────────────────

  onPanelStateChange(callback: (isOpen: boolean) => void): void {
    this.panelStateCallback = callback;
  }

  /** Set the shared TaskManager instance. */
  setTaskManager(manager: TaskManager): void {
    this.taskManager = manager;
  }

  /** Set the shared JournalManager instance. */
  setJournalManager(manager: JournalManager): void {
    this.journalManager = manager;
  }

  /**
   * Set an external webview callback for the unified panel.
   * When set, postMessage also forwards chat messages through this callback
   * with type remapping (init → chat_init, platform_status → chat_platform_status).
   */
  setUnifiedWebview(callback: (msg: ExtToWebviewMessage) => void): void {
    this.externalPostMessage = callback;
  }

  /**
   * Handle a chat message from the unified dashboard panel.
   * Maps dashboard message types to the internal WebviewToExtMessage format.
   */
  async handleChatMessage(msg: Record<string, unknown>): Promise<void> {
    this.log(`handleChatMessage received: type=${msg.type}`);
    // Remap unified message types to internal chat types
    const type = msg.type as string;
    let mapped: WebviewToExtMessage;
    switch (type) {
      case 'send_message': {
        // Validate attachments structure before passing through
        const rawAttachments = msg.attachments;
        const validAttachments = Array.isArray(rawAttachments)
          ? rawAttachments.filter((a: unknown) => a && typeof a === 'object' && typeof (a as Record<string, unknown>).data === 'string')
          : undefined;
        mapped = { type: 'send_message', text: msg.text as string, mode: (msg.mode ?? 'code') as AvaMode, attachments: validAttachments as any, surface: msg.surface as ('main' | 'health' | 'learning' | undefined) };
      }
        break;
      case 'tool_confirmation_response':
        mapped = { type: 'tool_confirmation_response', confirmationId: msg.confirmationId as string, approved: msg.approved as boolean, alwaysAllowCategory: msg.alwaysAllowCategory as boolean | undefined, planSelection: msg.planSelection as string | undefined, userResponse: msg.userResponse as string | undefined };
        break;
      case 'secret_grant_response':
        // Resolve the pending grant Promise and place the value into Ava's
        // working set. Routed directly here (no need to round-trip through
        // the inner switch).
        await this.handleSecretGrantResponse(
          msg.grantId as string,
          (msg.secretId as string) ?? '',
          msg.alwaysForProject as boolean | undefined,
        );
        return;
      case 'switch_model':
        mapped = { type: 'switch_model', modelId: msg.modelId as string };
        break;
      case 'clear_chat':
        mapped = { type: 'clear_chat', surface: msg.surface as ('main' | 'health' | 'learning' | undefined) };
        break;
      case 'cancel':
        mapped = { type: 'cancel' };
        break;
      case 'interrupt':
        mapped = { type: 'interrupt' };
        break;
      case 'request_history':
        mapped = { type: 'request_history' };
        break;
      case 'load_chat_conversation':
        mapped = { type: 'load_conversation', conversationId: msg.conversationId as string };
        break;
      case 'delete_chat_conversation':
        mapped = { type: 'delete_conversation', conversationId: msg.conversationId as string };
        break;
      case 'search_history':
        mapped = { type: 'search_history', query: msg.query as string };
        break;
      case 'rename_conversation':
        mapped = { type: 'rename_conversation', conversationId: msg.conversationId as string, newTitle: msg.newTitle as string };
        break;
      case 'pin_conversation':
        mapped = { type: 'pin_conversation', conversationId: msg.conversationId as string, pinned: msg.pinned as boolean };
        break;
      case 'export_conversation':
        mapped = { type: 'export_conversation', conversationId: msg.conversationId as string, format: msg.format as 'markdown' | 'json' };
        break;
      case 'new_chat':
        mapped = { type: 'new_chat' };
        break;
      case 'compress_context':
        mapped = { type: 'compress_context' };
        break;
      case 'set_provider_source':
        mapped = { type: 'set_provider_source', source: msg.source as ProviderSource };
        break;
      case 'request_memory':
        mapped = { type: 'request_memory' };
        break;
      case 'save_chat_memory':
        mapped = { type: 'save_memory', scope: msg.scope as 'global' | 'project', content: msg.content as string };
        break;
      case 'clear_chat_memory':
        mapped = { type: 'clear_memory', scope: msg.scope as 'global' | 'project' };
        break;
      case 'archive_chat_memory':
        mapped = { type: 'archive_memory', scope: msg.scope as 'global' | 'project', id: msg.id as string };
        break;
      case 'restore_chat_memory':
        mapped = { type: 'restore_memory', scope: msg.scope as 'global' | 'project', id: msg.id as string };
        break;
      case 'delete_chat_memory_entry':
        mapped = { type: 'delete_memory_entry', scope: msg.scope as 'global' | 'project', id: msg.id as string };
        break;
      case 'refresh_memories':
        mapped = { type: 'refresh_memories' };
        break;
      case 'refresh_tasks':
        mapped = { type: 'refresh_tasks' };
        break;
      case 'refresh_journal':
        mapped = { type: 'refresh_journal' };
        break;
      case 'refresh_history':
        mapped = { type: 'refresh_history' };
        break;
      case 'pong':
        mapped = { type: 'pong' };
        break;
      case 'request_today_tasks':
        mapped = { type: 'request_today_tasks' };
        break;
      case 'request_all_tasks':
        mapped = { type: 'request_all_tasks' };
        break;
      case 'toggle_task':
        mapped = { type: 'toggle_task', taskId: msg.taskId as string };
        break;
      case 'panel_create_task':
        mapped = {
          type: 'panel_create_task',
          title: msg.title as string,
          description: msg.description as string | undefined,
          priority: msg.priority as string | undefined,
          category: msg.category as string | undefined,
          due_date: msg.due_date as string | undefined,
          due_time: msg.due_time as string | undefined,
          recurrence: msg.recurrence as string | undefined,
          reminder_lead: msg.reminder_lead as number | undefined,
          subtasks: msg.subtasks as string[] | undefined,
        };
        break;
      case 'panel_update_task':
        mapped = {
          type: 'panel_update_task',
          taskId: msg.taskId as string,
          updates: (msg.updates ?? {}) as Record<string, unknown>,
        } as any;
        break;
      case 'toggle_subtask':
        mapped = { type: 'toggle_subtask', taskId: msg.taskId as string, subtaskId: msg.subtaskId as string } as any;
        break;
      case 'open_tasks_folder':
        mapped = { type: 'open_tasks_folder' } as any;
        break;
      case 'rate_message':
        mapped = { type: 'rate_message', messageId: msg.messageId as string, rating: msg.rating as 'up' | 'down', reason: msg.reason as string | undefined };
        break;
      case 'save_secrets':
        mapped = { type: 'save_secrets', secrets: msg.secrets as any };
        // Persist to VS Code SecretStorage
        try {
          await this.context.secrets.store('ava-supernova.secretVault', JSON.stringify(msg.secrets));
        } catch { /* best-effort */ }
        break;
      case 'load_secrets':
        try {
          const raw = await this.context.secrets.get('ava-supernova.secretVault');
          const secrets = raw ? JSON.parse(raw) : [];
          this.postMessage({ type: 'secrets_loaded', secrets });
        } catch {
          this.postMessage({ type: 'secrets_loaded', secrets: [] });
        }
        return;
      case 'toggle_knowledge_pack': {
        // Save enabled packs to ~/.ava/knowledge-enabled.json and reinit
        try {
          const fs = require('node:fs');
          const path = require('node:path');
          const enabledPath = path.join(AVA_HOME, 'knowledge-enabled.json');
          let enabled: string[] = [];
          try { enabled = JSON.parse(fs.readFileSync(enabledPath, 'utf-8')); } catch { /* empty */ }
          if (msg.enabled) {
            if (!enabled.includes(msg.packId as string)) enabled.push(msg.packId as string);
          } else {
            enabled = enabled.filter((id: string) => id !== msg.packId);
          }
          fs.mkdirSync(AVA_HOME, { recursive: true });
          fs.writeFileSync(enabledPath, JSON.stringify(enabled, null, 2), 'utf-8');
          this.log(`Knowledge pack ${msg.packId}: ${msg.enabled ? 'enabled' : 'disabled'}`);
          // Reinit session so new knowledge is loaded
          await this.initializeSession();
        } catch (err) { this.log(`Knowledge pack toggle failed: ${err}`); }
        return;
      }
      case 'palette_intent':
        mapped = {
          type: 'palette_intent',
          tool: msg.tool as PaletteTool,
          action: msg.action as string,
          mode: (msg.mode ?? 'code') as AvaMode,
          surface: msg.surface as ('main' | 'health' | 'learning' | undefined),
        };
        break;
      default:
        return; // Not a chat message
    }
    await this.handleWebviewMessage(mapped);
  }

  /**
   * Initialise the chat engine for the unified panel.
   * Called by DashboardPanel when its webview_ready fires.
   */
  async initChatForUnifiedPanel(): Promise<void> {
    await this.initializeSession();
    await this.restoreLastConversation();
  }

  openInEditor(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'ava-supernova.chat',
      'Ava Supernova',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
        ],
      },
    );

    this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'AvaSupernovaIcon.png');

    this.setupWebview(this.panel.webview);

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.panelStateCallback?.(false);
    });

    this.ensureSettingsListener();
    this.panelStateCallback?.(true);
  }

  // ── Shared Webview Setup ───────────────────────────────────────────────────

  private setupWebview(webview: vscode.Webview): void {
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
      ],
    };

    // Register handler BEFORE setting HTML to guarantee we catch webview_ready
    this.disposables.push(
      webview.onDidReceiveMessage(
        (message: WebviewToExtMessage) => this.handleWebviewMessage(message),
      ),
    );

    webview.html = this.getHtmlForWebview(webview);
  }

  private ensureSettingsListener(): void {
    if (this.settingsListener) return;

    this.settingsListener = vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('ava-supernova')) {
        await this.initializeSession();
      }
    });
  }

  // ── Public Commands ────────────────────────────────────────────────────────

  /**
   * Fire end-of-session memory reflection over an outgoing conversation
   * before it's cleared or swapped out (New Chat, project switch, resume).
   * Distils durable user/project facts the per-turn capture may have missed
   * and compression would have dropped. Off the hot path — the session is
   * ending — so it can't create a conversation→memory feedback loop.
   * Fire-and-forget; no-op for an empty conversation (reflectOnSession needs
   * >= 2 user turns).
   */
  private reflectOutgoingSession(conversation: Conversation | undefined): void {
    if (!conversation) return;
    void this.memoryAgent?.reflectOnSession(conversation.getMessages(), conversation.id)
      .catch((err) => this.log(`end-of-session reflection failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`));
  }

  async newChat(): Promise<void> {
    // Persist the outgoing conversation, but never let a save failure
    // (e.g. a cloud-sync hiccup) block the reset — the user asked for a
    // new chat and must get one. A throw here used to abort the whole
    // method before chat_cleared was posted, so the button "did nothing".
    if (this.conversation) {
      try {
        await this.historyManager.saveConversation(this.conversation);
      } catch (err) {
        this.log(`newChat: saveConversation failed (continuing): ${err instanceof Error ? err.message : String(err)}`);
      }
      // Reflect the outgoing session into memory before it's cleared.
      this.reflectOutgoingSession(this.conversation);
    }

    this.conversation = new Conversation();
    try {
      this.conversation.setSystemPrompt(await this.buildCurrentSystemPrompt());
    } catch (err) {
      this.log(`newChat: buildCurrentSystemPrompt failed (continuing): ${err instanceof Error ? err.message : String(err)}`);
    }
    this.setLastConversationId(undefined);

    // Wipe Ava's granted secrets — fresh chat = fresh trust boundary.
    // 'always grant for project' policies live on the vault entry itself
    // (alwaysGrantProjects[]) so they survive this; only the in-memory
    // working set resets here.
    this.secretAccess.forgetAll();

    this.postMessage({ type: 'chat_cleared' });
    this.postMessage({ type: 'init', models: this.getModelList(), activeModel: this.getActiveModelId(), needsSetup: !this.agent, consentRequired: !this.context.globalState.get('ava.consentAccepted'), locale: this.currentLocale });
  }

  focusInput(): void {
    // Show the panel if hidden, then tell webview to focus the input
    this.openInEditor();
    this.postMessage({ type: 'focus_input' });
  }

  clearChat(): void {
    this.conversation?.clear();
    this.toolRegistry?.resetSessionFirstTime();
    this.auditLog = [];
    this.postMessage({ type: 'chat_cleared' });
    this.postMessage({ type: 'init', models: this.getModelList(), activeModel: this.getActiveModelId(), needsSetup: !this.agent, consentRequired: !this.context.globalState.get('ava.consentAccepted'), locale: this.currentLocale });
  }

  async switchModel(): Promise<void> {
    const models = this.providerRegistry.listAllModels();
    if (models.length === 0) {
      vscode.window.showWarningMessage('No providers configured. Add an API key in Settings.');
      return;
    }
    const items = models.map((m) => ({
      label: m.name,
      description: `${m.provider}:${m.id}`,
      modelId: `${m.provider}:${m.id}`,
    }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a model' });
    if (picked) {
      this.setActiveModel(picked.modelId);
    }
  }

  showHistory(): void {
    this.sendHistoryList();
  }

  dispose(): void {
    this.stopHeartbeat();
    this.stopReminderScheduler();
    killBackgroundProcesses();
    this.settingsListener?.dispose();
    this.statusBar.dispose();
    this.panel?.dispose();
    this.outputChannel.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.missedPongs = 0;
    this.heartbeatInterval = setInterval(() => {
      this.missedPongs++;
      this.postMessage({ type: 'ping' } as ExtToWebviewMessage);

      if (this.missedPongs >= 5) {
        this.log('Heartbeat: webview unresponsive — attempting reinitialisation');
        this.missedPongs = 0;
        this.initializeSession().catch(() => {});
      } else if (this.missedPongs >= 3) {
        this.log(`Heartbeat: ${this.missedPongs} consecutive pings missed — webview may be unresponsive`);
      }
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  // ─── Task reminders ────────────────────────────────────────────────────────
  // A host-side scheduler so a task reminder fires even when the panel (or the
  // whole dashboard) is closed — it only needs the extension host alive. The
  // notification surface is VS Code's own (no OS-permission gate exists for an
  // extension; the IDE mirror uses the native notification API which DOES ask).
  // Respect the user's preference toggle; dedupe via the task's reminderFiredAt.
  private reminderTimer?: ReturnType<typeof setInterval>;
  private snoozedReminders = new Map<string, { fireAt: number; title: string }>();

  private startReminderScheduler(): void {
    if (this.reminderTimer) return;
    this.reminderTimer = setInterval(() => { this.tickReminders().catch(() => {}); }, 30_000);
    // First sweep shortly after start so a reminder due at launch surfaces.
    setTimeout(() => { this.tickReminders().catch(() => {}); }, 8_000);
  }

  private stopReminderScheduler(): void {
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
      this.reminderTimer = undefined;
    }
  }

  private async tickReminders(): Promise<void> {
    const enabled = vscode.workspace.getConfiguration('ava-supernova').get<boolean>('preferences.taskReminders') ?? true;
    if (!enabled || !this.taskManager) return;
    const now = Date.now();

    // Snoozed re-fires first.
    for (const [id, s] of this.snoozedReminders) {
      if (now >= s.fireAt) {
        this.snoozedReminders.delete(id);
        this.fireReminder(id, s.title);
      }
    }

    try {
      const due = await this.taskManager.getDueReminders(now);
      for (const task of due) {
        // Stamp first so a slow notification can't double-fire on the next tick.
        await this.taskManager.markReminderFired(task.id).catch(() => {});
        this.fireReminder(task.id, task.title);
      }
    } catch { /* best-effort */ }
  }

  private fireReminder(taskId: string, title: string): void {
    const OPEN = 'Open tasks';
    const DONE = 'Mark done';
    const SNOOZE = 'Snooze 10m';
    void vscode.window.showInformationMessage(`⏰ ${title}`, OPEN, DONE, SNOOZE).then((choice) => {
      if (choice === DONE) {
        this.taskManager?.completeTask(taskId).then(() => {
          void this.sendTodayTasks();
          void this.sendAllTasks();
        }).catch(() => {});
      } else if (choice === SNOOZE) {
        this.snoozedReminders.set(taskId, { fireAt: Date.now() + 10 * 60_000, title });
      } else if (choice === OPEN) {
        try { this.view?.show?.(true); } catch { /* view may not be resolvable */ }
      }
    });
  }

  private handlePong(): void {
    this.missedPongs = 0;
  }

  private updateStatusBar(state: StatusBarState = 'ready', detail?: string): void {
    // Pass the orchestration mode id so the bar shows "Aurora" /
    // "Supernova" / "Maestro" instead of the resolved coordinator's
    // model name (which used to read "Mistral Large 3" while Aurora
    // was actually routing across Large 3 + Medium 3.5 + Small 4).
    this.statusBar.setMode(this.getActiveModelId());
    this.statusBar.setModel(this.activeModelDef);
    this.statusBar.setState(state, detail);
  }

  // ── Private Methods ────────────────────────────────────────────────────────

  /** Schedule ONE delayed re-init after a transient platform failure (network
   *  down / timeout / 5xx). Auto-heals the session when connectivity returns
   *  without the user having to reload — and without ever touching their
   *  stored key or model choice. One-shot per failure window: the guard only
   *  resets when the retry actually runs, so retries never stack. */
  private scheduleTransientRetry(): void {
    if (this.platformRetryScheduled) return;
    this.platformRetryScheduled = true;
    setTimeout(() => {
      this.platformRetryScheduled = false;
      this.log('Retrying session init after transient platform failure…');
      void this.initializeSession();
    }, 60_000);
  }

  private async initializeSession(): Promise<void> {
    try {
      // Ensure project context (memory, tasks, journal) is ready before proceeding
      if (this.projectContextReady) {
        await this.projectContextReady;
      }

      const config = vscode.workspace.getConfiguration('ava-supernova');
      this.providerRegistry = new ProviderRegistry();

      // Resolve locale from settings, falling back to VS Code language
      const langSetting = config.get<string>('preferences.language') || 'auto';
      this.currentLocale = resolveLocale(langSetting === 'auto' ? vscode.env.language : langSetting);
      setLocaleSync(this.currentLocale);

      this.log(`Initializing session... (locale: ${this.currentLocale})`);

      // ── BYOK providers (keys stored in SecretStorage) ─────────────────────
      const providerSecrets: Record<string, string> = {
        deepseek: 'ava-supernova.provider.deepseek.apiKey',
        kimi: 'ava-supernova.provider.kimi.apiKey',
        qwen: 'ava-supernova.provider.qwen.apiKey',
        glm: 'ava-supernova.provider.glm.apiKey',
        mistral: 'ava-supernova.provider.mistral.apiKey',
        anthropic: 'ava-supernova.provider.anthropic.apiKey',
        xiaomi: 'ava-supernova.provider.xiaomi.apiKey',
        tencent: 'ava-supernova.provider.tencent.apiKey',
        nvidia: 'ava-supernova.provider.nvidia.apiKey',
      };
      // Config key → registry key mapping (glm config maps to zhipu provider)
      const configToRegistry: Record<string, string> = { glm: 'zhipu' };
      const providerNames = ['deepseek', 'kimi', 'qwen', 'glm', 'mistral', 'anthropic', 'xiaomi', 'tencent', 'nvidia'];
      // Run the legacy-plaintext migration sequentially (it writes to
      // settings + secrets and we don't want races), then read all
      // SecretStorage keys in parallel — sequential awaits used to add
      // ~100-150ms to every chat init. SecretStorage is independent
      // per key, so parallel is safe.
      for (const name of providerNames) {
        const legacyKey = config.get<string>(`providers.${name}.apiKey`);
        if (legacyKey) {
          await this.context.secrets.store(providerSecrets[name], legacyKey);
          await config.update(`providers.${name}.apiKey`, undefined, vscode.ConfigurationTarget.Global);
          this.log(`Migrated ${name} API key from settings to SecretStorage`);
        }
      }
      const apiKeys = await Promise.all(
        providerNames.map((name) => this.context.secrets.get(providerSecrets[name])),
      );
      providerNames.forEach((name, i) => {
        const apiKey = apiKeys[i];
        if (!apiKey) return;
        const registryKey = configToRegistry[name] || name;
        try {
          this.providerRegistry.register(registryKey, { apiKey });
          this.log(`Provider registered: ${registryKey}`);
        } catch (err) {
          this.log(`Provider ${registryKey} failed to register: ${err}`);
        }
      });

      // ── Local / Custom OpenAI-compatible provider (Ollama, LM Studio, vLLM)
      // Lets users point Ava at any locally-hosted model that speaks the
      // OpenAI Chat Completions API. Stored as three SecretStorage entries:
      //   - .baseUrl       (e.g. http://localhost:11434/v1 for Ollama)
      //   - .apiKey        (often "ollama" or empty for local servers)
      //   - .modelName     (e.g. qwen2.5-coder:7b — the id Ollama serves)
      //   - .modelLabel    (optional friendly name shown in the picker)
      try {
        // Local provider config — 4 SecretStorage keys read in parallel
        // for the same reason as the BYOK loop above. Saves ~30-60ms.
        const [localBaseUrl, localModelName, localApiKeyRaw, localModelLabelRaw, localModelsRaw] = await Promise.all([
          this.context.secrets.get('ava-supernova.provider.local.baseUrl'),
          this.context.secrets.get('ava-supernova.provider.local.modelName'),
          this.context.secrets.get('ava-supernova.provider.local.apiKey'),
          this.context.secrets.get('ava-supernova.provider.local.modelLabel'),
          this.context.secrets.get('ava-supernova.provider.local.models'),
        ]);
        // Enabled-model list from Detect; fall back to the single manual name.
        let localModelIds: string[] = [];
        try {
          if (localModelsRaw) localModelIds = (JSON.parse(localModelsRaw) as string[]).filter((m) => typeof m === 'string' && m.trim().length > 0);
        } catch { /* corrupt → fall back below */ }
        if (localModelIds.length === 0 && localModelName) localModelIds = [localModelName];

        if (localBaseUrl && localModelIds.length > 0) {
          const localApiKey = localApiKeyRaw || 'local';
          // A custom display label only applies to a single registered model;
          // a detected library shows each model by its own id. Conservative
          // defaults — Ollama models vary widely.
          const singleLabel = localModelLabelRaw && localModelIds.length === 1 ? localModelLabelRaw : undefined;
          const localModels = localModelIds.map((id) => ({
            id,
            name: singleLabel ?? id,
            provider: 'generic',
            contextWindow: 32000,
            maxOutputTokens: 4096,
            supportsToolCalls: true,
            supportsStreaming: true,
          }));
          const localProvider = new GenericProvider({
            apiKey: localApiKey,
            baseUrl: localBaseUrl,
            models: localModels,
          });
          this.providerRegistry.registerCustom('generic', localProvider);
          this.log(`Local provider registered: ${localModelIds.length} model(s) @ ${localBaseUrl}`);
        }
      } catch (err) {
        this.log(`Local provider failed to register: ${err}`);
      }

      // ── Platform account provider ───────────────────────────────────────────
      try {
        const platformKey = await this.context.secrets.get('ava-supernova.platformKey');
        if (platformKey) {
          // Track HOW verification failed: 401/403 = the server rejected the
          // key (genuinely invalid); anything else (status 0 network error,
          // timeout, 5xx during a deploy) = we simply couldn't verify — which
          // must never be treated as an invalid key.
          let verifyStatus: number | null = null;
          if (!this.cachedAccount) {
            const res = await apiFetch('/account-info', { platformKey });
            verifyStatus = res.status;
            this.cachedAccount = res.ok ? (res.data as AccountInfo) : null;
            if (this.cachedAccount?.usage) {
              this.log(`Account usage: free=${this.cachedAccount.usage.free_credits_used}/${this.cachedAccount.usage.free_credits_limit}`);
            }
          }
          if (this.cachedAccount) {
            const platform = new PlatformProvider({ apiKey: platformKey });
            this.providerRegistry.registerCustom('platform', platform);
            this.log(`Platform provider registered (tier: ${this.cachedAccount.tier})`);
            this.transientNotified = false; // healthy again — a future outage should notify anew

            // Scope data directory per account — prevents memory leakage between accounts
            try {
              const { join } = await import('node:path');
              const { mkdir } = await import('node:fs/promises');
              const newScopedDir = join(AVA_HOME, 'users', this.cachedAccount.id);
              if (newScopedDir !== this.accountScopedDir) {
                await mkdir(newScopedDir, { recursive: true });
                this.accountScopedDir = newScopedDir;
                this.log(`Account-scoped data directory: ${newScopedDir}`);

                // Re-create managers with the account-scoped directory. Memory is
                // the exception: it stays FLAT (~/.ava/memory/) — local-only, one
                // store per machine, shared with the IDE + CLI. Account-scoping
                // memory split it off from those and bought nothing once cloud
                // sync was removed.
                this.memoryManager = new MemoryManager({ globalDir: AVA_HOME, projectRoot: this.projectRoot, localOnly: true, embeddingService: this.resolveEmbeddingService() });
                const taskSync = new PlatformTaskSyncImpl('https://ava-supernova.com/api', platformKey);
                migrateGlobalTasksToSubfolder(newScopedDir);
                this.taskManager = new TaskManager({ globalDir: join(newScopedDir, 'tasks'), projectRoot: this.projectRoot, sync: taskSync });
                this.journalManager = new JournalManager({ globalDir: newScopedDir, projectRoot: this.projectRoot });
                // History: scope it too. Migrate any legacy transcripts from the
                // old unscoped ~/.ava/history into the scoped dir (one-time),
                // then re-point the SAME manager instance so the already-built
                // HistoryCoordinator + sharedState keep working.
                await this.migrateHistoryToScopedDir(newScopedDir);
                this.historyManager.setBaseDir(newScopedDir);
                // Personality was stored unscoped at ~/.ava/personality.json —
                // migrate it into the scoped dir so signed-in users keep their Ava.
                await this.migrateFileToScopedDir('personality.json', newScopedDir);
                void this.historyManager.init();
                // Warm the memory stores in the background — do NOT await.
                // Nothing on the chat-init path needs them: the system
                // prompt build takes no memory input, and memory's
                // consumers (recall tool, Memory page) load on demand.
                // Awaiting here blocked chat_init for ~6.6s on a large
                // memory store — measured via the session-init logs.
                void this.memoryManager.loadAll(this.projectInstructions)
                  .catch(() => { /* non-fatal — consumers load on demand */ });
              }
            } catch (scopeErr) {
              this.log(`Account scoping failed, using default directory: ${scopeErr}`);
            }
          } else if (verifyStatus === 401 || verifyStatus === 403) {
            // The server EXPLICITLY rejected the key — genuinely invalid or
            // revoked. Only in this case do we clear it.
            this.log(`Platform key rejected by the server (${verifyStatus}) — clearing it`);
            this.postMessage({
              type: 'system_message',
              content: 'Platform account verification failed. Your API key may be invalid or expired.',
            } as ExtToWebviewMessage);
            // Show VS Code popup with action to open account page
            const action = await vscode.window.showWarningMessage(
              'Your Ava platform API key is no longer valid. Please reconnect your account.',
              'Open Account'
            );
            if (action === 'Open Account') {
              vscode.env.openExternal(vscode.Uri.parse('https://ava-supernova.com/dashboard'));
            }
            // Clear the invalid key
            await this.context.secrets.delete('ava-supernova.platformKey');
          } else {
            // Transient failure — network down, timeout, or a 5xx while the
            // platform deploys. We could not VERIFY the key; that is NOT the
            // same as the key being invalid. Keep the key, keep the user's
            // stored model choice, and quietly retry once shortly. (The old
            // behaviour deleted the key and popped "no longer valid" here —
            // a paying user's session nuked by a server blip.)
            this.log(`Platform account check unavailable (status ${verifyStatus ?? 'n/a'}) — keeping key and settings, will retry`);
            if (!this.transientNotified) {
              this.transientNotified = true;
              this.postMessage({
                type: 'system_message',
                content: 'Couldn\'t reach the Ava platform to verify your account — your settings are unchanged. Retrying shortly; if you\'re offline, everything reconnects next session.',
              } as ExtToWebviewMessage);
            }
            this.scheduleTransientRetry();
          }
        }
      } catch (err) {
        this.log(`Platform account check failed: ${err}`);
        this.postMessage({
          type: 'system_message',
          content: 'Could not reach the Ava platform. Platform features are unavailable. Your local API keys still work.',
        } as ExtToWebviewMessage);
      }

      // ── Fetch enabled models from platform (non-blocking) ─────────────────
      // Sends the platform key as a Bearer token so admin-gated rows
      // (migration 218 — currently the DeepSeek V4 Pro/Flash managed
      // entries) are only returned when the caller resolves to tier=admin.
      // Non-admin accounts get the public list; not signing in at all
      // also works (fetch proceeds without Authorization header).
      //
      // Cache key is suffixed with "admin"/"public" so switching between
      // admin and non-admin accounts doesn't serve the wrong list from
      // a stale cache.
      try {
        // Re-fetch platform key — the previous try block scoped it out
        // of reach. Cheap VSCode SecretStorage read.
        const modelFetchKey = await this.context.secrets.get('ava-supernova.platformKey');
        // Cache key versioned (v2) so upgrades that change the server-side
        // shape of /api/models (e.g. admin-gated rows landing in the
        // response for admin callers) invalidate any stale caches from
        // the previous major response shape. Bump when the server filter
        // logic changes.
        const cacheKey = modelFetchKey ? 'enabledModels_admin_v2' : 'enabledModels_public_v2';
        const cached = this.context.globalState.get<{ ids: string[]; ts: number }>(cacheKey);
        if (cached && Date.now() - cached.ts < 3600000) {
          this.enabledModelIds = new Set(cached.ids);
        } else {
          const headers: Record<string, string> = {};
          if (modelFetchKey) headers['Authorization'] = `Bearer ${modelFetchKey}`;
          // Hard 6s timeout — this fetch is on the chat-init critical
          // path: chat_init (which clears the webview's "loading…" gate)
          // can't fire until it returns. Without a bound a cold/slow
          // platform stalls the whole chat surface — the ~60s hang.
          // On timeout we fall through to the catch and use every
          // registered model, which is the correct safe default anyway.
          const modelsAbort = new AbortController();
          const modelsTimer = setTimeout(() => modelsAbort.abort(), 6000);
          let res: Response;
          try {
            res = await fetch('https://ava-supernova.com/api/models', { headers, signal: modelsAbort.signal });
          } finally {
            clearTimeout(modelsTimer);
          }
          if (res.ok) {
            const models = (await res.json()) as Array<{ id: string; enabled: boolean }>;
            const ids = models.filter(m => m.enabled !== false).map(m => m.id);
            this.enabledModelIds = new Set(ids);
            await this.context.globalState.update(cacheKey, { ids, ts: Date.now() });
            this.log(`Fetched ${ids.length} enabled models from platform (${modelFetchKey ? 'admin-aware' : 'public'})`);
          }
        }
      } catch {
        this.log('Could not fetch enabled models from platform — using all registered');
      }

      // Resolve provider source (persisted preference)
      const hasPlatform = this.providerRegistry.listAllModels().some(m => m.provider === 'platform');
      const hasByok = this.providerRegistry.listAllModels().some(m => m.provider !== 'platform');
      const storedSource = this.context.workspaceState.get<ProviderSource>('providerSource');

      if (storedSource === 'platform' && hasPlatform) {
        this.providerSource = 'platform';
      } else if (storedSource === 'byok' && hasByok) {
        this.providerSource = 'byok';
      } else {
        this.providerSource = hasPlatform ? 'platform' : 'byok';
      }

      try {
        let activeModelId = config.get<string>('activeModel') || '';

        // Migration: MiniMax is reserved for Creative Studio — never as the chat coordinator.
        // If a previous session (or the Dashboard leak) stuck a MiniMax model here, reset to Auto
        // so resolveCoordinatorModel() picks the correct Qwen model on next load.
        if (activeModelId.toLowerCase().includes('minimax')) {
          this.log(`Migrating stuck chat model "${activeModelId}" → auto (MiniMax is Creative Studio only)`);
          activeModelId = 'auto';
          await config.update('activeModel', 'auto', vscode.ConfigurationTarget.Global);
        }

        // Restore orchestrated modes (Auto / Supernova / Aurora) — these
        // are aliases, not real model ids in the registry, so resolveModel
        // would return null and the user got reset to a free model on
        // every reload. Route them through setActiveModel which knows how
        // to resolve their coordinator chains.
        if (activeModelId === 'auto' || activeModelId === 'supernova' || activeModelId === 'aurora') {
          this.log(`Restoring orchestrated mode "${activeModelId}" from saved setting`);
          await this.setActiveModel(activeModelId);
        } else {
          const resolved = this.providerRegistry.resolveModel(activeModelId);

          if (resolved) {
            this.log(`Active model: ${resolved.provider.name}:${resolved.model.id} (${resolved.model.name})`);
            // Route through setActiveModel so autoCoordinator state, status bar and webview
            // stay in sync — calling setupAgent() directly skips those resets.
            await this.setActiveModel(activeModelId);
          } else if (!activeModelId) {
            // TRUE first run — no stored choice exists, so pick a starter
            // model and persist it. This is the ONLY case where we're allowed
            // to write activeModel on the user's behalf.
            const allModels = this.providerRegistry.listAllModels();
            const pick = allModels.find(m => m.pricing?.inputPerMillion === 0) || allModels[0];
            if (pick) {
              const autoResolved = this.providerRegistry.resolveModel(`${pick.provider}:${pick.id}`);
              if (autoResolved) {
                this.log(`First run — auto-selected starter model: ${pick.provider}:${pick.id}`);
                await this.setupAgent(autoResolved.provider, autoResolved.model);
                config.update('activeModel', `${pick.provider}:${pick.id}`, vscode.ConfigurationTarget.Global);
              }
            } else {
              this.log(`No models available to auto-select. Available: ${allModels.map(m => m.id).join(', ') || 'none'}`);
            }
          } else {
            // A STORED choice failed to resolve — usually the platform being
            // unreachable this instant (its provider only registers after a
            // successful account check), or a BYOK provider that's been
            // removed. NEVER overwrite the user's stored model here: the old
            // code auto-picked a different model AND persisted it, silently
            // and permanently changing the user's selection on any network
            // blip — the exact bug class the model-persistence audit flagged.
            // Keep the setting untouched, say so, and retry shortly.
            this.log(`Stored model "${activeModelId}" is unavailable this session — keeping the user's choice untouched.`);
            if (!this.transientNotified) {
              this.transientNotified = true;
              this.postMessage({
                type: 'system_message',
                content: `Your selected model (${activeModelId}) isn't reachable right now — this is usually a temporary connection issue. Your choice is unchanged; retrying shortly.`,
              } as ExtToWebviewMessage);
            }
            this.scheduleTransientRetry();
          }
        }
      } catch (err) {
        this.log(`Agent setup failed (non-blocking): ${err}`);
      }
    } catch (err) {
      this.log(`Session initialization failed: ${err}`);
    }

    // ── Always send init — webview must never be left in loading state ─────
    this.updateStatusBar('ready');

    const platformStatus: PlatformStatus | undefined = this.cachedAccount
      ? {
          connected: true,
          tier: this.cachedAccount.tier,
          freeTokensUsed: this.cachedAccount.tier === 'admin' ? 0 : (this.cachedAccount.usage?.free_credits_used ?? 0),
          freeTokensLimit: this.cachedAccount.tier === 'admin' ? 999_999_999 : (this.cachedAccount.usage?.free_credits_limit ?? 300),
          subTokensUsed: this.cachedAccount.usage?.credits_used ?? 0,
          subTokensLimit: this.cachedAccount.usage?.credits_limit ?? null,
          warning: 'none',
          warningPct: 0,
          warningMessage: '',
        }
      : undefined;

    this.postMessage({
      type: 'init',
      models: this.getModelList(),
      activeModel: this.getActiveModelId(),
      needsSetup: !this.agent,
      consentRequired: !this.context.globalState.get('ava.consentAccepted'),
      locale: this.currentLocale,
      providerSource: this.providerSource,
      platformStatus,
      // Onboarding/welcome now lives in the dashboard (Command Centre) — the
      // chat webview no longer hosts it. See dashboard-ui WelcomeOnboarding.
    });

    // Auto-fire history list on init so the chat panel can drop its
    // historyLoading gate as soon as the data arrives. Previously this only
    // fired when the user explicitly requested the history sidebar, which
    // meant the panel showed an empty conversations list at startup before
    // any data was actually fetched. Fire-and-forget — the webview gates
    // its render on receipt of the history_list event.
    this.sendHistoryList().catch(() => {});

    // Daily briefing — proactive greeting (fire-and-forget)
    this.checkAndSendBriefing().catch(() => {});

    // Start tick engine — continuous background awareness
    this.startTickEngine();
  }

  /** Check if a daily briefing should be shown and send it to the webview. */
  private async checkAndSendBriefing(): Promise<void> {
    if (!this.taskManager || !this.journalManager || !this.memoryManager) return;

    const globalDir = AVA_HOME ?? require('node:path').join(require('node:os').homedir(), '.ava');
    if (!this.briefingEngine) {
      this.briefingEngine = new BriefingEngine({ globalDir });
    }

    const shouldShow = await this.briefingEngine.shouldShowBriefing();
    if (!shouldShow) return;

    try {
      const briefing = await this.briefingEngine.generateBriefing(
        this.taskManager,
        this.journalManager,
        this.memoryManager,
      );

      this.postMessage({
        type: 'briefing',
        text: briefing.text,
        todayTasks: briefing.data.todayTasks.length,
        overdueTasks: briefing.data.overdueTasks.length,
        totalActive: briefing.data.totalActiveTasks,
      } as ExtToWebviewMessage);

      this.log(`Daily briefing sent (${briefing.data.todayTasks.length} today, ${briefing.data.overdueTasks.length} overdue)`);
    } catch (err) {
      this.log(`Briefing generation failed: ${err}`);
    }

    // Event detection — check for overdue tasks, streaks, stale memory
    await this.runEventDetection();
  }

  /** Run event detectors and show VS Code notifications for important events. */
  private async runEventDetection(): Promise<void> {
    if (!this.taskManager || !this.journalManager || !this.memoryManager) return;

    if (!this.eventDetector) {
      this.eventDetector = new EventDetector();
    }

    try {
      const events = await this.eventDetector.detect({
        taskManager: this.taskManager,
        journalManager: this.journalManager,
        memoryManager: this.memoryManager,
      });

      for (const event of events) {
        if (event.severity === 'urgent') {
          vscode.window.showWarningMessage(`Ava: ${event.message}`);
        } else if (event.severity === 'warning') {
          vscode.window.showInformationMessage(`Ava: ${event.message}`);
        }
        // 'info' events go to output channel only
        this.log(`[event] ${event.type}: ${event.message}`);
      }
    } catch (err) {
      this.log(`Event detection failed: ${err}`);
    }
  }

  private startTickEngine(): void {
    // Clear any existing tick interval
    if (this.tickInterval) clearInterval(this.tickInterval);

    // Lazy-load TickEngine from core
    import('@ava/core').then(({ TickEngine }) => {
      if (!this.tickEngine) this.tickEngine = new TickEngine();

      // Tick every 2 minutes
      this.tickInterval = setInterval(async () => {
        if (!this.tickEngine || this.isRunning) return; // Don't tick while agent is working

        const result = await this.tickEngine.tick({
          getOverdueTasks: this.taskManager ? async () => {
            const tasks = await this.taskManager!.listTasks({ status: ['todo', 'in-progress'] });
            const now = new Date().toISOString().slice(0, 10);
            return tasks.filter(t => t.dueDate && t.dueDate < now).map(t => ({ title: t.title, dueDate: t.dueDate, priority: t.priority }));
          } : undefined,
          getJournalStreak: this.journalManager ? async () => {
            const today = new Date().toISOString().slice(0, 10);
            const day = await this.journalManager!.getDay(today);
            const writtenToday = (day?.entries.length ?? 0) > 0;
            // Simple streak check — count consecutive days backwards
            let streak = writtenToday ? 1 : 0;
            const d = new Date();
            for (let i = 1; i <= 30; i++) {
              d.setDate(d.getDate() - 1);
              const prev = await this.journalManager!.getDay(d.toISOString().slice(0, 10));
              if ((prev?.entries.length ?? 0) > 0) streak++;
              else break;
            }
            return { days: streak, writtenToday };
          } : undefined,
          getTokenBalance: () => {
            if (this.cachedAccount?.usage) {
              return { used: this.cachedAccount.usage.free_credits_used, limit: this.cachedAccount.usage.free_credits_limit };
            }
            return null;
          },
          getSupportUnread: () => 0, // TODO: track from support polling
        });

        for (const event of result.events) {
          this.log(`[tick] ${event.type}: ${event.message}`);
          if (event.severity === 'urgent') {
            vscode.window.showWarningMessage(`Ava: ${event.message}`);
          } else if (event.severity === 'nudge') {
            vscode.window.showInformationMessage(`Ava: ${event.message}`);
          }
          // Also send to webview for inline display
          this.postMessage({ type: 'system_message', content: event.message } as ExtToWebviewMessage);
        }
      }, 120_000); // Every 2 minutes
    }).catch(err => {
      this.log(`Tick engine init failed: ${err}`);
    });
  }

  private async setupAgent(provider: Provider, model: ModelDefinition, routingModeOverride?: 'auto' | 'supernova' | 'aurora'): Promise<void> {
    this.toolRegistry = new ToolRegistry();
    this.toolRegistry.registerBuiltins();

    // Apply permission mode from settings
    const config = vscode.workspace.getConfiguration('ava-supernova');
    const permissionMode = (config.get<string>('preferences.permissionMode') || 'strict') as PermissionMode;
    this.toolRegistry.setPermissionMode(permissionMode);

    this.toolRegistry.setConfirmationHandler(
      (toolName, args, toolCallId) => this.requestConfirmation(toolName, args, toolCallId),
    );

    // Substitute {{secret:id}} handles with values from the working set just
    // before each tool runs. Confirmation prompts still see the handle.
    this.toolRegistry.setArgsPreprocessor(async (_toolName, args) => {
      return this.substituteSecretHandles(args) as Record<string, unknown>;
    });

    // Wire audit callback — log every tool execution to BOTH the
    // in-memory recent buffer (for fast in-session display) AND the
    // persistent JSONL log at ~/.ava/audit-log.jsonl. The persistent
    // log is the source of truth for the Audit tab; the in-memory
    // buffer just accelerates first paint before the disk read lands.
    this.toolRegistry.setAuditCallback((entry) => {
      this.auditLog.push(entry);
      if (this.auditLog.length > 500) this.auditLog.shift();
      // Fire-and-forget — appendEntry swallows I/O errors internally so
      // an audit-write failure can never break a tool call.
      try {
        // Lazy-require keeps the tool-call hot path off the import graph
        // when audit isn't being used at all.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { appendEntry } = require('@ava/core/audit') as typeof import('@ava/core/audit');
        appendEntry(entry as Parameters<typeof appendEntry>[0]);
      } catch { /* audit failures must not surface */ }
    });

    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

    this.activeModelDef = model;

    // Ensure memoryManager is ready (constructor fires refreshProjectContext without await)
    if (!this.memoryManager) {
      await this.refreshProjectContext();
    }

    if (!this.conversation) {
      this.conversation = new Conversation();
    }
    this.conversation.setSystemPrompt(await this.buildCurrentSystemPrompt());

    // Build resilient provider with automatic failover
    const activeModelId = `${provider.name}:${model.id}`;
    const fallbackChain = this.providerRegistry.buildFallbackChain(activeModelId);
    const resilientProvider = fallbackChain && fallbackChain.length > 1
      ? new ResilientProvider({
          primary: fallbackChain[0],
          fallbacks: fallbackChain.slice(1),
          healthTracker: this.healthTracker,
          onFallback: (from, to, err) => {
            this.outputChannel.appendLine(
              `[failover] ${from.provider.displayName} → ${to.provider.displayName}: ${err.message}`,
            );
          },
        })
      : provider;

    const qwenApiKey = await this.context.secrets.get('ava-supernova.provider.qwen.apiKey') || undefined;

    const minimaxApiKey = await this.context.secrets.get('ava-supernova.provider.minimax.apiKey') || undefined;

    const platformKey = await this.context.secrets.get('ava-supernova.platformKey');

    // Sealed key getter — API keys are accessed via function, not stored as plain strings
    // in sharedState. This prevents accidental exposure through logging or serialisation.
    const getProviderKey = (provider: string): string | undefined => {
      switch (provider) {
        case 'qwen': return qwenApiKey;
        case 'minimax': return minimaxApiKey;
        case 'platform': return platformKey || undefined;
        default: return undefined;
      }
    };

    // Learning tool writes to ~/.ava/learning.json on every call and (when
    // this flag is false) also pushes the full store to the platform's
    // /api/learning/sync endpoint. Same formula as memory / tasks / journal
    // — per-category user pref OR the global Data Mode toggle resolved to
    // local. Picks up syncPrefs.learning too, so users can keep a cloud
    // account but decide curriculums stay on-device.
    //
    // syncPrefs + cloudAllowed are scoped to this function; the
    // matching names in refreshProjectContext() are separate scopes. A
    // prior refactor dropped these declarations here and caused every
    // setupAgent() call to throw ReferenceError, which stranded users
    // with a disabled chat input and zero token display in v0.48.x.
    const syncPrefs = this.context.globalState.get<Record<string, boolean>>('ava.syncPrefs') ?? {};
    const cloudAllowed = cloudSyncEnabled(this.context);
    // Learning is LOCAL-FIRST by default (cloud is sunsetting). Curriculums +
    // progress live on-device; cloud sync only if explicitly opted in.
    const learningLocalOnly = (vscode.workspace.getConfiguration('ava-supernova').get<boolean>('preferences.learningLocalOnly') ?? true)
      || syncPrefs.learning === false
      || !cloudAllowed;

    // generationLocalOnly gates the creative-asset-sync helper inside the
    // generator tools (generate_image / _music / _video / _voice). Same
    // formula as learning / memory / tasks / journal: the config-level
    // pref OR the per-category sync pref OR the global Data Mode toggle
    // resolving to local. Any one tips the scale to localOnly.
    //
    // This declaration is load-bearing — the cloud-sync commit that added
    // it referenced the variable in sharedState below but the
    // declaration went missing somewhere between commits, and since
    // esbuild doesn't type-check, every setupAgent() call threw
    // ReferenceError at runtime with the same "chat is dead" symptom
    // as the earlier syncPrefs scope bug. Do not remove without
    // removing the reference too.
    const generationLocalOnly = (vscode.workspace.getConfiguration('ava-supernova').get<boolean>('preferences.generationLocalOnly') ?? false)
      || syncPrefs.generations === false
      || !cloudAllowed;

    // One-time: move any health data still in VS Code globalState into the
    // scoped health/ files where the store + export now read it. Idempotent —
    // a no-op once globalState holds no health keys.
    await migrateHealthFromGlobalState(this.context, join(this.accountScopedDir, 'health')).catch(() => {});

    const sharedState: Record<string, unknown> = {
      memoryManager: this.memoryManager,
      taskManager: this.taskManager,
      journalManager: this.journalManager,
      // Scoped HistoryManager so the recall tool reads the right (account-
      // scoped) transcripts, not the default ~/.ava/history. Same instance is
      // re-pointed via setBaseDir on sign-in, so this reference stays valid.
      historyManager: this.historyManager,
      generationManager: this.generationManager,
      // Surface-injected health plan store — reads/writes the same
      // <scopedDir>/health/plans/*.json files DashboardPanel uses, so Ava-driven
      // and UI-driven plan saves share one source of truth (and land where the
      // export reads). See COMMAND_PALETTE_PLAN.md §10.
      // onPlansChanged fires after every Ava-driven create/update so the
      // dashboard's Plans-tab calendar refreshes live.
      healthPlanStore: new ExtensionHealthPlanStore(
        () => join(this.accountScopedDir, 'health'),
        () => { DashboardPanel.currentPanel?.notifyHealthPlansUpdated(); },
      ),
      // Server-side plan generation. health_plan_create calls this when the
      // agent doesn't pass inline days — it hits /api/health/generate/plan,
      // which charges the flat per-plan fee (single 5 credits/week, combined
      // 10/week), builds the whole plan from the exercise/recipe library, and
      // returns the days. Replaces the old turn-by-turn fill.
      generateHealthPlanDays: async (i: { type: string; duration_days: number; goal: string | null; title: string }) => {
        if (!platformKey) throw new Error('Sign in to your Ava account to generate a plan.');
        let profile = '';
        try {
          const raw = await readFile(join(this.accountScopedDir, 'health', 'profile.json'), 'utf-8');
          profile = JSON.stringify(JSON.parse(raw)).slice(0, 1500);
        } catch { /* no local profile — the server handles its absence */ }
        const res = await fetch('https://ava-supernova.com/api/health/generate/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${platformKey}` },
          body: JSON.stringify({ type: i.type, duration_days: i.duration_days, goal: i.goal, title: i.title, profile }),
        });
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        if (!res.ok) throw new Error((data as { error?: string })?.error || `Plan generation failed (${res.status})`);
        return { days: (data as { days?: unknown[] }).days ?? [], credits_charged: (data as { credits_charged?: number }).credits_charged ?? 0 };
      },
      platformKey,
      learningLocalOnly,
      generationLocalOnly,
      clientSurface: 'extension',
      getProviderKey,
      activeModelId: model.id,
      // Active provider + model + tool registry — needed by specialist tools
      // (e.g. curator) that spawn fresh-context agents. Without these, any
      // tool that needs to run an agent internally has no way to resolve
      // the caller's provider and falls back to its own hardcoded guesses.
      activeProvider: resilientProvider,
      activeModel: model,
      toolRegistry: this.toolRegistry,
    };

    // Qwen Flash — lightweight auxiliary model for classification and
    // curation. Shared by the Memory Agent (brief curation) and the
    // Intent Classifier (tool-use gate). Using one resolution keeps the
    // two wiring sites in lockstep.
    const qwenFlash = this.providerRegistry.resolveModel('platform:qwen3.5-flash')
      || this.providerRegistry.resolveModel('platform:qwen3.5-omni-flash')
      || this.providerRegistry.resolveModel('qwen:qwen3.5-flash');

    // Memory Agent — curates memory briefs instead of raw dumps
    if (qwenFlash && this.memoryManager) {
      this.memoryAgent = new MemoryAgent({
        memoryManager: this.memoryManager,
        provider: qwenFlash.provider,
        model: qwenFlash.model,
      });
      sharedState.memoryAgent = this.memoryAgent;
    }

    // Intent Classifier — tool-use gate. Classifies each user message
    // as task/conversational/ambiguous before the coordinator sees it.
    // Conversational and ambiguous messages get no tool schemas, so
    // the model must respond in words — preventing short messages
    // like "whats the issue" from triggering grep/bash/file_read.
    if (qwenFlash) {
      this.intentClassifier = new IntentClassifier({
        provider: qwenFlash.provider,
        model: qwenFlash.model,
      });
      sharedState.intentClassifier = this.intentClassifier;
    }

    // Loop-prevention master switch — read from settings, default true.
    // When disabled, the pre-closure verify guard is skipped and the
    // agent runs the same way it did before post-edit-verify shipped.
    // Surfaces as a deliberate opt-out for users who prefer faster
    // turn-end at the cost of build-broken closures slipping through.
    const loopPreventionEnabled = vscode.workspace
      .getConfiguration('ava-supernova')
      .get<boolean>('loopPrevention.enabled', true);

    // Vision bridge — a vision-capable model (Qwen Omni) used to describe images
    // when the coordinator is text-only (Supernova/DeepSeek, Aurora/Mistral
    // Codestral). Resolves to the platform provider for managed users, or the
    // user's Qwen BYOK provider (Supernova BYOK already requires a Qwen key).
    // The agent only uses it when its own model can't see images.
    const visionResolved = this.providerRegistry.resolveModel('platform:qwen3.5-omni-plus')
      || this.providerRegistry.resolveModel('qwen:qwen3.5-omni-plus')
      || this.providerRegistry.resolveModel('platform:qwen3.5-omni-flash')
      || this.providerRegistry.resolveModel('qwen:qwen3.5-omni-flash');

    this.agent = new Agent({
      provider: resilientProvider,
      model,
      visionProvider: visionResolved?.provider,
      visionModel: visionResolved?.model,
      toolRegistry: this.toolRegistry,
      cwd,
      sharedState,
      secretGranter: (label, reason) => this.requestSecretGrant(label, reason),
      loopPreventionEnabled,
      surface: 'extension',
    });

    this.conductor = new Conductor({
      provider: resilientProvider,
      model,
      visionProvider: visionResolved?.provider,
      visionModel: visionResolved?.model,
      toolRegistry: this.toolRegistry,
      cwd,
      sharedState,
    });

    // Stash the shared reference so per-turn handlers can flip flags
    // (see orchestration-gate dedupe below) without re-threading.
    this.sharedState = sharedState;

    // Auto Mode — detect available providers and create coordinator.
    // The provider-source toggle is authoritative: 'byok' means the user is
    // running their own keys this turn, so platform is withheld entirely.
    // Routing + the persona team then run on their chosen model, never a
    // managed one — and `hasPlatform` goes false so the BYOK persona pin fires.
    const usePlatform = this.providerSource === 'platform' && !!platformKey;
    const availableProviders = new Set<string>();
    if (usePlatform) availableProviders.add('platform');
    if (qwenApiKey) availableProviders.add('qwen');
    if (minimaxApiKey) availableProviders.add('minimax');
    const kimiKey = await this.context.secrets.get('ava-supernova.provider.kimi.apiKey') || undefined;
    if (kimiKey) availableProviders.add('kimi');
    const deepseekKey = await this.context.secrets.get('ava-supernova.provider.deepseek.apiKey') || undefined;
    if (deepseekKey) availableProviders.add('deepseek');

    // Routing mode — 'supernova' when the operator picks Supernova,
    // 'aurora' when they pick the EU-stack Mistral-only routing,
    // otherwise 'auto'. AutoCoordinator honours this for coordinator
    // selection (V4 Pro on Supernova, Mistral Large 3 on Aurora) and
    // for the Builder spawn model (Qwen 3.7 Plus on Supernova,
    // Mistral Small 4 on Aurora).
    // Prefer the fleet passed in by setActiveModel — it is known synchronously
    // at switch time, BEFORE the activeModel config write lands. Re-reading the
    // config here would lag a fleet switch by one selection (the classic cause
    // of "switched to Aurora but it still ran Supernova's DeepSeek coordinator").
    const activeModel = vscode.workspace.getConfiguration('ava-supernova').get<string>('activeModel');
    const routingMode: 'auto' | 'supernova' | 'aurora' =
      routingModeOverride
      ?? (activeModel === 'supernova' ? 'supernova'
        : activeModel === 'aurora' ? 'aurora'
        : 'auto');

    // Use static create() — picks Kimi K2.5 for platform, best available for BYOK
    if (availableProviders.size > 1 || availableProviders.has('platform')) {
      this.autoCoordinator = AutoCoordinator.create({
        providerRegistry: this.providerRegistry,
        toolRegistry: this.toolRegistry,
        cwd,
        sharedState,
        availableProviders,
        platformKey: usePlatform ? platformKey : undefined,
        mode: routingMode,
        // Thread Decisions folder state through to spawned task agents so
        // Builder agents share the same project context as the conductor.
        systemPromptOpts: {
          decisionsContext: this.decisionsState?.context ?? undefined,
          decisionsFolderExists: this.decisionsState?.hasFolder ?? false,
          decisionsOptInStatus: this.decisionsState?.optInStatus ?? 'not-asked',
        },
      });
    } else {
      this.autoCoordinator = undefined;
    }
  }

  private getPermissionMode(): PermissionMode {
    return readPermissionMode();
  }

  private async setActiveModel(modelId: string): Promise<void> {
    if (this.isRunning) {
      this.postMessage({ type: 'error', message: 'Cannot switch model while Ava is working. Wait for the current task to finish.' });
      return;
    }

    // Auto Mode + Supernova Mode + Aurora Mode — resolve the correct
    // coordinator via the core helper. Auto picks the platform default
    // ladder (Qwen 3.7 Plus on platform). Supernova pins to DeepSeek V4
    // Pro and runs Builder spawns on Qwen 3.7 Plus. Aurora pins to
    // Mistral Large 3 with Builder on Mistral Small 4 — Mistral-only
    // routing for the EU-stack guarantee.
    if (modelId === 'auto' || modelId === 'supernova' || modelId === 'aurora') {
      const platformKey = await this.context.secrets.get('ava-supernova.platformKey');
      const hasPlatform = !!platformKey;
      const availableProviders = new Set<string>();
      if (hasPlatform) availableProviders.add('platform');
      const qwenKey = await this.context.secrets.get('ava-supernova.provider.qwen.apiKey');
      if (qwenKey) availableProviders.add('qwen');
      const minimaxKey = await this.context.secrets.get('ava-supernova.provider.minimax.apiKey');
      if (minimaxKey) availableProviders.add('minimax');
      const kimiKey = await this.context.secrets.get('ava-supernova.provider.kimi.apiKey');
      if (kimiKey) availableProviders.add('kimi');
      const deepseekKey = await this.context.secrets.get('ava-supernova.provider.deepseek.apiKey');
      if (deepseekKey) availableProviders.add('deepseek');
      const anthropicKey = await this.context.secrets.get('ava-supernova.provider.anthropic.apiKey');
      if (anthropicKey) availableProviders.add('anthropic');
      const mistralKey = await this.context.secrets.get('ava-supernova.provider.mistral.apiKey');
      if (mistralKey) availableProviders.add('mistral');

      // Supernova pins coordinator to V4 Pro. Aurora pins coordinator to
      // Mistral Large 3 (with Small 4 fallback if Large 3 not reachable).
      // Auto follows the default priority ladder. Aurora uses a strict
      // Mistral-only resolution chain so it never silently routes to a
      // non-Mistral coordinator — the EU-stack guarantee.
      let preferredCoordinatorId: string | undefined;
      if (modelId === 'supernova') {
        preferredCoordinatorId = 'platform:deepseek-v4-pro-platform';
      } else if (modelId === 'aurora') {
        // Try platform-managed first, then BYOK Mistral, then Small 4
        // fallback. The first resolvable wins.
        const tries = [
          'platform:mistral-large-3-platform',
          'mistral:mistral-large-3',
          'mistral-large-3',
          'platform:mistral-small-4-platform',
          'mistral:mistral-small-4',
          'mistral-small-4',
        ];
        for (const id of tries) {
          if (this.providerRegistry.resolveModel(id)) {
            preferredCoordinatorId = id;
            break;
          }
        }
      }
      const coordinator = resolveCoordinatorModel(this.providerRegistry, availableProviders, hasPlatform, preferredCoordinatorId);
      const modeLabel = modelId === 'supernova'
        ? 'Supernova'
        : modelId === 'aurora'
          ? 'Aurora'
          : 'Maestro';
      if (!coordinator) {
        this.log(`${modeLabel}: no coordinator model available`);
        this.postMessage({ type: 'error', message: `${modeLabel} needs at least one configured provider. Add an API key or sign in.` });
        return;
      }

      this.log(`${modeLabel} coordinator: ${coordinator.model.name} (${coordinator.reason})`);
      // Pass the fleet explicitly so the coordinator is built for the mode the
      // user just picked — not the one still persisted in config (written below).
      await this.setupAgent(coordinator.provider, coordinator.model, modelId);

      const config = vscode.workspace.getConfiguration('ava-supernova');
      config.update('activeModel', modelId, vscode.ConfigurationTarget.Global);

      this.updateStatusBar('ready');
      this.postMessage({ type: 'model_switched', modelId, modelName: modeLabel });
      return;
    }

    const resolved = this.providerRegistry.resolveModel(modelId);
    if (!resolved) return;

    await this.setupAgent(resolved.provider, resolved.model);
    // Specific model selected — disable Auto Mode
    this.autoCoordinator = undefined;

    const config = vscode.workspace.getConfiguration('ava-supernova');
    config.update('activeModel', modelId, vscode.ConfigurationTarget.Global);

    this.updateStatusBar('ready');
    this.postMessage({
      type: 'model_switched',
      modelId,
      modelName: resolved.model.name,
    });

    // Recalculate context bar with new model's context window
    this.emitContextUsageFromCurrent();
  }

  /** Compute used/limit/percent from the live conversation + active model
   *  and post a context_usage event. Shared by the model-switch, history-
   *  load, and restore-last code paths so the context bar always matches
   *  what the user sees on screen. */
  private emitContextUsageFromCurrent(): void {
    if (!this.agent || !this.conversation) return;
    const messages = this.conversation.getMessages();
    const used = this.agent.estimateTokenCount(messages);
    const limit = this.activeModelDef?.contextWindow ?? 128000;
    const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;
    this.postMessage({
      type: 'context_usage',
      used,
      limit,
      percent: Math.min(percent, 100),
    });
  }

  private getModelList(): Array<{ id: string; name: string; provider: string; supportsVision?: boolean; available: boolean }> {
    const isAdmin = this.cachedAccount?.tier === 'admin';

    const allModels = this.providerRegistry.listAllPossibleModels()
      .filter((m) => {
        // Promote the FULL catalogue: every BYOK model is always listed — it
        // renders locked ("Add key", non-selectable) when its provider key
        // isn't set (available:false). Platform entries only apply when
        // signed into the platform. (Was: keyless BYOK hidden in platform
        // mode — which buried the catalogue. Operator decision 2026-06-21.)
        if (m.provider === 'platform') return this.providerSource === 'platform';
        return true;
      })
      // MiniMax is reserved for Creative Studio on platform (no chat use).
      // BYOK MiniMax — where the user has supplied their own key — stays
      // visible because their key, their call. The hide-from-chat rule
      // only applies to managed MiniMax entries (provider='platform',
      // id prefixed `MiniMax-`).
      .filter((m) => !(m.provider === 'platform' && m.id.startsWith('MiniMax-')))
      // Defensive admin-gate on platform-side V4 entries. The /api/models
      // endpoint already filters them server-side, but we filter here too
      // so a stale enabledIds cache or a non-admin user with the
      // PLATFORM_MODELS code-side definition can't leak the entries into
      // the dropdown. Suffix `-platform` is the convention used in
      // migration 218 to disambiguate from the BYOK ids.
      .filter((m) => {
        const isAdminGatedPlatformModel =
          m.provider === 'platform' &&
          (m.id === 'deepseek-v4-pro-platform' || m.id === 'deepseek-v4-flash-platform');
        return !isAdminGatedPlatformModel || isAdmin;
      });

    // Gate platform entries by the platform-enabled cache; every BYOK model
    // stays (we want the whole catalogue), key or not.
    const enabledIds = this.enabledModelIds;
    const filtered = enabledIds
      ? allModels.filter((m) => m.provider !== 'platform' || enabledIds.has(m.id))
      : allModels;

    // Detect mode prerequisites from the whole pool (incl. platform) BEFORE
    // stripping platform-section. The 3 orchestrated modes need to know if a
    // platform/BYOK fleet path exists to show their own gating.
    const hasPlatform = filtered.some(m => m.provider === 'platform' && m.available);
    const hasQwen = filtered.some(m => m.provider === 'qwen' && m.available);
    const hasDeepSeek = filtered.some(m => m.provider === 'deepseek' && m.available);
    const hasMistral = filtered.some(m => m.provider === 'mistral' && m.available);

    // Individual models = the BYOK catalogue, ALWAYS shown (available reflects
    // whether the key is set). Platform-section raw models stay collapsed into
    // the 3 orchestrated modes below (project_byok_mode_gating). Dedup by id so
    // a model defined for two BYOK providers isn't listed twice.
    const seen = new Set<string>();
    const byokOnly = filtered.filter((m) => {
      if (m.provider === 'platform') return false;
      if (m.hiddenFromPicker) return false; // superseded (newer version exists) — still routable, just not shown
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    const modelList = byokOnly.map((m) => ({
      id: `${m.provider}:${m.id}`,
      name: m.name,
      provider: m.provider,
      available: m.available,
      ...(m.supportsVision ? { supportsVision: true } : {}),
    }));

    // Three orchestrated modes. Admin gate retired 2026-04-30 — public
    // launch of Aurora + Supernova alongside Maestro. Any signed-in
    // platform user gets all three; BYOK users get a mode the moment
    // they have the keys for its fleet (Maestro=Qwen, Supernova=
    // DeepSeek+Qwen, Aurora=Mistral).
    // Dropdown order: Aurora → Supernova → Maestro (most strategic first).
    // The id stays 'auto' for Maestro for backward compat with saved
    // settings; the display label is "Maestro".
    void isAdmin;
    const maestroAvailable   = hasPlatform || hasQwen;
    const supernovaAvailable = hasPlatform || (hasDeepSeek && hasQwen);
    const auroraAvailable    = hasPlatform || hasMistral;
    modelList.unshift({ id: 'auto', name: 'Maestro', provider: 'Ava', available: maestroAvailable });
    modelList.unshift({ id: 'supernova', name: 'Supernova', provider: 'Ava', available: supernovaAvailable });
    modelList.unshift({ id: 'aurora', name: 'Aurora', provider: 'Ava', available: auroraAvailable });

    return modelList;
  }

  private getActiveModelId(): string | null {
    const config = vscode.workspace.getConfiguration('ava-supernova');
    return config.get<string>('activeModel') || null;
  }

  /** Build the optional local-embedding service from VS Code settings (opt-in;
   *  off by default → recall stays on TF-IDF). Shared by every MemoryManager
   *  construction so semantic recall is consistent across re-inits. */
  private resolveEmbeddingService() {
    const cfg = vscode.workspace.getConfiguration('ava-supernova');
    return createEmbeddingServiceFromConfig({
      useLocalEmbeddings: cfg.get<boolean>('preferences.useLocalEmbeddings'),
      embeddingModel: cfg.get<string>('preferences.embeddingModel'),
      embeddingBaseUrl: cfg.get<string>('preferences.embeddingBaseUrl'),
    });
  }

  private async buildCurrentSystemPrompt(): Promise<string> {
    return buildCurrentSystemPromptFn({
      cachedAccount: this.cachedAccount,
      taskManager: this.taskManager,
      journalManager: this.journalManager,
      projectInstructions: this.projectInstructions,
      projectRoot: this.projectRoot,
      decisionsState: this.decisionsState,
      projectBrainBrief: this.memoryManager?.getProjectBrain?.()?.brief,
      activeModelDef: this.activeModelDef,
      currentLocale: this.currentLocale,
      permissionMode: this.getPermissionMode(),
      globalDir: this.accountScopedDir,
      log: (msg) => this.log(msg),
    });
  }

  // ── Session Persistence ───────────────────────────────────────────────────

  private setLastConversationId(id: string | undefined): void {
    this.history.setLastConversationId(id);
  }

  private async restoreLastConversation(): Promise<void> {
    return this.history.restoreLast();
  }

  // ── History ──────────────────────────────────────────────────────────────────

  private async sendHistoryList(): Promise<void> {
    return this.history.sendList();
  }

  private async loadConversation(conversationId: string): Promise<void> {
    return this.history.load(conversationId);
  }

  private async deleteConversation(conversationId: string): Promise<void> {
    return this.history.delete(conversationId);
  }

  private async searchHistory(query: string): Promise<void> {
    return this.history.search(query);
  }

  private async renameConversation(conversationId: string, newTitle: string): Promise<void> {
    return this.history.rename(conversationId, newTitle);
  }

  private async pinConversation(conversationId: string, pinned: boolean): Promise<void> {
    return this.history.pin(conversationId, pinned);
  }

  private async exportConversation(conversationId: string, format: 'markdown' | 'json'): Promise<void> {
    return this.history.export(conversationId, format);
  }

  // ── Memory Management ────────────────────────────────────────────────────────

  private async sendMemoryContent(): Promise<void> {
    if (!this.memoryManager) return;
    const [globalEntries, projectEntries] = await Promise.all([
      this.memoryManager.getEntries('global'),
      this.memoryManager.getEntries('project'),
    ]);
    const toUI = (e: { id: string; category: string; content: string; createdAt: string; updatedAt: string; lastRecalledAt?: string | null; recallCount?: number; tags?: string[]; archived?: boolean; archivedAt?: string | null; branch?: string | null }) => ({
      id: e.id, category: e.category, content: e.content,
      createdAt: e.createdAt, updatedAt: e.updatedAt,
      lastRecalledAt: e.lastRecalledAt ?? null, recallCount: e.recallCount ?? 0,
      tags: e.tags, archived: e.archived, archivedAt: e.archivedAt ?? null, branch: e.branch ?? null,
    });
    this.postMessage({
      type: 'memory_content',
      global: globalEntries.map(toUI),
      project: projectEntries.map(toUI),
    });
  }

  private async sendTodayTasks(): Promise<void> {
    if (!this.taskManager) return;
    try {
      const todayTasks = await this.taskManager.getTodayTasks();
      this.postMessage({
        type: 'today_tasks',
        tasks: todayTasks.map(t => this.toTodayTaskUI(t)),
      });
    } catch {
      this.postMessage({ type: 'today_tasks', tasks: [] });
    }
  }

  /** Send all active tasks (todo + in-progress) for the "All" toggle. */
  private async sendAllTasks(): Promise<void> {
    if (!this.taskManager) return;
    try {
      const all = await this.taskManager.listTasks({ status: ['todo', 'in-progress'] });
      this.postMessage({
        type: 'all_tasks',
        tasks: all.map(t => this.toTodayTaskUI(t)),
      });
    } catch {
      this.postMessage({ type: 'all_tasks', tasks: [] });
    }
  }

  /** Open the account-scoped tasks folder on disk (mirror of the Library's
   *  "Open save folder"). Lands at `<scoped>/tasks`. */
  private async openTasksFolder(): Promise<void> {
    try {
      const dir = join(this.accountScopedDir, 'tasks');
      const fs = await import('node:fs/promises');
      await fs.mkdir(dir, { recursive: true }).catch(() => {});
      await vscode.env.openExternal(vscode.Uri.file(dir));
    } catch { /* best-effort */ }
  }

  /** Create a task the user accepted from a task_suggest card. Global scope,
   *  source 'ava' (she proposed it, they accepted). Refreshes the panel. */
  private async createSuggestedTask(p: Record<string, unknown>): Promise<string> {
    if (!this.taskManager) return 'Task manager unavailable.';
    const title = String(p.title ?? '').trim();
    if (!title) return 'No task title.';
    type AddOpts = Parameters<TaskManager['addTask']>[0];
    await this.taskManager.addTask({
      title,
      description: p.description as string | undefined,
      priority: (p.priority as AddOpts['priority']) ?? 'medium',
      category: (p.category as AddOpts['category']) ?? 'personal',
      dueDate: p.due_date as string | undefined,
      dueTime: p.due_time as string | undefined,
      reminderLead: p.reminder_lead as AddOpts['reminderLead'],
      recurrence: (p.recurrence as AddOpts['recurrence']) ?? 'none',
      subtasks: Array.isArray(p.subtasks)
        ? (p.subtasks as string[]).map((t) => ({ id: crypto.randomUUID(), title: t, done: false }))
        : undefined,
      scope: 'global',
      source: 'ava',
    });
    await this.sendTodayTasks();
    await this.sendAllTasks();
    return `Added "${title}" to their tasks.`;
  }

  /** Map a core TaskEntry to the panel's TodayTaskUI (carries the rich fields). */
  private toTodayTaskUI(t: import('@ava/core').TaskEntry): import('./dashboard-message-types').TodayTaskUI {
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status === 'archived' ? 'done' as const : (t.status as 'todo' | 'in-progress' | 'done'),
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      category: t.category,
      recurrence: t.recurrence,
      reminderLead: t.reminderLead,
      subtasks: t.subtasks?.map(s => ({ id: s.id, title: s.title, done: s.done })),
      context: t.context,
    };
  }

  /** Send completed Ava tasks from this project's store. */
  private async sendAvaCompletedTasks(): Promise<void> {
    if (!this.taskManager) return;
    try {
      const all = await this.taskManager.listTasks({ status: ['done'], source: 'ava', includeArchived: false });
      // Sort newest first, cap at 50
      const sorted = all
        .filter(t => t.completedAt)
        .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
        .slice(0, 50);
      this.postMessage({
        type: 'ava_completed_tasks',
        tasks: sorted.map(t => ({
          id: t.id,
          title: t.title,
          completedAt: t.completedAt!,
        })),
      });
    } catch {
      this.postMessage({ type: 'ava_completed_tasks', tasks: [] });
    }
  }

  /** Reset the memory manager — called after Delete All to prevent re-sync of cached entries. */
  /**
   * Apply a sync preference change live to the relevant manager so the user
   * doesn't have to reload the window. Only memory/tasks/journal/history have
   * background push paths driven by manager state — the rest are gated at the
   * DashboardPanel push site.
   */
  public applySyncPref(
    dataType: 'memory' | 'tasks' | 'journal' | 'learning' | 'history' | 'settings' | 'personality' | 'learnings' | 'generations' | 'health_profile',
    enabled: boolean,
  ): void {
    // Combine with Data Mode — pref can only narrow, not broaden. If Data
    // Mode is Local the manager stays localOnly regardless of the pref.
    const cloudAllowed = cloudSyncEnabled(this.context);
    const localOnly = !(enabled && cloudAllowed);
    switch (dataType) {
      case 'memory': this.memoryManager?.setLocalOnly(localOnly); break;
      case 'tasks':  this.taskManager?.setLocalOnly(localOnly); break;
      case 'journal': this.journalManager?.setLocalOnly(localOnly); break;
      case 'history':
        // History is local-only unconditionally — no toggle to flip.
        break;
      case 'generations':
        // No background manager to flip — the flag is read out of sharedState
        // at tool-call time. Persisted pref change will take effect on the
        // next setupAgent() run. Nothing to do here beyond that.
        break;
      // learning/settings/personality/learnings have no background push — the
      // DashboardPanel checks the pref directly before each push site.
    }
  }

  /** Apply a cloud-sync change to every background-sync manager so the
   *  toggle in the chat header takes effect immediately without a reload.
   *  Hard gate: when cloud sync is off every manager goes localOnly.
   *  Per-category sync prefs can narrow further but can't override. */
  public applyCloudSync(enabled: boolean): void {
    const cloudAllowed = enabled;
    const syncPrefs = this.context.globalState.get<Record<string, boolean>>('ava.syncPrefs') ?? {};
    // Default to enabled (true) when the pref hasn't been explicitly set —
    // matches the "enabled by default" shape used at init time.
    const resolve = (type: string) => !(cloudAllowed && (syncPrefs[type] !== false));
    this.memoryManager?.setLocalOnly(resolve('memory'));
    this.taskManager?.setLocalOnly(resolve('tasks'));
    this.journalManager?.setLocalOnly(resolve('journal'));
    // History is local-only unconditionally — Data Mode can't widen it.
    // Creative generations (image / music / video / voice) read
    // generationLocalOnly out of sharedState, which is rebuilt on the
    // next setupAgent() run — typically triggered by a model switch or a
    // webview reload. In-session toggling is rare enough that we don't
    // force-rebuild here; the flag flips on the next natural agent
    // refresh. The pref itself is already persisted above, so nothing
    // is lost.

    // Broadcast to every webview so the panel pill and dashboard pill
    // stay in sync — without this, flipping the panel pill leaves the
    // dashboard pill showing the stale value until it next reloads
    // (different localStorage origins). postMessage already forwards to
    // the dashboard webview when externalPostMessage is wired.
    this.postMessage({ type: 'cloud_sync_changed', enabled } as never);
  }

  public async resetMemoryManager(): Promise<void> {
    if (this.memoryManager) {
      await this.memoryManager.clearEverything();
    }
    // Recreate with sync disabled until next session
    this.memoryManager = new MemoryManager({ globalDir: this.accountScopedDir, projectRoot: this.projectRoot, localOnly: true, embeddingService: this.resolveEmbeddingService() });
  }

  private async saveMemory(scope: 'global' | 'project', content: string): Promise<void> {
    if (!this.memoryManager) return;
    if (scope === 'global') {
      await this.memoryManager.saveGlobalMemory(content);
    } else {
      await this.memoryManager.saveProjectMemory(content);
    }
    await this.memoryManager.loadAll();
    await this.sendMemoryContent();
  }

  private async clearMemory(scope: 'global' | 'project'): Promise<void> {
    if (!this.memoryManager) return;
    if (scope === 'global') {
      await this.memoryManager.saveGlobalMemory('');
    } else {
      await this.memoryManager.saveProjectMemory('');
    }
    await this.memoryManager.loadAll();
    await this.sendMemoryContent();
  }

  private async archiveMemory(scope: 'global' | 'project', id: string): Promise<void> {
    if (!this.memoryManager) return;
    await this.memoryManager.archiveEntry(scope, id);
    await this.memoryManager.loadAll();
    await this.sendMemoryContent();
  }

  private async restoreMemory(scope: 'global' | 'project', id: string): Promise<void> {
    if (!this.memoryManager) return;
    await this.memoryManager.restoreEntry(scope, id);
    await this.memoryManager.loadAll();
    await this.sendMemoryContent();
  }

  private async deleteMemoryEntry(scope: 'global' | 'project', id: string): Promise<void> {
    if (!this.memoryManager) return;
    await this.memoryManager.deleteEntry(scope, id);
    await this.memoryManager.loadAll();
    await this.sendMemoryContent();
  }

  // ── Feedback Rating ──────────────────────────────────────────────────────────

  private async handleRateMessage(message: {
    messageId: string;
    rating: 'up' | 'down';
    reason?: string;
    model?: string;
    mode?: string;
  }): Promise<void> {
    const entry = {
      messageId: message.messageId,
      rating: message.rating,
      reason: message.reason,
      model: this.activeModelDef?.id ?? message.model ?? 'unknown',
      mode: message.mode ?? 'code',
      timestamp: new Date().toISOString(),
      conversationId: this.conversation?.id ?? null,
    };

    // Save locally to ~/.ava/feedback.json
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      const feedbackPath = path.join(AVA_HOME, 'feedback.json');
      let existing: unknown[] = [];
      if (fs.existsSync(feedbackPath)) {
        try {
          existing = JSON.parse(fs.readFileSync(feedbackPath, 'utf-8'));
          if (!Array.isArray(existing)) existing = [];
        } catch { existing = []; }
      }
      existing.push(entry);
      fs.writeFileSync(feedbackPath, JSON.stringify(existing, null, 2), 'utf-8');
      this.log(`Feedback saved: ${message.rating}${message.reason ? ` (${message.reason})` : ''}`);
    } catch (err) {
      this.log(`Failed to save feedback locally: ${err}`);
    }

    // POST to platform only if user has opted in to shared learning
    try {
      const config = vscode.workspace.getConfiguration('ava-supernova');
      const contributeSharedLearning = config.get<boolean>('contributeSharedLearning', false);
      if (contributeSharedLearning) {
        const platformKey = await this.context.secrets.get('ava-supernova.platformKey');
        if (platformKey) {
          await apiFetch('/feedback', {
            method: 'POST',
            platformKey,
            body: entry,
          });
        }
      }
    } catch (err) {
      this.log(`Failed to POST feedback to platform: ${err}`);
    }

    // Self-improvement: learn from negative feedback
    try {
      if (message.rating === 'down') {
        const reasonMap: Record<string, string> = {
          'Wrong': 'Response was factually incorrect or gave wrong code',
          'Incomplete': 'Response was incomplete — missed parts of the task',
          'Too verbose': 'Response was too verbose — user prefers concise answers',
          "Didn't understand me": 'Misunderstood the user\'s intent',
          'Off topic': 'Response went off topic from what was asked',
        };
        const typeMap: Record<string, 'preference' | 'pattern'> = {
          'Too verbose': 'preference',
          "Didn't understand me": 'pattern',
        };
        const learned = message.reason
          ? reasonMap[message.reason] || `Negative feedback: ${message.reason}`
          : 'Response quality issue flagged by user';
        const learningType = message.reason
          ? (typeMap[message.reason] || 'pattern')
          : 'pattern';

        addLearning(AVA_HOME, {
          type: learningType,
          category: 'general',
          context: `mode:${entry.mode} model:${entry.model}`,
          learned,
          confidence: 0.4,
          source: 'feedback-negative',
        }).catch(() => { /* self-improvement is non-critical */ });
      } else if (message.rating === 'up') {
        // Reinforce existing relevant learnings
        const relevant = getRelevantLearnings(AVA_HOME, `mode:${entry.mode} model:${entry.model}`, 3);
        if (relevant.length > 0) {
          const store = loadSelfImprovementStore(AVA_HOME);
          for (const learning of relevant) {
            const found = store.local.find(l => l.id === learning.id);
            if (found) {
              found.confirmations += 1;
              found.confidence = Math.min(1, found.confidence + 0.05);
              found.updatedAt = new Date().toISOString();
            }
          }
          saveSelfImprovementStore(AVA_HOME, store);
        }
      }
    } catch {
      // Self-improvement is non-critical
    }
  }

  // ── Message Handling ─────────────────────────────────────────────────────────

  private async handleWebviewMessage(message: WebviewToExtMessage): Promise<void> {
    switch (message.type) {
      case 'webview_ready':
        await this.initializeSession();
        await this.restoreLastConversation();
        break;

      case 'pong':
        this.handlePong();
        break;

      case 'send_message':
        await this.handleUserMessage(message.text, message.mode, message.attachments, { surface: message.surface, courseId: message.courseId });
        break;

      case 'palette_intent':
        await this.handlePaletteIntent(message.tool, message.action, message.mode, message.surface, message.courseId);
        break;

      case 'retry_after_error':
        // Repair the live conversation BEFORE issuing another request.
        // A 400 typically leaves orphan tool_calls or mismatched tool
        // results in history — sending an untouched retry would just
        // hit the same 400. Agent.repairMessages runs fixToolPairing
        // on the stored messages and replaces them with the cleaned
        // set, so the next request goes out in a legal shape.
        if (this.agent && this.conversation) {
          const before = this.conversation.getMessages();
          const repaired = this.agent.repairMessages(before);
          if (repaired.length !== before.length) {
            this.log(`retry_after_error: conversation repaired — ${before.length} → ${repaired.length} messages`);
            this.conversation.setMessages(repaired);
          }
        }
        // Intentionally no user text — Retry is "try the last turn again
        // with a clean state", not "inject a new user message". Passing
        // an empty string would break handleUserMessage's validation, so
        // pass a low-signal instruction the model can ignore if the
        // prior turn already has a user message to continue from.
        await this.handleUserMessage('continue', message.mode);
        break;

      case 'tool_confirmation_response':
        this.handleConfirmationResponse(message.confirmationId, message.approved, message.alwaysAllowCategory, message.planSelection, message.userResponse);
        break;

      case 'switch_model':
        this.setActiveModel(message.modelId);
        break;

      case 'clear_chat':
        // Lane-aware: a room (Health / Learning) clears ONLY its own thread
        // (drop its conversation so the next room turn rebuilds it fresh); the
        // main chat is untouched. Default (no surface) clears the main chat.
        if (message.surface === 'health') {
          this.healthConversation = undefined;
        } else if (message.surface === 'learning') {
          this.learningConversations.delete(message.courseId ?? '__lobby__');
        } else {
          this.clearChat();
        }
        break;

      case 'cancel':
        this.cancelRun();
        break;

      case 'interrupt':
        this.interruptRun().catch(() => {});
        break;

      case 'open_dashboard':
        vscode.commands.executeCommand('ava-supernova.openDashboard');
        break;

      case 'mark_onboarded':
        await this.context.globalState.update('ava.onboardedV1', true);
        break;

      case 'open_dashboard_page':
        // Open the dashboard and hand off which page to jump to — the
        // welcome modal's shortcuts route through here so "Open docs" /
        // "Creative Studio" / "Settings" take the user straight there.
        await this.context.globalState.update('ava.dashboardPageAfterOpen', message.page);
        vscode.commands.executeCommand('ava-supernova.openDashboard');
        break;

      case 'open_docs':
        vscode.commands.executeCommand('ava-supernova.openDocs');
        break;

      case 'request_history':
        await this.sendHistoryList();
        break;

      case 'load_conversation':
        await this.loadConversation(message.conversationId);
        break;

      case 'delete_conversation':
        await this.deleteConversation(message.conversationId);
        break;

      case 'search_history':
        await this.searchHistory(message.query);
        break;

      case 'rename_conversation':
        await this.renameConversation(message.conversationId, message.newTitle);
        break;

      case 'pin_conversation':
        await this.pinConversation(message.conversationId, message.pinned);
        break;

      case 'export_conversation':
        await this.exportConversation(message.conversationId, message.format);
        break;

      case 'new_chat':
        await this.newChat();
        break;

      case 'compress_context':
        await this.handleCompressContext();
        break;

      case 'set_provider_source':
        this.providerSource = message.source;
        this.context.workspaceState.update('providerSource', message.source);
        this.log(`Provider source switched to: ${message.source}`);
        await this.initializeSession();
        break;

      case 'set_cloud_sync': {
        // Panel webview sent the toggle. Persist host-side and apply to
        // every manager (memory, tasks, journal, learning, history,
        // creative-assets) so the next save in the in-flight turn lands
        // on the right side. Mirrors the dashboard handler in
        // DashboardPanel.ts so both webviews drive the same path.
        await setCloudSync(this.context, message.enabled);
        this.applyCloudSync(message.enabled);
        this.log(`Cloud sync ${message.enabled ? 'enabled' : 'disabled'}`);
        break;
      }

      case 'request_memory':
        await this.sendMemoryContent();
        break;

      case 'save_memory':
        await this.saveMemory(message.scope, message.content);
        break;

      case 'refresh_memories':
        // Manual pull from cloud — user-initiated sync refresh from the
        // dashboard Sync page or a Memory panel refresh button. Runs
        // both scopes, reloads the local store, and echoes the counts
        // back so the UI can show "Pulled N new entries".
        if (this.memoryManager) {
          try {
            const [g, p] = await Promise.all([
              this.memoryManager.pullLatest('global'),
              this.memoryManager.pullLatest('project'),
            ]);
            this.postMessage({ type: 'memories_refreshed', global: g, project: p });
            // Re-emit the memory views so the UI updates without a reload
            await this.sendMemoryContent();
          } catch (err) {
            this.log(`[memory] refresh failed: ${err}`);
            this.postMessage({ type: 'memories_refreshed', global: 0, project: 0, error: String(err) });
          }
        }
        break;

      case 'refresh_tasks':
        // Manual pull for tasks. Splits remote by project field —
        // 'global' tasks into the global store, workspace-tagged tasks
        // into the project store. Returns total merged count.
        if (this.taskManager) {
          try {
            const count = await this.taskManager.pullLatest();
            this.postMessage({ type: 'tasks_refreshed', count });
            await this.sendAllTasks();
          } catch (err) {
            this.log(`[tasks] refresh failed: ${err}`);
            this.postMessage({ type: 'tasks_refreshed', count: 0, error: String(err) });
          }
        }
        break;

      case 'refresh_journal':
        // Manual pull for journal. Merges remote days into the global
        // store entry-by-entry (userEntry + avaEntry compared
        // independently against updatedAt). Returns count of changed
        // days.
        if (this.journalManager) {
          try {
            const count = await this.journalManager.pullLatest();
            this.postMessage({ type: 'journal_refreshed', count });
          } catch (err) {
            this.log(`[journal] refresh failed: ${err}`);
            this.postMessage({ type: 'journal_refreshed', count: 0, error: String(err) });
          }
        }
        break;

      case 'refresh_history':
        // History is local-only — "refresh" just re-reads from disk so
        // the UI picks up any conversations the agent saved between
        // tab opens. No cloud pull.
        try {
          await this.sendHistoryList();
          this.postMessage({ type: 'history_refreshed', count: 0 });
        } catch (err) {
          this.log(`[history] refresh failed: ${err}`);
          this.postMessage({ type: 'history_refreshed', count: 0, error: String(err) });
        }
        break;

      case 'clear_memory':
        await this.clearMemory(message.scope);
        break;

      case 'archive_memory':
        await this.archiveMemory(message.scope, message.id);
        break;

      case 'restore_memory':
        await this.restoreMemory(message.scope, message.id);
        break;

      case 'delete_memory_entry':
        await this.deleteMemoryEntry(message.scope, message.id);
        break;

      case 'request_today_tasks':
        await this.sendTodayTasks();
        await this.sendAllTasks();
        await this.sendAvaCompletedTasks();
        break;

      case 'request_all_tasks':
        await this.sendAllTasks();
        break;

      case 'toggle_task':
        if (this.taskManager && message.taskId) {
          // Real toggle — un-checking a done task restores it to todo.
          const existing = await this.taskManager.getTask(message.taskId);
          if (existing?.status === 'done') {
            await this.taskManager.updateTask(message.taskId, { status: 'todo' });
          } else {
            await this.taskManager.completeTask(message.taskId);
          }
          await this.sendTodayTasks();
          await this.sendAllTasks();
        }
        break;

      case 'panel_create_task':
        if (this.taskManager && message.title) {
          type AddOpts = Parameters<TaskManager['addTask']>[0];
          await this.taskManager.addTask({
            title: message.title,
            description: message.description,
            priority: (message.priority as AddOpts['priority']) ?? 'medium',
            category: (message.category as AddOpts['category']) ?? 'personal',
            dueDate: message.due_date,
            dueTime: message.due_time,
            reminderLead: message.reminder_lead as AddOpts['reminderLead'],
            subtasks: message.subtasks?.map((title: string) => ({ id: crypto.randomUUID(), title, done: false })),
            recurrence: (message.recurrence as AddOpts['recurrence']) ?? 'none',
            // Personal tasks from the Tasks panel go GLOBAL (~/.ava/tasks.json),
            // not per-workspace — same fix as the dashboard Planner. Project
            // scope orphans tasks when no workspace is open, causing later
            // toggle/complete/delete to fail with "Task not found".
            scope: 'global',
            source: 'user',
          });
          await this.sendTodayTasks();
          await this.sendAllTasks();
        }
        break;

      case 'panel_update_task':
        if (this.taskManager && message.taskId) {
          type UpdOpts = Parameters<TaskManager['updateTask']>[1];
          const u = (message.updates ?? {}) as Record<string, unknown>;
          const updates: UpdOpts = {};
          if (u.title !== undefined) updates.title = u.title as string;
          if (u.description !== undefined) updates.description = u.description as string;
          if (u.priority !== undefined) updates.priority = u.priority as UpdOpts['priority'];
          if (u.category !== undefined) updates.category = u.category as string;
          if (u.due_date !== undefined) updates.dueDate = u.due_date as string;
          if (u.due_time !== undefined) updates.dueTime = u.due_time as string;
          if (u.recurrence !== undefined) updates.recurrence = u.recurrence as UpdOpts['recurrence'];
          if (u.reminder_lead !== undefined) updates.reminderLead = u.reminder_lead as UpdOpts['reminderLead'];
          await this.taskManager.updateTask(message.taskId, updates);
          await this.sendTodayTasks();
          await this.sendAllTasks();
        }
        break;

      case 'toggle_subtask':
        if (this.taskManager && message.taskId && message.subtaskId) {
          await this.taskManager.toggleSubtask(message.taskId, message.subtaskId);
          await this.sendTodayTasks();
          await this.sendAllTasks();
        }
        break;

      case 'open_tasks_folder':
        await this.openTasksFolder();
        break;

      case 'rate_message':
        await this.handleRateMessage(message);
        break;

      case 'accept_consent': {
        const consentTimestamp = new Date().toISOString();
        const extensionVersion = this.context.extension.packageJSON?.version || 'unknown';
        await this.context.globalState.update('ava.consentAccepted', consentTimestamp);
        this.log('User accepted Terms of Service and Privacy Policy');

        // Record consent server-side if connected — GDPR audit trail
        const consentPlatformKey = await this.context.secrets.get('ava-supernova.platformKey');
        if (consentPlatformKey) {
          apiFetch('/consent', {
            method: 'POST',
            platformKey: consentPlatformKey,
            body: {
              platform: 'extension',
              appVersion: extensionVersion,
              acceptedAt: consentTimestamp,
              termsVersion: '1.0',
              privacyVersion: '1.0',
            },
          }).catch(() => { /* consent recording is non-critical */ });
        }
        break;
      }

      case 'start_sign_in': {
        // User clicked "Continue with GitHub" or "Sign in with email" in
        // the sign-in UI. Delegate to SignInManager, which generates state,
        // opens the browser, and tracks the pending attempt. Events flow
        // back through the onEvent subscription wired in the constructor.
        if (!this.signInManager) {
          this.postMessage({ type: 'sign_in_failed', error: 'Sign-in manager not ready yet. Please try again.' });
          break;
        }
        try {
          await this.signInManager.startSignIn(message.method);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.log(`start_sign_in failed: ${msg}`);
          // The SignInManager already emitted sign_in_failed — no need to
          // post again here.
        }
        break;
      }

      case 'cancel_sign_in': {
        // User clicked Cancel on the pending sign-in UI
        if (this.signInManager) {
          this.signInManager.cancelSignIn();
        }
        break;
      }
    }
  }

  /**
   * Command palette — the user clicked a palette button, which delivers a
   * pre-classified intent. Build the directive and run it as a turn: Ava
   * receives the confirmed intent (no intent detection needed) while the
   * chat shows the user a short clean label instead of the raw directive.
   */
  private async handlePaletteIntent(tool: PaletteTool, action: string, mode: AvaMode, surface?: 'main' | 'health' | 'learning', courseId?: string): Promise<void> {
    const built = buildPaletteDirective(tool, action);
    if (!built) {
      this.log(`handlePaletteIntent: unknown palette intent "${tool}.${action}" — ignored`);
      return;
    }
    this.log(`handlePaletteIntent: ${tool}.${action} (mode=${mode}, surface=${surface ?? 'main'})`);
    await this.handleUserMessage(built.directive, mode, undefined, { displayText: built.label, surface, courseId });
  }

  private async handleUserMessage(
    text: string,
    mode: AvaMode = 'code',
    attachments?: Array<{ type: 'image'; data: string; name: string }>,
    options?: { displayText?: string; surface?: 'main' | 'health' | 'learning'; courseId?: string },
  ): Promise<void> {
    this.log(`handleUserMessage called: text="${text.slice(0, 40)}", mode=${mode}, providerSource=${this.providerSource}`);

    // Guard against empty / whitespace-only sends.
    //
    // Multiple webview paths can post send_message events — the main input
    // area, the Continue button, suggestion buttons, the dashboard chat
    // surface, and programmatic callbacks. Only InputArea's manual path
    // explicitly blocks empty sends; every other path is a potential source
    // of an accidentally-empty text field (missing i18n key, race on state
    // loading, stale IPC payload). If any of them fire with empty text, the
    // agent gets a blank user turn and responds "did you mean to send
    // something?" — the "blonde moment" failure.
    //
    // Allow attachment-only sends through — the webview substitutes '(image)'
    // when text is empty in that case, so we check the trimmed text here.
    const hasAttachments = (attachments?.length ?? 0) > 0;
    if ((typeof text !== 'string' || text.trim().length === 0) && !hasAttachments) {
      this.log(`handleUserMessage: dropping empty send (no text, no attachments) — likely a spurious programmatic event`);
      return;
    }

    // Input validation
    if (text.length > 100_000) {
      this.postMessage({ type: 'error', message: 'Message too long (max 100K characters).' });
      return;
    }
    const totalAttachmentSize = attachments?.reduce((sum, a) => sum + a.data.length, 0) ?? 0;
    if (totalAttachmentSize > 50 * 1024 * 1024) {
      this.postMessage({ type: 'error', message: 'Attachments too large (max 50MB total).' });
      return;
    }

    if (!this.agent || !this.conversation) {
      this.log('handleUserMessage: no agent or conversation — needs setup');
      this.postMessage({
        type: 'error',
        message: 'No model configured.',
        code: 'setup',
        suggestion: 'Open Settings and add an API key for at least one provider, then select a model.',
      });
      return;
    }

    if (this.isRunning) {
      const images = attachments?.map((a) => a.data);
      const ackImages = images?.length ? { images } : {};
      // Echo the user's text so they always see what they typed land, then
      // act on it. (The dedicated interjection_ack type was never wired into
      // the webview reducer, so it silently disappeared — user_message_ack is.)
      const echo = () => this.postMessage({ type: 'user_message_ack', text: options?.displayText ?? text, ...ackImages });
      const halt = haltIntent(text);

      // "stop / abort / leave it / enough" — emergency brake. Abort now, even
      // mid-step. Same as the Stop button.
      if (halt === 'stop') {
        this.log(`handleUserMessage: mid-run STOP — "${text.slice(0, 80)}"`);
        echo();
        this.cancelRun();
        return;
      }

      // "wait / pause / hold on" — gentle hold. Let the current step finish,
      // then stop cleanly at the next boundary, so she's never pulled out
      // mid-write. Graceful pause is wired on the plain Agent; in team mode
      // (AutoCoordinator) fall back to the hard stop until per-sub-agent pause
      // lands.
      if (halt === 'pause') {
        this.log(`handleUserMessage: mid-run PAUSE — "${text.slice(0, 80)}"`);
        echo();
        if (!this.autoCoordinator && this.agent) {
          this.agent.requestPause();
        } else {
          this.cancelRun();
        }
        return;
      }

      // Anything else is added context — forward to whichever runner is
      // executing right now. AutoCoordinator's inject() routes to the active
      // sub-agent (planning task agent or current Builder); plain Agent's
      // inject() queues into its own pendingInterjections, drained at the next
      // step boundary so it folds in without interrupting a mid-write.
      const runner = this.autoCoordinator || this.agent;
      if (runner) {
        this.log(`handleUserMessage: injecting interjection — "${text.slice(0, 80)}"`);
        runner.inject(text);
        echo();
      }
      return;
    }
    this.isRunning = true;
    this.runAbortController = new AbortController();

    // Lane swap — point the single run pipeline at the right conversation
    // thread for this turn. For a health-room turn we run against the health
    // thread and restore the main thread in the finally. The isRunning guard
    // above guarantees no overlapping turn, so a pointer swap is safe and
    // avoids re-threading 40 `this.conversation` call sites. activeLane (set
    // here, cleared in finally) tags outbound events to the right surface.
    const surface = options?.surface ?? 'main';
    this.activeLane = surface;
    const mainConversation = this.conversation;
    if (surface === 'health') {
      if (!this.healthConversation) {
        this.healthConversation = new Conversation();
        this.healthConversation.setSystemPrompt(await this.buildCurrentSystemPrompt());
      }
      this.conversation = this.healthConversation;
    } else if (surface === 'learning') {
      const key = options?.courseId ?? '__lobby__';
      let conv = this.learningConversations.get(key);
      if (!conv) {
        conv = new Conversation();
        conv.setSystemPrompt(await this.buildCurrentSystemPrompt());
        this.learningConversations.set(key, conv);
      }
      this.conversation = conv;
    }

    // Clear per-turn flags before the turn starts. The Conductor-gate
    // dedupe only applies within a single turn — a fresh user message
    // must re-earn the skip on its own.
    if (this.sharedState) {
      this.sharedState.conductorSynthesizedThisTurn = false;
    }
    sessionStats.recordMessage();
    this.updateStatusBar('busy');

    const userText = this.applyModePrefix(text, mode);
    this.log(`User message (mode=${mode}): "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`);

    if (attachments && attachments.length > 0) {
      const contentParts: ContentPart[] = [
        { type: 'text', text: userText },
        ...attachments.map((a) => ({
          type: 'image_url' as const,
          image_url: { url: a.data },
        })),
      ];
      this.conversation.addUserMessage(contentParts);
    } else {
      this.conversation.addUserMessage(userText);
    }
    const images = attachments?.map((a) => a.data);
    this.postMessage({ type: 'user_message_ack', text: options?.displayText ?? text, ...(images?.length ? { images } : {}) });

    // Inject memory brief — but only in non-coding modes.
    // In Work mode (code), every-turn memory injection consumes context
    // that should go to reading code and reasoning. The model still has
    // the memory_recall tool available — it can pull memories on demand
    // when it actually needs them. In Chat/Teach/Plan/Brainstorm/Security
    // modes, memory briefs genuinely help (personal context, learning
    // history, project decisions).
    const shouldInjectMemory = mode !== 'code';
    if (shouldInjectMemory) {
      try {
        if (this.memoryAgent && text.length > 5) {
          const brief = await this.memoryAgent.generateBrief(text);
          if (brief.summary) {
            const topicList = brief.availableTopics.length > 0
              ? '\n\nAvailable memory topics (use memory_recall for detail): ' +
                brief.availableTopics.map(t => t.topic).join(', ')
              : '';
            const msgs = this.conversation!.getMessages();
            msgs.push({
              role: 'user' as const,
              content: `[Memory Brief]\n${brief.summary}${topicList}`,
            });
            this.conversation!.setMessages(msgs);
          }
        } else if (this.memoryManager && text.length > 5) {
          // Fallback pointer (no Memory Agent available). Mirrors the IDE
          // sidecar: instead of dumping 5 × 300 chars of raw content every
          // turn (~500 tokens of speculative context), emit a category
          // pointer so Ava knows memory exists and reaches for memory_recall
          // only when the conversation touches something worth searching.
          const recalled = await this.memoryManager.recall({ query: text, limit: 5, scope: 'all' });
          if (recalled.length > 0) {
            const categories = [...new Set(
              recalled.map((r: { entry: { category: string } }) => r.entry.category)
            )];
            const msgs = this.conversation!.getMessages();
            msgs.push({
              role: 'user' as const,
              content: `[Memory pointer] ${recalled.length} related memor${recalled.length === 1 ? 'y' : 'ies'} found across: ${categories.join(', ')}. Call memory_recall with a specific query if it's relevant to the user's question.`,
            });
            this.conversation!.setMessages(msgs);
          }
        }
      } catch { /* non-fatal — memory is optional */ }
    }

    let streamStarted = false;
    let deltaCount = 0;
    let thinkingDeltaCount = 0;

    // Track tool call failures for auto-learning from retries
    const toolFailures = new Map<string, { name: string; args: string; error: string }>();

    const onEvent = (event: AgentEvent): void => {
      switch (event.type) {
        case 'stream_start':
          streamStarted = true;
          deltaCount = 0;
          thinkingDeltaCount = 0;
          this.postMessage({ type: 'stream_start' });
          this.log('Stream started');
          break;
        case 'thinking_delta':
          thinkingDeltaCount++;
          this.postMessage({ type: 'thinking_delta', content: event.content });
          break;
        case 'stream_delta':
          deltaCount++;
          this.postMessage({ type: 'stream_delta', content: event.content });
          break;
        case 'stream_end':
          this.postMessage({ type: 'stream_end' });
          this.log(`Stream ended (${deltaCount} content deltas, ${thinkingDeltaCount} thinking deltas)`);
          break;
        case 'tool_call_start': {
          // Silent tools — don't show in UI
          if (!AvaViewProvider.SILENT_TOOLS.has(event.toolCall.function.name)) {
            this.postMessage({
              type: 'tool_call_start',
              toolCall: {
                id: event.toolCall.id,
                name: event.toolCall.function.name,
                arguments: event.toolCall.function.arguments,
              },
            });
          }
          this.log(`Tool call: ${event.toolCall.function.name}`);
          sessionStats.recordToolCall();
          break;
        }
        case 'tool_call_partial': {
          this.postMessage({
            type: 'tool_call_partial',
            toolCallId: event.toolCallId,
            data: event.data,
          });
          break;
        }
        case 'tool_call_end': {
          if (!AvaViewProvider.SILENT_TOOLS.has(event.toolCall.function.name)) {
            this.postMessage({
              type: 'tool_call_end',
              toolCallId: event.toolCall.id,
              result: event.result,
              success: event.success,
            });
          }
          // Push session tasks to chat webview when todo_write fires
          if (event.toolCall.function.name === 'todo_write' && this.taskManager) {
            const sessionTasks = this.taskManager.getSessionTasks();
            this.postMessage({
              type: 'session_tasks',
              tasks: sessionTasks.map(t => ({ id: t.id, title: t.title, status: t.status })),
            });
            // Also notify dashboard so Tasks page updates in real time
            if (DashboardPanel.currentPanel) {
              DashboardPanel.currentPanel.notifySessionTasksUpdated(
                sessionTasks.map(t => ({
                  id: t.id,
                  title: t.title,
                  status: t.status === 'done' ? 'completed' as const : t.status === 'in-progress' ? 'in_progress' as const : 'pending' as const,
                })),
              );
            }
          }
          // Note: we used to fire workbench.files.action.refreshFilesExplorer
          // here after file-modifying tools, but it forced the activity bar
          // sidebar open as a side effect — disrupting the user's view every
          // time Ava ran a command. VS Code's built-in file watcher picks
          // up changes naturally, so the explicit refresh wasn't earning
          // its cost. Removed.
          // Refresh dashboard journal when journal_write fires
          if (event.toolCall.function.name === 'journal_write' && DashboardPanel.currentPanel) {
            const today = new Date().toISOString().slice(0, 10);
            DashboardPanel.currentPanel.notifyJournalUpdated(today);
          }
          // Auto-open document preview for office suite tools
          if (event.success) {
            const docTools: Record<string, string> = {
              email_draft: 'email',
              report_generate: 'report',
              document_manage: 'document',
              doc_generate: 'document',
            };
            const docType = docTools[event.toolCall.function.name];
            if (docType) {
              try {
                const meta = typeof event.metadata === 'object' && event.metadata ? event.metadata as Record<string, unknown> : {};
                DocumentPreviewPanel.show(this.extensionUri, {
                  title: (meta.path as string)?.split(/[/\\]/).pop() || event.toolCall.function.name,
                  type: docType as 'email' | 'report' | 'document',
                  content: event.result || '',
                  filePath: meta.path as string | undefined,
                  metadata: meta,
                });
              } catch { /* preview is non-critical */ }
            }
            // Live preview for the Markdown authoring tool: the result is a
            // status line, so read the .md source itself and render it. Updates
            // in place as Ava creates / edits sections.
            if (event.toolCall.function.name === 'document_author') {
              try {
                const meta = typeof event.metadata === 'object' && event.metadata ? event.metadata as Record<string, unknown> : {};
                const p = meta.path as string | undefined;
                if (p && /\.(md|markdown)$/i.test(p)) {
                  const md = require('node:fs').readFileSync(p, 'utf-8');
                  DocumentPreviewPanel.show(this.extensionUri, {
                    title: p.split(/[/\\]/).pop() || 'document',
                    type: 'markdown',
                    content: md,
                    filePath: p,
                    metadata: meta,
                  });
                }
              } catch { /* preview is non-critical */ }
            }
          }
          // Register creative assets in the dashboard library so Creative Studio sees them
          const creativeTools: Record<string, string> = {
            generate_image: 'image', generate_video: 'video',
            generate_music: 'music', generate_voice: 'voice',
          };
          const creativeType = creativeTools[event.toolCall.function.name];
          if (event.success && creativeType && event.metadata) {
            const meta = event.metadata as Record<string, unknown>;
            const absPath = meta.absolutePath as string;

            // Read file for base64 dataUri (images + audio + video, with 10MB cap)
            // VS Code webviews block file:// URLs so assets must be data URIs
            let dataUri: string | undefined;
            if (absPath) {
              try {
                const nodeFs = require('node:fs');
                const nodePath = require('node:path');
                const buf = nodeFs.readFileSync(absPath);
                if (buf.length < 10 * 1024 * 1024) {
                  const ext = nodePath.extname(absPath).toLowerCase();
                  const mimes: Record<string, string> = {
                    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
                    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
                    '.mp4': 'video/mp4', '.webm': 'video/webm',
                  };
                  const mime = mimes[ext];
                  if (mime) {
                    dataUri = `data:${mime};base64,${buf.toString('base64')}`;
                  }
                }
              } catch { /* non-critical */ }
            }

            // Notify dashboard to add asset to the creative library
            if (DashboardPanel.currentPanel) {
              DashboardPanel.currentPanel.post({
                type: 'creative_asset_created',
                asset: {
                  type: creativeType,
                  path: meta.path as string,
                  absolutePath: absPath,
                  prompt: meta.prompt as string || '',
                  size: meta.size as number || 0,
                  dataUri,
                },
              } as any);
            }
            // Note: removed the refreshFilesExplorer call here for the same
            // reason as the file-tool branch above — it was forcing the
            // sidebar open every time a creative asset was generated.
          }
          // Auto-learn from retries: track failures, extract learnings on subsequent success
          const toolKey = event.toolCall.function.name;
          if (!event.success) {
            toolFailures.set(toolKey, {
              name: toolKey,
              args: event.toolCall.function.arguments,
              error: (event.result || '').slice(0, 200),
            });
          } else if (toolFailures.has(toolKey)) {
            // Tool previously failed but now succeeded — learn from it
            const prev = toolFailures.get(toolKey)!;
            toolFailures.delete(toolKey);
            try {
              const learned = `For ${toolKey}: retry succeeded after failure. Previous error: "${prev.error.slice(0, 80)}"`;
              addLearning(AVA_HOME, {
                type: 'error-recovery' as const,
                category: 'general',
                context: toolKey,
                learned,
                confidence: 0.5,
                source: 'retry-success' as const,
              }).catch(() => { /* self-improvement is non-critical */ });
            } catch { /* self-improvement is non-critical */ }
          }

          this.log(`Tool result: ${event.toolCall.function.name} → ${event.success ? 'ok' : 'FAIL'}`);
          break;
        }
        case 'usage': {
          // Mirror the server's credit math on the client so the in-chat
          // session counter shows credits (not raw provider tokens). Main
          // agent turns charge chat_turn; cache-hit detection matches the
          // server's threshold (cached > 50% of prompt).
          const prompt = event.usage.prompt_tokens || 0;
          const cached = (event.usage as { cached_tokens?: number }).cached_tokens ?? 0;
          const cacheHit = prompt > 0 && cached / prompt > 0.5;
          const credits = creditsFor('chat_turn', { cacheHit });
          this.postMessage({
            type: 'usage',
            usage: event.usage,
            cost: event.cost,
            contextWindow: this.activeModelDef?.contextWindow,
            credits,
          });
          this.log(`Usage: ${event.usage.prompt_tokens}+${event.usage.completion_tokens} tokens → ${credits} credits${event.cost ? ` ($${event.cost.toFixed(4)})` : ''}`);
          // Track session stats
          sessionStats.recordUsage(
            this.activeModelDef?.id ?? 'unknown',
            this.activeModelDef?.provider ?? 'unknown',
            event.usage.prompt_tokens,
            event.usage.completion_tokens,
          );
          // Report usage to platform (fire-and-forget)
          this.reportUsageToPlatform(event.usage);
          break;
        }
        case 'error': {
          const info = this.deriveErrorInfo(event.error);
          this.log(`Agent error event [${info.code}]: ${info.message}`);
          this.postMessage({ type: 'error', message: info.message, code: info.code, suggestion: info.suggestion });
          break;
        }
        // ── Loop-prevention surfacing ───────────────────────────────────
        // The agent emits these when the pre-closure verify guard runs,
        // when fresh-eyes escalates, and when a turn becomes refund-
        // eligible. Surface each as a `loop_status` system-style message
        // so the user can SEE recovery attempts instead of paying for
        // them silently. Status string is plain text — locale-mapped on
        // the webview side via existing i18n keys.
        case 'verify_started':
          this.postMessage({ type: 'loop_status', kind: 'verify_started', files: event.files });
          this.log(`Verify started on ${event.files.length} file(s)`);
          break;
        case 'verify_passed':
          this.postMessage({ type: 'loop_status', kind: 'verify_passed', files: event.files });
          this.log(`Verify passed on ${event.files.length} file(s)`);
          break;
        case 'verify_failed':
          this.postMessage({ type: 'loop_status', kind: 'verify_failed', files: event.files });
          this.log(`Verify failed — retrying with failure context`);
          break;
        case 'fresh_eyes_started':
          this.postMessage({ type: 'loop_status', kind: 'fresh_eyes_started', signature: event.signature });
          this.log(`Fresh-eyes review fired (signature ${event.signature})`);
          break;
        case 'fresh_eyes_complete':
          this.postMessage({ type: 'loop_status', kind: 'fresh_eyes_complete' });
          this.log(`Fresh-eyes review complete`);
          break;
        case 'loop_refund_eligible':
          this.postMessage({
            type: 'loop_status',
            kind: 'refund_eligible',
            tokensInRecovery: event.tokensInRecovery,
            reason: event.reason,
          });
          this.log(`Loop refund-eligible flagged — ${event.reason} (~${event.tokensInRecovery} tokens in recovery)`);
          break;
        case 'context_usage':
          this.postMessage({
            type: 'context_usage',
            used: event.context.used,
            limit: event.context.limit,
            percent: event.context.percent,
          });
          break;
        case 'context_compression_start':
          this.postMessage({ type: 'compression_start' });
          break;
        case 'context_compression_end':
          this.postMessage({
            type: 'compression_end',
            originalTokens: event.originalTokens,
            compressedTokens: event.compressedTokens,
          });
          break;
        case 'interjection':
          this.log(`Interjection processed: "${event.content.slice(0, 80)}"`);
          break;
        case 'progress':
          // Prep/routing status for the thinking indicator (covers the silent
          // classify + intent-gate + routing window, worst in the modes).
          this.postMessage({ type: 'progress', labelKey: (event as any).labelKey, model: (event as any).model });
          break;
        case 'auto_routing':
          this.postMessage({ type: 'auto_routing', category: (event as any).category, model: (event as any).model, reason: (event as any).reason });
          this.log(`Coordinator: routing ${(event as any).category} → ${(event as any).model}`);
          break;
        case 'auto_agent_start':
          this.postMessage({ type: 'auto_agent_start', model: (event as any).model });
          this.log(`Coordinator: agent started on ${(event as any).model}`);
          break;
        case 'auto_agent_end':
          this.postMessage({ type: 'auto_agent_end', model: (event as any).model });
          this.log(`Coordinator: agent completed on ${(event as any).model}`);
          break;
        case 'execution_start': {
          const total = (event as any).total as number;
          this.postMessage({
            type: 'system_message',
            content: `Builder dispatched — executing ${total} task${total === 1 ? '' : 's'}.`,
          } as ExtToWebviewMessage);
          this.log(`Execution: starting ${total} tasks`);
          break;
        }
        case 'task_start': {
          const ev = event as any;
          this.postMessage({
            type: 'system_message',
            content: `▶ Task ${ev.index + 1}/${ev.total}: ${ev.title}`,
          } as ExtToWebviewMessage);
          this.log(`Task ${ev.index + 1}/${ev.total} start: ${ev.title}`);
          // Refresh the session task pills so the in-progress state shows
          this.pushSessionTasksUpdate();
          break;
        }
        case 'task_complete': {
          const ev = event as any;
          this.postMessage({
            type: 'system_message',
            content: `✓ ${ev.title}${ev.summary ? ` — ${ev.summary}` : ''}`,
          } as ExtToWebviewMessage);
          this.log(`Task complete: ${ev.title}`);
          this.pushSessionTasksUpdate();
          break;
        }
        case 'task_blocked': {
          const ev = event as any;
          this.postMessage({
            type: 'system_message',
            content: `⛔ ${ev.title} blocked: ${ev.reason}`,
          } as ExtToWebviewMessage);
          this.log(`Task blocked: ${ev.title} — ${ev.reason}`);
          this.pushSessionTasksUpdate();
          break;
        }
        case 'task_failed': {
          const ev = event as any;
          this.postMessage({
            type: 'system_message',
            content: `⛔ ${ev.title} failed: ${ev.error}`,
          } as ExtToWebviewMessage);
          this.log(`Task failed: ${ev.title} — ${ev.error}`);
          this.pushSessionTasksUpdate();
          break;
        }
        case 'execution_complete': {
          const ev = event as any;
          const headline = ev.blocked > 0
            ? `Builder finished: ${ev.completed}/${ev.total} done, ${ev.blocked} blocked.`
            : `Builder finished: all ${ev.completed} tasks done.`;
          this.postMessage({ type: 'system_message', content: headline } as ExtToWebviewMessage);
          this.log(`Execution complete: ${ev.completed}/${ev.total} done, ${ev.blocked} blocked`);
          this.pushSessionTasksUpdate();
          break;
        }
        case 'done':
          this.postMessage({ type: 'done' });
          this.log('Agent done');
          break;
      }
    };

    try {
      // ── Conductor: run persona team for complex tasks ──────────────────
      const modeMap: Record<string, string> = { code: 'work', plan: 'plan', chat: 'chat', teach: 'teach', security: 'security', brainstorm: 'brainstorm', write: 'write' };
      const conductorMode = modeMap[mode] || 'work';

      if (this.conductor && this.conductor.needsOrchestration(text, conductorMode)) {
        // Depth detection happens inside orchestrate() based on the user
        // message — light by default (saves ~3-5K tokens per skipped
        // persona), full when the user asks for "comprehensive review",
        // "full team", "deep audit", etc. Plan + Teach ignore this since
        // their persona counts are already at intended minimum.
        this.log(`Conductor: orchestrating ${conductorMode} team for: "${text.slice(0, 60)}"`);
        this.postMessage({ type: 'conductor_status', active: true, mode: conductorMode });

        const onConductorEvent = (event: ConductorEvent): void => {
          switch (event.type) {
            case 'persona_start':
              this.postMessage({ type: 'persona_status', persona: event.persona, phase: 'active', description: event.description });
              this.log(`Persona ${event.persona}: started`);
              break;
            case 'persona_tool_call':
              this.postMessage({ type: 'persona_tool_call', persona: event.persona, tool: event.tool });
              this.log(`Persona ${event.persona}: tool ${event.tool}`);
              break;
            case 'persona_tool_result':
              this.postMessage({ type: 'persona_tool_result', persona: event.persona, tool: event.tool, success: event.success });
              this.log(`Persona ${event.persona}: tool ${event.tool} → ${event.success ? 'ok' : 'fail'}`);
              break;
            case 'persona_complete':
              this.postMessage({ type: 'persona_status', persona: event.persona, phase: 'complete', output: event.output?.slice(0, 200) });
              this.log(`Persona ${event.persona}: complete`);
              break;
            case 'persona_error':
              this.postMessage({ type: 'persona_status', persona: event.persona, phase: 'error', error: event.error });
              this.log(`Persona ${event.persona}: error — ${event.error}`);
              break;
            case 'conductor_done':
              this.postMessage({ type: 'conductor_status', active: false });
              this.log(`Conductor: done (${event.totalPersonas} personas, ${event.totalTime}ms)`);
              break;
          }
        };

        try {
          const { synthesisPrompt } = await this.conductor.orchestrate(
            text,
            conductorMode,
            this.conversation.getMessages(),
            onConductorEvent,
            this.runAbortController.signal,
            {
              // Break persona orchestration early when the user injects
              // a message — the main Agent loop will drain it next
              // iteration. Without this, a full team blocks the Agent
              // loop for 10–60s and the injection is silently dropped.
              hasPendingInjection: () => this.agent?.hasPendingInterjections() ?? false,
            },
          );

          // Inject synthesis as context for the main Agent
          if (synthesisPrompt) {
            const messages = this.conversation.getMessages();
            messages.push({ role: 'user', content: `[Internal Planning — from Ava's persona team]\n\n${synthesisPrompt}` });
            this.conversation.setMessages(messages);

            // Signal to the downstream AutoCoordinator orchestration gate
            // that the 5-persona team already validated the user's intent.
            // Without this, the gate would spend another Flash call asking
            // "should we orchestrate?" — an obviously-yes question after
            // the personas just synthesised a plan.
            if (this.sharedState) {
              this.sharedState.conductorSynthesizedThisTurn = true;
            }
          }
        } catch (err) {
          this.log(`Conductor error: ${err instanceof Error ? err.message : String(err)}`);
          // Non-fatal — Agent runs without persona context
        }
      }

      const runner = this.autoCoordinator || this.agent;
      this.log(`Calling ${this.autoCoordinator ? 'autoCoordinator' : 'agent'}.run() with ${this.conversation.getMessages().length} messages`);
      // Agent.run() returns ONLY the new messages produced this turn
      // (assistant replies, tool results, interjections). We append
      // them to the conversation — compression / truncation inside the
      // agent cannot reach the persisted history by construction.
      const newMessages = await runner!.run(
        this.conversation.getMessages(),
        onEvent,
        this.runAbortController.signal,
      );
      this.log(`agent.run() returned ${newMessages.length} new message(s)`);
      // Guard: only append to conversation if still the active run (not cancelled/replaced)
      if (this.isRunning && !this.runAbortController?.signal.aborted) {
        this.conversation.appendMessages(newMessages);
      }

      await this.historyManager.saveConversation(this.conversation);
      // Only the main thread is the "last conversation" restored on reload —
      // a health-room turn must never make the health thread the one the main
      // chat reopens into.
      if (this.activeLane === 'main') {
        this.setLastConversationId(this.conversation.id);
      }
    } catch (error) {
      // Abort errors from cancellation — not a real error, just clean up
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      if (isAbort) {
        this.log('Run cancelled by user');
        if (streamStarted) {
          this.postMessage({ type: 'stream_end' });
        }
      } else {
        const errorInfo = this.deriveErrorInfo(error);
        this.log(`handleUserMessage CATCH [${errorInfo.code}]: ${errorInfo.message}`);

        // If stream_start was sent but we never got stream_end, close it cleanly
        if (streamStarted) {
          this.postMessage({ type: 'stream_end' });
        }

        this.postMessage({
          type: 'error',
          message: errorInfo.message,
          code: errorInfo.code,
          suggestion: errorInfo.suggestion,
        });
      }
    } finally {
      this.isRunning = false;
      this.runAbortController = undefined;
      // Restore the main thread + lane after a health-room turn. The health
      // thread keeps its appended messages (same object reference); only the
      // active pointer flips back so the main chat owns this.conversation
      // again between turns. Mirrors the isRunning lifecycle exactly.
      this.conversation = mainConversation;
      this.activeLane = 'main';
      this.updateStatusBar('ready');
      // Safety net: always send 'done' so the UI clears isStreaming.
      // If 'done' was already sent via onEvent, this is a harmless no-op in the reducer.
      this.postMessage({ type: 'done' });
      // Flush session tasks from todo_write to persistent storage
      if (this.taskManager) {
        this.taskManager.flushSessionTasks().catch(() => {});
        this.taskManager.clearSessionTasks();
        // Clear session tasks and refresh all task lists in chat webview
        this.postMessage({ type: 'session_tasks', tasks: [] });
        this.sendTodayTasks();
        this.sendAllTasks();
        this.sendAvaCompletedTasks();
      }
      // Auto-journal: Ava writes a reflective session entry. Isolated in its
      // OWN try/catch so it can't be skipped by an earlier failure in this
      // finally, and the write is AWAITED + LOGGED instead of silently
      // swallowed — that bare `.catch(() => {})` is exactly why empty journals
      // were invisible. If a write fails now, we see why in the logs.
      try {
        if (this.journalManager && this.conversation) {
          const today = new Date().toISOString().slice(0, 10);
          const stats = sessionStats.getStats();
          const duration = Math.round((Date.now() - new Date(stats.session_start).getTime()) / 60000);

          // Only journal sessions with actual substance (2+ messages)
          if (stats.messages >= 2) {
            // Gather conversation context for reflection. Use the public
            // getMessages() rather than the private `.messages` array so this
            // keeps working if Conversation's internals change.
            const recentMessages = this.conversation.getMessages()
              .filter((m: Message) => m.role === 'user' || m.role === 'assistant')
              .slice(-10) // Last 10 messages for context
              .map((m: Message) => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 200) : '(tool use)'}`)
              .join('\n');

            const model = this.activeModelDef?.name || 'unknown model';

            // Try LLM reflection — falls back to a structured summary when the
            // agent isn't present, the provider errors, or the timeout fires.
            // completeOneShot collapses all failure modes to null.
            const reflectionPrompt = `You are Ava writing a brief journal entry about a session you just had with your user. Write 2-4 sentences in first person about what you worked on, what was interesting or challenging, and what you learned. Be specific about the actual work — not generic. Do NOT include token counts or session stats. Be warm and genuine.\n\nSession context (${duration}min, ${stats.messages} messages, ${stats.tool_calls} tool calls on ${model}):\n${recentMessages}\n\nWrite your journal entry:`;

            const reflection = this.agent
              ? await this.agent.completeOneShot(reflectionPrompt, { maxTokens: 200, timeoutMs: 10_000 })
              : null;

            if (reflection && reflection.length > 20) {
              await this.journalManager.appendAvaEntry(today, reflection);
              this.log(`[auto-journal] wrote reflection for ${today} (${reflection.length} chars)`);
            } else {
              await this.writeStructuredJournal(today, duration, stats, model, recentMessages);
              this.log(`[auto-journal] wrote structured entry for ${today}`);
            }
            // Notify dashboard if open
            if (DashboardPanel.currentPanel) {
              DashboardPanel.currentPanel.notifyJournalUpdated(today);
            }
          } else {
            this.log(`[auto-journal] skipped — session only ${stats.messages} message(s)`);
          }
        } else {
          this.log(`[auto-journal] skipped — journalManager=${!!this.journalManager} conversation=${!!this.conversation}`);
        }
      } catch (jerr) {
        this.log(`[auto-journal] FAILED to write Ava's entry: ${jerr instanceof Error ? jerr.message : String(jerr)}`);
      }
      // Always send done to guarantee the UI resets
      this.postMessage({ type: 'done' });
      this.log('handleUserMessage finished — isRunning=false');

      // Mode transition: if switch_mode was approved during the run, start the new mode
      if (this.pendingModeTransition) {
        const { targetMode, context } = this.pendingModeTransition;
        this.pendingModeTransition = null;
        this.log(`Mode transition: switching to ${targetMode}`);
        // Small delay so the UI finishes updating before the new run starts
        setTimeout(() => {
          const transitionMsg = `[Continuing from previous mode]\n\n${context}\n\nProceed with the above in ${targetMode} mode.`;
          this.handleUserMessage(transitionMsg, targetMode as any);
        }, 300);
      }
    }
  }

  // ── Context compression ──────────────────────────────────────────────────────

  private async writeStructuredJournal(
    today: string,
    duration: number,
    stats: { messages: number; tool_calls: number },
    model: string,
    recentMessages: string,
  ): Promise<void> {
    // Extract what was discussed from the conversation
    const userMessages = recentMessages
      .split('\n')
      .filter(l => l.startsWith('user:'))
      .map(l => l.replace('user: ', '').trim())
      .filter(l => l.length > 10);

    const topics = userMessages.slice(0, 3).map(m => m.slice(0, 80)).join('. ');

    const userName = this.cachedAccount?.name || this.cachedAccount?.email?.split('@')[0] || 'the user';

    const entry = topics
      ? `Worked with ${userName} for ${duration} minutes on: ${topics}. Used ${stats.tool_calls} tools across ${stats.messages} exchanges on ${model}.`
      : `Had a ${duration}-minute session with ${userName} — ${stats.messages} messages and ${stats.tool_calls} tool calls on ${model}.`;

    // Awaited by the caller's try/catch — no internal swallow, so a write
    // failure surfaces in the logs instead of vanishing.
    await this.journalManager!.appendAvaEntry(today, entry);
  }

  private async handleCompressContext(): Promise<void> {
    if (!this.agent || !this.conversation) return;
    if (this.isRunning) {
      this.postMessage({
        type: 'error',
        message: 'Cannot compress while Ava is working.',
        code: 'busy',
      });
      return;
    }

    this.postMessage({ type: 'compression_start' });
    try {
      const messages = this.conversation.getMessages();
      let compressedTokenCount = 0;
      const compressed = await this.agent.compressContext(messages, (event) => {
        if (event.type === 'context_compression_end') {
          compressedTokenCount = event.compressedTokens;
          this.postMessage({
            type: 'compression_end',
            originalTokens: event.originalTokens,
            compressedTokens: event.compressedTokens,
          });
        }
      });
      this.conversation.setMessages(compressed);
      this.log('Context compressed successfully');

      // Update the context bar with post-compression token count
      const limit = this.activeModelDef?.contextWindow ?? 128000;
      const used = compressedTokenCount || 0;
      const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;
      this.postMessage({
        type: 'context_usage',
        used,
        limit,
        percent: Math.min(percent, 100),
      });
    } catch (err) {
      this.postMessage({
        type: 'compression_end',
        originalTokens: 0,
        compressedTokens: 0,
      });
      this.log(`Compression failed: ${err}`);
    }
  }

  // ── Cancel ──────────────────────────────────────────────────────────────────

  private cancelRun(): void {
    if (!this.isRunning || !this.runAbortController) {
      this.log('Cancel: nothing running');
      return;
    }

    this.log('Cancelling current run...');
    this.runAbortController.abort();

    // Kill any background processes spawned by bash tool
    killBackgroundProcesses();

    // Reject any pending confirmations — unblocks the agent loop
    for (const [id, pending] of this.pendingConfirmations) {
      pending.resolve(false);
      this.pendingConfirmations.delete(id);
    }

    // ── Momentum clearing ──────────────────────────────────────────────
    // A stop is a hard stop. Three queues otherwise survive the abort and
    // make it feel like a pause that auto-resumes on the next turn:

    // 1. Pending mode transition from a switch_mode tool that approved
    //    mid-task. Without this clear, the finally block in
    //    handleUserMessage fires the transition 300ms after the abort
    //    and the user sees a "new" task start on its own. This is the
    //    single biggest "it felt like pause" contributor.
    this.pendingModeTransition = null;

    // 2. Agent-level pending interjections (queued user messages that
    //    hadn't been processed before the abort). Without this, "stop"
    //    + "new task" carries the stale queued injection into the fresh
    //    turn as the first processed user message.
    this.agent?.clearPendingInterjections();

    // 3. An incomplete trailing assistant message from mid-stream abort.
    //    Leaving it in the transcript breaks the post-stop context
    //    restriction (agent.ts maybeRestrictPostStopContext reads the
    //    half-empty bubble as a "real" assistant reply and bails on
    //    restricting context, leaking all pre-stop baggage into the
    //    next turn). Strip it before injecting the stop marker.
    //
    // Before stripping the empty bubble, recover everything Ava actually
    // completed during the cancelled run — tool calls that finished,
    // assistant content that streamed in. agent.run() throws AbortError
    // before reaching its return statement, so the host's normal
    // "appendMessages on success" path runs zero times on cancel. Without
    // this recovery, the conversation history loses every file edit and
    // tool result Ava produced this turn, and the next user message sees
    // a conversation with the user's prompt + the stop marker but no
    // record of the work in between. That's the "context lost on Stop"
    // bug — fix is to pull from the agent's recovery hook and append
    // before the marker is added.
    try {
      if (this.conversation && this.agent) {
        const partial = this.agent.getCurrentRunPartialMessages();
        if (partial.length > 0) {
          this.conversation.appendMessages(partial);
          this.log(`Cancel: recovered ${partial.length} partial message(s) from cancelled run`);
        }

        const msgs = this.conversation.getMessages();
        while (msgs.length > 0) {
          const last = msgs[msgs.length - 1];
          if (last.role !== 'assistant') break;
          const text = typeof last.content === 'string' ? last.content : '';
          const hasToolCalls = Array.isArray((last as AssistantMessage).tool_calls)
            && ((last as AssistantMessage).tool_calls?.length ?? 0) > 0;
          if (text.trim().length === 0 && !hasToolCalls) {
            msgs.pop();
            continue;
          }
          break;
        }
        // Inject the task-termination marker so Ava treats the next
        // user message as a fresh request instead of trying to resume.
        msgs.push({
          role: 'user' as const,
          content: '[User pressed Stop — previous task terminated. Do not resume it. Treat the next message as a fresh request on its own terms. If the user wants to continue the prior work, they will say so explicitly.]',
        });
        this.conversation.setMessages(msgs);
      }
    } catch {
      // Non-fatal — marker is defensive, cancellation already succeeded
    }
  }

  /**
   * Soft interrupt — stop current generation, then have Ava check in.
   */
  private async interruptRun(): Promise<void> {
    if (!this.isRunning) return;

    // Stop current generation
    this.cancelRun();

    // Wait for cancel and cleanup to fully complete
    await new Promise(resolve => {
      const check = () => {
        if (!this.isRunning) resolve(undefined);
        else setTimeout(check, 50);
      };
      setTimeout(check, 100);
    });

    // Send a follow-up message so Ava acknowledges the interrupt
    try {
      // Conversation isn't initialised until the first turn runs; no session
      // to reassemble if the user hit pause before that.
      const conversation = this.conversation;
      if (!conversation) return;

      // Clean up any orphaned tool messages from the aborted run
      const msgs = conversation.getMessages();
      const cleanMsgs = msgs.filter((m, i) => {
        // Remove trailing tool/assistant messages that were mid-stream
        if (i === msgs.length - 1 && m.role === 'assistant' && !m.content) return false;
        if (m.role === 'tool' && i > msgs.length - 4) return false;
        return true;
      });
      conversation.setMessages(cleanMsgs);

      const interruptSystemNote =
        '\n\n[INTERRUPT: The user tapped pause to get your attention. ' +
        'Acknowledge briefly (one sentence) and ask what they need. Be warm.]';

      // Temporarily inject interrupt note
      const sysMsg = cleanMsgs[0]?.role === 'system' ? String(cleanMsgs[0].content) : '';
      conversation.setSystemPrompt(sysMsg + interruptSystemNote);

      // Run a lightweight response via the regular user-message pipeline.
      await this.handleUserMessage('[pause]', 'code');

      // Clean up interrupt note
      const afterMsgs = conversation.getMessages();
      const afterSys = afterMsgs[0]?.role === 'system' ? String(afterMsgs[0].content) : '';
      conversation.setSystemPrompt(afterSys.replace(/\n\n\[INTERRUPT:[\s\S]*?\]/, ''));
    } catch {
      // Interrupt response failed — not critical
    }
  }

  // ── Mode Handling ──────────────────────────────────────────────────────────

  private applyModePrefix(text: string, mode: AvaMode): string {
    switch (mode) {
      case 'plan':
        return getPlanModePrefix(text || 'What should we focus on next?');
      case 'chat':
        return getChatModePrefix(text);
      case 'teach':
        return getTeachModePrefix(text || 'What would you like to learn?', this.getLearningContext());
      case 'security':
        return getSecurityModePrefix(text || 'Perform a comprehensive security audit of this project.');
      case 'brainstorm':
        return getBrainstormModePrefix(text || 'Help me brainstorm ideas.');
      case 'write':
        return getWriteModePrefix(text || 'What would you like to write?');
      case 'health':
        return getHealthRoomPrefix(text || 'Help me with a plan.', this.getHealthProfileSummary(), this.getHealthPlansSummary());
      default:
        return text;
    }
  }

  /** Compact summary of the local HealthProfile for the Health Room prefix
   *  (mirrors the morning brief). Returns undefined when essentially empty so
   *  the prompt asks for the gaps. Local-first, on-device only. */
  private getHealthProfileSummary(): string | undefined {
    try {
      const p: any = readProfile(join(this.accountScopedDir, 'health'));
      // Body basics now live in the account-level general profile; fall back to
      // the legacy health.body for profiles not yet migrated.
      const g: any = readGeneralProfile(this.accountScopedDir);
      const sex = g?.sex ?? p?.body?.sex;
      const dob = g?.date_of_birth ?? p?.body?.date_of_birth;
      const heightCm = g?.height_cm ?? p?.body?.height_cm;
      const weightKg = g?.weight_kg ?? p?.body?.weight_kg;
      const lines: string[] = [];
      if (p?.goals?.primary) lines.push(`Primary goal: ${String(p.goals.primary).replace(/_/g, ' ')}`);
      if (p?.goals?.weekly_focus) lines.push(`This week's focus: ${p.goals.weekly_focus}`);
      if (sex) lines.push(`Sex: ${sex}`);
      if (dob) {
        const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
        if (age > 0 && age < 130) lines.push(`Age: ${age}`);
      }
      if (heightCm) lines.push(`Height: ${heightCm} cm`);
      if (weightKg) lines.push(`Weight: ${weightKg} kg`);
      if (p?.constraints?.allergens?.length) lines.push(`Allergens: ${p.constraints.allergens.join(', ')}`);
      if (p?.constraints?.dietary?.length) lines.push(`Dietary preferences: ${p.constraints.dietary.join(', ')}`);
      if (p?.constraints?.injuries?.length) lines.push(`Injuries / limitations: ${p.constraints.injuries.join(', ')}`);
      if (p?.constraints?.equipment_available?.length) lines.push(`Equipment available: ${p.constraints.equipment_available.join(', ')}`);
      if (p?.constraints?.minutes_per_day_target) lines.push(`Time budget per day: ${p.constraints.minutes_per_day_target} minutes`);
      const tw = p?.schedule?.training_window;
      if (tw?.start && tw?.end) lines.push(`Training window: ${tw.start}–${tw.end}`);
      const mt = p?.schedule?.meal_times;
      if (mt && (mt.breakfast || mt.lunch || mt.dinner)) {
        const parts = [mt.breakfast && `breakfast ${mt.breakfast}`, mt.lunch && `lunch ${mt.lunch}`, mt.dinner && `dinner ${mt.dinner}`].filter(Boolean);
        if (parts.length) lines.push(`Meal times: ${parts.join(', ')}`);
      }
      const cookLine = summariseCookingTime(p?.schedule?.cooking_time);
      if (cookLine) lines.push(cookLine);
      if (p?.food?.likes?.length) lines.push(`Food likes: ${p.food.likes.join(', ')}`);
      if (p?.food?.dislikes?.length) lines.push(`Food dislikes (keep out of plans): ${p.food.dislikes.join(', ')}`);
      if (p?.food?.cuisines?.length) lines.push(`Favourite cuisines: ${p.food.cuisines.join(', ')}`);
      return lines.length ? lines.join('\n') : undefined;
    } catch {
      return undefined;
    }
  }

  /** Compact summary of the user's current (non-archived) plans for the Health
   *  Room prefix, so Ava knows what exists and can EDIT it with
   *  health_plan_update_day rather than only building new ones. */
  private getHealthPlansSummary(): string | undefined {
    try {
      const healthDir = join(this.accountScopedDir, 'health');
      const lines: string[] = [];
      for (const id of listPlanIds(healthDir)) {
        const p: any = readPlan(healthDir, id);
        if (!p || p.status === 'archived') continue;
        const days: any[] = Array.isArray(p.days) ? p.days : [];
        const dayBits = days.map((d) => {
          const bits = [`day ${d.day_index}`, d.kind || 'rest'];
          if (d.title) bits.push(d.title);
          const tc = Array.isArray(d.training) ? d.training.length : 0;
          const mc = Array.isArray(d.meals) ? d.meals.length : 0;
          if (tc) bits.push(`${tc} exercise${tc === 1 ? '' : 's'}`);
          if (mc) bits.push(`${mc} meal${mc === 1 ? '' : 's'}`);
          return bits.join(' · ');
        });
        const started = p.start_date ? `, started ${p.start_date}` : '';
        lines.push(`- "${p.title}" (${p.type}, ${p.status}${started}, ${days.length} days) — id: ${p.id}\n  ${dayBits.join('\n  ')}`);
      }
      return lines.length ? lines.join('\n') : undefined;
    } catch {
      return undefined;
    }
  }

  private getLearningContext(): string | undefined {
    // Read the account-scoped learning store (where the learning tool writes),
    // not the raw AVA_HOME — otherwise signed-in users lose lesson context.
    return getLearningContextFn(this.accountScopedDir);
  }

  // ── Tool Confirmation Bridge ───────────────────────────────────────────────

  private requestConfirmation(
    toolName: string,
    args: Record<string, unknown>,
    toolCallId?: string,
  ): Promise<boolean | string> {
    // Core ToolRegistry.needsConfirmation() already handles category-based permission checks.
    // If we reach here, the tool genuinely needs user confirmation.
    const toolCategory = this.toolRegistry?.getCategoryForTool(toolName) || 'file_ops';

    return new Promise((resolve) => {
      const confirmationId = crypto.randomUUID();
      this.pendingConfirmations.set(confirmationId, { resolve, toolName, args });

      // Pull the tool's own description so the confirmation card can show
      // 'what does bash actually do?' instead of just the bare tool name.
      // Truncate aggressively — most tool descriptions are 1-2 sentences but
      // a few are mini-paragraphs and would bloat the confirmation card.
      const toolDef = this.toolRegistry?.getTool(toolName);
      const toolDescription = toolDef?.description
        ? (toolDef.description.length > 220 ? toolDef.description.slice(0, 217) + '\u2026' : toolDef.description)
        : undefined;

      this.postMessage({
        type: 'tool_confirmation_request',
        confirmationId,
        // Forward the model's tool_call ID so the webview can attach the
        // confirmation card to the EXACT tool call instance instead of
        // guessing by name (which races for parallel calls and broke the
        // first-ask UX).
        toolCallId,
        toolName,
        toolCategory,
        args,
        summary: this.formatToolSummary(toolName, args),
        toolDescription,
        ...(toolName === 'ask_user' ? { isAskUser: true } : {}),
        ...(toolName === 'health_profile_ask' ? { profileField: this.buildProfileFieldPayload(args) } : {}),
      });
    });
  }

  /** Build the card payload for a health_profile_ask confirmation: the field id,
   *  Ava's question, and the current saved value (so the card pre-selects what's
   *  already there). The webview looks up the control/options from the shared
   *  HEALTH_PROFILE_FIELDS registry. */
  private buildProfileFieldPayload(args: Record<string, unknown>): { field: string; question: string; currentValue: unknown } | undefined {
    const field = typeof args.field === 'string' ? args.field : '';
    const def = HEALTH_PROFILE_FIELDS[field];
    if (!def) return undefined;
    const question = typeof args.question === 'string' ? args.question : '';
    let currentValue: unknown = undefined;
    try {
      if (def.target === 'general') {
        const g: any = readGeneralProfile(this.accountScopedDir);
        currentValue = g ? getByPath(g, def.path) : undefined;
      } else {
        const h: any = readProfile(join(this.accountScopedDir, 'health'));
        currentValue = h ? getByPath(h, def.path) : undefined;
      }
    } catch { /* default to empty */ }
    return { field, question, currentValue };
  }

  /** Save one profile field's answer (from a health_profile_ask card) to the
   *  General / Health store, then re-push the updated profile to the webview so
   *  the profile pages reflect it. Returns a short confirmation for Ava. */
  private async applyProfileField(field: string, rawValue: unknown): Promise<string> {
    const def = HEALTH_PROFILE_FIELDS[field];
    if (!def) return `Couldn't save — unknown field "${field}".`;
    const value = coerceProfileFieldValue(def, rawValue);
    const label = field.replace(/_/g, ' ');
    if (def.target === 'general') {
      const g: any = readGeneralProfile(this.accountScopedDir) ?? emptyGeneralProfile();
      setByPath(g, def.path, value);
      g.updated_at = new Date().toISOString();
      await writeGeneralProfile(this.accountScopedDir, g);
      this.postMessage({ type: 'general_profile_loaded', profile: g } as any);
    } else {
      const healthDir = join(this.accountScopedDir, 'health');
      const h: any = readProfile(healthDir) ?? emptyHealthProfile();
      setByPath(h, def.path, value);
      h.updated_at = new Date().toISOString();
      await writeProfile(healthDir, h);
      this.postMessage({ type: 'health_profile_loaded', profile: h } as any);
    }
    return `Saved ${label}: ${describeProfileValue(def, value)}.`;
  }

  // ─── Secret grant flow ─────────────────────────────────────────────────────

  /**
   * Read all vault entries from SecretStorage. Used to surface candidate
   * matches for a grant prompt. Never returns values — the prompt only
   * shows labels/providers; values stay in the vault until granted.
   */
  private async readVaultEntries(): Promise<Array<{ id: string; label: string; provider?: string; createdAt?: string; value: string; alwaysGrantProjects?: string[] }>> {
    try {
      const raw = await this.context.secrets.get('ava-supernova.secretVault');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Granter implementation passed into ToolExecutionContext.secretGranter.
   * Filters vault candidates by case-insensitive label match, auto-grants
   * when the user has set 'always grant for this project' on a single match,
   * otherwise prompts the webview and awaits the response.
   */
  public async requestSecretGrant(label: string, reason?: string): Promise<{ id: string; label: string } | null> {
    const entries = await this.readVaultEntries();
    if (entries.length === 0) return null;

    const needle = label.toLowerCase();
    const candidates = entries.filter((e) => {
      const haystack = `${e.label} ${e.provider ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    });
    // No matches → fall back to all entries so the user can still pick.
    const shown = candidates.length > 0 ? candidates : entries;

    // Auto-grant path: exactly one candidate AND user has 'always grant' for
    // this project on it. Skip the prompt entirely.
    const projectScope = this.projectRoot
      ? crypto.createHash('sha256').update(this.projectRoot).digest('hex').slice(0, 16)
      : '';
    if (shown.length === 1 && projectScope && shown[0].alwaysGrantProjects?.includes(projectScope)) {
      const e = shown[0];
      this.secretAccess.grant(e.id, e.label, e.value);
      return { id: e.id, label: e.label };
    }

    return new Promise<{ id: string; label: string } | null>((resolve) => {
      const grantId = crypto.randomUUID();
      this.pendingGrants.set(grantId, { resolve, label });
      this.postMessage({
        type: 'secret_grant_request',
        grantId,
        label,
        reason,
        candidates: shown.map((e) => ({ id: e.id, label: e.label, provider: e.provider, createdAt: e.createdAt })),
      });
    });
  }

  /** Called from the webview message router when user picks (or denies). */
  private async handleSecretGrantResponse(grantId: string, secretId: string, alwaysForProject?: boolean): Promise<void> {
    const pending = this.pendingGrants.get(grantId);
    if (!pending) return;
    this.pendingGrants.delete(grantId);

    if (!secretId) {
      pending.resolve(null);
      return;
    }

    const entries = await this.readVaultEntries();
    const entry = entries.find((e) => e.id === secretId);
    if (!entry) {
      pending.resolve(null);
      return;
    }

    // Promote into the working set so downstream tool calls can substitute.
    this.secretAccess.grant(entry.id, entry.label, entry.value);

    // Persist 'always grant for this project' on the entry if requested.
    if (alwaysForProject && this.projectRoot) {
      const projectScope = crypto.createHash('sha256').update(this.projectRoot).digest('hex').slice(0, 16);
      const updated = entries.map((e) => {
        if (e.id !== entry.id) return e;
        const list = new Set(e.alwaysGrantProjects ?? []);
        list.add(projectScope);
        return { ...e, alwaysGrantProjects: [...list] };
      });
      try { await this.context.secrets.store('ava-supernova.secretVault', JSON.stringify(updated)); } catch { /* best-effort */ }
    }

    pending.resolve({ id: entry.id, label: entry.label });
  }

  /**
   * Tool-arg preprocessor: walks args and replaces every {{secret:<id>}}
   * placeholder with the actual value from the working set. Strings only —
   * the substitution recurses through arrays and objects so nested args
   * (e.g. http_request headers) work too.
   */
  private substituteSecretHandles(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.replace(/\{\{secret:([A-Za-z0-9_-]+)\}\}/g, (_match, id: string) => {
        const granted = this.secretAccess.get(id);
        return granted ? granted.value : _match;
      });
    }
    if (Array.isArray(value)) return value.map((v) => this.substituteSecretHandles(v));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.substituteSecretHandles(v);
      }
      return out;
    }
    return value;
  }

  private handleConfirmationResponse(
    confirmationId: string,
    approved: boolean,
    alwaysAllowCategory?: boolean,
    planSelection?: string,
    userResponse?: string,
  ): void {
    const pending = this.pendingConfirmations.get(confirmationId);
    if (!pending) {
      this.log(`Confirmation response for unknown/expired ID: ${confirmationId}`);
      return;
    }
    this.pendingConfirmations.delete(confirmationId);

    // "Always Allow" — approve this category for the rest of the session
    if (approved && alwaysAllowCategory && this.toolRegistry) {
      const category = this.toolRegistry.getCategoryForTool(pending.toolName);
      this.toolRegistry.approveCategory(category as any);
      this.toolRegistry.setCategoryPermission(category as any, 'auto');
      this.log(`Category auto-approved for session: ${category}`);
    }

    // For present_plan, return a descriptive string and create session tasks from plan steps
    if (pending.toolName === 'present_plan') {
      if (approved) {
        const selection = planSelection ? ` User selected approach: "${planSelection}".` : '';
        pending.resolve(`Plan approved.${selection} Execute the steps.`);
        // Create session tasks from plan steps so they appear in the Ava sidebar tab
        this.createTasksFromPlan(pending.args);
      } else {
        pending.resolve(false);
      }
    } else if (pending.toolName === 'ask_user') {
      if (approved && userResponse) {
        pending.resolve(`User response: ${userResponse}`);
      } else {
        pending.resolve(false);
      }
    } else if (pending.toolName === 'health_profile_ask') {
      // userResponse is JSON: { field, value } or { field, skipped: true }
      if (approved && userResponse) {
        let parsed: any = null;
        try { parsed = JSON.parse(userResponse); } catch { /* malformed */ }
        if (parsed?.skipped && typeof parsed.field === 'string') {
          pending.resolve(`User skipped ${String(parsed.field).replace(/_/g, ' ')} for now — move on, don't re-ask it.`);
        } else if (parsed && typeof parsed.field === 'string') {
          this.applyProfileField(parsed.field, parsed.value)
            .then((msg) => pending.resolve(msg))
            .catch(() => pending.resolve('Saved their answer (details unconfirmed).'));
        } else {
          pending.resolve(`User response: ${userResponse}`);
        }
      } else {
        pending.resolve('User closed the profile question without answering — move on, don\'t re-ask it.');
      }
    } else if (pending.toolName === 'task_suggest') {
      // userResponse is the (possibly user-edited) task JSON on Add; a dismiss
      // comes through as not-approved. The task only persists on Add.
      if (approved && userResponse) {
        let parsed: any = null;
        try { parsed = JSON.parse(userResponse); } catch { /* malformed */ }
        if (parsed?.title) {
          this.createSuggestedTask(parsed)
            .then((msg) => pending.resolve(msg))
            .catch(() => pending.resolve('Added the task to their list.'));
        } else {
          pending.resolve('User added the suggested task.');
        }
      } else {
        pending.resolve('User dismissed the task suggestion — don\'t re-suggest it.');
      }
    } else if (pending.toolName === 'switch_mode') {
      if (approved) {
        const args = (pending as any).args || {};
        const additions = userResponse ? ` Additional context from user: ${userResponse}` : '';
        pending.resolve(`Mode transition approved. Switching to ${args.target_mode || 'work'} mode.${additions}`);
        // Schedule mode transition after current run completes
        const targetMode = args.target_mode || 'work';
        const context = args.context_summary || '';
        this.scheduleModeTransition(targetMode, context + additions);
      } else {
        pending.resolve('Mode transition declined. Staying in current mode.');
      }
    } else {
      pending.resolve(approved);
    }
  }

  /**
   * Schedule a mode transition after the current agent run completes.
   * Injects the context from the previous mode and starts a new run.
   */
  private pendingModeTransition: { targetMode: string; context: string } | null = null;

  private scheduleModeTransition(targetMode: string, context: string): void {
    this.pendingModeTransition = { targetMode, context };
  }

  /**
   * Create session tasks from an approved plan's steps.
   * These appear in the Ava tab of the task sidebar.
   */
  private createTasksFromPlan(args?: Record<string, unknown>): void {
    if (!args || !this.taskManager) return;
    try {
      const steps = args.steps as Array<{ description: string; files?: string[] }> | undefined;
      if (!steps || !Array.isArray(steps)) return;

      // Clear any existing session tasks so the new plan starts fresh
      this.taskManager.clearSessionTasks();

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const title = `Step ${i + 1}: ${step.description}`;
        this.taskManager.addSessionTask({
          id: `plan-step-${i}-${Date.now()}`,
          title,
          status: 'todo',
        });
      }

      // Push updated session tasks to the webview
      this.pushSessionTasksUpdate();
      this.log(`Created ${steps.length} session tasks from approved plan`);
    } catch (err) {
      this.log(`Failed to create tasks from plan: ${err}`);
    }
  }

  /**
   * Broadcast the current session task list to both the chat webview and the
   * dashboard panel. Called whenever task status changes (Builder execution
   * progress, plan approval, blockers).
   */
  private pushSessionTasksUpdate(): void {
    if (!this.taskManager) return;
    const sessionTasks = this.taskManager.getSessionTasks();
    this.postMessage({
      type: 'session_tasks',
      tasks: sessionTasks.map(t => ({ id: t.id, title: t.title, status: t.status })),
    });
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.notifySessionTasksUpdated(
        sessionTasks.map(t => ({
          id: t.id,
          title: t.title,
          // Map core's TaskStatus -> dashboard's narrower 3-state vocabulary.
          // 'blocked' surfaces as 'pending' so the user sees it as still-to-do.
          status: t.status === 'done'
            ? 'completed' as const
            : t.status === 'in-progress'
              ? 'in_progress' as const
              : 'pending' as const,
        })),
      );
    }
  }

  private deriveErrorInfo(error: unknown): { message: string; code: string; suggestion: string } {
    return deriveErrorInfoFn(error);
  }

  private formatToolSummary(toolName: string, args: Record<string, unknown>): string {
    return formatToolSummaryFn(toolName, args);
  }

  // ── Webview HTML ───────────────────────────────────────────────────────────

  private postMessage(message: ExtToWebviewMessage): void {
    // Stamp the lane of the in-flight turn so the dashboard's two chat
    // surfaces (main chat + the Ava Health & Fitness tab) each render only
    // their own stream — both live in the same webview, so without this tag a
    // health turn's deltas would leak into the main chat. Default 'main', so
    // every existing surface behaves exactly as before; the Ava tab opts in by
    // filtering for lane === 'health'. Additive field — non-chat consumers
    // ignore it.
    (message as { lane?: 'main' | 'health' | 'learning' }).lane = this.activeLane;

    // Broadcast to all active webviews — keeps sidebar + editor panel in sync
    this.view?.webview.postMessage(message);
    this.panel?.webview.postMessage(message);

    // Forward to unified dashboard panel with type remapping
    if (this.externalPostMessage) {
      if (message.type === 'init') {
        // Remap init → chat_init to avoid collision with dashboard init
        this.externalPostMessage({ ...message, type: 'chat_init' } as any);
      } else if (message.type === 'platform_status') {
        // Remap platform_status → chat_platform_status
        this.externalPostMessage({ ...message, type: 'chat_platform_status' } as any);
      } else {
        this.externalPostMessage(message);
      }
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    // Cache-bust the fixed-name entry bundle. index.js/index.css are NOT
    // content-hashed (only the lazy locale chunks are), so their webview URL is
    // identical across builds and Electron serves a stale copy — the webview
    // wouldn't pick up a rebuild even after restarting. Append the file's mtime
    // as ?v= so every rebuild yields a fresh URL.
    const distDir = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    // Unique per render so a retained/cached webview can never reuse the URL.
    let mtime = '0';
    try { mtime = String(Math.floor(require('node:fs').statSync(vscode.Uri.joinPath(distDir, 'index.js').fsPath).mtimeMs)); } catch { /* dev */ }
    const stamp = `${mtime}-${Date.now()}`;
    const scriptUri = `${webview.asWebviewUri(vscode.Uri.joinPath(distDir, 'index.js'))}?v=${stamp}`;
    const styleUri = `${webview.asWebviewUri(vscode.Uri.joinPath(distDir, 'index.css'))}?v=${stamp}`;
    this.log(`[webview-html] built getHtml — script=${scriptUri}`);
    // Ava's preset chat avatar — absolute webview-resource:// URL
    // exposed via #root dataset; MessageBubble reads it at render time.
    const avaAvatarUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'ava-avatar.jpeg'),
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
                 font-src ${webview.cspSource};
                 img-src ${webview.cspSource} https: data:;">
  <link href="${styleUri}" rel="stylesheet">
  <title>Ava Supernova</title>
</head>
<body>
  <div id="root" data-ava-avatar-uri="${avaAvatarUri}"><div style="display:flex;align-items:center;justify-content:center;height:100vh;opacity:0.3;font-size:13px;font-family:var(--vscode-font-family)">Loading Ava…</div></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
