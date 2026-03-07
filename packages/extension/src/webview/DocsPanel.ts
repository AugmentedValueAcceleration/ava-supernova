import * as vscode from 'vscode';
import { getNonce } from '../utils/nonce.js';

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
      { enableScripts: false, localResourceRoots: [extensionUri] },
    );

    DocsPanel.currentPanel = new DocsPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'AvaSupernovaIcon.png');
    this.panel.webview.html = this.getHtml(panel.webview, extensionUri);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private dispose(): void {
    DocsPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
  }

  private getHtml(_webview: vscode.Webview, _extensionUri: vscode.Uri): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ava | Documentation</title>
  <style nonce="${nonce}">
    :root {
      --ava-accent: #a78bfa;
      --ava-accent-dim: #7c3aed;
      --ava-bg: var(--vscode-editor-background);
      --ava-fg: var(--vscode-editor-foreground);
      --ava-muted: var(--vscode-descriptionForeground);
      --ava-border: var(--vscode-panel-border, #333);
      --ava-card-bg: var(--vscode-editorWidget-background, #1e1e2e);
      --ava-link: var(--vscode-textLink-foreground, #7c9ff5);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--ava-fg);
      background: var(--ava-bg);
      line-height: 1.6;
      padding: 0;
    }
    .docs-container {
      max-width: 820px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }

    /* Header */
    .docs-header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--ava-border);
    }
    .docs-header h1 {
      font-size: 28px;
      font-weight: 700;
      background: linear-gradient(135deg, #a78bfa, #c084fc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 6px;
    }
    .docs-header p {
      color: var(--ava-muted);
      font-size: 14px;
    }

    /* Navigation */
    .docs-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-bottom: 36px;
    }
    .docs-nav a {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 6px;
      background: var(--ava-card-bg);
      color: var(--ava-link);
      text-decoration: none;
      font-size: 12px;
      font-weight: 500;
      border: 1px solid var(--ava-border);
      transition: background 0.15s;
    }
    .docs-nav a:hover {
      background: var(--ava-accent-dim);
      color: #fff;
    }

    /* Sections */
    .docs-section {
      margin-bottom: 36px;
    }
    .docs-section h2 {
      font-size: 20px;
      font-weight: 600;
      color: var(--ava-accent);
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--ava-border);
    }
    .docs-section h3 {
      font-size: 15px;
      font-weight: 600;
      margin: 16px 0 8px;
    }
    .docs-section p {
      margin-bottom: 10px;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 13px;
    }
    th, td {
      text-align: left;
      padding: 8px 12px;
      border: 1px solid var(--ava-border);
    }
    th {
      background: var(--ava-card-bg);
      font-weight: 600;
      color: var(--ava-accent);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    tr:nth-child(even) td {
      background: var(--ava-card-bg);
    }

    /* Code */
    code {
      font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
      font-size: 12px;
      background: var(--ava-card-bg);
      padding: 2px 6px;
      border-radius: 3px;
      border: 1px solid var(--ava-border);
    }
    pre {
      background: var(--ava-card-bg);
      border: 1px solid var(--ava-border);
      border-radius: 6px;
      padding: 14px 16px;
      overflow-x: auto;
      margin: 10px 0;
    }
    pre code {
      background: none;
      border: none;
      padding: 0;
    }

    /* Cards */
    .card {
      background: var(--ava-card-bg);
      border: 1px solid var(--ava-border);
      border-radius: 8px;
      padding: 16px;
      margin: 10px 0;
    }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
      margin: 12px 0;
    }
    .card h4 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--ava-accent);
    }
    .card p {
      font-size: 12px;
      color: var(--ava-muted);
      margin: 0;
    }

    /* Lists */
    ul, ol {
      padding-left: 20px;
      margin: 8px 0;
    }
    li { margin: 4px 0; }

    /* Badge */
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-safe { background: #065f46; color: #6ee7b7; }
    .badge-write { background: #92400e; color: #fcd34d; }
    .badge-dangerous { background: #991b1b; color: #fca5a5; }

    /* Kbd */
    kbd {
      display: inline-block;
      padding: 2px 6px;
      font-size: 11px;
      font-family: var(--vscode-editor-font-family, monospace);
      background: var(--ava-card-bg);
      border: 1px solid var(--ava-border);
      border-radius: 3px;
      box-shadow: 0 1px 0 var(--ava-border);
    }

    /* Muted */
    .muted { color: var(--ava-muted); }
    .small { font-size: 12px; }
    strong { font-weight: 600; }
  </style>
</head>
<body>
  <div class="docs-container">

    <!-- Header -->
    <div class="docs-header">
      <h1>Ava | Supernova</h1>
      <p>Open-source AI coding agent &mdash; Full reference guide</p>
    </div>

    <!-- Navigation -->
    <nav class="docs-nav">
      <a href="#models">Models</a>
      <a href="#tools">Tools</a>
      <a href="#memory">Memory</a>
      <a href="#commands">Commands</a>
      <a href="#modes">Modes</a>
      <a href="#permissions">Permissions</a>
      <a href="#config">Configuration</a>
      <a href="#context">Project Context</a>
      <a href="#i18n">Languages</a>
      <a href="#keys">Keyboard Shortcuts</a>
    </nav>

    <!-- Models -->
    <section class="docs-section" id="models">
      <h2>Supported Models</h2>
      <p>All models work on every plan. Use our managed service or bring your own API keys.</p>
      <table>
        <thead>
          <tr><th>Provider</th><th>Model</th><th>Highlights</th><th>Cost / 1M tokens*</th></tr>
        </thead>
        <tbody>
          <tr><td>Anthropic</td><td>Claude Opus 4.6</td><td>Most capable, vision, 200K context</td><td>$15.00 in / $75.00 out</td></tr>
          <tr><td>Anthropic</td><td>Claude Sonnet 4.6</td><td>Best balance of speed and capability</td><td>$3.00 in / $15.00 out</td></tr>
          <tr><td>Anthropic</td><td>Claude Haiku 4.5</td><td>Fast and affordable, vision</td><td>$0.80 in / $4.00 out</td></tr>
          <tr><td>DeepSeek</td><td>DeepSeek V3</td><td>Best price/performance</td><td>$0.14 in / $0.28 out</td></tr>
          <tr><td>DeepSeek</td><td>DeepSeek R1</td><td>Extended thinking, reasoning</td><td>$0.14 in / $2.19 out</td></tr>
          <tr><td>Moonshot AI</td><td>Kimi K2.5</td><td>Best multi-step tool calling</td><td>$0.60 in / $2.00 out</td></tr>
          <tr><td>Moonshot AI</td><td>Moonshot V1 128K</td><td>Long context</td><td>$2.00 in / $5.00 out</td></tr>
          <tr><td>Zhipu AI</td><td>GLM-5</td><td>Best tool-call reliability, vision</td><td>$0.70 in / $0.70 out</td></tr>
          <tr><td>Zhipu AI</td><td>GLM-4.7</td><td>Fast, affordable coding</td><td>$0.25 in / $0.25 out</td></tr>
          <tr><td>Zhipu AI</td><td>GLM-4 Flash</td><td>Free tier available</td><td>Free</td></tr>
          <tr><td>Alibaba</td><td>Qwen 3.5 Plus</td><td>Vision, thinking, 256K context</td><td>$0.40 in / $1.20 out</td></tr>
          <tr><td>Alibaba</td><td>Qwen Turbo</td><td>Fast, up to 1M context</td><td>$0.05 in / $0.20 out</td></tr>
          <tr><td>Mistral AI</td><td>Mistral Large 3</td><td>Flagship general-purpose</td><td>$2.00 in / $6.00 out</td></tr>
          <tr><td>Mistral AI</td><td>Codestral</td><td>Code-focused, 256K context</td><td>$0.30 in / $0.90 out</td></tr>
          <tr><td>Mistral AI</td><td>Devstral 2</td><td>Agentic coding specialist</td><td>$0.10 in / $0.30 out</td></tr>
        </tbody>
      </table>
      <p class="small muted">*Pricing is approximate and subject to change. Check each provider's website for current rates.</p>
      <p class="small muted">You can also use any locally hosted model via Ollama, LM Studio, or any standard API format endpoint by configuring a custom <code>baseUrl</code> in your provider settings.</p>
    </section>

    <!-- Tools -->
    <section class="docs-section" id="tools">
      <h2>Built-in Tools (23)</h2>

      <h3>Reading &amp; Searching</h3>
      <table>
        <thead><tr><th>Tool</th><th>Description</th><th>Risk</th></tr></thead>
        <tbody>
          <tr><td><code>file_read</code></td><td>Read files with line numbers. Supports offset and limit for large files.</td><td><span class="badge badge-safe">safe</span></td></tr>
          <tr><td><code>glob</code></td><td>Find files matching glob patterns (e.g. <code>**/*.ts</code>).</td><td><span class="badge badge-safe">safe</span></td></tr>
          <tr><td><code>grep</code></td><td>Search file contents with regex. Filter by file pattern.</td><td><span class="badge badge-safe">safe</span></td></tr>
          <tr><td><code>list_directory</code></td><td>List directory contents with file sizes and types.</td><td><span class="badge badge-safe">safe</span></td></tr>
          <tr><td><code>git_status</code></td><td>Read-only git commands (status, diff, log, branch, show).</td><td><span class="badge badge-safe">safe</span></td></tr>
          <tr><td><code>git_diff</code></td><td>View detailed diffs between commits, branches, or working tree.</td><td><span class="badge badge-safe">safe</span></td></tr>
          <tr><td><code>project_index</code></td><td>Index the project structure for intelligent code navigation.</td><td><span class="badge badge-safe">safe</span></td></tr>
          <tr><td><code>find_symbol</code></td><td>Find symbols (functions, classes, variables) across the codebase.</td><td><span class="badge badge-safe">safe</span></td></tr>
        </tbody>
      </table>

      <h3>Writing &amp; Editing</h3>
      <table>
        <thead><tr><th>Tool</th><th>Description</th><th>Risk</th></tr></thead>
        <tbody>
          <tr><td><code>file_write</code></td><td>Create or overwrite files. Auto-creates parent directories.</td><td><span class="badge badge-write">write</span></td></tr>
          <tr><td><code>file_edit</code></td><td>Exact string replacement. Supports single or global replace.</td><td><span class="badge badge-write">write</span></td></tr>
          <tr><td><code>bash</code></td><td>Execute shell commands with configurable timeout.</td><td><span class="badge badge-dangerous">dangerous</span></td></tr>
          <tr><td><code>rollback</code></td><td>Undo file changes made during the current session.</td><td><span class="badge badge-write">write</span></td></tr>
        </tbody>
      </table>

      <h3>Research &amp; Browser</h3>
      <table>
        <thead><tr><th>Tool</th><th>Description</th><th>Risk</th></tr></thead>
        <tbody>
          <tr><td><code>web_search</code></td><td>Search the web via DuckDuckGo. No API key required.</td><td><span class="badge badge-safe">safe</span></td></tr>
          <tr><td><code>http_request</code></td><td>Make HTTP requests (GET, POST, PUT, DELETE).</td><td><span class="badge badge-write">write</span></td></tr>
          <tr><td><code>browser</code></td><td>Open and interact with web pages using a headless browser.</td><td><span class="badge badge-write">write</span></td></tr>
          <tr><td><code>screenshot</code></td><td>Capture screenshots of the current screen or a URL.</td><td><span class="badge badge-safe">safe</span></td></tr>
          <tr><td><code>database_query</code></td><td>Run read-only SQL queries against configured databases.</td><td><span class="badge badge-safe">safe</span></td></tr>
          <tr><td><code>docs_lookup</code></td><td>Search Ava's own documentation to help with features, setup, and troubleshooting.</td><td><span class="badge badge-safe">safe</span></td></tr>
        </tbody>
      </table>

      <h3>Memory</h3>
      <table>
        <thead><tr><th>Tool</th><th>Description</th><th>Risk</th></tr></thead>
        <tbody>
          <tr><td><code>memory_save</code></td><td>Save knowledge to persistent memory (global or project scope).</td><td><span class="badge badge-write">write</span></td></tr>
          <tr><td><code>memory_recall</code></td><td>Search memories by keyword. Finds relevant stored knowledge.</td><td><span class="badge badge-safe">safe</span></td></tr>
        </tbody>
      </table>

      <h3>Collaboration</h3>
      <table>
        <thead><tr><th>Tool</th><th>Description</th><th>Risk</th></tr></thead>
        <tbody>
          <tr><td><code>present_plan</code></td><td>Present a structured plan for your approval.</td><td><span class="badge badge-safe">safe</span></td></tr>
          <tr><td><code>todo_write</code></td><td>Track task progress with a structured to-do list.</td><td><span class="badge badge-safe">safe</span></td></tr>
          <tr><td><code>ask_user</code></td><td>Ask you a question mid-task and wait for a response.</td><td><span class="badge badge-safe">safe</span></td></tr>
        </tbody>
      </table>

      <p class="small muted">The agent runs up to 50 iterations per request, deciding which tools to use, executing them, reading results, and continuing.</p>
    </section>

    <!-- Memory -->
    <section class="docs-section" id="memory">
      <h2>Memory System</h2>
      <p>Ava has persistent memory that survives across sessions. Memories are stored locally and optionally synced to the cloud with a platform account.</p>

      <div class="card-grid">
        <div class="card">
          <h4>Global Memory</h4>
          <p>Preferences, patterns, and knowledge that apply to all your projects. Stored at <code>~/.ava/memory.md</code>.</p>
        </div>
        <div class="card">
          <h4>Project Memory</h4>
          <p>Context specific to the current project. Stored at <code>.ava/memory.md</code> in your project root.</p>
        </div>
        <div class="card">
          <h4>Semantic Search</h4>
          <p>Relevant memories are automatically retrieved at session start using vector embeddings.</p>
        </div>
        <div class="card">
          <h4>Cloud Sync</h4>
          <p>With a platform account, memories sync across machines and are viewable in the web dashboard.</p>
        </div>
      </div>

      <div class="card" style="margin-top: 12px;">
        <h4>How It Works</h4>
        <ul>
          <li>Ask Ava to remember something and it saves via <code>memory_save</code></li>
          <li>Memories load automatically into each new session</li>
          <li>Use <code>memory_recall</code> to search stored knowledge mid-conversation</li>
          <li>You have full control &mdash; view, edit, and delete memories in the Dashboard or locally</li>
        </ul>
      </div>
    </section>

    <!-- Commands (CLI) -->
    <section class="docs-section" id="commands">
      <h2>CLI Commands</h2>

      <h3>General</h3>
      <table>
        <thead><tr><th>Command</th><th>Aliases</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><code>/help</code></td><td><code>/h</code></td><td>Show all available commands</td></tr>
          <tr><td><code>/model</code></td><td><code>/m</code></td><td>List available models</td></tr>
          <tr><td><code>/model &lt;id&gt;</code></td><td></td><td>Switch to a different model</td></tr>
          <tr><td><code>/clear</code></td><td><code>/c</code></td><td>Clear conversation history</td></tr>
          <tr><td><code>/provider</code></td><td><code>/p</code></td><td>List configured providers</td></tr>
          <tr><td><code>/provider add &lt;name&gt;</code></td><td></td><td>Add a provider API key</td></tr>
          <tr><td><code>/permission</code></td><td><code>/perm</code></td><td>View or set permission mode</td></tr>
          <tr><td><code>/tools</code></td><td></td><td>List available tools</td></tr>
          <tr><td><code>/retry</code></td><td><code>/r</code></td><td>Retry the last message</td></tr>
          <tr><td><code>/init</code></td><td></td><td>Create <code>.ava/instructions.md</code></td></tr>
          <tr><td><code>/exit</code></td><td><code>/quit</code>, <code>/q</code></td><td>Exit Ava</td></tr>
        </tbody>
      </table>

      <h3>History</h3>
      <table>
        <thead><tr><th>Command</th><th>Aliases</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><code>/history</code></td><td><code>/ls</code></td><td>List saved conversations</td></tr>
          <tr><td><code>/resume &lt;id&gt;</code></td><td></td><td>Resume a saved conversation</td></tr>
          <tr><td><code>/search &lt;query&gt;</code></td><td><code>/s</code></td><td>Search conversations</td></tr>
          <tr><td><code>/delete &lt;id&gt;</code></td><td><code>/rm</code></td><td>Delete a conversation</td></tr>
          <tr><td><code>/rename &lt;id&gt; &lt;title&gt;</code></td><td></td><td>Rename a conversation</td></tr>
          <tr><td><code>/pin &lt;id&gt;</code></td><td></td><td>Pin a conversation</td></tr>
          <tr><td><code>/unpin &lt;id&gt;</code></td><td></td><td>Unpin a conversation</td></tr>
          <tr><td><code>/export &lt;id&gt;</code></td><td></td><td>Export as Markdown or JSON</td></tr>
        </tbody>
      </table>
    </section>

    <!-- Modes -->
    <section class="docs-section" id="modes">
      <h2>Modes</h2>
      <div class="card-grid">
        <div class="card">
          <h4>Code Mode</h4>
          <p>Full agent with all 23 tools. Ava reads, writes, searches, and executes across your codebase.</p>
        </div>
        <div class="card">
          <h4>Plan Mode</h4>
          <p>Read-only analysis. Ava reads your code and creates plans without modifying anything.</p>
        </div>
        <div class="card">
          <h4>Chat Mode</h4>
          <p>Conversation only. No tools, just discussion about code, architecture, or ideas.</p>
        </div>
        <div class="card">
          <h4>Security Mode</h4>
          <p>AI-powered OWASP-aligned security audit. Scans your project for vulnerabilities using existing tools.</p>
        </div>
      </div>
      <p class="small muted">Switch modes from the dropdown in the chat input area.</p>
    </section>

    <!-- Permissions -->
    <section class="docs-section" id="permissions">
      <h2>Permission Modes</h2>
      <table>
        <thead><tr><th>Mode</th><th>File Reads</th><th>File Writes</th><th>Shell Commands</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>Strict</strong></td>
            <td><span class="badge badge-safe">auto</span></td>
            <td>Confirm</td>
            <td>Confirm</td>
          </tr>
          <tr>
            <td><strong>Balanced</strong></td>
            <td><span class="badge badge-safe">auto</span></td>
            <td><span class="badge badge-safe">auto</span></td>
            <td>Confirm</td>
          </tr>
          <tr>
            <td><strong>Autonomous</strong></td>
            <td><span class="badge badge-safe">auto</span></td>
            <td><span class="badge badge-safe">auto</span></td>
            <td><span class="badge badge-safe">auto</span></td>
          </tr>
        </tbody>
      </table>
      <p>Plans (<code>present_plan</code>) and questions (<code>ask_user</code>) always require your approval, regardless of mode.</p>
      <p>During a session, you can also grant per-tool approval with <strong>Always Allow</strong> or blanket approval with <strong>Allow All</strong>.</p>
    </section>

    <!-- Configuration -->
    <section class="docs-section" id="config">
      <h2>Configuration</h2>

      <h3>Extension Settings</h3>
      <p>Open <strong>Settings</strong> (<kbd>Ctrl</kbd>+<kbd>,</kbd>) and search <code>ava-supernova</code>.</p>
      <table>
        <thead><tr><th>Setting</th><th>Description</th><th>Default</th></tr></thead>
        <tbody>
          <tr><td>Active Model</td><td>The model Ava uses for responses</td><td><em>(none)</em></td></tr>
          <tr><td>Providers &gt; API Key</td><td>Your API key for each provider</td><td><em>(empty)</em></td></tr>
          <tr><td>Temperature</td><td>Sampling temperature (0&ndash;2)</td><td>0.7</td></tr>
          <tr><td>Language</td><td>UI and response language</td><td>Auto-detect</td></tr>
          <tr><td>Permission Mode</td><td>Tool approval behavior</td><td>Strict</td></tr>
          <tr><td>Max Tokens</td><td>Maximum output tokens per response</td><td>8192</td></tr>
          <tr><td>Auto Memory</td><td>Enable/disable automatic memory persistence</td><td>Enabled</td></tr>
          <tr><td>Stream Responses</td><td>Enable/disable streaming output</td><td>Enabled</td></tr>
        </tbody>
      </table>

      <h3>CLI Configuration</h3>
      <p>Stored at <code>~/.ava/config.json</code>:</p>
      <pre><code>{
  "activeModel": "deepseek:deepseek-chat",
  "providers": {
    "anthropic": { "apiKey": "sk-ant-..." },
    "deepseek": { "apiKey": "sk-..." },
    "kimi": { "apiKey": "sk-..." },
    "glm": { "apiKey": "..." },
    "qwen": { "apiKey": "sk-..." },
    "mistral": { "apiKey": "..." }
  },
  "preferences": {
    "temperature": 0.7,
    "maxTokens": 8192,
    "language": "auto"
  }
}</code></pre>

      <h3>Custom Provider (Ollama / LM Studio)</h3>
      <p>Add a <code>baseUrl</code> to connect to any locally hosted model:</p>
      <pre><code>{
  "providers": {
    "deepseek": {
      "apiKey": "sk-...",
      "baseUrl": "http://localhost:11434/v1"
    }
  }
}</code></pre>
    </section>

    <!-- Project Context -->
    <section class="docs-section" id="context">
      <h2>Project Context</h2>
      <p>Create a <code>.ava/instructions.md</code> file in your project root to give Ava persistent knowledge about your codebase.</p>
      <div class="card">
        <h4>What to include</h4>
        <ul>
          <li>Project architecture overview</li>
          <li>Coding conventions and style preferences</li>
          <li>Key file locations and patterns</li>
          <li>Anything you'd tell a new team member</li>
        </ul>
      </div>
      <p>This file is loaded into Ava's system prompt every session. History is scoped per project &mdash; each project gets its own conversation history.</p>
      <p>Use <code>/init</code> in the CLI to generate a starter file.</p>
    </section>

    <!-- Languages -->
    <section class="docs-section" id="i18n">
      <h2>Language Support</h2>
      <p>Ava supports <strong>20 languages</strong> for both the UI and model responses:</p>
      <div class="card">
        <p>English, Chinese (Simplified &amp; Traditional), Japanese, Korean, Spanish, Portuguese, French, German, Russian, Arabic, Hindi, Vietnamese, Thai, Turkish, Italian, Polish, Ukrainian, Dutch, Indonesian</p>
      </div>
      <ul>
        <li><strong>Auto-detect</strong> (default) &mdash; uses your VS Code language setting</li>
        <li>The AI model responds in your preferred language</li>
        <li>Code and technical terms always stay in English</li>
      </ul>
    </section>

    <!-- Keyboard Shortcuts -->
    <section class="docs-section" id="keys">
      <h2>Keyboard Shortcuts</h2>
      <table>
        <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd></td><td>Open Ava Chat</td></tr>
          <tr><td><kbd>Enter</kbd></td><td>Send message</td></tr>
          <tr><td><kbd>Shift</kbd>+<kbd>Enter</kbd></td><td>New line in message</td></tr>
        </tbody>
      </table>
      <p class="small muted">On macOS, use <kbd>Cmd</kbd> instead of <kbd>Ctrl</kbd>.</p>
    </section>

    <!-- Footer -->
    <div class="docs-header" style="margin-top: 48px; border-top: 1px solid var(--ava-border); border-bottom: none; padding-top: 24px;">
      <p class="muted">Ava | Supernova v0.4.0 &mdash; Apache License 2.0</p>
      <p class="muted small">Built with purpose. Agentic coding for everyone.</p>
    </div>

  </div>
</body>
</html>`;
  }
}
