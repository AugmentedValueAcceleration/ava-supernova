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
import type { AvaViewProvider } from './AvaViewProvider.js';
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

    const panel = vscode.window.createWebviewPanel(
      DashboardPanel.viewType,
      'Ava | Supernova',
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'dashboard')],
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
      case 'webview_ready':
        await this.sendInit();
        // Also initialise the chat engine
        if (this.viewProvider) {
          this.viewProvider.initChatForUnifiedPanel().catch((err) => console.error('[Ava] Chat init failed:', err));
        }
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
        this.saveSettings(msg.settings);
        break;

      case 'set_category_permission':
        if ((this.viewProvider as any)?.toolRegistry && (msg as any).category && (msg as any).permission) {
          (this.viewProvider as any).toolRegistry.setCategoryPermission((msg as any).category, (msg as any).permission);
        }
        break;

      case 'request_audit_log':
        this.post({ type: 'audit_log', entries: (this.viewProvider as any)?.auditLog || [] } as any);
        break;

      // ─── Creative Studio generation (proxied through extension host for CORS) ──
      case 'creative_generate': {
        const m = msg as any;
        this.handleCreativeGenerate(m.endpoint, m.body).catch(() => {});
        break;
      }

      case 'open_chat':
        vscode.commands.executeCommand('ava-supernova.openChat');
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

      case 'load_admin_conversations':
        await this.loadAdminConversations(msg.status, msg.needsHuman);
        break;

      case 'load_admin_conversation_messages':
        await this.loadAdminConversationMessages(msg.conversationId);
        break;

      case 'admin_reply_conversation':
        await this.adminReplyConversation(msg.conversationId, msg.message);
        break;

      case 'admin_update_conversation':
        await this.adminUpdateConversation(msg.conversationId, msg.status, msg.needs_human);
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
          const platformKey = this.context.globalState.get<string>('ava.platformKey');
          if (platformKey) {
            const res = await apiFetch(url, { platformKey });
            this.postMessage({ type: 'library_paths_loaded', paths: res.paths || [], total: res.total || 0 });
          } else {
            // Direct public fetch for BYOK users
            const res = await fetch(`https://ava-supernova.com/api${url}`);
            const data = await res.json();
            this.postMessage({ type: 'library_paths_loaded', paths: data.paths || [], total: data.total || 0 });
          }
        } catch {
          this.postMessage({ type: 'library_paths_loaded', paths: [], total: 0 });
        }
        break;
      }

      case 'load_library_path_detail': {
        try {
          const res = await fetch(`https://ava-supernova.com/api/learning/library/${msg.id}`);
          const data = await res.json();
          if (data && data.id) {
            this.postMessage({ type: 'library_path_detail_loaded', path: data });
          }
        } catch { /* non-fatal */ }
        break;
      }

      case 'fork_library_path': {
        const platformKey = this.context.globalState.get<string>('ava.platformKey');
        if (!platformKey) {
          this.postMessage({ type: 'error', message: 'Connect your Ava account to start learning paths from the library.' });
          break;
        }
        try {
          const res = await apiFetch(`/learning/library/${msg.id}/fork`, { method: 'POST', platformKey });
          this.postMessage({ type: 'library_path_forked', curriculumId: res.curriculum_id, title: res.message || 'Started!' });
        } catch (err: any) {
          this.postMessage({ type: 'error', message: err.message || 'Failed to fork learning path' });
        }
        break;
      }

      case 'publish_to_library': {
        const platformKey = this.context.globalState.get<string>('ava.platformKey');
        if (!platformKey) {
          this.postMessage({ type: 'error', message: 'Connect your Ava account to publish learning paths.' });
          break;
        }
        try {
          const res = await apiFetch('/learning/library', { method: 'POST', body: { curriculum_id: msg.curriculumId }, platformKey });
          this.postMessage({ type: 'library_path_published', pathId: res.id, status: res.status, message: res.message });
        } catch (err: any) {
          this.postMessage({ type: 'error', message: err.message || 'Failed to publish' });
        }
        break;
      }

      case 'rate_library_path': {
        const platformKey = this.context.globalState.get<string>('ava.platformKey');
        if (!platformKey) break;
        try {
          await apiFetch(`/learning/library/${msg.id}/rate`, { method: 'POST', body: { rating: msg.rating }, platformKey });
          this.postMessage({ type: 'library_path_rated', pathId: msg.id, rating: msg.rating });
        } catch { /* non-fatal */ }
        break;
      }

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

      case 'download_asset': {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && msg.path) {
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
        if (workspaceFolders) {
          const projectRoot = workspaceFolders[0].uri.fsPath;
          const docsDir = path.join(projectRoot, 'documents');
          const filePath = path.join(docsDir, msg.filename);
          try {
            await fs.mkdir(docsDir, { recursive: true });
            const ext = path.extname(msg.filename).toLowerCase();
            if (ext === '.docx') {
              try {
                const { Document, Packer, Paragraph } = await import('docx');
                const doc = new Document({ sections: [{ children: [new Paragraph({ text: '' })] }] });
                const buf = await Packer.toBuffer(doc);
                await fs.writeFile(filePath, buf);
              } catch {
                await fs.writeFile(filePath, '');
              }
            } else if (ext === '.xlsx') {
              try {
                const ExcelJS = await import('exceljs');
                const wb = new ExcelJS.default.Workbook();
                wb.addWorksheet('Sheet1');
                await wb.xlsx.writeFile(filePath);
              } catch {
                await fs.writeFile(filePath, '');
              }
            } else if (ext === '.pptx') {
              try {
                const PptxGenJS = (await import('pptxgenjs')).default;
                const pptx = new PptxGenJS();
                pptx.addSlide();
                const buf = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
                await fs.writeFile(filePath, buf);
              } catch {
                await fs.writeFile(filePath, '');
              }
            } else if (ext === '.csv') {
              await fs.writeFile(filePath, 'Column1,Column2,Column3\n');
            } else if (ext === '.md') {
              await fs.writeFile(filePath, `# ${path.basename(msg.filename, ext)}\n\n`);
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
              } catch {
                await fs.writeFile(filePath, '');
              }
            } else {
              await fs.writeFile(filePath, '');
            }
            this.post({ type: 'info', message: `Created documents/${msg.filename}` });
            await vscode.workspace.openTextDocument(vscode.Uri.file(filePath)).then(doc => vscode.window.showTextDocument(doc));
            await this.loadLibraryFiles();
          } catch (err: any) {
            this.post({ type: 'error', message: `Failed to create document: ${err.message}` });
          }
        }
        break;
      }
      case 'create_from_template': {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && this.toolRegistry) {
          const projectRoot = workspaceFolders[0].uri.fsPath;
          const filePath = path.join('documents', msg.filename);
          try {
            const tool = this.toolRegistry.getTool('document_manage');
            if (tool) {
              await tool.execute({
                action: 'from_template',
                template: msg.template,
                file_path: filePath,
                format: 'docx',
              }, { cwd: projectRoot, sharedState: {} });
              this.post({ type: 'info', message: `Created documents/${msg.filename} from ${msg.template} template` });
              const absPath = path.join(projectRoot, filePath);
              await vscode.workspace.openTextDocument(vscode.Uri.file(absPath)).then(doc => vscode.window.showTextDocument(doc));
              await this.loadLibraryFiles();
            }
          } catch (err: any) {
            this.post({ type: 'error', message: `Failed to create from template: ${err.message}` });
          }
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
          await vscode.env.openExternal(vscode.Uri.file(fullPath));
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
    const account = platformKey ? await this.fetchAccount(platformKey) : null;
    const connections = await this.getConnectionStatus();
    const settings = this.readSettings();
    const providerKeys = await this.getProviderKeyStatus();
    const locale = vscode.workspace.getConfiguration('ava-supernova').get<string>('preferences.language') ?? 'auto';

    this.post({ type: 'init', account, connections, settings, providerKeys, locale, platformKey: platformKey || undefined });

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

      // Free tier: show free pool only. Paid tiers: show subscription pool (free pool is bonus).
      const hasSub = summary.period.tokens_limit !== null && summary.period.tokens_limit > 0 && summary.tier !== 'free';
      const balance = {
        used: hasSub ? summary.period.tokens_used : summary.period.free_tokens_used,
        limit: hasSub ? summary.period.tokens_limit! : summary.period.free_tokens_limit,
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
      this.post({ type: 'conversations_loaded', conversations: res.ok ? (res.data as any[]) : [] });
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

  // ─── Admin Support Conversations (new schema) ─────────────────────────────

  private async loadAdminConversations(status?: string, needsHuman?: boolean): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) {
      this.post({ type: 'admin_conversations_loaded', conversations: [] });
      return;
    }

    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (needsHuman) params.set('needs_human', 'true');
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await apiFetch(`/support/conversations/admin${qs}`, { platformKey });
      if (res.ok) {
        const data = res.data as { conversations: unknown[] };
        this.post({ type: 'admin_conversations_loaded', conversations: (data.conversations as never[]) || [] });
      } else {
        this.post({ type: 'admin_conversations_loaded', conversations: [] });
      }
    } catch (err) {
      this.log(`loadAdminConversations failed: ${err instanceof Error ? err.message : String(err)}`);
      this.post({ type: 'admin_conversations_loaded', conversations: [] });
    }
  }

  private async loadAdminConversationMessages(conversationId: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch(`/support/conversations/${conversationId}/messages`, { platformKey });
      if (res.ok) {
        const data = res.data as { messages: unknown[] };
        this.post({
          type: 'admin_conversation_messages_loaded',
          conversationId,
          messages: (data.messages as never[]) || [],
        });
      } else {
        this.post({ type: 'error', message: 'Failed to load conversation messages.' });
      }
    } catch (err) {
      this.log(`loadAdminConversationMessages failed: ${err instanceof Error ? err.message : String(err)}`);
      this.post({ type: 'error', message: 'Failed to load conversation messages.' });
    }
  }

  private async adminReplyConversation(conversationId: string, message: string): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const res = await apiFetch(`/support/conversations/${conversationId}/admin-reply`, {
        method: 'POST',
        body: { message },
        platformKey,
      });
      if (res.ok) {
        this.post({ type: 'admin_conversation_updated', conversationId });
        // Reload messages so the UI shows the new reply
        await this.loadAdminConversationMessages(conversationId);
      } else {
        this.post({ type: 'error', message: 'Failed to send admin reply.' });
      }
    } catch (err) {
      this.log(`adminReplyConversation failed: ${err instanceof Error ? err.message : String(err)}`);
      this.post({ type: 'error', message: 'Failed to send admin reply.' });
    }
  }

  private async adminUpdateConversation(conversationId: string, status?: string, needsHuman?: boolean): Promise<void> {
    const platformKey = await this.secrets.get(PLATFORM_KEY_SECRET);
    if (!platformKey) return;

    try {
      const body: Record<string, unknown> = {};
      if (status) body.status = status;
      if (typeof needsHuman === 'boolean') body.needs_human = needsHuman;
      const res = await apiFetch(`/support/conversations/${conversationId}`, {
        method: 'PATCH',
        body,
        platformKey,
      });
      if (res.ok) {
        this.post({ type: 'admin_conversation_updated', conversationId });
      } else {
        this.post({ type: 'error', message: 'Failed to update conversation.' });
      }
    } catch (err) {
      this.log(`adminUpdateConversation failed: ${err instanceof Error ? err.message : String(err)}`);
      this.post({ type: 'error', message: 'Failed to update conversation.' });
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
  // getter which delegates to AvaViewProvider's account-scoping logic.

  private getUserDataDir(): string {
    return this.viewProvider?.getAccountScopedDir() ?? AVA_HOME;
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
      const PRESENTATION_EXTENSIONS = new Set(['.pptx', '.ppt']);

      type FileType = 'image' | 'video' | 'audio' | 'document' | 'spreadsheet' | 'presentation';

      const getFileType = (ext: string): FileType | null => {
        if (IMAGE_EXTENSIONS.has(ext)) return 'image';
        if (VIDEO_EXTENSIONS.has(ext)) return 'video';
        if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
        if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';
        if (SPREADSHEET_EXTENSIONS.has(ext)) return 'spreadsheet';
        if (PRESENTATION_EXTENSIONS.has(ext)) return 'presentation';
        return null;
      };

      const ALL_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS, ...DOCUMENT_EXTENSIONS, ...SPREADSHEET_EXTENSIONS, ...PRESENTATION_EXTENSIONS]);

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

            const item: typeof files[number] = {
              path: relativePath,
              name: entry.name,
              folder: relativeFolder || (dir === imagesDir ? 'images' : 'documents'),
              size: stat.size,
              modified: stat.mtime.toISOString(),
              fileType,
            };

            // Send base64 data for images + audio (webviews block file:// URLs)
            // Images: 5MB cap. Audio: 10MB cap. Video: skip (too large for base64).
            if (fileType === 'image' && stat.size <= 5 * 1024 * 1024) {
              const fileBuffer = await fs.readFile(fullPath);
              const mimeTypes: Record<string, string> = {
                '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
                '.ico': 'image/x-icon', '.bmp': 'image/bmp',
              };
              item.dataUri = `data:${mimeTypes[ext] || 'image/png'};base64,${fileBuffer.toString('base64')}`;
            } else if (fileType === 'audio' && stat.size <= 10 * 1024 * 1024) {
              const fileBuffer = await fs.readFile(fullPath);
              const audioMimes: Record<string, string> = {
                '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
              };
              item.dataUri = `data:${audioMimes[ext] || 'audio/mpeg'};base64,${fileBuffer.toString('base64')}`;
            }

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
      const raw = await fs.readFile(path.join(this.getUserDataDir(), 'sync-state.json'), 'utf-8');
      return JSON.parse(raw);
    } catch { return {}; }
  }

  private async scanCreativeDir(dir: string, projectRoot: string): Promise<Array<{ absolutePath: string; relativePath: string; type: string }>> {
    const fsLib = await import('node:fs/promises');
    const results: Array<{ absolutePath: string; relativePath: string; type: string }> = [];
    const exts: Record<string, string> = {
      '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image', '.svg': 'image',
      '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio',
      '.mp4': 'video', '.webm': 'video',
    };
    try {
      const entries = await fsLib.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          results.push(...await this.scanCreativeDir(full, projectRoot));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          const type = exts[ext];
          if (type) results.push({ absolutePath: full, relativePath: path.relative(projectRoot, full).replace(/\\/g, '/'), type });
        }
      }
    } catch { /* dir doesn't exist */ }
    return results;
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
    const types = ['memory', 'tasks', 'journal', 'learning', 'history', 'settings', 'personality', 'creative'] as const;
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
          const raw = await fs.readFile(path.join(this.getUserDataDir(), 'memory.json'), 'utf-8');
          const store = JSON.parse(raw);
          const entries = store.entries || [];
          await sync.pushEntries('global', entries);
          await this.saveSyncState('memory', entries.length);
          this.post({ type: 'sync_completed', dataType, count: entries.length });
          await this.loadSyncStatus();
          break;
        }

        case 'tasks': {
          const raw = await fs.readFile(path.join(this.getUserDataDir(), 'tasks.json'), 'utf-8');
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
          const raw = await fs.readFile(path.join(this.getUserDataDir(), 'learning.json'), 'utf-8');
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

        case 'creative': {
          // Sync local creative asset files to cloud storage
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (!workspaceFolders) {
            this.post({ type: 'sync_completed', dataType, count: 0 });
            break;
          }
          const projectRoot = workspaceFolders[0].uri.fsPath;
          const creativeDirs = [
            path.join(projectRoot, 'images'),
            path.join(projectRoot, '.ava', 'creative'),
          ];
          let uploadCount = 0;
          for (const dir of creativeDirs) {
            try {
              const entries = await this.scanCreativeDir(dir, projectRoot);
              for (const entry of entries) {
                try {
                  const buf = await fs.readFile(entry.absolutePath);
                  if (buf.length > 10 * 1024 * 1024) continue; // Skip files > 10MB
                  // Upload via platform API
                  const base64 = buf.toString('base64');
                  const res = await apiFetch('/sync/creative', {
                    platformKey,
                    method: 'POST',
                    body: { path: entry.relativePath, data: base64, type: entry.type, size: buf.length },
                  });
                  if (res.ok) uploadCount++;
                } catch { /* skip individual file failures */ }
              }
            } catch { /* dir doesn't exist */ }
          }
          await this.saveSyncState('creative', uploadCount);
          this.post({ type: 'sync_completed', dataType, count: uploadCount });
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
      const res = await fetch(`https://ava-supernova.com/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${platformKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
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
                 media-src data: https: blob:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Ava | Dashboard</title>
</head>
<body>
  <div id="root" data-icon-uri="${iconUri}"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
