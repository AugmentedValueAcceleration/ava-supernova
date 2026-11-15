import * as vscode from 'vscode';
import * as path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { readSheetForView } from '@ava/core/authoring/sheet-view';

/**
 * The document viewer, in its OWN editor tab (Documents 1.0 Part 4, his call
 * 15 Nov 2026: "opening a separate tab … the cleaner option"). One tab per
 * file; opening the same file again brings its tab forward.
 *
 * It runs the dashboard's bundle in viewer mode (`data-view="document"`), so
 * the PDF, Word and spreadsheet views are the same code as the IDE's. This
 * host reads the file and hands it over; nothing leaves the computer.
 */

/** Bigger than this opens in their own app — a webview message is not the place for it. */
const MAX_BYTES = 60 * 1024 * 1024;

function nonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

export class DocumentViewerPanel {
  private static readonly open = new Map<string, DocumentViewerPanel>();
  private static readonly viewType = 'ava-supernova.documentViewer';

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  /** Show a document in its own tab. `projectRoot` only shapes the folder label. */
  public static show(extensionUri: vscode.Uri, filePath: string, opts: { projectRoot?: string; locale?: string } = {}): void {
    const key = path.resolve(filePath);
    const existing = DocumentViewerPanel.open.get(key);
    if (existing) { existing.panel.reveal(); return; }
    DocumentViewerPanel.open.set(key, new DocumentViewerPanel(extensionUri, key, opts));
  }

  private constructor(private readonly extensionUri: vscode.Uri, private readonly filePath: string, private readonly opts: { projectRoot?: string; locale?: string }) {
    this.panel = vscode.window.createWebviewPanel(
      DocumentViewerPanel.viewType,
      path.basename(filePath),
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'dashboard')],
      },
    );
    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'dist', 'dashboard', 'icon.png');
    this.panel.webview.html = this.html();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((m) => { void this.onMessage(m); }, null, this.disposables);
  }

  private dispose(): void {
    DocumentViewerPanel.open.delete(this.filePath);
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }

  private folderLabel(): string | undefined {
    const root = this.opts.projectRoot;
    if (!root) return undefined;
    const rel = path.relative(root, path.dirname(this.filePath)).replace(/\\/g, '/');
    return rel && !rel.startsWith('..') ? rel : undefined;
  }

  private async onMessage(m: { type?: string; locale?: string }): Promise<void> {
    switch (m?.type) {
      case 'viewer_ready': await this.sendDocument(); return;
      case 'viewer_open_in_app': await vscode.env.openExternal(vscode.Uri.file(this.filePath)); return;
      case 'viewer_show_in_folder': await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(this.filePath)); return;
      case 'request_locale_strings': {
        const safe = /^[a-zA-Z]{2}(-[a-zA-Z]{2})?$/.test(m.locale ?? '') ? m.locale! : 'en';
        try {
          const raw = await readFile(vscode.Uri.joinPath(this.extensionUri, 'dist', 'locales', `${safe}.json`).fsPath, 'utf8');
          void this.panel.webview.postMessage({ type: 'locale_strings', locale: safe, strings: JSON.parse(raw) });
        } catch {
          void this.panel.webview.postMessage({ type: 'locale_strings', locale: safe, strings: null });
        }
        return;
      }
    }
  }

  private async sendDocument(): Promise<void> {
    const name = path.basename(this.filePath);
    const base = { type: 'viewer_open', name, folder: this.folderLabel(), locale: this.opts.locale };
    const ext = path.extname(name).toLowerCase();
    try {
      const st = await stat(this.filePath);
      if (st.size > MAX_BYTES) {
        void this.panel.webview.postMessage({ ...base, kind: 'other' });
        return;
      }
      if (ext === '.pdf' || ext === '.docx') {
        const bytes = await readFile(this.filePath);
        void this.panel.webview.postMessage({ ...base, kind: ext === '.pdf' ? 'pdf' : 'docx', b64: bytes.toString('base64') });
      } else if (ext === '.xlsx' || ext === '.ods' || ext === '.csv') {
        void this.panel.webview.postMessage({ ...base, kind: 'sheet', sheets: await readSheetForView(this.filePath) });
      } else {
        void this.panel.webview.postMessage({ ...base, kind: 'other' });
      }
    } catch (err) {
      void this.panel.webview.postMessage({ ...base, kind: 'error', message: `This file could not be opened: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  private html(): string {
    const webview = this.panel.webview;
    const distDir = vscode.Uri.joinPath(this.extensionUri, 'dist', 'dashboard');
    const pick = (re: RegExp, fallback: string): string => {
      try { return readdirSync(distDir.fsPath).find((f) => re.test(f)) ?? fallback; } catch { return fallback; }
    };
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distDir, pick(/^index-.*\.js$/, 'index.js')));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distDir, pick(/^index-.*\.css$/, 'index.css')));
    const n = nonce();
    // Same policy as the dashboard, plus fonts from data:/blob: (Word and PDF
    // documents carry their own). 'strict-dynamic' lets the lazy viewer chunk load.
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${webview.cspSource} 'unsafe-inline';
                 script-src 'nonce-${n}' 'strict-dynamic';
                 font-src ${webview.cspSource} data: blob:;
                 connect-src ${webview.cspSource} blob: data:;
                 img-src ${webview.cspSource} data: blob:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>${path.basename(this.filePath).replace(/[<>&"]/g, '')}</title>
</head>
<body>
  <div id="root" data-view="document"></div>
  <script type="module" nonce="${n}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
