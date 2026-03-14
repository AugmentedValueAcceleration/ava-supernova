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
      { enableScripts: true, localResourceRoots: [extensionUri] },
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
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

    /* Tab Navigation */
    .docs-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-bottom: 36px;
    }
    .tab-btn {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 6px;
      background: var(--ava-card-bg);
      color: var(--ava-link);
      text-decoration: none;
      font-size: 12px;
      font-weight: 500;
      border: 1px solid var(--ava-border);
      cursor: pointer;
      transition: background 0.15s;
      font-family: inherit;
    }
    .tab-btn:hover {
      background: var(--ava-accent-dim);
      color: #fff;
    }
    .tab-btn.active {
      background: var(--ava-accent-dim);
      color: #fff;
    }

    /* Sections */
    .docs-section {
      margin-bottom: 36px;
      display: none;
    }
    .docs-section.active {
      display: block;
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

    /* Platform sub-tabs */
    .platform-tabs {
      display: flex;
      gap: 6px;
      margin: 12px 0;
    }
    .platform-tab {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 5px;
      background: var(--ava-card-bg);
      color: var(--ava-link);
      font-size: 12px;
      font-weight: 500;
      border: 1px solid var(--ava-border);
      cursor: pointer;
      transition: background 0.15s;
      font-family: inherit;
    }
    .platform-tab:hover {
      background: var(--ava-accent-dim);
      color: #fff;
    }
    .platform-tab.active {
      background: var(--ava-accent-dim);
      color: #fff;
    }
    .platform-content {
      display: none;
    }
    .platform-content.active {
      display: block;
    }

    /* Model recommendation cards */
    .model-category {
      margin-bottom: 20px;
    }
    .model-category h3 {
      font-size: 15px;
      font-weight: 600;
      margin: 16px 0 8px;
      color: var(--ava-accent);
    }
  </style>
</head>
<body>
  <div class="docs-container">

    <!-- Header -->
    <div class="docs-header">
      <h1>Ava | Supernova</h1>
      <p>Open-source AI coding agent &mdash; Full reference guide</p>
    </div>

    <!-- Tab Navigation -->
    <nav class="docs-nav">
      <button class="tab-btn active" data-tab="getting-started">Getting Started</button>
      <button class="tab-btn" data-tab="choosing-model">Choosing Your Model</button>
      <button class="tab-btn" data-tab="models">Models</button>
      <button class="tab-btn" data-tab="tools">Tools</button>
      <button class="tab-btn" data-tab="memory">Memory</button>
      <button class="tab-btn" data-tab="tasks">Tasks</button>
      <button class="tab-btn" data-tab="journal">Journal</button>
      <button class="tab-btn" data-tab="commands">Commands</button>
      <button class="tab-btn" data-tab="modes">Modes</button>
      <button class="tab-btn" data-tab="permissions">Permissions</button>
      <button class="tab-btn" data-tab="config">Configuration</button>
      <button class="tab-btn" data-tab="context">Project Context</button>
      <button class="tab-btn" data-tab="i18n">Languages</button>
      <button class="tab-btn" data-tab="keys">Keyboard Shortcuts</button>
    </nav>

    <!-- Getting Started -->
    <section class="docs-section active" id="getting-started">
      <h2>Getting Started</h2>
      <p>Ava | Supernova is available as a VS Code extension, a CLI tool, and a standalone IDE. Choose your platform below to get started.</p>

      <div class="platform-tabs">
        <button class="platform-tab active" data-platform="vscode">VS Code</button>
        <button class="platform-tab" data-platform="cli">CLI</button>
        <button class="platform-tab" data-platform="ide">IDE</button>
      </div>

      <div class="platform-content active" id="platform-vscode">
        <div class="card">
          <h4>1. Install the Extension</h4>
          <p>Search for <strong>Ava Supernova</strong> in the VS Code Extensions Marketplace, or install from the command line:</p>
        </div>
        <pre><code>code --install-extension AugmentedValueAcceleration.ava-supernova</code></pre>
        <div class="card">
          <h4>2. Add a Provider API Key</h4>
          <p>Open <strong>Settings</strong> (<kbd>Ctrl</kbd>+<kbd>,</kbd>), search <code>ava-supernova</code>, and enter your API key for at least one provider (e.g. DeepSeek, Kimi, GLM).</p>
        </div>
        <div class="card">
          <h4>3. Select a Model</h4>
          <p>Click the model selector in the chat panel, or open Settings and set <code>ava-supernova.activeModel</code>.</p>
        </div>
        <div class="card">
          <h4>4. Start Chatting</h4>
          <p>Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> to open the Ava chat panel and start coding with your AI agent.</p>
        </div>
      </div>

      <div class="platform-content" id="platform-cli">
        <div class="card">
          <h4>1. Install via npm</h4>
          <p>Install the Ava CLI globally:</p>
        </div>
        <pre><code>npm install -g @ava/cli</code></pre>
        <div class="card">
          <h4>2. Run the Setup Wizard</h4>
          <p>The first time you run Ava, the setup wizard will guide you through provider configuration:</p>
        </div>
        <pre><code>ava</code></pre>
        <div class="card">
          <h4>3. Add Provider Keys</h4>
          <p>You can also add providers manually at any time:</p>
        </div>
        <pre><code>ava
/provider add deepseek
/provider add kimi
/model deepseek:deepseek-chat</code></pre>
        <div class="card">
          <h4>4. Start Coding</h4>
          <p>Navigate to your project directory and run <code>ava</code>. The agent has full access to your codebase tools.</p>
        </div>
      </div>

      <div class="platform-content" id="platform-ide">
        <div class="card">
          <h4>1. Download the IDE</h4>
          <p>Download the latest Ava IDE installer from <strong>GitHub Releases</strong> on the <code>ava-supernova-ide</code> repository.</p>
        </div>
        <div class="card">
          <h4>2. Install and Launch</h4>
          <p>Run the installer for your platform. The IDE is a standalone application based on Eclipse Theia with Ava built in.</p>
        </div>
        <div class="card">
          <h4>3. Configure Providers</h4>
          <p>Open <strong>Settings</strong> and search for <code>ava</code> to configure your API keys and select a model.</p>
        </div>
        <div class="card">
          <h4>4. Open a Project</h4>
          <p>Open any folder to start working. Ava's chat panel is accessible from the sidebar, with all the same tools as the VS Code extension.</p>
        </div>
      </div>
    </section>

    <!-- Choosing Your Model -->
    <section class="docs-section" id="choosing-model">
      <h2>Choosing Your Model</h2>
      <p>Different models excel at different tasks. Here are our recommendations based on your needs:</p>

      <div class="model-category">
        <h3>Best for Agentic Coding</h3>
        <p>These models excel at multi-step tool calling and autonomous coding tasks.</p>
        <div class="card-grid">
          <div class="card">
            <h4>Kimi K2.5</h4>
            <p>76.8% SWE-Bench. Best multi-step tool calling among open models. Excellent at planning and executing complex coding tasks.</p>
            <p style="margin-top: 6px;"><strong>$0.60 / $2.00</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>GLM-5</h4>
            <p>77.8% SWE-Bench. Best tool-call reliability. Consistently formats tool calls correctly with minimal retries needed.</p>
            <p style="margin-top: 6px;"><strong>$0.70 / $0.70</strong> per 1M tokens</p>
          </div>
        </div>
      </div>

      <div class="model-category">
        <h3>Best Value</h3>
        <p>High capability at the lowest cost. Great for everyday coding tasks.</p>
        <div class="card-grid">
          <div class="card">
            <h4>DeepSeek V3.2</h4>
            <p>Best price/performance ratio. Strong coding ability with extremely low token costs. Ideal for high-volume usage.</p>
            <p style="margin-top: 6px;"><strong>$0.14 / $0.28</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>GLM-4.5 Flash</h4>
            <p>Free tier available. Fast and capable for straightforward coding and Q&amp;A tasks. Zero cost to get started.</p>
            <p style="margin-top: 6px;"><strong>Free</strong></p>
          </div>
        </div>
      </div>

      <div class="model-category">
        <h3>Best Reasoning</h3>
        <p>Extended thinking for complex problems that require deep analysis.</p>
        <div class="card-grid">
          <div class="card">
            <h4>DeepSeek R1</h4>
            <p>Extended thinking and chain-of-thought reasoning. Excels at debugging, architecture decisions, and complex algorithmic problems.</p>
            <p style="margin-top: 6px;"><strong>$0.14 / $2.19</strong> per 1M tokens</p>
          </div>
        </div>
      </div>

      <div class="model-category">
        <h3>Frontier Intelligence</h3>
        <p>The most capable models available, for when you need the best possible results.</p>
        <div class="card-grid">
          <div class="card">
            <h4>Claude Opus 4.6</h4>
            <p>Most capable overall. Vision support, 200K context. Best at nuanced understanding and complex multi-file refactoring.</p>
            <p style="margin-top: 6px;"><strong>$15.00 / $75.00</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>Claude Sonnet 4.6</h4>
            <p>Best balance of speed and capability. Fast enough for interactive use with near-frontier quality.</p>
            <p style="margin-top: 6px;"><strong>$3.00 / $15.00</strong> per 1M tokens</p>
          </div>
        </div>
      </div>

      <div class="model-category">
        <h3>Best for Code</h3>
        <p>Purpose-built for code generation, completion, and refactoring.</p>
        <div class="card-grid">
          <div class="card">
            <h4>Codestral</h4>
            <p>Code-focused with 256K context. Excellent at code completion, generation, and understanding large codebases.</p>
            <p style="margin-top: 6px;"><strong>$0.30 / $0.90</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>Devstral 2</h4>
            <p>Agentic coding specialist. Optimized for tool-augmented development workflows at very low cost.</p>
            <p style="margin-top: 6px;"><strong>$0.10 / $0.30</strong> per 1M tokens</p>
          </div>
        </div>
      </div>

      <div class="model-category">
        <h3>Best Long Context</h3>
        <p>For working with very large files, multiple files, or extensive codebases.</p>
        <div class="card-grid">
          <div class="card">
            <h4>Qwen 3.5 Plus</h4>
            <p>256K context with vision and thinking. Great for analyzing large codebases and multi-file refactoring.</p>
            <p style="margin-top: 6px;"><strong>$0.40 / $1.20</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>Mistral Large 3</h4>
            <p>Flagship general-purpose model. Strong long-context performance for complex multi-file tasks.</p>
            <p style="margin-top: 6px;"><strong>$2.00 / $6.00</strong> per 1M tokens</p>
          </div>
        </div>
      </div>
    </section>

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
      <h2>Built-in Tools (24)</h2>

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

      <h3>Support</h3>
      <table>
        <thead><tr><th>Tool</th><th>Description</th><th>Risk</th></tr></thead>
        <tbody>
          <tr><td><code>support_request</code></td><td>Submit a support ticket to the Ava team. Requires email, subject, and message.</td><td><span class="badge badge-write">write</span></td></tr>
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

    <!-- Task Management -->
    <section class="docs-section" id="tasks">
      <h2>Task Management</h2>
      <p>A full life-management task system built into Ava. Manage daily tasks, track Ava&rsquo;s session progress, and sync across devices.</p>

      <h3>Three Surfaces</h3>
      <div class="card-grid">
        <div class="card">
          <h4>Dashboard</h4>
          <p>Full CRUD task manager with stats, filters by priority and category, search, recurrence, and subtask tracking.</p>
        </div>
        <div class="card">
          <h4>Chat Panel</h4>
          <p>Collapsible right-side panel in the chat view with <strong>Personal</strong> and <strong>Ava</strong> tabs &mdash; your today tasks and Ava&rsquo;s live progress.</p>
        </div>
        <div class="card">
          <h4>Chat Integration</h4>
          <p>Tell Ava to manage tasks in conversation. The <code>todo_write</code> tool persists session tasks that appear in real-time.</p>
        </div>
      </div>

      <h3>Features</h3>
      <div class="card-grid">
        <div class="card">
          <h4>Local-First Storage</h4>
          <p>Tasks stored as JSON at <code>~/.ava/tasks.json</code> (global) and <code>.ava/tasks.json</code> (per project). Works offline.</p>
        </div>
        <div class="card">
          <h4>Priority &amp; Categories</h4>
          <p>Four priorities (low, medium, high, urgent) with color-coded badges. Five categories: coding, personal, admin, meeting, custom.</p>
        </div>
        <div class="card">
          <h4>Recurrence</h4>
          <p>Set tasks to repeat daily or weekly. Completed recurring tasks auto-generate the next instance.</p>
        </div>
        <div class="card">
          <h4>Platform Sync</h4>
          <p>Connected users get tasks synced to the cloud. Access your tasks from any machine.</p>
        </div>
        <div class="card">
          <h4>Ava Context</h4>
          <p>Active tasks are injected into Ava&rsquo;s system prompt &mdash; she knows what you&rsquo;re working on and can proactively help.</p>
        </div>
        <div class="card">
          <h4>Session Transparency</h4>
          <p>When Ava works on a complex task, her step-by-step progress shows in the Ava tab with a live progress bar.</p>
        </div>
      </div>
    </section>

    <!-- Journal System -->
    <section class="docs-section" id="journal">
      <h2>Journal System</h2>
      <p>A dual-journal system &mdash; your thoughts and Ava&rsquo;s observations, side by side. Same day, two perspectives.</p>

      <h3>Two Perspectives</h3>
      <div class="card-grid">
        <div class="card">
          <h4>Your Journal</h4>
          <p>Personal reflection with optional mood tracking (1-5), tags, and markdown. Private and local-first.</p>
        </div>
        <div class="card">
          <h4>Ava&rsquo;s Journal</h4>
          <p>Ava&rsquo;s authentic observations &mdash; ideas, concerns, patterns. Written automatically at session end. Read-only.</p>
        </div>
      </div>

      <h3>Features</h3>
      <div class="card-grid">
        <div class="card">
          <h4>Calendar Navigation</h4>
          <p>Mini calendar in the sidebar with dot indicators &mdash; white for your entries, purple for Ava&rsquo;s.</p>
        </div>
        <div class="card">
          <h4>Auto-Journaling</h4>
          <p>Ava writes session summaries automatically &mdash; duration, messages, tool calls, model used.</p>
        </div>
        <div class="card">
          <h4>Mood Tracking</h4>
          <p>Optional 1-5 mood scale. Track how you&rsquo;re feeling over time &mdash; Ava can notice patterns.</p>
        </div>
        <div class="card">
          <h4>Context Awareness</h4>
          <p>Last 3 days of journal entries injected into Ava&rsquo;s system prompt for continuity.</p>
        </div>
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
          <h4>Work Mode</h4>
          <p>Full agent with all 32 tools. Ava reads, writes, searches, executes, manages tasks, journals, and creates documents.</p>
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

  <script nonce="${nonce}">
    (function() {
      // Main tab switching
      var tabBtns = document.querySelectorAll('.tab-btn');
      var sections = document.querySelectorAll('.docs-section');

      tabBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          var target = btn.getAttribute('data-tab');

          // Update active tab button
          tabBtns.forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');

          // Show target section, hide all others
          sections.forEach(function(section) {
            if (section.id === target) {
              section.classList.add('active');
            } else {
              section.classList.remove('active');
            }
          });
        });
      });

      // Platform sub-tab switching (Getting Started)
      var platformTabs = document.querySelectorAll('.platform-tab');
      var platformContents = document.querySelectorAll('.platform-content');

      platformTabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          var target = tab.getAttribute('data-platform');

          // Update active platform tab
          platformTabs.forEach(function(t) { t.classList.remove('active'); });
          tab.classList.add('active');

          // Show target platform content, hide others
          platformContents.forEach(function(content) {
            if (content.id === 'platform-' + target) {
              content.classList.add('active');
            } else {
              content.classList.remove('active');
            }
          });
        });
      });
    })();
  </script>
</body>
</html>`;
  }
}
