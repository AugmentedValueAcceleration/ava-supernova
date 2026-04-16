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
      max-width: 100%;
      margin: 0;
      padding: 0;
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

    /* Layout: sidebar + content */
    .docs-layout {
      display: flex;
      gap: 0;
      min-height: 100vh;
    }

    /* Sidebar Navigation — sticky left column */
    .docs-nav {
      display: flex;
      flex-direction: column;
      gap: 2px;
      width: 180px;
      min-width: 180px;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      padding: 16px 12px;
      border-right: 1px solid var(--ava-border);
      background: var(--vscode-sideBar-background, var(--ava-bg));
    }
    .docs-content {
      flex: 1;
      min-width: 0;
      padding: 32px 24px 64px;
      overflow-y: auto;
    }
    .tab-btn {
      display: block;
      width: 100%;
      padding: 7px 12px;
      border-radius: 6px;
      background: transparent;
      color: var(--ava-muted);
      text-decoration: none;
      font-size: 11px;
      font-weight: 500;
      border: none;
      cursor: pointer;
      transition: all 0.15s;
      font-family: inherit;
      text-align: left;
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

    <div class="docs-layout">
    <!-- Sidebar Navigation -->
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

    <div class="docs-content">
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
      <p>Ava supports models from multiple providers. Some are managed (we handle the API, you use your token allowance). Others are BYOK (you bring your own API key, requests don't count against your plan).</p>

      <div class="model-category">
        <h3>Ava Platform &mdash; Managed Models</h3>
        <p>Available on every plan including Free. We handle the API keys &mdash; you just pick and go. The coordinator (Qwen 3.6 Plus) drives planning and tool dispatch in Auto Mode.</p>
        <div class="card-grid">
          <div class="card">
            <h4>Qwen 3.6 Plus <span style="font-size:10px;opacity:.6;">(conductor)</span></h4>
            <p>Best agentic coding in the Qwen family. 1M context, native function calling. Drives Auto Mode planning and Builder dispatch.</p>
            <p style="margin-top: 6px;"><strong>$0.20 / $1.20</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>Qwen 3.5 Omni Plus</h4>
            <p>Vision + reasoning. Understands screenshots, diagrams, and UI mockups alongside code.</p>
            <p style="margin-top: 6px;"><strong>$0.26 / $1.56</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>Qwen 3.5 Plus</h4>
            <p>1M context window. Great for analysing large codebases and multi-file refactoring.</p>
            <p style="margin-top: 6px;"><strong>$0.40 / $1.20</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>Qwen Omni Flash <span style="font-size:10px;opacity:.6;">(free default)</span></h4>
            <p>Free-tier default. Fast, vision-capable, good for everyday tasks. 3M tokens/month with a free account.</p>
            <p style="margin-top: 6px;"><strong>$0.065 / $0.26</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>Qwen Flash</h4>
            <p>Fastest and cheapest managed model. Great for quick questions, light tasks, and classification.</p>
            <p style="margin-top: 6px;"><strong>$0.05 / $0.40</strong> per 1M tokens</p>
          </div>
        </div>
      </div>

      <div class="model-category">
        <h3>Creative Studio &mdash; MiniMax</h3>
        <p>Image, video, music, and voice generation runs exclusively on MiniMax. Costs deducted from the same single token pool as coding &mdash; one pool, one number.</p>
        <div class="card-grid">
          <div class="card">
            <h4>MiniMax M2.7</h4>
            <p>Chat + Creative Studio. 200K context, tool calls, thinking.</p>
            <p style="margin-top: 6px;"><strong>$0.30 / $1.20</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>MiniMax M2.5</h4>
            <p>Chat + Creative Studio. 1M context, tool calls, thinking.</p>
            <p style="margin-top: 6px;"><strong>$0.15 / $1.20</strong> per 1M tokens</p>
          </div>
        </div>
        <h4 style="margin-top: 12px;">Per-generation token costs</h4>
        <p>Each Creative Studio generation deducts a fixed token amount from your allowance:</p>
        <table>
          <thead><tr><th>Type</th><th>Tokens per generation</th><th>Approximate cost*</th></tr></thead>
          <tbody>
            <tr><td>Image</td><td>~18K&ndash;100K tokens</td><td>~$0.004&ndash;$0.02</td></tr>
            <tr><td>Video</td><td>~500K tokens</td><td>~$0.10</td></tr>
            <tr><td>Music</td><td>~250K tokens</td><td>~$0.05</td></tr>
            <tr><td>Voice (TTS)</td><td>~50K tokens per request</td><td>~$0.01</td></tr>
          </tbody>
        </table>
        <p class="small muted">*At managed platform rates. BYOK with your own MiniMax key &mdash; you pay MiniMax directly and tokens don't count against your Ava plan.</p>
      </div>

      <div class="model-category">
        <h3>BYOK &mdash; Bring Your Own Key</h3>
        <p>Use your own API keys from any provider below. BYOK requests don't count against your plan allowance. Available on every plan including Free.</p>
        <div class="card-grid">
          <div class="card">
            <h4>Claude Opus 4.6 <span style="font-size:10px;opacity:.6;">Anthropic</span></h4>
            <p>Most capable overall. Vision, 200K context. Best at nuanced understanding and complex multi-file work.</p>
            <p style="margin-top: 6px;"><strong>$5.00 / $25.00</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>Claude Sonnet 4.6 <span style="font-size:10px;opacity:.6;">Anthropic</span></h4>
            <p>Best balance of speed and capability. Fast enough for interactive use with near-frontier quality.</p>
            <p style="margin-top: 6px;"><strong>$3.00 / $15.00</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>Kimi K2.5 <span style="font-size:10px;opacity:.6;">Moonshot</span></h4>
            <p>76.8% SWE-Bench. Excellent multi-step tool calling and planning.</p>
            <p style="margin-top: 6px;"><strong>$0.60 / $2.50</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>DeepSeek V3.2 <span style="font-size:10px;opacity:.6;">DeepSeek</span></h4>
            <p>Best price-to-performance ratio. Strong coding at very low cost.</p>
            <p style="margin-top: 6px;"><strong>$0.28 / $0.42</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>DeepSeek Reasoner <span style="font-size:10px;opacity:.6;">DeepSeek</span></h4>
            <p>Extended thinking and chain-of-thought. Excels at debugging and architecture decisions.</p>
          </div>
          <div class="card">
            <h4>Mistral Large <span style="font-size:10px;opacity:.6;">Mistral</span></h4>
            <p>Strong multilingual reasoning with 128K context.</p>
            <p style="margin-top: 6px;"><strong>$2.00 / $6.00</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>Codestral <span style="font-size:10px;opacity:.6;">Mistral</span></h4>
            <p>Code-focused with 256K context. Excellent at code completion and generation.</p>
            <p style="margin-top: 6px;"><strong>$0.30 / $0.90</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>Devstral 2 <span style="font-size:10px;opacity:.6;">Mistral</span></h4>
            <p>Agentic coding specialist. Tool-augmented workflows at very low cost.</p>
          </div>
          <div class="card">
            <h4>GLM-5 <span style="font-size:10px;opacity:.6;">Zhipu</span></h4>
            <p>77.8% SWE-Bench. Best tool-call reliability &mdash; consistently formats calls correctly.</p>
          </div>
          <div class="card">
            <h4>Claude Haiku 4.5 <span style="font-size:10px;opacity:.6;">Anthropic</span></h4>
            <p>Fastest Anthropic model. Good for quick classification and light tasks.</p>
          </div>
          <div class="card">
            <h4>Custom / Ollama / LM Studio</h4>
            <p>Any endpoint that speaks the standard API format. Run local models via Ollama or LM Studio.</p>
          </div>
        </div>
      </div>

      <div class="model-category">
        <h3>Best Long Context</h3>
        <p>For working with very large files, multiple files, or extensive codebases.</p>
        <div class="card-grid">
          <div class="card">
            <h4>Qwen 3.5 Plus</h4>
            <p>1M context. Great for analysing large codebases and multi-file refactoring.</p>
            <p style="margin-top: 6px;"><strong>$0.40 / $1.20</strong> per 1M tokens</p>
          </div>
          <div class="card">
            <h4>Mistral Large</h4>
            <p>Flagship general-purpose model. Strong long-context performance for complex multi-file tasks.</p>
            <p style="margin-top: 6px;"><strong>$2.00 / $6.00</strong> per 1M tokens</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Models -->
    <section class="docs-section" id="models">
      <h2>Supported Models</h2>
      <p>Every model on every plan. Managed models use your token allowance. BYOK models use your own API key and don't count against your plan.</p>

      <h3>Managed (Ava Platform)</h3>
      <table>
        <thead>
          <tr><th>Model</th><th>Role</th><th>Input / Output per 1M tokens</th></tr>
        </thead>
        <tbody>
          <tr><td>Qwen 3.6 Plus</td><td>Coordinator &mdash; drives Auto Mode</td><td>$0.20 / $1.20</td></tr>
          <tr><td>Qwen 3.5 Omni Plus</td><td>Vision + reasoning</td><td>$0.26 / $1.56</td></tr>
          <tr><td>Qwen 3.5 Plus</td><td>1M context</td><td>$0.40 / $1.20</td></tr>
          <tr><td>Qwen Omni Flash</td><td>Free-tier default (3M tokens/mo)</td><td>$0.065 / $0.26</td></tr>
          <tr><td>Qwen Flash</td><td>Fast + cheap</td><td>$0.05 / $0.40</td></tr>
          <tr><td>MiniMax M2.7</td><td>Creative Studio + chat (200K ctx)</td><td>$0.30 / $1.20</td></tr>
          <tr><td>MiniMax M2.5</td><td>Creative Studio + chat (1M ctx)</td><td>$0.15 / $1.20</td></tr>
        </tbody>
      </table>

      <h3>BYOK (Bring Your Own Key)</h3>
      <table>
        <thead>
          <tr><th>Provider</th><th>Model</th><th>Input / Output per 1M tokens</th></tr>
        </thead>
        <tbody>
          <tr><td>Anthropic</td><td>Claude Opus 4.6</td><td>$5.00 / $25.00</td></tr>
          <tr><td>Anthropic</td><td>Claude Sonnet 4.6</td><td>$3.00 / $15.00</td></tr>
          <tr><td>Anthropic</td><td>Claude Haiku 4.5</td><td>$0.80 / $4.00</td></tr>
          <tr><td>Moonshot</td><td>Kimi K2.5</td><td>$0.60 / $2.50</td></tr>
          <tr><td>DeepSeek</td><td>DeepSeek V3.2</td><td>$0.28 / $0.42</td></tr>
          <tr><td>DeepSeek</td><td>DeepSeek Reasoner</td><td>$0.14 / $2.19</td></tr>
          <tr><td>Mistral</td><td>Mistral Large</td><td>$2.00 / $6.00</td></tr>
          <tr><td>Mistral</td><td>Codestral</td><td>$0.30 / $0.90</td></tr>
          <tr><td>Mistral</td><td>Devstral 2</td><td>$0.10 / $0.30</td></tr>
          <tr><td>Zhipu</td><td>GLM-5</td><td>$0.70 / $0.70</td></tr>
          <tr><td colspan="3">Ollama, LM Studio, or any standard API format endpoint</td></tr>
        </tbody>
      </table>
      <p class="small muted">Pricing is approximate. Check each provider's website for current rates. BYOK requests never consume your Ava plan allowance.</p>
    </section>

    <!-- Tools -->
    <section class="docs-section" id="tools">
      <h2>Built-in Tools (63)</h2>

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
          <p>Full agent with all 63 tools. Ava reads, writes, searches, executes, manages tasks, journals, and creates documents.</p>
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
      <p>All 63 tools are grouped into <strong>10 categories</strong> (File Ops, Shell, Git, Web, Media, Database, System, Documents, Memory, Learning). Each category has its own permission level. Three presets:</p>
      <table>
        <thead><tr><th>Mode</th><th>File Ops</th><th>Shell</th><th>Git</th><th>Web</th><th>Database</th><th>System</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>Strict</strong></td>
            <td>First time</td>
            <td>Always ask</td>
            <td>Always ask</td>
            <td>Always ask</td>
            <td>Always ask</td>
            <td>Always ask</td>
          </tr>
          <tr>
            <td><strong>Balanced</strong></td>
            <td><span class="badge badge-safe">auto</span></td>
            <td>Always ask</td>
            <td>First time</td>
            <td>First time</td>
            <td>Always ask</td>
            <td>Always ask</td>
          </tr>
          <tr>
            <td><strong>Autonomous</strong></td>
            <td><span class="badge badge-safe">auto</span></td>
            <td><span class="badge badge-safe">auto</span></td>
            <td><span class="badge badge-safe">auto</span></td>
            <td><span class="badge badge-safe">auto</span></td>
            <td><span class="badge badge-safe">auto</span></td>
            <td><span class="badge badge-safe">auto</span></td>
          </tr>
        </tbody>
      </table>
      <p><strong>Auto</strong> executes immediately. <strong>First time</strong> asks once per session, then remembers. <strong>Always ask</strong> confirms every call. Memory and Learning categories are always auto.</p>
      <p>Plans (<code>present_plan</code>) and questions (<code>ask_user</code>) always require your approval, regardless of mode.</p>
      <p>Customise individual categories in <strong>Settings &rarr; Customise by Category</strong>. Clicking <strong>Always Allow</strong> on a confirmation auto-approves that category for the session. Every tool call is logged in the <strong>Audit</strong> tab in History.</p>
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
      <p class="muted">Ava | Supernova v0.42.0 &mdash; Apache License 2.0</p>
      <p class="muted small">Built with purpose. Agentic coding for everyone.</p>
    </div>

    </div><!-- end docs-content -->
    </div><!-- end docs-layout -->

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
