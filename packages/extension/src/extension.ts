import * as vscode from 'vscode';
import { AvaViewProvider } from './webview/AvaViewProvider.js';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new AvaViewProvider(context.extensionUri, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AvaViewProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ava-supernova.openChat', () => provider.openInEditor()),
    vscode.commands.registerCommand('ava-supernova.newChat', () => provider.newChat()),
    vscode.commands.registerCommand('ava-supernova.clearChat', () => provider.clearChat()),
    vscode.commands.registerCommand('ava-supernova.switchModel', () => provider.switchModel()),
    vscode.commands.registerCommand('ava-supernova.showHistory', () => provider.showHistory()),
  );

  // Auto-open in editor area on activation
  provider.openInEditor();
}

export function deactivate(): void {
  // cleanup
}
