import * as vscode from 'vscode';
import { getNonce } from '../utils/nonce.js';
import { renderDocsBody, DOCS_CSS, DOCS_SCRIPT } from './docs-html-adapter.js';

// Webview panel host for the Ava Supernova documentation. All rendering is delegated to
// the HTML adapter, which reads the canonical corpus from @ava/core/docs. This file owns
// panel lifecycle and CSP only — no content.

export class DocsPanel {
  public static currentPanel: DocsPanel | undefined;
  private static readonly viewType = 'ava-supernova.docs';

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static show(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (DocsPanel.currentPanel) {
      DocsPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DocsPanel.viewType,
      'Ava | Documentation',
      column,
      { enableScripts: true, localResourceRoots: [extensionUri] },
    );

    DocsPanel.currentPanel = new DocsPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'AvaSupernovaIcon.png');
    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private dispose(): void {
    DocsPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
  }

  private getHtml(): string {
    const nonce = getNonce();
    const body = renderDocsBody();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ava | Documentation</title>
  <style nonce="${nonce}">${DOCS_CSS}</style>
</head>
<body>
${body}
<script nonce="${nonce}">${DOCS_SCRIPT}</script>
</body>
</html>`;
  }
}
