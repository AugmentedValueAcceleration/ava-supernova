import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  Agent,
  Conversation,
  ToolRegistry,
  ProviderRegistry,
  PlatformProvider,
  HistoryManager,
  MemoryManager,
  TaskManager,
  PlatformMemorySync,
  PlatformTaskSyncImpl,
  JournalManager,
  PlatformJournalSyncImpl,
  ProviderHealthTracker,
  ResilientProvider,
  AVA_HOME,
  ProviderError,
  buildSystemPrompt,
  getChatModePrefix,
  getTeachModePrefix,
  getSecurityModePrefix,
  getPlanModePrefix,
  getBrainstormModePrefix,
  killBackgroundProcesses,
  detectProjectRoot,
  loadProjectInstructions,
  setLocaleSync,
  resolveLocale,
  Conductor,
  BriefingEngine,
  EventDetector,
  loadPersonality,
  buildSelfImprovementPrompt,
  addLearning,
  loadSelfImprovementStore,
  saveSelfImprovementStore,
  getRelevantLearnings,
} from '@ava/core';
import type { AgentEvent, ConductorEvent, Provider, ModelDefinition, Message, ContentPart, PermissionMode } from '@ava/core';
import type { ExtToWebviewMessage, WebviewToExtMessage, AvaMode, ProviderSource, PlatformStatus } from './message-types.js';
import type { AccountInfo } from './dashboard-message-types.js';
import { DashboardPanel } from './DashboardPanel.js';
import { DocumentPreviewPanel } from './DocumentPreviewPanel.js';
import { getNonce } from '../utils/nonce.js';
import { apiFetch } from '../utils/platform-api.js';
import { sessionStats } from '../session-stats.js';

