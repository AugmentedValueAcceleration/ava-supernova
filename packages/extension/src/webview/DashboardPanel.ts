import * as vscode from 'vscode';
import { getNonce } from '../utils/nonce.js';
import { apiFetch } from '../utils/platform-api.js';
import type {
  ExtToDashboardMessage,
  DashboardToExtMessage,
  DashboardSettings,
  AccountInfo,
  ConnectionStatus,
} from './dashboard-message-types.js';

// ─── Platform API ─────────────────────────────────────────────────────────────

const DEV_MODE = false;
const PLATFORM_KEY_SECRET = 'ava-supernova.platformKey';

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

  // ─── Static factory ────────────────────────────────────────────────────────

  public static show(extensionUri: vscode.Uri, context: vscode.ExtensionContext): void {
    const column = vscode.ViewColumn.Beside;

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

      case 'load_memories':
        await this.loadMemories();
        break;

      case 'delete_memory':
        await this.deleteMemory(msg.id);
        break;

      case 'upsert_memory':
        await this.upsertMemory(msg);
        break;

      case 'save_connection':
        await this.saveConnection(msg.service, msg.credentials);
        break;

      case 'remove_connection':
        await this.removeConnection(msg.service);
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
    }
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  private async sendInit(): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    const account = platformKey ? await this.fetchAccount(platformKey) : null;
    const connections = await this.getConnectionStatus();
    const settings = this.readSettings();
    const locale = vscode.workspace.getConfiguration('ava-supernova').get<string>('preferences.language') ?? 'auto';

    this.post({ type: 'init', account, connections, settings, locale });

    // Auto-load memories if signed in
    if (account) {
      await this.loadMemories();
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
    if (DEV_MODE) {
      return {
        id: 'dev-001',
        email: 'dev@ava-supernova.com',
        name: 'Dev User',
        tier: 'pro',
        usage: {
          tokens_used: 1_250_000,
          tokens_limit: 5_000_000,
          requests_count: 42,
          period_start: new Date(Date.now() - 14 * 86400000).toISOString(),
          period_end: new Date(Date.now() + 16 * 86400000).toISOString(),
        },
      };
    }
    try {
      const res = await apiFetch('/account-info', { platformKey });
      if (!res.ok) return null;
      return res.data as AccountInfo;
    } catch {
      return null;
    }
  }

  // ─── Memories ──────────────────────────────────────────────────────────────

  private async loadMemories(): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch('/memories', { platformKey });
      if (res.ok) {
        this.post({ type: 'memories_loaded', memories: res.data as never[] });
      }
    } catch {
      // Non-fatal: just leave memories empty
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
        vscode.env.openExternal(vscode.Uri.parse((res.data as { url: string }).url));
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
        vscode.env.openExternal(vscode.Uri.parse((res.data as { url: string }).url));
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
        vscode.env.openExternal(vscode.Uri.parse((res.data as { url: string }).url));
      } else {
        this.post({ type: 'error', message: 'Failed to open billing portal.' });
      }
    } catch {
      this.post({ type: 'error', message: 'Failed to open billing portal.' });
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
    cfg.update('preferences.streamResponses', settings.streamResponses, vscode.ConfigurationTarget.Global);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private post(msg: ExtToDashboardMessage): void {
    this.panel.webview.postMessage(msg);
  }

  private dispose(): void {
    DashboardPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'dashboard', 'index.js'),
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src 'unsafe-inline';
                 script-src 'nonce-${nonce}';
                 img-src ${webview.cspSource} data:;">
  <title>Ava | Dashboard</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
