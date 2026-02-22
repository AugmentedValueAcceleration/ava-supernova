import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import {
  Agent,
  Conversation,
  ToolRegistry,
  ProviderRegistry,
  buildSystemPrompt,
} from '@ava/core';
import type { AgentEvent, Provider, ModelDefinition } from '@ava/core';
import type { ExtToWebviewMessage, WebviewToExtMessage } from './message-types.js';
import { getNonce } from '../utils/nonce.js';

export class AvaViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ava-supernova.chatView';

  private view?: vscode.WebviewView;
  private agent?: Agent;
  private conversation?: Conversation;
  private toolRegistry?: ToolRegistry;
  private providerRegistry: ProviderRegistry;
  private isRunning = false;
  private pendingConfirmations = new Map<string, (approved: boolean) => void>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    _context: vscode.ExtensionContext,
  ) {
    this.providerRegistry = new ProviderRegistry();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
      ],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message: WebviewToExtMessage) => this.handleWebviewMessage(message),
    );
  }

  // ── Public Commands ───────────────────────────────────────────────────────

  newChat(): void {
    this.conversation = new Conversation();
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    this.conversation.setSystemPrompt(
      buildSystemPrompt({ cwd, platform: process.platform, shell: 'bash' }),
    );
    this.postMessage({ type: 'init', models: this.getModelList(), activeModel: this.getActiveModelId(), needsSetup: !this.agent });
  }

  clearChat(): void {
    this.conversation?.clear();
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

  // ── Private Methods ───────────────────────────────────────────────────────

  private initializeSession(): void {
    const config = vscode.workspace.getConfiguration('ava-supernova');
    this.providerRegistry = new ProviderRegistry();

    for (const name of ['deepseek', 'kimi', 'zhipu', 'mistral']) {
      const apiKey = config.get<string>(`providers.${name}.apiKey`);
      if (apiKey) {
        try {
          this.providerRegistry.register(name, { apiKey });
        } catch {
          // skip
        }
      }
    }

    const activeModelId = config.get<string>('activeModel') || '';
    const resolved = this.providerRegistry.resolveModel(activeModelId);

    if (resolved) {
      this.setupAgent(resolved.provider, resolved.model);
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
    this.toolRegistry.setConfirmationHandler(
      (toolName, args) => this.requestConfirmation(toolName, args),
    );

    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

    if (!this.conversation) {
      this.conversation = new Conversation();
      this.conversation.setSystemPrompt(
        buildSystemPrompt({ cwd, platform: process.platform, shell: 'bash' }),
      );
    }

    this.agent = new Agent({
      provider,
      model,
      toolRegistry: this.toolRegistry,
      cwd,
    });
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

  // ── Message Handling ──────────────────────────────────────────────────────

  private async handleWebviewMessage(message: WebviewToExtMessage): Promise<void> {
    switch (message.type) {
      case 'webview_ready':
        this.initializeSession();
        break;

      case 'send_message':
        await this.handleUserMessage(message.text);
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
    }
  }

  private async handleUserMessage(text: string): Promise<void> {
    if (!this.agent || !this.conversation) {
      this.postMessage({
        type: 'error',
        message: 'No model configured. Open Settings to add an API key.',
      });
      return;
    }

    if (this.isRunning) return;
    this.isRunning = true;

    this.conversation.addUserMessage(text);
    this.postMessage({ type: 'user_message_ack', text });

    const onEvent = (event: AgentEvent): void => {
      switch (event.type) {
        case 'stream_start':
          this.postMessage({ type: 'stream_start' });
          break;
        case 'stream_delta':
          this.postMessage({ type: 'stream_delta', content: event.content });
          break;
        case 'stream_end':
          this.postMessage({ type: 'stream_end' });
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
          break;
        case 'tool_call_end':
          this.postMessage({
            type: 'tool_call_end',
            toolCallId: event.toolCall.id,
            result: event.result,
            success: event.success,
          });
          break;
        case 'usage':
          this.postMessage({
            type: 'usage',
            usage: event.usage,
            cost: event.cost,
          });
          break;
        case 'error':
          this.postMessage({ type: 'error', message: event.error.message });
          break;
        case 'done':
          this.postMessage({ type: 'done' });
          break;
      }
    };

    try {
      const updatedMessages = await this.agent.run(
        this.conversation.getMessages(),
        onEvent,
      );
      this.conversation.setMessages(updatedMessages);
    } catch (error) {
      this.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isRunning = false;
    }
  }

  // ── Tool Confirmation Bridge ──────────────────────────────────────────────

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

  // ── Webview HTML ──────────────────────────────────────────────────────────

  private postMessage(message: ExtToWebviewMessage): void {
    this.view?.webview.postMessage(message);
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
