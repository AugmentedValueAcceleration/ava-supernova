import * as vscode from 'vscode';
import * as os from 'node:os';
import * as path from 'node:path';
import { AvaViewProvider } from './webview/AvaViewProvider.js';
import { DocsPanel } from './webview/DocsPanel.js';
import { DashboardPanel } from './webview/DashboardPanel.js';
import { killBackgroundProcesses, TaskManager, JournalManager, AVA_HOME } from '@ava/core';

let viewProvider: AvaViewProvider | undefined;

const PANEL_STATE_KEY = 'avaSupernova.panelOpen';

export function activate(context: vscode.ExtensionContext): void {
  viewProvider = new AvaViewProvider(context.extensionUri, context);

  // Task Manager (shared instance)
  const globalDir = AVA_HOME ?? path.join(os.homedir(), '.ava');
  const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const taskManager = new TaskManager({ globalDir, projectRoot });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AvaViewProvider.viewType,
      viewProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // Journal Manager (shared instance)
  const journalManager = new JournalManager({ globalDir, projectRoot });

  // Pass managers to view provider
  viewProvider.setTaskManager(taskManager);
  viewProvider.setJournalManager(journalManager);

  context.subscriptions.push(
    vscode.commands.registerCommand('ava-supernova.openChat', () => viewProvider!.openInEditor()),
    vscode.commands.registerCommand('ava-supernova.newChat', () => viewProvider!.newChat()),
    vscode.commands.registerCommand('ava-supernova.clearChat', () => viewProvider!.clearChat()),
    vscode.commands.registerCommand('ava-supernova.switchModel', () => viewProvider!.switchModel()),
    vscode.commands.registerCommand('ava-supernova.showHistory', () => viewProvider!.showHistory()),
    vscode.commands.registerCommand('ava-supernova.openDocs', () => DocsPanel.show(context.extensionUri)),
    vscode.commands.registerCommand('ava-supernova.openDashboard', () => DashboardPanel.show(context.extensionUri, context)),
  );

  // Restore panel if it was open in the previous session (default: open on first install)
  const wasOpen = context.globalState.get<boolean>(PANEL_STATE_KEY, true);
  if (wasOpen) {
    viewProvider.openInEditor();
  }

  // Track panel open/close state for persistence across restarts
  viewProvider.onPanelStateChange((isOpen) => {
    context.globalState.update(PANEL_STATE_KEY, isOpen);
  });

  // ── Release notes on version change ──────────────────────────────────────
  checkForReleaseNotes(context);
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

  // Version changed — fetch and show release notes
  try {
    const res = await fetch(`https://ava-supernova.com/api/releases?version=${currentVersion}`);
    if (!res.ok) {
      // No release notes for this version — just update stored version
      await context.globalState.update(LAST_VERSION_KEY, currentVersion);
      return;
    }

    const release = await res.json();
    await context.globalState.update(LAST_VERSION_KEY, currentVersion);

    // Show release notes as an information message with option to view
    const action = await vscode.window.showInformationMessage(
      `Ava | Supernova updated to v${currentVersion} — ${release.title}`,
      'View Release Notes',
      'Dismiss',
    );

    if (action === 'View Release Notes') {
      showReleaseNotesPanel(context, release);
    }
  } catch {
    // Network error — don't update stored version so we retry next activation
  }
}

function showReleaseNotesPanel(
  context: vscode.ExtensionContext,
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
