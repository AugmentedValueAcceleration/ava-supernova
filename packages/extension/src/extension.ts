import * as vscode from 'vscode';
import * as os from 'node:os';
import * as path from 'node:path';
import { AvaViewProvider } from './webview/AvaViewProvider.js';
import { DocsPanel } from './webview/DocsPanel.js';
import { DashboardPanel } from './webview/DashboardPanel.js';
import { killBackgroundProcesses, TaskManager, AVA_HOME } from '@ava/core';

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

  // Pass task manager to view provider for session task updates
  viewProvider.setTaskManager(taskManager);

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
}

export function deactivate(): void {
  killBackgroundProcesses();
  viewProvider?.dispose();
}
