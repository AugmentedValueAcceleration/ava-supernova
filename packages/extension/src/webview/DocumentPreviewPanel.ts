import * as vscode from 'vscode';
import { getNonce } from '../utils/nonce.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DocumentPreview {
  /** Display title for the tab. */
  title: string;
  /** Document type for layout selection. */
  type: 'email' | 'report' | 'markdown' | 'document';
  /** Raw content (markdown). */
  content: string;
  /** File path where the document was saved. */
  filePath?: string;
  /** Additional metadata for type-specific rendering. */
  metadata?: Record<string, unknown>;
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export class DocumentPreviewPanel {
  public static currentPanel: DocumentPreviewPanel | undefined;
  private static readonly viewType = 'ava-supernova.documentPreview';

  private readonly panel: vscode.WebviewPanel;
  private documents: DocumentPreview[] = [];
  private activeIndex = 0;
  private disposables: vscode.Disposable[] = [];

  // ── Static factory ──────────────────────────────────────────────────────────

  /** Show a document in the preview panel. Creates the panel if needed.
   *  `_extensionUri` is accepted for call-site parity with other panel
   *  factories but isn't currently needed (no webview-local assets). */
  public static show(_extensionUri: vscode.Uri, doc: DocumentPreview): void {
    if (DocumentPreviewPanel.currentPanel) {
      // Update in place when the same file is re-previewed (live editing),
      // otherwise add a tab. Don't steal focus on an update — the writer is
      // working in the chat; the preview refreshes beside them.
      DocumentPreviewPanel.currentPanel.upsertDocument(doc);
      DocumentPreviewPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside, true);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DocumentPreviewPanel.viewType,
      `Preview: ${doc.title}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    DocumentPreviewPanel.currentPanel = new DocumentPreviewPanel(panel, doc);
  }

  // ── Constructor ─────────────────────────────────────────────────────────────

  private constructor(panel: vscode.WebviewPanel, doc: DocumentPreview) {
    this.panel = panel;
    this.documents = [doc];
    this.activeIndex = 0;

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.updatePanel();
  }

  // ── Public ──────────────────────────────────────────────────────────────────

  /** Add a document to the preview (creates a tab). */
  public addDocument(doc: DocumentPreview): void {
    this.documents.push(doc);
    this.activeIndex = this.documents.length - 1;
    this.panel.title = `Preview: ${doc.title}`;
    this.updatePanel();
  }

  /** Update the tab for this file if it's already open (live editing), else add
   *  a new tab. Keyed by filePath so re-rendering a document Ava is editing
   *  refreshes in place instead of stacking duplicates. */
  public upsertDocument(doc: DocumentPreview): void {
    const idx = doc.filePath ? this.documents.findIndex(d => d.filePath && d.filePath === doc.filePath) : -1;
    if (idx >= 0) {
      this.documents[idx] = doc;
      this.activeIndex = idx;
    } else {
      this.documents.push(doc);
      this.activeIndex = this.documents.length - 1;
    }
    this.panel.title = `Preview: ${doc.title}`;
    this.updatePanel();
  }

  // ── Message handling ────────────────────────────────────────────────────────

  private handleMessage(msg: { type: string; index?: number }): void {
    switch (msg.type) {
      case 'switch_tab':
        if (typeof msg.index === 'number' && msg.index >= 0 && msg.index < this.documents.length) {
          this.activeIndex = msg.index;
          this.panel.title = `Preview: ${this.documents[this.activeIndex].title}`;
          this.updatePanel();
        }
        break;
      case 'open_file':
        if (this.documents[this.activeIndex]?.filePath) {
          vscode.commands.executeCommand('vscode.open', vscode.Uri.file(this.documents[this.activeIndex].filePath!));
        }
        break;
      case 'copy':
        if (this.documents[this.activeIndex]) {
          vscode.env.clipboard.writeText(this.documents[this.activeIndex].content);
          vscode.window.showInformationMessage('Document copied to clipboard.');
        }
        break;
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  private updatePanel(): void {
    this.panel.webview.html = this.getHtml();
  }

  private getHtml(): string {
    const nonce = getNonce();
    const doc = this.documents[this.activeIndex];
    const renderedContent = this.renderDocument(doc);

    const tabs = this.documents.length > 1
      ? this.documents.map((d, i) => `
        <button
          class="tab ${i === this.activeIndex ? 'active' : ''}"
          onclick="switchTab(${i})"
        >${this.escHtml(d.title)}</button>
      `).join('')
      : '';

    const typeBadge = doc.type !== 'markdown'
      ? `<span class="badge badge-${doc.type}">${doc.type}</span>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Preview: ${this.escHtml(doc.title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, system-ui, -apple-system, sans-serif);
      color: var(--vscode-foreground, #ccc);
      background: var(--vscode-editor-background, #1e1e1e);
      padding: 0;
      line-height: 1.6;
    }

    /* Toolbar */
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      background: var(--vscode-sideBar-background, #252526);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .toolbar-title {
      font-size: 13px;
      font-weight: 600;
      flex: 1;
    }
    .toolbar button {
      background: var(--vscode-button-secondaryBackground, #333);
      color: var(--vscode-button-secondaryForeground, #ccc);
      border: none;
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 11px;
      cursor: pointer;
    }
    .toolbar button:hover {
      background: var(--vscode-button-secondaryHoverBackground, #444);
    }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 2px;
      padding: 4px 16px;
      background: var(--vscode-sideBar-background, #252526);
      border-bottom: 1px solid var(--vscode-panel-border, #333);
    }
    .tab {
      background: transparent;
      color: var(--vscode-foreground, #999);
      border: none;
      border-bottom: 2px solid transparent;
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
    }
    .tab.active {
      color: var(--vscode-foreground, #fff);
      border-bottom-color: var(--vscode-focusBorder, #007acc);
    }
    .tab:hover { color: var(--vscode-foreground, #fff); }

    /* Badge */
    .badge {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: 4px;
      letter-spacing: 0.5px;
    }
    .badge-email { background: #06b6d420; color: #67e8f9; }
    .badge-report { background: #10b98120; color: #6ee7b7; }
    .badge-document { background: #f59e0b20; color: #fcd34d; }

    /* Content */
    .content {
      padding: 24px;
      max-width: 800px;
      margin: 0 auto;
    }

    /* Markdown rendering */
    .content h1 { font-size: 1.8em; font-weight: 700; margin: 0 0 16px; }
    .content h2 { font-size: 1.4em; font-weight: 600; margin: 24px 0 12px; padding-top: 16px; border-top: 1px solid var(--vscode-panel-border, #333); }
    .content h3 { font-size: 1.1em; font-weight: 600; margin: 16px 0 8px; }
    .content p { margin: 0 0 12px; }
    .content ul, .content ol { margin: 0 0 12px; padding-left: 24px; }
    .content li { margin: 4px 0; }
    .content strong { font-weight: 600; color: var(--vscode-foreground, #fff); }
    .content em { font-style: italic; color: var(--vscode-descriptionForeground, #aaa); }
    .content code {
      background: var(--vscode-textCodeBlock-background, #2d2d2d);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.9em;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .content hr { border: none; border-top: 1px solid var(--vscode-panel-border, #333); margin: 20px 0; }
    .content blockquote {
      border-left: 3px solid var(--vscode-focusBorder, #007acc);
      padding: 8px 16px;
      margin: 12px 0;
      color: var(--vscode-descriptionForeground, #aaa);
    }
    .content table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.95em; }
    .content th, .content td { border: 1px solid var(--vscode-panel-border, #333); padding: 6px 10px; text-align: left; }
    .content th { background: var(--vscode-sideBar-background, #252526); font-weight: 600; }
    .content tr:nth-child(even) td { background: var(--vscode-textCodeBlock-background, #2d2d2d33); }
    .content .callout { border-left: 3px solid var(--vscode-focusBorder, #7c3aed); background: var(--vscode-textCodeBlock-background, #2d2d2d44); padding: 10px 14px; margin: 12px 0; border-radius: 0 4px 4px 0; }
    .content .callout-label { font-weight: 600; display: block; margin-bottom: 4px; }

    /* Email layout */
    .email-header {
      background: var(--vscode-sideBar-background, #252526);
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 8px 8px 0 0;
      padding: 16px 20px;
    }
    .email-field { font-size: 12px; margin: 4px 0; }
    .email-field strong { color: var(--vscode-descriptionForeground, #888); min-width: 60px; display: inline-block; }
    .email-body {
      border: 1px solid var(--vscode-panel-border, #333);
      border-top: none;
      border-radius: 0 0 8px 8px;
      padding: 20px;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="toolbar-title">${this.escHtml(doc.title)}</span>
    ${typeBadge}
    ${doc.filePath ? '<button onclick="openFile()">Open File</button>' : ''}
    <button onclick="copyContent()">Copy</button>
  </div>

  ${tabs ? `<div class="tabs">${tabs}</div>` : ''}

  <div class="content">
    ${renderedContent}
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function switchTab(i) { vscode.postMessage({ type: 'switch_tab', index: i }); }
    function openFile() { vscode.postMessage({ type: 'open_file' }); }
    function copyContent() { vscode.postMessage({ type: 'copy' }); }

  </script>
</body>
</html>`;
  }

  // ── Content Renderers ───────────────────────────────────────────────────────

  private renderDocument(doc: DocumentPreview): string {
    // If content is already HTML (e.g. from mammoth docx conversion), render directly
    if (doc.metadata?.rawHtml) return doc.content;

    switch (doc.type) {
      case 'email': return this.renderEmail(doc.content);
      default: return this.renderMarkdown(doc.content);
    }
  }

  private renderEmail(content: string): string {
    // Parse email format: **To:** X, **Subject:** X, then body
    const lines = content.split('\n');
    const headerLines: string[] = [];
    const bodyLines: string[] = [];
    let inBody = false;

    for (const line of lines) {
      if (!inBody && line.startsWith('---')) {
        inBody = true;
        continue;
      }
      if (!inBody && (line.startsWith('**To:') || line.startsWith('**Subject:') || line.startsWith('**From:'))) {
        headerLines.push(line);
      } else if (inBody || line.trim() === '') {
        inBody = true;
        bodyLines.push(line);
      } else {
        headerLines.push(line);
      }
    }

    const headerHtml = headerLines.map(l => {
      const cleaned = l.replace(/\*\*/g, '');
      const [label, ...rest] = cleaned.split(':');
      return `<div class="email-field"><strong>${this.escHtml(label.trim())}:</strong> ${this.escHtml(rest.join(':').trim())}</div>`;
    }).join('');

    const bodyHtml = this.renderMarkdown(bodyLines.join('\n').trim());

    return `<div class="email-header">${headerHtml}</div><div class="email-body">${bodyHtml}</div>`;
  }

  private renderMarkdown(md: string): string {
    // Lift the authoring front-matter / directives so the preview shows a clean
    // document, not raw source. Safe no-op for plain markdown (e.g. email body).
    md = this.preprocessAuthoring(md);

    // Simple markdown → HTML (covers the common cases)
    let html = this.escHtml(md);

    // Tables (before block wrapping; operates on escaped pipe rows)
    html = this.renderTables(html);

    // Headings (H1-H4)
    html = html.replace(/^#### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Bold + italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');

    // Lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Paragraphs (double newline)
    html = html.replace(/\n\n/g, '</p><p>');
    html = `<p>${html}</p>`;

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>\s*(<h[123]>)/g, '$1');
    html = html.replace(/(<\/h[123]>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<hr>)/g, '$1');
    html = html.replace(/(<hr>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<blockquote>)/g, '$1');
    html = html.replace(/<p>\s*(<table>)/g, '$1');
    html = html.replace(/(<\/table>)\s*<\/p>/g, '$1');

    return html;
  }

  /** Lift authoring extras (front-matter, ::: directives) into something the
   *  basic markdown renderer can show cleanly. No-op for plain markdown. */
  private preprocessAuthoring(md: string): string {
    const fm = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(md);
    let title = '';
    if (fm) {
      const tm = /^title:[ \t]*(.+)$/m.exec(fm[1]);
      if (tm) title = tm[1].trim().replace(/^["']|["']$/g, '');
      md = md.slice(fm[0].length);
    }
    md = md.replace(/^:::[ \t]*pagebreak[ \t]*$/gim, '\n---\n');
    md = md.replace(/^:::[ \t]*(\w+)(?:\{([^}]*)\})?[ \t]*\r?\n([\s\S]*?)\r?\n:::[ \t]*$/gim, (_m, variant: string, attrs: string, inner: string) => {
      const tm = /title="([^"]*)"/.exec(attrs || '');
      const label = tm ? tm[1] : variant.charAt(0).toUpperCase() + variant.slice(1);
      const quoted = inner.split(/\r?\n/).map(l => '> ' + l).join('\n');
      return `> **${label}**\n${quoted}`;
    });
    md = md.replace(/^:::[ \t]*$/gim, '');
    if (title) md = `# ${title}\n\n${md}`;
    return md;
  }

  /** Render GitHub-style pipe tables from already-escaped HTML lines. */
  private renderTables(html: string): string {
    const lines = html.split('\n');
    const out: string[] = [];
    const isRow = (s: string) => /^\s*\|(.+)\|\s*$/.test(s);
    const isSep = (s: string) => /^\s*\|[\s:|-]+\|\s*$/.test(s);
    const cells = (s: string) => s.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    for (let i = 0; i < lines.length; i++) {
      if (isRow(lines[i]) && i + 1 < lines.length && isSep(lines[i + 1])) {
        const header = cells(lines[i]);
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && isRow(lines[i])) { rows.push(cells(lines[i])); i++; }
        i--;
        const thead = `<tr>${header.map(h => `<th>${h}</th>`).join('')}</tr>`;
        const tbody = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
        out.push(`<table>${thead}${tbody}</table>`);
      } else {
        out.push(lines[i]);
      }
    }
    return out.join('\n');
  }

  private escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  private dispose(): void {
    DocumentPreviewPanel.currentPanel = undefined;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
