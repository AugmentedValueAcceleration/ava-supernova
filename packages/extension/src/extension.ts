import * as vscode from 'vscode';
import * as os from 'node:os';
import * as path from 'node:path';
import { AvaViewProvider } from './webview/AvaViewProvider.js';
import { DocsPanel } from './webview/DocsPanel.js';
import { DashboardPanel } from './webview/DashboardPanel.js';
import { DocumentPreviewPanel } from './webview/DocumentPreviewPanel.js';
import {
  killBackgroundProcesses,
  TaskManager,
  JournalManager,
  AVA_HOME,
  installDatasetConsumer,
} from '@ava/core';

let viewProvider: AvaViewProvider | undefined;

const PANEL_STATE_KEY = 'avaSupernova.panelOpen';
const DASHBOARD_STATE_KEY = 'avaSupernova.dashboardOpen';

export function activate(context: vscode.ExtensionContext): void {
  try {
  // Install the dataset capture consumer once at activation. No-op for
  // any user who hasn't opted in via ~/.ava/datasets/config.json — defaults
  // are all-off, so this is just opening the subscription. When the user
  // toggles capture on, events start landing without restarting VS Code.
  installDatasetConsumer();

  // Defensive vault hygiene: older builds briefly stored the platform key
  // in plaintext globalState. Evict any stragglers so SecretStorage stays
  // the single source of truth. Safe no-op when the key was never written.
  if (context.globalState.get('ava.platformKey') !== undefined) {
    context.globalState.update('ava.platformKey', undefined);
  }

  viewProvider = new AvaViewProvider(context.extensionUri, context);

  // Task Manager (shared instance)
  const globalDir = AVA_HOME ?? path.join(os.homedir(), '.ava');
  const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const taskManager = new TaskManager({ globalDir, projectRoot });

  // Keep sidebar registration for backwards compat (will still work if user prefers sidebar)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AvaViewProvider.viewType,
      viewProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // OAuth sign-in URI handler — catches vscode://augmentedvalueacceleration.ava-supernova/auth
  // callbacks from the website's device authorization flow and delegates
  // to AvaViewProvider.handleSignInCallback for state validation, code
  // exchange, and platform key storage.
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri: async (uri: vscode.Uri) => {
        // Log every callback the OS routes to us so a stuck sign-in can
        // be diagnosed from the Output panel ("Ava Supernova" channel)
        // without needing to attach a debugger.
        console.log('[Ava] URI callback received:', uri.toString());
        try {
          // Only handle the /auth path — leave room for future URI-handled
          // actions (e.g. deep-linking a conversation, opening a specific
          // memory, etc.) without touching this block
          if (uri.path === '/auth') {
            if (!viewProvider) {
              vscode.window.showErrorMessage('Ava Supernova — view provider not ready. Reload the window and try again.');
              return;
            }
            const consumed = await viewProvider.handleSignInCallback(uri);
            console.log('[Ava] Sign-in callback consumed:', consumed);
            if (consumed) {
              // Surface a small notification so the user knows VS Code
              // received the callback even if they can't immediately see
              // the chat webview
              vscode.window.showInformationMessage('Ava Supernova — signed in successfully.');
            } else {
              // Stale or unknown callback — surface a clear hint so the
              // user isn't left wondering whether the click landed.
              vscode.window.showWarningMessage('Ava Supernova — sign-in callback ignored (state mismatch or no pending sign-in). Try signing in again.');
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Ava sign-in callback failed: ${message}`);
        }
      },
    }),
  );

  // Journal Manager (shared instance)
  const journalManager = new JournalManager({ globalDir, projectRoot });

  // Pass managers to view provider
  viewProvider.setTaskManager(taskManager);
  viewProvider.setJournalManager(journalManager);

  /** Open the unified panel (dashboard + chat in one editor tab) */
  const openUnifiedPanel = () => {
    DashboardPanel.show(context.extensionUri, context, viewProvider);
    context.globalState.update(DASHBOARD_STATE_KEY, true);
  };

  context.subscriptions.push(
    // Primary action — Ava icon opens the unified panel
    vscode.commands.registerCommand('ava-supernova.openChat', openUnifiedPanel),
    vscode.commands.registerCommand('ava-supernova.focusInput', () => viewProvider!.focusInput()),
    vscode.commands.registerCommand('ava-supernova.newChat', () => viewProvider!.newChat()),
    vscode.commands.registerCommand('ava-supernova.clearChat', () => viewProvider!.clearChat()),
    vscode.commands.registerCommand('ava-supernova.switchModel', () => viewProvider!.switchModel()),
    vscode.commands.registerCommand('ava-supernova.showHistory', () => viewProvider!.showHistory()),
    vscode.commands.registerCommand('ava-supernova.openDocs', () => DocsPanel.show(context.extensionUri)),
    vscode.commands.registerCommand('ava-supernova.openDashboard', openUnifiedPanel),
    vscode.commands.registerCommand('ava-supernova.previewDocument', async (resourceUri?: vscode.Uri) => {
      // Accept URI from explorer context menu, editor title bar, or let user pick
      let uri = resourceUri ?? vscode.window.activeTextEditor?.document.uri;
      if (!uri) {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectMany: false,
          filters: { 'Documents': ['md', 'txt', 'csv', 'html', 'docx', 'xlsx', 'pdf'] },
          openLabel: 'Preview',
        });
        if (!uris || uris.length === 0) return;
        uri = uris[0];
      }
      const ext = uri.fsPath.split('.').pop()?.toLowerCase();
      const fileName = uri.fsPath.split(/[/\\]/).pop() || 'Document';

      // Binary formats — extract text and render in preview panel
      if (ext === 'docx') {
        try {
          const mammoth = require('mammoth');
          const result = await mammoth.convertToHtml({ path: uri.fsPath });
          DocumentPreviewPanel.show(context.extensionUri, {
            title: fileName,
            type: 'document',
            content: result.value || 'Empty document',
            filePath: uri.fsPath,
            metadata: { rawHtml: true },
          });
        } catch {
          DocumentPreviewPanel.show(context.extensionUri, {
            title: fileName,
            type: 'document',
            content: `# ${fileName}\n\nWord document preview requires the mammoth package.\n\nRun: \`npm install mammoth\` in the extension directory, or ask Ava to read the file with the \`document_manage\` tool.`,
            filePath: uri.fsPath,
          });
        }
        return;
      }

      if (ext === 'xlsx' || ext === 'csv') {
        try {
          if (ext === 'csv') {
            const raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
            const lines = raw.split('\n').filter(l => l.trim());
            const headers = lines[0]?.split(',').map(h => h.trim()) || [];
            const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim()));
            let table = `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n`;
            for (const row of rows.slice(0, 100)) {
              table += `| ${row.join(' | ')} |\n`;
            }
            if (rows.length > 100) table += `\n*...and ${rows.length - 100} more rows*`;
            DocumentPreviewPanel.show(context.extensionUri, {
              title: fileName,
              type: 'document',
              content: `# ${fileName}\n\n${table}`,
              filePath: uri.fsPath,
            });
          } else {
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(uri.fsPath);
            const parts: string[] = [`# ${fileName}\n`];
            workbook.eachSheet((sheet: any) => {
              parts.push(`## ${sheet.name}\n`);
              const rows: string[][] = [];
              sheet.eachRow((row: any) => {
                rows.push(row.values.slice(1).map((v: any) => String(v ?? '')));
              });
              if (rows.length > 0) {
                const headers = rows[0];
                parts.push(`| ${headers.join(' | ')} |`);
                parts.push(`| ${headers.map(() => '---').join(' | ')} |`);
                for (const row of rows.slice(1, 101)) {
                  parts.push(`| ${row.join(' | ')} |`);
                }
                if (rows.length > 101) parts.push(`\n*...and ${rows.length - 101} more rows*`);
              }
              parts.push('');
            });
            DocumentPreviewPanel.show(context.extensionUri, {
              title: fileName,
              type: 'document',
              content: parts.join('\n'),
              filePath: uri.fsPath,
            });
          }
        } catch {
          DocumentPreviewPanel.show(context.extensionUri, {
            title: fileName,
            type: 'document',
            content: `# ${fileName}\n\nExcel preview requires the exceljs package.\n\nRun: \`npm install exceljs\` in the extension directory, or ask Ava to read the file with the \`document_manage\` tool.`,
            filePath: uri.fsPath,
          });
        }
        return;
      }

      if (ext === 'pdf') {
        try {
          const pdfParse = require('pdf-parse');
          const buffer = Buffer.from(await vscode.workspace.fs.readFile(uri));
          const data = await pdfParse(buffer);
          DocumentPreviewPanel.show(context.extensionUri, {
            title: fileName,
            type: 'document',
            content: `# ${fileName}\n\n*${data.numpages} pages*\n\n${data.text}`,
            filePath: uri.fsPath,
          });
        } catch {
          DocumentPreviewPanel.show(context.extensionUri, {
            title: fileName,
            type: 'document',
            content: `# ${fileName}\n\nPDF preview requires the pdf-parse package.\n\nRun: \`npm install pdf-parse\` in the extension directory, or ask Ava to read the file with the \`document_manage\` tool.`,
            filePath: uri.fsPath,
          });
        }
        return;
      }

      // Text-based formats — render directly in preview panel
      const content = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(content).toString('utf-8');

      // Detect type from content
      let type: 'email' | 'report' | 'markdown' = 'markdown';
      if (text.includes('**To:**') || text.includes('**Subject:**')) type = 'email';
      else if (text.includes('Weekly Status Report') || text.includes('Sprint Review') || text.includes('Board Brief')) type = 'report';

      DocumentPreviewPanel.show(context.extensionUri, {
        title: fileName,
        type,
        content: text,
        filePath: uri.fsPath,
      });
    }),
  );

  // Track panel open/close state for persistence across restarts
  viewProvider.onPanelStateChange((isOpen) => {
    context.globalState.update(PANEL_STATE_KEY, isOpen);
  });

  // Track dashboard close
  DashboardPanel.onDidDispose(() => {
    context.globalState.update(DASHBOARD_STATE_KEY, false);
  });

  // Restore the unified panel after a short delay so VS Code's Welcome tab doesn't steal focus
  const wasOpen = context.globalState.get<boolean>(PANEL_STATE_KEY, false);
  const dashboardWasOpen = context.globalState.get<boolean>(DASHBOARD_STATE_KEY, false);

  if (wasOpen || dashboardWasOpen) {
    setTimeout(() => {
      openUnifiedPanel();
    }, 1500);
  }


  // ── Release notes on version change ──────────────────────────────────────
  checkForReleaseNotes(context);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Ava] ACTIVATION FAILED:', msg, err);
    vscode.window.showErrorMessage(`Ava failed to activate: ${msg}`);
  }
}

