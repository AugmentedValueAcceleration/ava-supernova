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
  PlatformMemorySync,
  AVA_HOME,
  ProviderError,
  buildSystemPrompt,
  getSecurityModePrefix,
  killBackgroundProcesses,
  detectProjectRoot,
  loadProjectInstructions,
  setLocaleSync,
  resolveLocale,
} from '@ava/core';
import type { AgentEvent, Provider, ModelDefinition, Message, ContentPart, PermissionMode } from '@ava/core';
import type { ExtToWebviewMessage, WebviewToExtMessage, AvaMode, ProviderSource, PlatformStatus } from './message-types.js';
import type { AccountInfo } from './dashboard-message-types.js';
import { getNonce } from '../utils/nonce.js';
import { apiFetch } from '../utils/platform-api.js';

export class AvaViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ava-supernova.chatView';

  private view?: vscode.WebviewView;
  private panel?: vscode.WebviewPanel;
  private agent?: Agent;
  private activeModelDef?: ModelDefinition;
  private conversation?: Conversation;
  private toolRegistry?: ToolRegistry;
  private providerRegistry: ProviderRegistry;
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
  private cachedMemory?: string;
  private currentLocale = 'en';
  private panelStateCallback?: (isOpen: boolean) => void;
  private cachedAccount: AccountInfo | null = null;
  private providerSource: ProviderSource = 'byok';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.providerRegistry = new ProviderRegistry();
    this.outputChannel = vscode.window.createOutputChannel('Ava | Supernova');
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'ava-supernova.switchModel';
    this.updateStatusBar();
    this.statusBarItem.show();

    // Detect project and load instructions (also creates historyManager)
    this.refreshProjectContext();

    // Re-detect project when workspace folders change
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.onWorkspaceChanged();
    });

    // Re-initialize when platform key is added or removed (dashboard connect/disconnect)
    this.context.secrets.onDidChange((e) => {
      if (e.key === 'ava-supernova.platformKey') {
        this.cachedAccount = null;
        this.initializeSession();
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
    this.memoryManager = new MemoryManager({ globalDir: AVA_HOME, projectRoot: this.projectRoot, sync });

    this.projectInstructions = this.projectRoot
      ? (await loadProjectInstructions(this.projectRoot)) ?? undefined
      : undefined;
    this.cachedMemory = (await this.memoryManager.loadAll(this.projectInstructions)) || undefined;
  }

  private async onWorkspaceChanged(): Promise<void> {
    // Save current conversation before switching
    if (this.conversation) {
      await this.historyManager.saveConversation(this.conversation);
    }

    await this.refreshProjectContext();

    // Start fresh for the new project
    this.conversation = new Conversation();
    this.conversation.setSystemPrompt(this.buildCurrentSystemPrompt());
    this.setLastConversationId(undefined);
    this.postMessage({ type: 'chat_cleared' });

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
      if (this.providerSource !== 'platform') return;

      const res = await apiFetch('/usage', {
        method: 'POST',
        platformKey,
        body: {
          model: this.activeModelDef?.id ?? 'unknown',
          provider: this.activeModelDef?.provider ?? 'unknown',
          input_tokens: usage.prompt_tokens,
          output_tokens: usage.completion_tokens,
        },
      });

      if (res.ok && res.data && typeof res.data === 'object') {
        const data = res.data as {
          free_tokens_used: number;
          free_tokens_limit: number;
          tokens_used: number;
          tokens_limit: number | null;
        };

        this.postMessage({
          type: 'platform_status',
          connected: true,
          tier: this.cachedAccount?.tier ?? null,
          freeTokensUsed: data.free_tokens_used,
          freeTokensLimit: data.free_tokens_limit,
          subTokensUsed: data.tokens_used,
          subTokensLimit: data.tokens_limit,
        });

        // Low balance warning at 20% remaining (100K)
        const freeRemaining = data.free_tokens_limit - data.free_tokens_used;
        if (freeRemaining > 0 && freeRemaining <= 100_000) {
          this.postMessage({
            type: 'error',
            message: `Low free token balance: ~${Math.round(freeRemaining / 1000)}K remaining this month.`,
            code: 'low_balance',
            suggestion: 'Add your own API key in settings or wait for the monthly reset.',
          });
        }
      }
    } catch {
      // Silent fail — usage reporting should never block the user
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
        await this.initializeSession();
      }
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });

    this.ensureSettingsListener();
  }

  // ── Editor Panel ───────────────────────────────────────────────────────────

  onPanelStateChange(callback: (isOpen: boolean) => void): void {
    this.panelStateCallback = callback;
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
    this.conversation.setSystemPrompt(this.buildCurrentSystemPrompt());
    this.setLastConversationId(undefined);
    this.postMessage({ type: 'chat_cleared' });
    this.postMessage({ type: 'init', models: this.getModelList(), activeModel: this.getActiveModelId(), needsSetup: !this.agent, locale: this.currentLocale });
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
    killBackgroundProcesses();
    this.settingsListener?.dispose();
    this.statusBarItem.dispose();
    this.panel?.dispose();
    this.outputChannel.dispose();
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
        }
      }
    } catch (err) {
      this.log(`Platform account check failed: ${err}`);
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
          freeTokensUsed: this.cachedAccount.usage?.free_tokens_used ?? 0,
          freeTokensLimit: this.cachedAccount.usage?.free_tokens_limit ?? 500000,
          subTokensUsed: this.cachedAccount.usage?.tokens_used ?? 0,
          subTokensLimit: this.cachedAccount.usage?.tokens_limit ?? null,
          claudeTokensUsed: this.cachedAccount.usage?.claude_tokens_used ?? 0,
          claudeTokensLimit: this.cachedAccount.usage?.claude_tokens_limit ?? null,
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
  }

  private async setupAgent(provider: Provider, model: ModelDefinition): Promise<void> {
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
    this.conversation.setSystemPrompt(this.buildCurrentSystemPrompt());

    this.agent = new Agent({
      provider,
      model,
      toolRegistry: this.toolRegistry,
      cwd,
      sharedState: {
        memoryManager: this.memoryManager,
        platformKey: await this.context.secrets.get('ava-supernova.platformKey'),
      },
    });
  }

  private getPermissionMode(): PermissionMode {
    const config = vscode.workspace.getConfiguration('ava-supernova');
    return (config.get<string>('preferences.permissionMode') || 'strict') as PermissionMode;
  }

  private async setActiveModel(modelId: string): Promise<void> {
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
  }

  private getModelList(): Array<{ id: string; name: string; provider: string; supportsVision?: boolean; available: boolean }> {
    return this.providerRegistry.listAllPossibleModels()
      .filter((m) => {
        if (this.providerSource === 'platform') return m.provider === 'platform';
        return m.provider !== 'platform';
      })
      .map((m) => ({
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

  private buildCurrentSystemPrompt(): string {
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

    return buildSystemPrompt({
      cwd,
      platform: process.platform,
      shell: 'bash',
      permissionMode: this.getPermissionMode(),
      supportsVision: this.activeModelDef?.supportsVision,
      projectInstructions: this.projectInstructions,
      memory: this.cachedMemory,
      autoMemory: cfg.get<boolean>('preferences.autoMemory') ?? true,
      language: this.currentLocale,
      userName: this.cachedAccount?.name || this.cachedAccount?.email?.split('@')[0],
      userEmail: this.cachedAccount?.email,
      isAdmin,
      sourceRoot,
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
        content: this.buildCurrentSystemPrompt(),
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
    const conversations = await this.historyManager.listConversations();
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
        content: this.buildCurrentSystemPrompt(),
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
    const results = await this.historyManager.searchConversations(query);
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
    this.postMessage({
      type: 'memory_content',
      global: globalEntries as never[],
      project: projectEntries as never[],
    });
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
    }
  }

  private async handleUserMessage(
    text: string,
    mode: AvaMode = 'code',
    attachments?: Array<{ type: 'image'; data: string; name: string }>,
  ): Promise<void> {
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

    let streamStarted = false;
    let deltaCount = 0;
    let thinkingDeltaCount = 0;

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
        case 'tool_call_start':
          this.postMessage({
            type: 'tool_call_start',
            toolCall: {
              id: event.toolCall.id,
              name: event.toolCall.function.name,
              arguments: event.toolCall.function.arguments,
            },
          });
          this.log(`Tool call: ${event.toolCall.function.name}`);
          break;
        case 'tool_call_end':
          this.postMessage({
            type: 'tool_call_end',
            toolCallId: event.toolCall.id,
            result: event.result,
            success: event.success,
          });
          this.log(`Tool result: ${event.toolCall.function.name} → ${event.success ? 'ok' : 'FAIL'}`);
          break;
        case 'usage':
          this.postMessage({
            type: 'usage',
            usage: event.usage,
            cost: event.cost,
            contextWindow: this.activeModelDef?.contextWindow,
          });
          this.log(`Usage: ${event.usage.prompt_tokens}+${event.usage.completion_tokens} tokens${event.cost ? ` ($${event.cost.toFixed(4)})` : ''}`);
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
      // Always send done to guarantee the UI resets
      this.postMessage({ type: 'done' });
      this.log('handleUserMessage finished — isRunning=false');
    }
  }

  // ── Context compression ──────────────────────────────────────────────────────

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

  // ── Mode Handling ──────────────────────────────────────────────────────────

  private applyModePrefix(text: string, mode: AvaMode): string {
    switch (mode) {
      case 'plan':
        return `[Plan Mode] Analyze the codebase and create a structured plan for the following request. You may read files and search the codebase to understand context. Do NOT write files, edit files, or execute commands — only output a detailed plan.\n\n${text}`;
      case 'chat':
        return `[Chat Mode] Respond conversationally. Do not use any tools — just discuss, explain, or brainstorm.\n\n${text}`;
      case 'security':
        return getSecurityModePrefix(text || 'Perform a comprehensive security audit of this project.');
      default:
        return text;
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
          // Check both the error message and the raw response body for context-length keywords
          const raw400 = `${error.message} ${typeof error.responseBody === 'string' ? error.responseBody : ''}`.toLowerCase();
          if (raw400.includes('context') || raw400.includes('token') || raw400.includes('length') || raw400.includes('too long') || raw400.includes('maximum')) {
            return { message: msg, code: 'bad_request', suggestion: 'The conversation is too long for this model. Start a new chat (click + in the header).' };
          }
          return { message: msg, code: 'bad_request', suggestion: 'The request format may be incompatible with this model. Try starting a new chat or switching models.' };
        }
        case 401:
          return { message: msg, code: 'auth', suggestion: 'Open Settings and check your API key for this provider.' };
        case 402:
          return { message: msg, code: 'credits', suggestion: 'Top up your account balance with the provider.' };
        case 403:
          return { message: msg, code: 'forbidden', suggestion: 'Check that your API key has the required permissions.' };
        case 404:
          return { message: msg, code: 'model_not_found', suggestion: 'The model ID may have changed. Try switching to a different model.' };
        case 429:
          return { message: msg, code: 'rate_limit', suggestion: 'Wait a moment and try again, or switch to a different provider.' };
        case 500: case 502: case 503:
          return { message: msg, code: 'server_error', suggestion: 'The provider is having issues. Wait a few minutes or try another provider.' };
        default: {
          // No status code — check the raw message for patterns
          const raw = error.message.toLowerCase();
          if (raw.includes('timed out') || raw.includes('timeout')) {
            return { message: msg, code: 'timeout', suggestion: 'The provider took too long to respond. Check your connection or try again.' };
          }
          if (raw.includes('stream stalled')) {
            return { message: msg, code: 'stream_stall', suggestion: 'The response stream stopped unexpectedly. Try sending your message again.' };
          }
          if (raw.includes('network error') || raw.includes('fetch failed') || raw.includes('econnrefused')) {
            return { message: msg, code: 'network', suggestion: 'Check your internet connection. If using a custom endpoint, verify the URL in Settings.' };
          }
          return { message: msg, code: 'provider_error', suggestion: 'Check Output > "Ava | Supernova" for details.' };
        }
      }
    }

    const rawMsg = error instanceof Error ? error.message : String(error);
    const errorCode = error instanceof Error ? (error as Error & { code?: string }).code : undefined;

    if (errorCode === 'iterations_exceeded') {
      return { message: rawMsg, code: 'iterations_exceeded', suggestion: 'Click Continue to let Ava keep working, or start a new message with more specific instructions.' };
    }

    return { message: rawMsg, code: 'unknown', suggestion: 'An unexpected error occurred. Check Output > "Ava | Supernova" for details.' };
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
