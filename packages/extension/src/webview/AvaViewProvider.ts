import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import {
  Agent,
  Conversation,
  ToolRegistry,
  ProviderRegistry,
  HistoryManager,
  ProviderError,
  buildSystemPrompt,
} from '@ava/core';
import type { AgentEvent, Provider, ModelDefinition, Message, ContentPart, PermissionMode } from '@ava/core';
import type { ExtToWebviewMessage, WebviewToExtMessage, AvaMode } from './message-types.js';
import { getNonce } from '../utils/nonce.js';

export class AvaViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ava-supernova.chatView';

  private view?: vscode.WebviewView;
  private panel?: vscode.WebviewPanel;
  private agent?: Agent;
  private conversation?: Conversation;
  private toolRegistry?: ToolRegistry;
  private providerRegistry: ProviderRegistry;
  private historyManager: HistoryManager;
  private isRunning = false;
  private pendingConfirmations = new Map<string, (approved: boolean) => void>();
  private settingsListener?: vscode.Disposable;
  private readonly outputChannel: vscode.OutputChannel;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.providerRegistry = new ProviderRegistry();
    this.historyManager = new HistoryManager();
    this.historyManager.init();
    this.outputChannel = vscode.window.createOutputChannel('Ava | Supernova');
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString().slice(11, 23);
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }

  // ── Sidebar View ───────────────────────────────────────────────────────────

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    this.setupWebview(webviewView.webview);

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.initializeSession();
      }
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });

    this.ensureSettingsListener();
  }

  // ── Editor Panel ───────────────────────────────────────────────────────────

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
    });

    this.ensureSettingsListener();
  }

  // ── Shared Webview Setup ───────────────────────────────────────────────────

  private setupWebview(webview: vscode.Webview): void {
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
      ],
    };

    webview.html = this.getHtmlForWebview(webview);

    webview.onDidReceiveMessage(
      (message: WebviewToExtMessage) => this.handleWebviewMessage(message),
    );
  }

  private ensureSettingsListener(): void {
    if (this.settingsListener) return;

    this.settingsListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('ava-supernova')) {
        this.initializeSession();
      }
    });
  }

  // ── Public Commands ────────────────────────────────────────────────────────

  async newChat(): Promise<void> {
    if (this.conversation) {
      await this.historyManager.saveConversation(this.conversation);
    }

    this.conversation = new Conversation();
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    this.conversation.setSystemPrompt(
      buildSystemPrompt({ cwd, platform: process.platform, shell: 'bash', permissionMode: this.getPermissionMode() }),
    );
    this.setLastConversationId(undefined);
    this.postMessage({ type: 'chat_cleared' });
    this.postMessage({ type: 'init', models: this.getModelList(), activeModel: this.getActiveModelId(), needsSetup: !this.agent });
  }

  clearChat(): void {
    this.conversation?.clear();
    this.postMessage({ type: 'chat_cleared' });
    this.postMessage({ type: 'init', models: this.getModelList(), activeModel: this.getActiveModelId(), needsSetup: !this.agent });
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
    this.settingsListener?.dispose();
    this.panel?.dispose();
    this.outputChannel.dispose();
  }

  // ── Private Methods ────────────────────────────────────────────────────────

  private initializeSession(): void {
    const config = vscode.workspace.getConfiguration('ava-supernova');
    this.providerRegistry = new ProviderRegistry();

    this.log('Initializing session...');

    for (const name of ['deepseek', 'kimi', 'zhipu', 'mistral']) {
      const apiKey = config.get<string>(`providers.${name}.apiKey`);
      if (apiKey) {
        try {
          this.providerRegistry.register(name, { apiKey });
          this.log(`Provider registered: ${name} (key: ${apiKey.slice(0, 8)}...)`);
        } catch (err) {
          this.log(`Provider ${name} failed to register: ${err}`);
        }
      }
    }

    const activeModelId = config.get<string>('activeModel') || '';
    const resolved = this.providerRegistry.resolveModel(activeModelId);

    if (resolved) {
      this.log(`Active model: ${resolved.provider.name}:${resolved.model.id} (${resolved.model.name})`);
      this.setupAgent(resolved.provider, resolved.model);
    } else {
      this.log(`No model resolved for activeModel="${activeModelId}". Available: ${this.getModelList().map(m => m.id).join(', ') || 'none'}`);
    }

    this.postMessage({
      type: 'init',
      models: this.getModelList(),
      activeModel: resolved ? `${resolved.provider.name}:${resolved.model.id}` : null,
      needsSetup: !resolved,
    });
  }

  private setupAgent(provider: Provider, model: ModelDefinition): void {
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

    if (!this.conversation) {
      this.conversation = new Conversation();
      this.conversation.setSystemPrompt(
        buildSystemPrompt({ cwd, platform: process.platform, shell: 'bash', permissionMode }),
      );
    }

    this.agent = new Agent({
      provider,
      model,
      toolRegistry: this.toolRegistry,
      cwd,
    });
  }

  private getPermissionMode(): PermissionMode {
    const config = vscode.workspace.getConfiguration('ava-supernova');
    return (config.get<string>('preferences.permissionMode') || 'strict') as PermissionMode;
  }

  private setActiveModel(modelId: string): void {
    const resolved = this.providerRegistry.resolveModel(modelId);
    if (!resolved) return;

    this.setupAgent(resolved.provider, resolved.model);

    const config = vscode.workspace.getConfiguration('ava-supernova');
    config.update('activeModel', modelId, vscode.ConfigurationTarget.Global);

    this.postMessage({
      type: 'model_switched',
      modelId,
      modelName: resolved.model.name,
    });
  }

  private getModelList(): Array<{ id: string; name: string; provider: string }> {
    return this.providerRegistry.listAllModels().map((m) => ({
      id: `${m.provider}:${m.id}`,
      name: m.name,
      provider: m.provider,
    }));
  }

  private getActiveModelId(): string | null {
    const config = vscode.workspace.getConfiguration('ava-supernova');
    return config.get<string>('activeModel') || null;
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
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

    const messages = record.messages;
    if (messages.length > 0 && messages[0].role === 'system') {
      messages[0] = {
        role: 'system' as const,
        content: buildSystemPrompt({ cwd, platform: process.platform, shell: 'bash', permissionMode: this.getPermissionMode() }),
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
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

    const messages = record.messages;
    if (messages.length > 0 && messages[0].role === 'system') {
      messages[0] = {
        role: 'system' as const,
        content: buildSystemPrompt({ cwd, platform: process.platform, shell: 'bash', permissionMode: this.getPermissionMode() }),
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
        this.initializeSession();
        await this.restoreLastConversation();
        break;

      case 'send_message':
        await this.handleUserMessage(message.text, message.mode, message.attachments);
        break;

      case 'tool_confirmation_response':
        this.handleConfirmationResponse(message.confirmationId, message.approved);
        break;

      case 'switch_model':
        this.setActiveModel(message.modelId);
        break;

      case 'clear_chat':
        this.clearChat();
        break;

      case 'cancel':
        // Future: AbortController support
        break;

      case 'open_settings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'ava-supernova');
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

      case 'new_chat':
        await this.newChat();
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
        message: 'No model configured. Open Settings to add an API key.',
      });
      return;
    }

    if (this.isRunning) {
      this.log('handleUserMessage: blocked — already running');
      return;
    }
    this.isRunning = true;

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
    this.postMessage({ type: 'user_message_ack', text });

    let streamStarted = false;

    const onEvent = (event: AgentEvent): void => {
      switch (event.type) {
        case 'stream_start':
          streamStarted = true;
          this.postMessage({ type: 'stream_start' });
          this.log('Stream started');
          break;
        case 'thinking_delta':
          this.postMessage({ type: 'thinking_delta', content: event.content });
          break;
        case 'stream_delta':
          this.postMessage({ type: 'stream_delta', content: event.content });
          break;
        case 'stream_end':
          this.postMessage({ type: 'stream_end' });
          this.log('Stream ended');
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
          });
          this.log(`Usage: ${event.usage.prompt_tokens}+${event.usage.completion_tokens} tokens${event.cost ? ` ($${event.cost.toFixed(4)})` : ''}`);
          break;
        case 'error':
          this.log(`Agent error event: ${event.error.message}`);
          this.postMessage({ type: 'error', message: event.error.message });
          break;
        case 'done':
          this.postMessage({ type: 'done' });
          this.log('Agent done');
          break;
      }
    };

    try {
      const updatedMessages = await this.agent.run(
        this.conversation.getMessages(),
        onEvent,
      );
      this.conversation.setMessages(updatedMessages);

      await this.historyManager.saveConversation(this.conversation);
      this.setLastConversationId(this.conversation.id);
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : String(error);
      // Use human-friendly message for provider errors (e.g. "Invalid API key for deepseek")
      const userMsg = error instanceof ProviderError ? error.humanMessage : rawMsg;
      this.log(`handleUserMessage CATCH: ${rawMsg}`);

      // If stream_start was sent but we never got stream_end, close it cleanly
      if (streamStarted) {
        this.postMessage({ type: 'stream_end' });
      }

      this.postMessage({
        type: 'error',
        message: userMsg,
      });
    } finally {
      this.isRunning = false;
      // Always send done to guarantee the UI resets
      this.postMessage({ type: 'done' });
      this.log('handleUserMessage finished — isRunning=false');
    }
  }

  // ── Mode Handling ──────────────────────────────────────────────────────────

  private applyModePrefix(text: string, mode: AvaMode): string {
    switch (mode) {
      case 'plan':
        return `[Plan Mode] Analyze the codebase and create a structured plan for the following request. You may read files and search the codebase to understand context. Do NOT write files, edit files, or execute commands — only output a detailed plan.\n\n${text}`;
      case 'chat':
        return `[Chat Mode] Respond conversationally. Do not use any tools — just discuss, explain, or brainstorm.\n\n${text}`;
      default:
        return text;
    }
  }

  // ── Tool Confirmation Bridge ───────────────────────────────────────────────

  private requestConfirmation(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const confirmationId = crypto.randomUUID();
      this.pendingConfirmations.set(confirmationId, resolve);

      this.postMessage({
        type: 'tool_confirmation_request',
        confirmationId,
        toolName,
        args,
        summary: this.formatToolSummary(toolName, args),
      });
    });
  }

  private handleConfirmationResponse(confirmationId: string, approved: boolean): void {
    const resolve = this.pendingConfirmations.get(confirmationId);
    if (resolve) {
      this.pendingConfirmations.delete(confirmationId);
      resolve(approved);
    }
  }

  private formatToolSummary(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
      case 'bash':
        return `Execute: ${String(args.command ?? '').slice(0, 100)}`;
      case 'file_write':
        return `Write to ${args.file_path}`;
      case 'file_edit':
        return `Edit ${args.file_path}`;
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