const LAST_VERSION_KEY = 'avaSupernova.lastSeenVersion';

async function checkForReleaseNotes(context: vscode.ExtensionContext): Promise<void> {
  const ext = vscode.extensions.getExtension('augmentedvalueacceleration.ava-supernova');
  if (!ext) return;

  const currentVersion = ext.packageJSON.version as string;
  const lastSeen = context.globalState.get<string>(LAST_VERSION_KEY);

  // First install or same version — skip
  if (!lastSeen) {
    // First install — store version, don't show notes
    await context.globalState.update(LAST_VERSION_KEY, currentVersion);
    return;
  }

  if (lastSeen === currentVersion) return;

  // Version changed — fetch and show release notes. 5s timeout guards
  // activation against slow / blocked networks; previous unbounded
  // fetch could hang the extension on cold start indefinitely.
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(`https://ava-supernova.com/api/releases?version=${currentVersion}`, { signal: ctrl.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      // No release notes for this version — just update stored version
      await context.globalState.update(LAST_VERSION_KEY, currentVersion);
      return;
    }

    const release = (await res.json()) as {
      version: string;
      title: string;
      body: string;
      highlights: string[];
      tool_count: number;
    };
    await context.globalState.update(LAST_VERSION_KEY, currentVersion);

    // Show release notes as an information message with option to view
    const action = await vscode.window.showInformationMessage(
      `Ava Supernova updated to v${currentVersion} — ${release.title}`,
      'View Release Notes',
      'Dismiss',
    );

    if (action === 'View Release Notes') {
      showReleaseNotesPanel(release);
    }
  } catch {
    // Network error — don't update stored version so we retry next activation
  }
}