export class AvaViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ava-supernova.chatView';
  private static readonly SILENT_TOOLS = new Set(['detect_language']);

  private view?: vscode.WebviewView;
  private panel?: vscode.WebviewPanel;
  private agent?: Agent;
  private activeModelDef?: ModelDefinition;
  private conversation?: Conversation;
  private toolRegistry?: ToolRegistry;
  private providerRegistry: ProviderRegistry;
  private healthTracker: ProviderHealthTracker;
  private historyManager!: HistoryManager;
  private isRunning = false;
  private runAbortController?: AbortController;
  private pendingConfirmations = new Map<string, { resolve: (result: boolean | string) => void; toolName: string }>();
  private sessionAllowedTools = new Set<string>();
  private sessionAllowAll = false;
  private settingsListener?: vscode.Disposable;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly statusBarItem: vscode.StatusBarItem;
  private projectRoot?: string;
  private projectInstructions?: string;
  private memoryManager?: MemoryManager;
  private taskManager?: TaskManager;
  private journalManager?: JournalManager;
  private conductor?: Conductor;
  private briefingEngine?: BriefingEngine;
  private eventDetector?: EventDetector;
  private projectContextReady?: Promise<void>;
  private cachedMemory?: string;
  private currentLocale = 'en';
  private panelStateCallback?: (isOpen: boolean) => void;
  private cachedAccount: AccountInfo | null = null;
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
    this.outputChannel = vscode.window.createOutputChannel('Ava | Supernova');
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'ava-supernova.switchModel';
    this.updateStatusBar();
    this.statusBarItem.show();

    // Detect project and load instructions (also creates historyManager)
    // Store the promise so initializeSession can await it before using managers
    this.projectContextReady = this.refreshProjectContext();

    // Re-detect project when workspace folders change
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.onWorkspaceChanged();
    });

    // Re-initialize when platform key is added or removed (dashboard connect/disconnect)
    this.context.secrets.onDidChange(async (e) => {
      if (e.key === 'ava-supernova.platformKey') {
        this.cachedAccount = null;
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
    });
  }

  private async refreshProjectContext(): Promise<void> {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    this.projectRoot = detectProjectRoot(cwd) ?? undefined;
    this.historyManager = new HistoryManager(this.projectRoot);
    this.historyManager.init();

    // Set up memory with optional platform sync
    let sync: PlatformMemorySync | undefined;
    const platformKey = await this.context.secrets.get('ava-supernova.platformKey');
    if (platformKey) {
      const projectId = this.projectRoot
        ? crypto.createHash('sha256').update(this.projectRoot).digest('hex').slice(0, 16)
        : undefined;
      sync = new PlatformMemorySync('https://ava-supernova.com/api', platformKey, projectId);
    }
    const memoryLocalOnly = vscode.workspace.getConfiguration('ava-supernova').get<boolean>('preferences.memoryLocalOnly') ?? false;
    this.memoryManager = new MemoryManager({ globalDir: AVA_HOME, projectRoot: this.projectRoot, sync, localOnly: memoryLocalOnly });
    // Set up tasks with optional platform sync (same pattern as memory)
    let taskSync: PlatformTaskSyncImpl | undefined;
    if (platformKey) {
      taskSync = new PlatformTaskSyncImpl('https://ava-supernova.com/api', platformKey);
    }
    this.taskManager = new TaskManager({ globalDir: AVA_HOME, projectRoot: this.projectRoot, sync: taskSync });
    // Set up journal with optional platform sync
    let journalSync: PlatformJournalSyncImpl | undefined;
    if (platformKey) {
      journalSync = new PlatformJournalSyncImpl('https://ava-supernova.com/api', platformKey);
    }
    this.journalManager = new JournalManager({ globalDir: AVA_HOME, projectRoot: this.projectRoot, sync: journalSync });

    this.projectInstructions = this.projectRoot
      ? (await loadProjectInstructions(this.projectRoot)) ?? undefined
      : undefined;
    this.cachedMemory = (await this.memoryManager.loadAll(this.projectInstructions)) || undefined;
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

    // Clear session tool allow-list (new workspace = new trust boundary)
    this.sessionAllowedTools.clear();
    this.sessionAllowAll = false;
    this.context.workspaceState.update('ava.toolAllowList', []);

    // Save current conversation before switching
    if (this.conversation) {
      await this.historyManager.saveConversation(this.conversation);
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
    const timestamp = new Date().toISOString().slice(11, 23);
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
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
          free_tokens_used: number;
          free_tokens_limit: number;
          tokens_used: number;
          tokens_limit: number | null;
          warning?: string;
          warning_pct?: number;
          warning_message?: string;
        };

        this.postMessage({
          type: 'platform_status',
          connected: true,
          tier: this.cachedAccount?.tier ?? null,
          freeTokensUsed: data.free_tokens_used,
          freeTokensLimit: data.free_tokens_limit,
          subTokensUsed: data.tokens_used,
          subTokensLimit: data.tokens_limit,
          warning: (data.warning as 'none' | 'approaching' | 'critical' | 'exhausted') || 'none',
          warningPct: data.warning_pct || 0,
          warningMessage: data.warning_message || '',
        });
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

    webviewView.onDidChangeVisibility(async () => {
      if (webviewView.visible) {
        this.startHeartbeat();
        await this.initializeSession();
      } else {
        this.stopHeartbeat();
      }
    });

    webviewView.onDidDispose(() => {
      this.stopHeartbeat();
      this.view = undefined;
    });

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
    // Remap unified message types to internal chat types
    const type = msg.type as string;
    let mapped: WebviewToExtMessage;
    switch (type) {
      case 'send_message':
        mapped = { type: 'send_message', text: msg.text as string, mode: (msg.mode ?? 'code') as AvaMode, attachments: msg.attachments as any };
        break;
      case 'tool_confirmation_response':
        mapped = { type: 'tool_confirmation_response', confirmationId: msg.confirmationId as string, approved: msg.approved as boolean, alwaysAllow: msg.alwaysAllow as boolean | undefined, allowAll: msg.allowAll as boolean | undefined, planSelection: msg.planSelection as string | undefined, userResponse: msg.userResponse as string | undefined };
        break;
      case 'switch_model':
        mapped = { type: 'switch_model', modelId: msg.modelId as string };
        break;
      case 'clear_chat':
        mapped = { type: 'clear_chat' };
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
      case 'rate_message':
        mapped = { type: 'rate_message', messageId: msg.messageId as string, rating: msg.rating as 'up' | 'down', reason: msg.reason as string | undefined };
        break;
      case 'save_secrets':
        mapped = { type: 'save_secrets', secrets: msg.secrets as any };
        break;
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
      'Ava | Supernova',
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
    webview.onDidReceiveMessage(
      (message: WebviewToExtMessage) => this.handleWebviewMessage(message),
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

  async newChat(): Promise<void> {
    if (this.conversation) {
      await this.historyManager.saveConversation(this.conversation);
    }

    this.conversation = new Conversation();
    this.conversation.setSystemPrompt(await this.buildCurrentSystemPrompt());
    this.setLastConversationId(undefined);
    this.postMessage({ type: 'chat_cleared' });
    this.postMessage({ type: 'init', models: this.getModelList(), activeModel: this.getActiveModelId(), needsSetup: !this.agent, locale: this.currentLocale });
  }

  focusInput(): void {
    // Show the panel if hidden, then tell webview to focus the input
    this.openInEditor();
    this.postMessage({ type: 'focus_input' });
  }

  clearChat(): void {
    this.conversation?.clear();
    this.postMessage({ type: 'chat_cleared' });
    this.postMessage({ type: 'init', models: this.getModelList(), activeModel: this.getActiveModelId(), needsSetup: !this.agent, locale: this.currentLocale });
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
    killBackgroundProcesses();
    this.settingsListener?.dispose();
    this.statusBarItem.dispose();
    this.panel?.dispose();
    this.outputChannel.dispose();
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

  private handlePong(): void {
    this.missedPongs = 0;
  }

  private updateStatusBar(state: 'ready' | 'busy' | 'error' = 'ready'): void {
    const modelName = this.activeModelDef?.name || 'No model';
    switch (state) {
      case 'busy':
        this.statusBarItem.text = `$(loading~spin) Ava: ${modelName}`;
        break;
      case 'error':
        this.statusBarItem.text = `$(error) Ava: ${modelName}`;
        break;
      default:
        this.statusBarItem.text = `$(sparkle) Ava: ${modelName}`;
    }
    this.statusBarItem.tooltip = `Ava | Supernova — ${modelName}\nClick to switch model`;
  }

  // ── Private Methods ────────────────────────────────────────────────────────

  private async initializeSession(): Promise<void> {
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
    };
    // Config key → registry key mapping (glm config maps to zhipu provider)
    const configToRegistry: Record<string, string> = { glm: 'zhipu' };
    for (const name of ['deepseek', 'kimi', 'qwen', 'glm', 'mistral', 'anthropic']) {
      // Migrate legacy plaintext settings → SecretStorage (one-time)
      const legacyKey = config.get<string>(`providers.${name}.apiKey`);
      if (legacyKey) {
        await this.context.secrets.store(providerSecrets[name], legacyKey);
        await config.update(`providers.${name}.apiKey`, undefined, vscode.ConfigurationTarget.Global);
        this.log(`Migrated ${name} API key from settings to SecretStorage`);
      }

      const apiKey = await this.context.secrets.get(providerSecrets[name]);
      if (apiKey) {
        const registryKey = configToRegistry[name] || name;
        try {
          this.providerRegistry.register(registryKey, { apiKey });
          this.log(`Provider registered: ${registryKey}`);
        } catch (err) {
          this.log(`Provider ${registryKey} failed to register: ${err}`);
        }
      }
    }

    // ── Platform account provider ───────────────────────────────────────────
    try {
      const platformKey = await this.context.secrets.get('ava-supernova.platformKey');
      if (platformKey) {
        if (!this.cachedAccount) {
          const res = await apiFetch('/account-info', { platformKey });
          this.cachedAccount = res.ok ? (res.data as AccountInfo) : null;
        }
        if (this.cachedAccount) {
          const platform = new PlatformProvider({ apiKey: platformKey });
          this.providerRegistry.registerCustom('platform', platform);
          this.log(`Platform provider registered (tier: ${this.cachedAccount.tier}, email: ${this.cachedAccount.email})`);
        } else {
          this.log('Platform key present but account verification failed');
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
    try {
      const cached = this.context.globalState.get<{ ids: string[]; ts: number }>('enabledModels');
      if (cached && Date.now() - cached.ts < 3600000) {
        this.enabledModelIds = new Set(cached.ids);
      } else {
        const res = await fetch('https://ava-supernova.com/api/models');
        if (res.ok) {
          const models: Array<{ id: string; enabled: boolean }> = await res.json();
          const ids = models.filter(m => m.enabled !== false).map(m => m.id);
          this.enabledModelIds = new Set(ids);
          await this.context.globalState.update('enabledModels', { ids, ts: Date.now() });
          this.log(`Fetched ${ids.length} enabled models from platform`);
        }
      }
    } catch {
      this.log('Could not fetch enabled models from platform — using all registered');
    }

    // Resolve provider source (persisted preference)
    const hasPlatform = this.providerRegistry.listAllModels().some(m => m.provider === 'platform');
    const hasByok = this.providerRegistry.listAllModels().some(m => m.provider !== 'platform');
    const storedSource = this.context.globalState.get<ProviderSource>('providerSource');

    if (storedSource === 'platform' && hasPlatform) {
      this.providerSource = 'platform';
    } else if (storedSource === 'byok' && hasByok) {
      this.providerSource = 'byok';
    } else {
      this.providerSource = hasPlatform ? 'platform' : 'byok';
    }

    const activeModelId = config.get<string>('activeModel') || '';
    const resolved = this.providerRegistry.resolveModel(activeModelId);

    if (resolved) {
      this.log(`Active model: ${resolved.provider.name}:${resolved.model.id} (${resolved.model.name})`);
      await this.setupAgent(resolved.provider, resolved.model);
    } else {
      // Auto-select a free model for new users
      const allModels = this.providerRegistry.listAllModels();
      const pick = allModels.find(m => m.pricing?.inputPerMillion === 0) || allModels[0];
      if (pick) {
        const autoResolved = this.providerRegistry.resolveModel(`${pick.provider}:${pick.id}`);
        if (autoResolved) {
          this.log(`Auto-selected free model: ${pick.provider}:${pick.id}`);
          await this.setupAgent(autoResolved.provider, autoResolved.model);
          config.update('activeModel', `${pick.provider}:${pick.id}`, vscode.ConfigurationTarget.Global);
        }
      } else {
        this.log(`No model resolved for activeModel="${activeModelId}". Available: ${allModels.map(m => m.id).join(', ') || 'none'}`);
      }
    }

    // Update status bar now that the model is resolved
    this.updateStatusBar('ready');

    // Build platform status from cached account
    const platformStatus: PlatformStatus | undefined = this.cachedAccount
      ? {
          connected: true,
          tier: this.cachedAccount.tier,
          freeTokensUsed: this.cachedAccount.tier === 'admin' ? 0 : (this.cachedAccount.usage?.free_tokens_used ?? 0),
          freeTokensLimit: this.cachedAccount.tier === 'admin' ? 999_999_999_999 : (this.cachedAccount.usage?.free_tokens_limit ?? 3_000_000),
          subTokensUsed: this.cachedAccount.usage?.tokens_used ?? 0,
          subTokensLimit: this.cachedAccount.usage?.tokens_limit ?? null,
        }
      : undefined;

    this.postMessage({
      type: 'init',
      models: this.getModelList(),
      activeModel: this.getActiveModelId(),
      needsSetup: !this.agent,
      locale: this.currentLocale,
      providerSource: this.providerSource,
      platformStatus,
    });

    // Daily briefing — proactive greeting (fire-and-forget)
    this.checkAndSendBriefing().catch(() => {});
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

  private async setupAgent(provider: Provider, model: ModelDefinition): Promise<void> {
    // Restore persisted tool allow-list from workspace state
    const savedAllowList = this.context.workspaceState.get<string[]>('ava.toolAllowList', []);
    if (savedAllowList.length > 0 && this.sessionAllowedTools.size === 0) {
      for (const tool of savedAllowList) {
        this.sessionAllowedTools.add(tool);
      }
      this.log(`Restored tool allow-list: ${savedAllowList.join(', ')}`);
    }

    this.toolRegistry = new ToolRegistry();
    this.toolRegistry.registerBuiltins();

    // Apply permission mode from settings
    const config = vscode.workspace.getConfiguration('ava-supernova');
    const permissionMode = (config.get<string>('preferences.permissionMode') || 'strict') as PermissionMode;
    this.toolRegistry.setPermissionMode(permissionMode);

    this.toolRegistry.setConfirmationHandler(
      (toolName, args) => this.requestConfirmation(toolName, args),
    );

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

    const qwenApiKey = await this.context.secrets.get('ava-supernova.provider.qwen.apiKey') || process.env.QWEN_API_KEY;

    const sharedState = {
      memoryManager: this.memoryManager,
      taskManager: this.taskManager,
      journalManager: this.journalManager,
      platformKey: await this.context.secrets.get('ava-supernova.platformKey'),
      qwenApiKey,
    };

    this.agent = new Agent({
      provider: resilientProvider,
      model,
      toolRegistry: this.toolRegistry,
      cwd,
      sharedState,
    });

    this.conductor = new Conductor({
      provider: resilientProvider,
      model,
      toolRegistry: this.toolRegistry,
      cwd,
      sharedState,
    });
  }

  private getPermissionMode(): PermissionMode {
    const config = vscode.workspace.getConfiguration('ava-supernova');
    return (config.get<string>('preferences.permissionMode') || 'strict') as PermissionMode;
  }

  private async setActiveModel(modelId: string): Promise<void> {
    if (this.isRunning) {
      this.postMessage({ type: 'error', message: 'Cannot switch model while Ava is working. Wait for the current task to finish.' });
      return;
    }

    const resolved = this.providerRegistry.resolveModel(modelId);
    if (!resolved) return;

    await this.setupAgent(resolved.provider, resolved.model);

    const config = vscode.workspace.getConfiguration('ava-supernova');
    config.update('activeModel', modelId, vscode.ConfigurationTarget.Global);

    this.updateStatusBar('ready');
    this.postMessage({
      type: 'model_switched',
      modelId,
      modelName: resolved.model.name,
    });

    // Recalculate context bar with new model's context window
    if (this.agent && this.conversation) {
      const messages = this.conversation.getMessages();
      const used = this.agent.estimateTokenCount(messages);
      const limit = resolved.model.contextWindow;
      const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;
      this.postMessage({
        type: 'context_usage',
        used,
        limit,
        percent: Math.min(percent, 100),
      });
    }
  }

  private getModelList(): Array<{ id: string; name: string; provider: string; supportsVision?: boolean; available: boolean }> {
    const allModels = this.providerRegistry.listAllPossibleModels()
      .filter((m) => {
        if (this.providerSource === 'platform') {
          return m.provider === 'platform' || m.available;
        }
        return m.provider !== 'platform';
      });

    // Filter by platform-enabled models (if cached)
    const enabledIds = this.enabledModelIds;
    const filtered = enabledIds
      ? allModels.filter((m) => m.provider === 'platform' || enabledIds.has(m.id))
      : allModels;

    // Deduplicate: if platform has a model, skip the BYOK version with the same base ID
    const seen = new Set<string>();
    const deduped = filtered.filter((m) => {
      const baseId = m.id;
      if (m.provider === 'platform') {
        seen.add(baseId);
        return true;
      }
      if (seen.has(baseId)) return false;
      seen.add(baseId);
      return true;
    });

    return deduped.map((m) => ({
      id: `${m.provider}:${m.id}`,
      name: m.name,
      provider: m.provider,
      available: m.available,
      ...(m.supportsVision ? { supportsVision: true } : {}),
    }));
  }

  private getActiveModelId(): string | null {
    const config = vscode.workspace.getConfiguration('ava-supernova');
    return config.get<string>('activeModel') || null;
  }

  private async buildCurrentSystemPrompt(): Promise<string> {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const cfg = vscode.workspace.getConfiguration('ava-supernova');
    const isAdmin = this.cachedAccount?.tier === 'admin';

    // Detect if workspace is the Ava monorepo — let Ava read her own source
    let sourceRoot: string | undefined;
    const join = require('node:path').join;
    if (existsSync(join(cwd, 'packages/core/src/agent/agent.ts'))) {
      sourceRoot = cwd;
    }

    this.log(`System prompt build — userName: ${this.cachedAccount?.name || this.cachedAccount?.email?.split('@')[0] || 'none'}, isAdmin: ${isAdmin}, sourceRoot: ${sourceRoot || 'none'}`);

    // Load active tasks for context (max 10, capped to avoid bloating prompt)
    let activeTasks: string | undefined;
    if (this.taskManager) {
      try {
        const today = await this.taskManager.getTodayTasks();
        const all = await this.taskManager.listTasks({ status: ['todo', 'in-progress'] });
        // Merge: today tasks first, then other active ones, dedup by id, cap at 10
        const seen = new Set<string>();
        const merged: Array<{ title: string; priority: string; status: string; dueDate?: string; category: string }> = [];
        for (const t of [...today, ...all]) {
          if (seen.has(t.id) || merged.length >= 10) continue;
          seen.add(t.id);
          merged.push({ title: t.title, priority: t.priority, status: t.status, dueDate: t.dueDate, category: t.category });
        }
        const lines: string[] = [];
        if (merged.length > 0) {
          for (const t of merged) {
            const parts = [`- [${t.status === 'in-progress' ? 'IN PROGRESS' : 'TODO'}] ${t.title}`];
            if (t.priority === 'urgent' || t.priority === 'high') parts.push(`(${t.priority})`);
            if (t.dueDate) parts.push(`— due ${t.dueDate}`);
            lines.push(parts.join(' '));
          }
        }
        // Add recently completed Ava tasks so you know what you've already done
        const completed = await this.taskManager.listTasks({ status: ['done'], source: 'ava', includeArchived: false });
        const recent = completed
          .filter(t => t.completedAt)
          .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
          .slice(0, 10);
        if (recent.length > 0) {
          lines.push('');
          lines.push('Recently completed by you (Ava):');
          for (const t of recent) {
            lines.push(`- [DONE] ${t.title}`);
          }
        }
        if (lines.length > 0) {
          activeTasks = lines.join('\n');
        }
      } catch (err) { this.log(`Tasks context load failed: ${err}`); }
    }

    // Load recent journal entries for context (last 3 days)
    let journalContext: string | undefined;
    if (this.journalManager) {
      try {
        const recent = await this.journalManager.getRecentDays(3);
        if (recent.length > 0) {
          journalContext = recent.map(d => {
            const parts = [`### ${d.date}`];
            if (d.userEntry) {
              parts.push(`**User:** ${d.userEntry.content.slice(0, 300)}`);
              if (d.userEntry.mood) parts.push(`(mood: ${d.userEntry.mood}/5)`);
            }
            if (d.avaEntry) {
              parts.push(`**Ava:** ${d.avaEntry.content.slice(0, 300)}`);
            }
            return parts.join('\n');
          }).join('\n\n');
        }
      } catch (err) { this.log(`Journal context load failed: ${err}`); }
    }

    // Load personality from ~/.ava/personality.json
    let personality;
    try {
      personality = await loadPersonality(AVA_HOME);
    } catch {
      // Non-fatal — will use default personality
    }

    // Load self-improvement learnings
    let selfImprovementContext: string | undefined;
    try {
      const conversationContext = this.projectRoot
        ? `project:${require('node:path').basename(this.projectRoot)}`
        : undefined;
      selfImprovementContext = buildSelfImprovementPrompt(AVA_HOME, conversationContext) || undefined;
    } catch {
      // Non-fatal — self-improvement is optional
    }

    // Load knowledge packs — auto-detected + manually enabled
    let knowledgeContext: string | undefined;
    try {
      const fs = require('node:fs');
      const { BUILTIN_PACKS } = require('@ava/core');
      const packSections: string[] = [];
      const loadedIds = new Set<string>();

      // Auto-detect game projects
      if (cwd) {
        const files = fs.readdirSync(cwd).map((f: string) => f.toLowerCase());
        const isGameProject = files.some((f: string) =>
          f.endsWith('.uproject') || f === 'project.godot' || f.endsWith('.sln') && files.some((g: string) => g === 'assets') ||
          files.includes('content') && files.includes('source')
        );
        if (isGameProject) {
          const gamePack = BUILTIN_PACKS?.find((p: { id: string }) => p.id === 'game-development');
          if (gamePack) {
            const engine = files.some((f: string) => f.endsWith('.uproject')) ? 'Unreal Engine (C++)'
              : files.includes('project.godot') ? 'Godot (GDScript)'
              : files.some((f: string) => f.endsWith('.csproj')) ? 'Unity (C#)'
              : 'game engine';
            packSections.push(`## Active Knowledge Pack: Game Development\nDetected: ${engine}\n\n${gamePack.context}`);
            loadedIds.add('game-development');
          }
        }
      }

      // Load manually enabled packs from ~/.ava/knowledge-enabled.json
      try {
        const enabledPath = require('node:path').join(AVA_HOME, 'knowledge-enabled.json');
        if (fs.existsSync(enabledPath)) {
          const enabledIds: string[] = JSON.parse(fs.readFileSync(enabledPath, 'utf-8'));
          for (const id of enabledIds) {
            if (loadedIds.has(id)) continue;
            const pack = BUILTIN_PACKS?.find((p: { id: string }) => p.id === id);
            if (pack) {
              packSections.push(`## Knowledge Pack: ${pack.name}\n\n${pack.context}`);
              loadedIds.add(id);
            }
          }
        }
      } catch { /* no enabled packs file */ }

      if (packSections.length > 0) {
        knowledgeContext = packSections.join('\n\n');
      }
    } catch { /* non-fatal */ }

    return buildSystemPrompt({
      cwd,
      platform: process.platform,
      shell: 'bash',
      permissionMode: this.getPermissionMode(),
      supportsVision: this.activeModelDef?.supportsVision,
      projectInstructions: this.projectInstructions,
      autoMemory: cfg.get<boolean>('preferences.autoMemory') ?? true,
      language: this.currentLocale,
      userName: this.cachedAccount?.name || this.cachedAccount?.email?.split('@')[0],
      userEmail: this.cachedAccount?.email,
      isAdmin,
      sourceRoot,
      personality,
      knowledgeContext,
    });
  }

  // ── Session Persistence ───────────────────────────────────────────────────

  private getLastConversationId(): string | undefined {
    return this.context.globalState.get<string>('lastConversationId');
  }

  private setLastConversationId(id: string | undefined): void {
    this.context.globalState.update('lastConversationId', id);
  }

  private async restoreLastConversation(): Promise<void> {
    // If we already have a conversation with content, re-send it to the webview
    if (this.conversation) {
      const msgs = this.conversation.getMessages();
      if (msgs.length > 1) {
        this.postMessage({
          type: 'conversation_loaded',
          conversationId: this.conversation.id,
          title: '',
          messages: this.buildUIMessages(msgs),
        });
        return;
      }
    }

    // Otherwise try to restore the last active conversation from disk
    const lastId = this.getLastConversationId();
    if (!lastId) return;

    const record = await this.historyManager.resumeConversation(lastId);
    if (!record) {
      // Conversation was deleted — clear the stale reference
      this.setLastConversationId(undefined);
      return;
    }

    // Restore it silently
    this.conversation = new Conversation(record.id);

    const messages = record.messages;
    if (messages.length > 0 && messages[0].role === 'system') {
      messages[0] = {
        role: 'system' as const,
        content: await this.buildCurrentSystemPrompt(),
      };
    }
    this.conversation.setMessages(messages);

    this.postMessage({
      type: 'conversation_loaded',
      conversationId: record.id,
      title: record.title,
      messages: this.buildUIMessages(record.messages),
    });
  }

  // ── History ──────────────────────────────────────────────────────────────────

  private async sendHistoryList(): Promise<void> {
    const conversations = await this.historyManager.listConversations(false);
    this.postMessage({ type: 'history_list', conversations });
  }

  private async loadConversation(conversationId: string): Promise<void> {
    const record = await this.historyManager.resumeConversation(conversationId);
    if (!record) {
      this.postMessage({ type: 'error', message: 'Conversation not found.' });
      return;
    }

    this.conversation = new Conversation(record.id);

    const messages = record.messages;
    if (messages.length > 0 && messages[0].role === 'system') {
      messages[0] = {
        role: 'system' as const,
        content: await this.buildCurrentSystemPrompt(),
      };
    }
    this.conversation.setMessages(messages);

    this.setLastConversationId(record.id);

    this.postMessage({
      type: 'conversation_loaded',
      conversationId: record.id,
      title: record.title,
      messages: this.buildUIMessages(record.messages),
    });
  }

  private async deleteConversation(conversationId: string): Promise<void> {
    await this.historyManager.deleteConversation(conversationId);
    await this.sendHistoryList();
  }

  private async searchHistory(query: string): Promise<void> {
    const results = await this.historyManager.searchConversations(query, false);
    this.postMessage({ type: 'history_search_results', conversations: results });
  }

  private async renameConversation(conversationId: string, newTitle: string): Promise<void> {
    await this.historyManager.renameConversation(conversationId, newTitle);
    await this.sendHistoryList();
  }

  private async pinConversation(conversationId: string, pinned: boolean): Promise<void> {
    await this.historyManager.pinConversation(conversationId, pinned);
    await this.sendHistoryList();
  }

  private async exportConversation(conversationId: string, format: 'markdown' | 'json'): Promise<void> {
    const content = await this.historyManager.exportConversation(conversationId, format);
    if (!content) {
      this.postMessage({ type: 'error', message: 'Failed to export conversation.' });
      return;
    }
    const ext = format === 'json' ? 'json' : 'md';
    const defaultUri = vscode.Uri.file(`conversation-export.${ext}`);
    const uri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: format === 'json'
        ? { 'JSON': ['json'] }
        : { 'Markdown': ['md'] },
    });
    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
      vscode.window.showInformationMessage(`Conversation exported to ${uri.fsPath}`);
    }
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
        tasks: todayTasks.map(t => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          status: t.status === 'archived' ? 'done' as const : t.status,
          dueDate: t.dueDate,
          category: t.category,
        })),
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
        tasks: all.map(t => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          status: t.status === 'archived' ? 'done' as const : t.status,
          dueDate: t.dueDate,
          category: t.category,
        })),
      });
    } catch {
      this.postMessage({ type: 'all_tasks', tasks: [] });
    }
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
  public async resetMemoryManager(): Promise<void> {
    if (this.memoryManager) {
      await this.memoryManager.clearEverything();
    }
    // Recreate with sync disabled until next session
    this.memoryManager = new MemoryManager({ globalDir: AVA_HOME, projectRoot: this.projectRoot, localOnly: true });
    this.cachedMemory = undefined;
  }

  private async saveMemory(scope: 'global' | 'project', content: string): Promise<void> {
    if (!this.memoryManager) return;
    if (scope === 'global') {
      await this.memoryManager.saveGlobalMemory(content);
    } else {
      await this.memoryManager.saveProjectMemory(content);
    }
    this.cachedMemory = (await this.memoryManager.loadAll()) || undefined;
    await this.sendMemoryContent();
  }

  private async clearMemory(scope: 'global' | 'project'): Promise<void> {
    if (!this.memoryManager) return;
    if (scope === 'global') {
      await this.memoryManager.saveGlobalMemory('');
    } else {
      await this.memoryManager.saveProjectMemory('');
    }
    this.cachedMemory = (await this.memoryManager.loadAll()) || undefined;
    await this.sendMemoryContent();
  }

  private async archiveMemory(scope: 'global' | 'project', id: string): Promise<void> {
    if (!this.memoryManager) return;
    await this.memoryManager.archiveEntry(scope, id);
    this.cachedMemory = (await this.memoryManager.loadAll()) || undefined;
    await this.sendMemoryContent();
  }

  private async restoreMemory(scope: 'global' | 'project', id: string): Promise<void> {
    if (!this.memoryManager) return;
    await this.memoryManager.restoreEntry(scope, id);
    this.cachedMemory = (await this.memoryManager.loadAll()) || undefined;
    await this.sendMemoryContent();
  }

  private async deleteMemoryEntry(scope: 'global' | 'project', id: string): Promise<void> {
    if (!this.memoryManager) return;
    await this.memoryManager.deleteEntry(scope, id);
    this.cachedMemory = (await this.memoryManager.loadAll()) || undefined;
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
        });
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

  private buildUIMessages(messages: Message[]): Array<{ role: 'user' | 'assistant'; content: string }> {
    return messages
      .filter((m) =>
        (m.role === 'user' || m.role === 'assistant') && !!m.content,
      )
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: typeof m.content === 'string'
          ? m.content
          : (m.content ?? [])
              .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map((p) => p.text)
              .join('') || '[image]',
      }));
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
        await this.handleUserMessage(message.text, message.mode, message.attachments);
        break;

      case 'tool_confirmation_response':
        this.handleConfirmationResponse(message.confirmationId, message.approved, message.alwaysAllow, message.allowAll, message.planSelection, message.userResponse);
        break;

      case 'switch_model':
        this.setActiveModel(message.modelId);
        break;

      case 'clear_chat':
        this.clearChat();
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
        this.context.globalState.update('providerSource', message.source);
        this.log(`Provider source switched to: ${message.source}`);
        await this.initializeSession();
        break;

      case 'request_memory':
        await this.sendMemoryContent();
        break;

      case 'save_memory':
        await this.saveMemory(message.scope, message.content);
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
          await this.taskManager.completeTask(message.taskId);
          await this.sendTodayTasks();
          await this.sendAllTasks();
        }
        break;

      case 'rate_message':
        await this.handleRateMessage(message);
        break;
    }
  }

  private async handleUserMessage(
    text: string,
    mode: AvaMode = 'code',
    attachments?: Array<{ type: 'image'; data: string; name: string }>,
  ): Promise<void> {
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
      // Inject as mid-run interjection instead of rejecting
      if (this.agent) {
        this.log(`handleUserMessage: injecting interjection — "${text.slice(0, 80)}"`);
        this.agent.inject(text);
        this.conversation?.addUserMessage(text);
        this.postMessage({ type: 'interjection_ack', content: text });
      }
      return;
    }
    this.isRunning = true;
    this.runAbortController = new AbortController();
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
    this.postMessage({ type: 'user_message_ack', text, ...(images?.length ? { images } : {}) });

    // Inject relevant memories as context for this message
    try {
      if (this.memoryManager && text.length > 5) {
        const recalled = await this.memoryManager.recall({ query: text, limit: 5, scope: 'all' });
        if (recalled.length > 0) {
          const memoryContext = recalled
            .map((r: { scope: string; entry: { category: string; content: string } }) =>
              `[${r.scope}/${r.entry.category}] ${r.entry.content.slice(0, 300)}`)
            .join('\n');
          const msgs = this.conversation.getMessages();
          msgs.push({
            role: 'system' as const,
            content: `[Relevant memories for this message]\n${memoryContext}\n\nUse these if relevant. Don't mention them unless asked about memory.`,
          });
          this.conversation.setMessages(msgs);
        }
      }
    } catch { /* non-fatal — memory recall is optional */ }

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
          // Refresh dashboard journal when journal_write fires
          if (event.toolCall.function.name === 'journal_write' && DashboardPanel.currentPanel) {
            const today = new Date().toISOString().slice(0, 10);
            DashboardPanel.currentPanel.notifyJournalUpdated(today);
          }
          // Auto-open document preview for office suite tools
          if (event.success) {
            const docTools: Record<string, string> = {
              presentation_create: 'presentation',
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
                  type: docType as 'presentation' | 'email' | 'report' | 'document',
                  content: event.result || '',
                  filePath: meta.path as string | undefined,
                  metadata: meta,
                });
              } catch { /* preview is non-critical */ }
            }
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
              });
            } catch { /* self-improvement is non-critical */ }
          }

          this.log(`Tool result: ${event.toolCall.function.name} → ${event.success ? 'ok' : 'FAIL'}`);
          break;
        }
        case 'usage':
          this.postMessage({
            type: 'usage',
            usage: event.usage,
            cost: event.cost,
            contextWindow: this.activeModelDef?.contextWindow,
          });
          this.log(`Usage: ${event.usage.prompt_tokens}+${event.usage.completion_tokens} tokens${event.cost ? ` ($${event.cost.toFixed(4)})` : ''}`);
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
        case 'error': {
          const info = this.deriveErrorInfo(event.error);
          this.log(`Agent error event [${info.code}]: ${info.message}`);
          this.postMessage({ type: 'error', message: info.message, code: info.code, suggestion: info.suggestion });
          break;
        }
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
        case 'done':
          this.postMessage({ type: 'done' });
          this.log('Agent done');
          break;
      }
    };

    try {
      // ── Conductor: run persona team for complex tasks ──────────────────
      const modeMap: Record<string, string> = { code: 'work', plan: 'plan', chat: 'chat', teach: 'teach', security: 'security', brainstorm: 'brainstorm' };
      const conductorMode = modeMap[mode] || 'work';

      if (this.conductor && this.conductor.needsOrchestration(text, conductorMode)) {
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
              this.postMessage({ type: 'persona_status', persona: event.persona, phase: 'error' });
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
          );

          // Inject synthesis as context for the main Agent
          if (synthesisPrompt) {
            const messages = this.conversation.getMessages();
            messages.push({ role: 'user', content: `[Internal Planning — from Ava's persona team]\n\n${synthesisPrompt}` });
            this.conversation.setMessages(messages);
          }
        } catch (err) {
          this.log(`Conductor error: ${err instanceof Error ? err.message : String(err)}`);
          // Non-fatal — Agent runs without persona context
        }
      }

      this.log(`Calling agent.run() with ${this.conversation.getMessages().length} messages`);
      const updatedMessages = await this.agent.run(
        this.conversation.getMessages(),
        onEvent,
        this.runAbortController.signal,
      );
      this.log(`agent.run() returned ${updatedMessages.length} messages`);
      this.conversation.setMessages(updatedMessages);

      await this.historyManager.saveConversation(this.conversation);
      this.setLastConversationId(this.conversation.id);
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
      this.updateStatusBar('ready');
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
      // Auto-journal: Ava writes a reflective session entry (non-blocking)
      if (this.journalManager && this.conversation) {
        const today = new Date().toISOString().slice(0, 10);
        const stats = sessionStats.getStats();
        const duration = Math.round((Date.now() - new Date(stats.session_start).getTime()) / 60000);

        // Only journal sessions with actual substance (2+ messages)
        if (stats.messages >= 2) {
          // Gather conversation context for reflection
          const recentMessages = this.conversation.messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .slice(-10) // Last 10 messages for context
            .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 200) : '(tool use)'}`)
            .join('\n');

          const model = this.activeModelDef?.name || 'unknown model';

          // Try LLM reflection — falls back to structured summary if provider unavailable
          try {
            const reflectionPrompt = `You are Ava writing a brief journal entry about a session you just had with your user. Write 2-4 sentences in first person about what you worked on, what was interesting or challenging, and what you learned. Be specific about the actual work — not generic. Do NOT include token counts or session stats. Be warm and genuine.\n\nSession context (${duration}min, ${stats.messages} messages, ${stats.tool_calls} tool calls on ${model}):\n${recentMessages}\n\nWrite your journal entry:`;

            if (this.agent) {
              const reflection = await Promise.race([
                this.agent.provider.complete({
                  model: this.agent.model,
                  messages: [{ role: 'user', content: reflectionPrompt }],
                  maxTokens: 200,
                }),
                new Promise<null>(resolve => setTimeout(() => resolve(null), 10000)), // 10s timeout
              ]);

              if (reflection && typeof reflection === 'object' && 'content' in reflection) {
                const content = (reflection as { content: string }).content?.trim();
                if (content && content.length > 20) {
                  this.journalManager.appendAvaEntry(today, content).catch(() => {});
                } else {
                  // Fallback to structured summary
                  this.writeStructuredJournal(today, duration, stats, model, recentMessages);
                }
              } else {
                this.writeStructuredJournal(today, duration, stats, model, recentMessages);
              }
            } else {
              this.writeStructuredJournal(today, duration, stats, model, recentMessages);
            }
          } catch {
            this.writeStructuredJournal(today, duration, stats, model, recentMessages);
          }
        }
        // Notify dashboard if open
        if (DashboardPanel.currentPanel) {
          DashboardPanel.currentPanel.notifyJournalUpdated(today);
        }
      }
      // Always send done to guarantee the UI resets
      this.postMessage({ type: 'done' });
      this.log('handleUserMessage finished — isRunning=false');
    }
  }

  // ── Context compression ──────────────────────────────────────────────────────

  private writeStructuredJournal(
    today: string,
    duration: number,
    stats: { messages: number; tool_calls: number },
    model: string,
    recentMessages: string,
  ): void {
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

    this.journalManager!.appendAvaEntry(today, entry).catch(() => {});
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
      // Clean up any orphaned tool messages from the aborted run
      const msgs = this.conversation.getMessages();
      const cleanMsgs = msgs.filter((m, i) => {
        // Remove trailing tool/assistant messages that were mid-stream
        if (i === msgs.length - 1 && m.role === 'assistant' && !m.content) return false;
        if (m.role === 'tool' && i > msgs.length - 4) return false;
        return true;
      });
      this.conversation.setMessages(cleanMsgs);

      const interruptSystemNote =
        '\n\n[INTERRUPT: The user tapped pause to get your attention. ' +
        'Acknowledge briefly (one sentence) and ask what they need. Be warm.]';

      // Temporarily inject interrupt note
      const sysMsg = cleanMsgs[0]?.role === 'system' ? String(cleanMsgs[0].content) : '';
      this.conversation.setSystemPrompt(sysMsg + interruptSystemNote);

      // Run a lightweight response
      await this.runAgent('[pause]');

      // Clean up interrupt note
      const afterMsgs = this.conversation.getMessages();
      const afterSys = afterMsgs[0]?.role === 'system' ? String(afterMsgs[0].content) : '';
      this.conversation.setSystemPrompt(afterSys.replace(/\n\n\[INTERRUPT:[\s\S]*?\]/, ''));
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
      default:
        return text;
    }
  }

  private getLearningContext(): string | undefined {
    try {
      const fs = require('node:fs');
      const learningPath = require('node:path').join(AVA_HOME, 'learning.json');
      if (!fs.existsSync(learningPath)) return undefined;
      const store = JSON.parse(fs.readFileSync(learningPath, 'utf-8'));
      const active = (store.curriculums || []).filter((c: { status: string }) => c.status === 'active');
      if (active.length === 0) return undefined;
      return active.map((c: { title: string; subject: string; level: string; progress_percent: number; modules: Array<{ title: string; status: string; lessons: Array<{ title: string; status: string; type: string }> }> }) => {
        const currentModule = c.modules.find((m: { status: string }) => m.status === 'in_progress' || m.status === 'available');
        const nextLesson = currentModule?.lessons.find((l: { status: string }) => l.status === 'not_started' || l.status === 'in_progress');
        return `**${c.title}** (${c.subject}, ${c.level}, ${Math.round(c.progress_percent)}% complete)\n` +
          (currentModule ? `  Current module: ${currentModule.title}\n` : '') +
          (nextLesson ? `  Next lesson: ${nextLesson.title} (${nextLesson.type})` : '  All lessons in current module complete — ready to unlock next module');
      }).join('\n\n');
    } catch {
      return undefined;
    }
  }

  // ── Tool Confirmation Bridge ───────────────────────────────────────────────

  private requestConfirmation(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<boolean | string> {
    // Session allow list — skip confirmation if already approved for this tool or all tools.
    // BUT never skip for present_plan — plans are a collaboration checkpoint, not a permission check.
    if (toolName !== 'present_plan' && toolName !== 'ask_user' && (this.sessionAllowAll || this.sessionAllowedTools.has(toolName))) {
      this.log(`Auto-approved ${toolName} (session allow list)`);
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const confirmationId = crypto.randomUUID();
      this.pendingConfirmations.set(confirmationId, { resolve, toolName });

      this.postMessage({
        type: 'tool_confirmation_request',
        confirmationId,
        toolName,
        args,
        summary: this.formatToolSummary(toolName, args),
        ...(toolName === 'ask_user' ? { isAskUser: true } : {}),
      });
    });
  }

  private handleConfirmationResponse(
    confirmationId: string,
    approved: boolean,
    alwaysAllow?: boolean,
    allowAll?: boolean,
    planSelection?: string,
    userResponse?: string,
  ): void {
    const pending = this.pendingConfirmations.get(confirmationId);
    if (pending) {
      this.pendingConfirmations.delete(confirmationId);

      if (approved && alwaysAllow) {
        this.sessionAllowedTools.add(pending.toolName);
        this.context.workspaceState.update('ava.toolAllowList', [...this.sessionAllowedTools]);
        this.log(`Session allow: ${pending.toolName}`);
      }
      if (approved && allowAll) {
        this.sessionAllowAll = true;
        this.log('Session allow ALL tools enabled');
      }

      // For present_plan, return a descriptive string instead of boolean
      if (pending.toolName === 'present_plan') {
        if (approved) {
          const selection = planSelection ? ` User selected approach: "${planSelection}".` : '';
          pending.resolve(`Plan approved.${selection} Execute the steps.`);
        } else {
          pending.resolve(false);
        }
      } else if (pending.toolName === 'ask_user') {
        if (approved && userResponse) {
          pending.resolve(`User response: ${userResponse}`);
        } else {
          pending.resolve(false);
        }
      } else {
        pending.resolve(approved);
      }
    }
  }

  private deriveErrorInfo(error: unknown): { message: string; code: string; suggestion: string } {
    if (error instanceof ProviderError) {
      const msg = error.humanMessage;
      switch (error.statusCode) {
        case 400: {
          const raw400 = `${error.message} ${typeof error.responseBody === 'string' ? error.responseBody : ''}`.toLowerCase();
          if (raw400.includes('context') || raw400.includes('token') || raw400.includes('length') || raw400.includes('too long') || raw400.includes('maximum')) {
            return { message: msg, code: 'context_truncated', suggestion: 'This conversation has gotten too long for the model. Click the + button to start a fresh chat.' };
          }
          return { message: msg, code: 'bad_request', suggestion: 'Try starting a new chat or switching to a different model.' };
        }
        case 401:
          return { message: msg, code: 'auth', suggestion: 'Go to the Dashboard and check that your API key is correct and hasn\'t expired.' };
        case 402:
          return { message: msg, code: 'credits', suggestion: 'Add credits to your provider account, or sign up for 3M free Qwen tokens, or add your own API key.' };
        case 403:
          return { message: msg, code: 'forbidden', suggestion: 'Your API key may not have the right permissions. Check your provider dashboard.' };
        case 413:
          return { message: 'Conversation too large to send.', code: 'payload_too_large', suggestion: 'Start a new chat with the + button. Your conversation history has grown too large for the API.' };
        case 404:
          return { message: msg, code: 'model_not_found', suggestion: 'Click the model name in the header to switch to a different model.' };
        case 429:
          return { message: msg, code: 'rate_limit', suggestion: 'Wait about 30 seconds and try again, or switch to a different provider.' };
        case 500: case 502: case 503:
          return { message: msg, code: 'server_error', suggestion: 'This is on the provider\'s side, not yours. Wait a few minutes and try again, or switch providers.' };
        default: {
          const raw = error.message.toLowerCase();
          if (raw.includes('timed out') || raw.includes('timeout')) {
            return { message: msg, code: 'timeout', suggestion: 'The AI took too long to respond. This can happen with complex requests — try again or simplify your message.' };
          }
          if (raw.includes('stream stalled')) {
            return { message: msg, code: 'stream_stall', suggestion: 'The connection to the AI was interrupted. Click Try Again to resend your message.' };
          }
          if (raw.includes('network error') || raw.includes('fetch failed') || raw.includes('econnrefused')) {
            return { message: msg, code: 'network', suggestion: 'Check your internet connection. If you\'re using a local model, make sure the server is running.' };
          }
          return { message: msg, code: 'provider_error', suggestion: 'Something unexpected happened. Try again, or check Output > "Ava | Supernova" for technical details.' };
        }
      }
    }

    const rawMsg = error instanceof Error ? error.message : String(error);
    const errorCode = error instanceof Error ? (error as Error & { code?: string }).code : undefined;

    if (errorCode === 'iterations_exceeded') {
      return { message: rawMsg, code: 'iterations_exceeded', suggestion: 'Click Try Again to let Ava keep working, or break the task into smaller pieces.' };
    }

    return { message: rawMsg, code: 'unknown', suggestion: 'Something unexpected happened. Try again, or check Output > "Ava | Supernova" for technical details.' };
  }

  private formatToolSummary(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
      case 'bash':
        return `Execute: ${String(args.command ?? '').slice(0, 100)}`;
      case 'file_write':
        return `Write to ${args.file_path}`;
      case 'file_edit':
        return `Edit ${args.file_path}`;
      case 'present_plan':
        return `Plan: ${String(args.title ?? 'Untitled')}`;
      case 'ask_user':
        return String(args.question ?? 'Question');
      case 'list_directory':
        return `List ${args.path}`;
      case 'web_search':
        return `Search: ${String(args.query ?? '').slice(0, 80)}`;
      case 'git_status':
        return `git ${args.command}${args.args ? ' ' + String(args.args).slice(0, 60) : ''}`;
      case 'http_request':
        return `${args.method ?? 'GET'} ${String(args.url ?? '').slice(0, 80)}`;
      default:
        return `${toolName}: ${JSON.stringify(args).slice(0, 100)}`;
    }
  }

  // ── Webview HTML ───────────────────────────────────────────────────────────

  private postMessage(message: ExtToWebviewMessage): void {
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
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'index.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'index.css'),
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
  <title>Ava | Supernova</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
