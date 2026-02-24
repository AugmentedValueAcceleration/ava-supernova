import * as vscode from 'vscode';
import { AvaViewProvider } from './webview/AvaViewProvider.js';
import { DocsPanel } from './webview/DocsPanel.js';
import { killBackgroundProcesses } from '@ava/core';

let viewProvider: AvaViewProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  viewProvider = new AvaViewProvider(context.extensionUri, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AvaViewProvider.viewType,
      viewProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ava-supernova.openChat', () => viewProvider!.openInEditor()),
    vscode.commands.registerCommand('ava-supernova.newChat', () => viewProvider!.newChat()),
    vscode.commands.registerCommand('ava-supernova.clearChat', () => viewProvider!.clearChat()),
    vscode.commands.registerCommand('ava-supernova.switchModel', () => viewProvider!.switchModel()),
    vscode.commands.registerCommand('ava-supernova.showHistory', () => viewProvider!.showHistory()),
    vscode.commands.registerCommand('ava-supernova.openDocs', () => DocsPanel.show(context.extensionUri)),
    vscode.commands.registerCommand('ava-supernova.gettingStarted', () => {
      vscode.commands.executeCommand('workbench.action.openWalkthrough', 'stewai.ava-supernova#ava-supernova.gettingStarted', false);
    }),
  );

  // Auto-open in editor area on activation
  viewProvider.openInEditor();
}

export function deactivate(): void {
  killBackgroundProcesses();
  viewProvider?.dispose();
}