function showReleaseNotesPanel(
  release: { version: string; title: string; body: string; highlights: string[]; tool_count: number },
): void {
  const panel = vscode.window.createWebviewPanel(
    'ava-supernova.releaseNotes',
    `Ava v${release.version} — ${release.title}`,
    vscode.ViewColumn.One,
    { enableScripts: false },
  );

  // Escape HTML to prevent XSS from API data
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const highlights = release.highlights
    .map((h: string) => `<li>${esc(h)}</li>`)
    .join('');

  // Convert markdown-ish body to HTML (basic, after escaping)
  const bodyHtml = esc(release.body)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code>$1</code>');

  panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 2rem;
      max-width: 700px;
      margin: 0 auto;
      line-height: 1.6;
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .version { color: var(--vscode-descriptionForeground); font-size: 0.85rem; margin-bottom: 1.5rem; }
    .highlights {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 1.5rem;
    }
    .highlights h3 { margin: 0 0 0.5rem; font-size: 0.9rem; }
    .highlights ul { margin: 0; padding-left: 1.25rem; }
    .highlights li { margin-bottom: 0.25rem; font-size: 0.85rem; }
    .body { font-size: 0.9rem; }
    .body p { margin-bottom: 1rem; }
    .body code {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 0.15rem 0.35rem;
      border-radius: 3px;
      font-size: 0.85em;
    }
    .tool-count {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 0.15rem 0.5rem;
      border-radius: 10px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-left: 0.5rem;
    }
  </style>
</head>
<body>
  <h1>${esc(release.title)} <span class="tool-count">${release.tool_count} tools</span></h1>
  <div class="version">v${esc(release.version)}</div>

  <div class="highlights">
    <h3>Highlights</h3>
    <ul>${highlights}</ul>
  </div>

  <div class="body"><p>${bodyHtml}</p></div>
</body>
</html>`;
}

export function deactivate(): void {
  killBackgroundProcesses();
  viewProvider?.dispose();
}
