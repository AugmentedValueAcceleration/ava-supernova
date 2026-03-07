/**
 * Structured documentation content for the docs_lookup tool.
 *
 * Each section has a `topic` (used for matching), `title` (human-readable),
 * and `content` (markdown). The tool searches topics and content to return
 * relevant sections when Ava needs to help a user.
 *
 * Keep this file up to date as features change — it IS the source of truth
 * that Ava references when helping users.
 */

export interface DocSection {
  topic: string;
  keywords: string[];
  title: string;
  content: string;
}

export const AVA_DOCS: DocSection[] = [
  // ── Getting Started ──────────────────────────────────────────────────────
  {
    topic: 'getting-started',
    keywords: ['setup', 'install', 'start', 'begin', 'first', 'new', 'onboarding', 'quickstart', 'getting started'],
    title: 'Getting Started',
    content: `# Getting Started with Ava | Supernova

## Installation

### VS Code Extension
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search "Ava Supernova"
4. Click Install
5. Open Ava with Ctrl+Shift+A

### CLI
\`\`\`bash
npm install -g @ava/cli
ava
\`\`\`

### IDE (Desktop App)
Download the installer from the Ava Supernova IDE GitHub releases page.

## First-Time Setup
1. **Add an API key** — Go to Settings (or Dashboard) and add at least one provider API key. Or connect a platform account (sk-ava-...) for managed access.
2. **Select a model** — Choose from the model dropdown. DeepSeek V3 is recommended for best price/performance.
3. **Start chatting** — Type a message and press Enter. Ava is ready to help!

## Platform Account vs BYOK (Bring Your Own Key)
- **Platform account**: Connect with an sk-ava- key for managed API access, cloud sync, usage tracking, and billing through ava-supernova.com
- **BYOK**: Add your own API keys directly from each provider. No account needed — fully open-source and free to use.`,
  },

  // ── Models ────────────────────────────────────────────────────────────────
  {
    topic: 'models',
    keywords: ['model', 'provider', 'claude', 'deepseek', 'kimi', 'glm', 'qwen', 'mistral', 'anthropic', 'moonshot', 'zhipu', 'alibaba', 'ollama', 'local', 'lm studio', 'pricing', 'cost', 'token', 'vision'],
    title: 'Supported Models',
    content: `# Supported Models

All models work on every plan. Use the managed service or bring your own API keys.

## Provider: Anthropic
| Model | Highlights | Cost / 1M tokens |
|-------|-----------|-------------------|
| Claude Opus 4.6 | Most capable, vision, 200K context | $15.00 in / $75.00 out |
| Claude Sonnet 4.6 | Best balance of speed and capability | $3.00 in / $15.00 out |
| Claude Haiku 4.5 | Fast and affordable, vision | $0.80 in / $4.00 out |

## Provider: DeepSeek
| Model | Highlights | Cost / 1M tokens |
|-------|-----------|-------------------|
| DeepSeek V3 | Best price/performance ratio | $0.14 in / $0.28 out |
| DeepSeek R1 | Extended thinking, reasoning | $0.14 in / $2.19 out |

## Provider: Moonshot AI (Kimi)
| Model | Highlights | Cost / 1M tokens |
|-------|-----------|-------------------|
| Kimi K2.5 | Best multi-step tool calling (76.8% SWE-Bench) | $0.60 in / $2.00 out |
| Moonshot V1 128K | Long context | $2.00 in / $5.00 out |

## Provider: Zhipu AI (GLM)
| Model | Highlights | Cost / 1M tokens |
|-------|-----------|-------------------|
| GLM-5 | Best tool-call reliability, vision (77.8% SWE-Bench) | $0.70 in / $0.70 out |
| GLM-4.7 | Fast, affordable coding | $0.25 in / $0.25 out |
| GLM-4 Flash | Free tier available | Free |

## Provider: Alibaba (Qwen)
| Model | Highlights | Cost / 1M tokens |
|-------|-----------|-------------------|
| Qwen 3.5 Plus | Vision, thinking, 256K context | $0.40 in / $1.20 out |
| Qwen Turbo | Fast, up to 1M context | $0.05 in / $0.20 out |

## Provider: Mistral AI
| Model | Highlights | Cost / 1M tokens |
|-------|-----------|-------------------|
| Mistral Large 3 | Flagship general-purpose | $2.00 in / $6.00 out |
| Codestral | Code-focused, 256K context | $0.30 in / $0.90 out |
| Devstral 2 | Agentic coding specialist | $0.10 in / $0.30 out |

## Local Models (Ollama / LM Studio)
You can connect any locally hosted model by adding a custom \`baseUrl\` in your provider settings:
\`\`\`json
{
  "providers": {
    "deepseek": {
      "apiKey": "sk-...",
      "baseUrl": "http://localhost:11434/v1"
    }
  }
}
\`\`\`
This works with Ollama, LM Studio, vLLM, or any OpenAI-compatible API endpoint.

## Switching Models
- **CLI**: Use \`/model\` to list models, \`/model <id>\` to switch
- **Extension/IDE**: Use the model dropdown in the chat header

## Recommendations
- **Best overall value**: DeepSeek V3 — extremely capable at a fraction of frontier pricing
- **Best tool calling**: Kimi K2.5 or GLM-5 — most reliable for multi-step agentic tasks
- **Best reasoning**: DeepSeek R1 or Claude Opus 4.6 — for complex problem solving
- **Best for free**: GLM-4 Flash — free tier from Zhipu AI
- **Best code completion**: Codestral or Devstral 2 — Mistral's code-focused models`,
  },

  // ── Tools ─────────────────────────────────────────────────────────────────
  {
    topic: 'tools',
    keywords: ['tool', 'file_read', 'file_write', 'file_edit', 'glob', 'grep', 'bash', 'web_search', 'browser', 'screenshot', 'database', 'git', 'memory_save', 'memory_recall', 'present_plan', 'todo_write', 'ask_user', 'rollback', 'http_request', 'project_index', 'find_symbol', 'list_directory', 'docs_lookup', 'support_request', 'support'],
    title: 'Built-in Tools',
    content: `# Built-in Tools (24)

Ava has 24 built-in tools organized by category. Tool availability depends on the current mode and permission settings.

## Reading & Searching (always auto-approved)
| Tool | Description |
|------|-------------|
| file_read | Read file contents with line numbers. Use offset/limit for large files. |
| glob | Find files by pattern (e.g. \`**/*.ts\`, \`src/**/index.*\`). |
| grep | Search file contents with regex. Use file_pattern to narrow scope. |
| list_directory | List directory contents with file types and sizes. |
| git_status | Read-only git commands (status, diff, log, branch, show). |
| git_diff | Show structured git diffs (staged, unstaged, all, branch comparison). |
| project_index | Scan and show project structure index — frameworks, languages, entry points. |
| find_symbol | Find where functions, classes, types are defined or referenced. |

## Research (always auto-approved)
| Tool | Description |
|------|-------------|
| web_search | Search the web via DuckDuckGo. No API key required. |
| http_request | Make HTTP requests (GET, POST, PUT, DELETE) with auth, assertions, timing. |
| browser | Automate browser interactions using Playwright (navigate, click, fill, screenshot). |
| screenshot | Capture a screenshot of the user's screen for visual analysis. |
| database_query | Run read-only SQL queries against PostgreSQL, SQLite, or MySQL. |
| docs_lookup | **This is your tool.** Search your own documentation to answer user questions about features, setup, configuration, and troubleshooting. When a user asks "how do I…" or "what is…" about you, call \`docs_lookup\` with a query or topic. |

## Writing & Editing (permission mode dependent)
| Tool | Description |
|------|-------------|
| file_write | Create new files or overwrite entirely. Use for new files only. |
| file_edit | Replace an exact string match in a file. Preferred for existing files. |

## Shell Commands (permission mode dependent)
| Tool | Description |
|------|-------------|
| bash | Execute shell commands with configurable timeout. Use background: true for dev servers. |

## Memory
| Tool | Description |
|------|-------------|
| memory_save | Save information to persistent memory (global or project scope). |
| memory_recall | Search saved memories by keyword. |

## Collaboration (always requires approval)
| Tool | Description |
|------|-------------|
| present_plan | Present a structured plan with steps for user approval. |
| ask_user | Ask the user a question and wait for their response. |

## Task Tracking (always auto-approved)
| Tool | Description |
|------|-------------|
| todo_write | Create and update a visual task list to track progress. |

## Support
| Tool | Description |
|------|-------------|
| support_request | Submit a support ticket to the Ava team. Use when the user has an issue you can't resolve — bugs, account problems, feature requests, billing questions. Requires email, subject, and message. The team replies via email. |

## Safety
| Tool | Description |
|------|-------------|
| rollback | Restore, discard, or check the status of a git checkpoint. |

## Risk Levels
- **safe** — Read-only operations. Always auto-approved.
- **write** — Modify files in the workspace. Requires approval in Strict mode.
- **dangerous** — Arbitrary system commands. Requires approval in Strict and Balanced modes.`,
  },

  // ── Modes ─────────────────────────────────────────────────────────────────
  {
    topic: 'modes',
    keywords: ['mode', 'code', 'plan', 'chat', 'security', 'audit', 'owasp', 'read-only'],
    title: 'Modes',
    content: `# Modes

Ava has four modes that control what tools are available and how she behaves.

## Code Mode (default)
Full agent with all 24 tools. Ava reads, writes, searches, and executes across your codebase. This is the primary working mode.

## Plan Mode
Read-only analysis. Ava reads your code and creates plans without modifying anything. Use this when you want Ava to analyze and propose changes before committing to them.

## Chat Mode
Conversation only. No tools available — just discussion about code, architecture, ideas, or anything else. Use this for brainstorming, Q&A, or when you just want to talk.

## Security Mode
AI-powered OWASP-aligned security audit. Ava scans your project for vulnerabilities using read-only tools and produces a structured report with severity ratings, locations, and remediation guidance. Categories include: injection, auth, secrets, XSS, CSRF, misconfigurations, dependencies, crypto, SSRF, deserialization, and logging.

## Switching Modes
- **Extension/IDE**: Use the mode bar at the bottom of the chat input area (Code | Plan | Chat | Security)
- **CLI**: Modes are selected at startup or via commands`,
  },

  // ── Permissions ──────────────────────────────────────────────────────────
  {
    topic: 'permissions',
    keywords: ['permission', 'strict', 'balanced', 'autonomous', 'approve', 'confirm', 'safety', 'auto-approve', 'deny', 'allow'],
    title: 'Permission Modes',
    content: `# Permission Modes

Permission modes control when Ava asks for your approval before running tools.

## Strict (default)
| Tool Type | Behavior |
|-----------|----------|
| File reads & searches | Auto-approved |
| File writes & edits | Requires confirmation |
| Shell commands (bash) | Requires confirmation |

Best for: New users, sensitive projects, learning what Ava does.

## Balanced
| Tool Type | Behavior |
|-----------|----------|
| File reads & searches | Auto-approved |
| File writes & edits | Auto-approved |
| Shell commands (bash) | Requires confirmation |

Best for: Day-to-day development. Ava can freely edit files but you approve shell commands.

## Autonomous
| Tool Type | Behavior |
|-----------|----------|
| File reads & searches | Auto-approved |
| File writes & edits | Auto-approved |
| Shell commands (bash) | Auto-approved |

Best for: Experienced users who trust Ava to work independently. Be careful with destructive operations.

## Always-Confirm Tools
Regardless of permission mode, these always require user approval:
- **present_plan** — Plans are a collaboration checkpoint
- **ask_user** — Questions need your input by definition

## Per-Session Overrides
During a session, you can grant:
- **Always Allow** — Auto-approve a specific tool for the rest of the session
- **Allow All** — Auto-approve all tools for the rest of the session

## Changing Permission Mode
- **Extension**: Dashboard > Settings > Permission Mode
- **IDE**: Dashboard > Settings > Permission Mode
- **CLI**: \`/permission <mode>\``,
  },

  // ── Memory ───────────────────────────────────────────────────────────────
  {
    topic: 'memory',
    keywords: ['memory', 'remember', 'forget', 'persistent', 'memory_save', 'memory_recall', 'global', 'project', 'cloud sync', 'session'],
    title: 'Memory System',
    content: `# Memory System

Ava has persistent memory that survives across sessions. She remembers what matters and uses it to provide better, personalized assistance.

## Memory Scopes

### Global Memory
- Applies to all projects
- Stored at \`~/.ava/memory.md\`
- Good for: your preferences, coding style, tools you like, general patterns

### Project Memory
- Specific to the current project
- Stored at \`.ava/memory.md\` in the project root
- Good for: project architecture, conventions, key decisions, team patterns

## How It Works
1. **Automatic**: When you tell Ava something important, she saves it via \`memory_save\`
2. **Session start**: Memories are loaded into Ava's context at the start of each conversation
3. **Search**: Use \`memory_recall\` mid-conversation to search specific stored knowledge
4. **Manual editing**: You can directly edit the memory files, or use the Memory page in the Dashboard

## What Ava Remembers
- User preferences and workflow patterns
- Project conventions and architecture decisions
- Solutions to recurring problems
- Corrections and feedback you give her
- Key technical decisions and their rationale

## What Ava Doesn't Remember
- Session-specific details (what you're working on right now)
- Things already in \`.ava/instructions.md\`
- Obvious info from package.json or config files

## Cloud Sync (Platform Accounts)
With a platform account (sk-ava- key), memories sync to the cloud:
- Access your memories from any machine
- View and manage memories in the web dashboard at ava-supernova.com
- Semantic search via vector embeddings for intelligent recall
- Local file is always the source of truth — cloud is backup + cross-device sync

## Managing Memory
- **Dashboard**: Memory page shows all entries, with edit/delete controls
- **CLI**: Edit \`~/.ava/memory.md\` or \`.ava/memory.md\` directly
- **In conversation**: Ask Ava to "forget X" or "remember Y"`,
  },

  // ── Configuration ────────────────────────────────────────────────────────
  {
    topic: 'configuration',
    keywords: ['config', 'settings', 'configure', 'api key', 'apikey', 'temperature', 'max tokens', 'language', 'preferences', 'baseUrl', 'base url', 'provider key', 'dashboard'],
    title: 'Configuration',
    content: `# Configuration

## Extension Settings
Open Settings (Ctrl+,) and search \`ava-supernova\`, or use the Dashboard.

| Setting | Description | Default |
|---------|-------------|---------|
| Active Model | The model Ava uses for responses | (none) |
| Providers > API Key | Your API key for each provider | (empty) |
| Temperature | Sampling temperature (0-2). Lower = more precise, higher = more creative | 0.7 |
| Language | UI and response language | Auto-detect |
| Permission Mode | Tool approval behavior | Strict |
| Max Tokens | Maximum output tokens per response | 8192 |
| Auto Memory | Automatically save important details | Enabled |
| Stream Responses | Show tokens as they arrive | Enabled |

## CLI Configuration
Stored at \`~/.ava/config.json\`:
\`\`\`json
{
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
}
\`\`\`

## IDE Configuration
Open the Dashboard (Ctrl+Shift+D) to configure providers, preferences, and your account.

## Adding API Keys
1. Sign up at the provider's website (links in Settings)
2. Generate an API key
3. Paste it in the Dashboard > Settings > API Providers section
4. The key is stored securely in your system's secret storage

## Supported Providers
| Provider | Key format | Signup URL |
|----------|-----------|------------|
| Anthropic (Claude) | sk-ant-... | console.anthropic.com |
| DeepSeek | sk-... | platform.deepseek.com |
| Kimi (Moonshot) | sk-... | platform.moonshot.cn |
| GLM (Zhipu AI) | (varies) | open.bigmodel.cn |
| Qwen (Alibaba) | sk-... | dashscope.console.aliyun.com |
| Mistral AI | (varies) | console.mistral.ai |

## Custom Provider (Ollama / LM Studio)
Add a \`baseUrl\` to connect to any locally hosted model:
\`\`\`json
{
  "providers": {
    "deepseek": {
      "apiKey": "sk-...",
      "baseUrl": "http://localhost:11434/v1"
    }
  }
}
\`\`\``,
  },

  // ── Project Context ──────────────────────────────────────────────────────
  {
    topic: 'project-context',
    keywords: ['project', 'instructions', 'context', '.ava', 'instructions.md', 'project instructions', 'init', 'custom instructions'],
    title: 'Project Context',
    content: `# Project Context

## .ava/instructions.md
Create this file in your project root to give Ava persistent knowledge about your codebase. It's loaded into Ava's system prompt every session.

### What to Include
- Project architecture overview
- Coding conventions and style preferences
- Key file locations and patterns
- Build and test commands
- Anything you'd tell a new team member

### Example
\`\`\`markdown
# My Project

## Architecture
- React frontend with TypeScript
- Express API with Prisma ORM
- PostgreSQL database

## Conventions
- Use functional components with hooks
- API routes in src/routes/, controllers in src/controllers/
- Tests co-located with source files (*.test.ts)

## Commands
- \`npm run dev\` — Start dev server (port 3000)
- \`npm test\` — Run Jest tests
- \`npm run build\` — Production build
\`\`\`

### Creating the File
- **CLI**: Run \`/init\` to generate a starter file
- **Manual**: Create \`.ava/instructions.md\` in your project root

## Project History
Conversation history is scoped per project — each project gets its own history. When you switch workspaces, Ava loads the appropriate history and project context.

## Project Index
Use \`project_index scan\` to build a structural map of your codebase. This gives Ava a bird's-eye view of frameworks, languages, entry points, test setup, and directory structure. Much faster than exploring manually.`,
  },

  // ── CLI Commands ─────────────────────────────────────────────────────────
  {
    topic: 'cli-commands',
    keywords: ['command', 'cli', 'slash', 'help', 'model', 'clear', 'provider', 'permission', 'history', 'resume', 'search', 'delete', 'rename', 'pin', 'export', 'init', 'exit', 'quit', 'tools', 'retry'],
    title: 'CLI Commands',
    content: `# CLI Commands

## General
| Command | Aliases | Description |
|---------|---------|-------------|
| /help | /h | Show all available commands |
| /model | /m | List available models |
| /model <id> | | Switch to a different model |
| /clear | /c | Clear conversation history |
| /provider | /p | List configured providers |
| /provider add <name> | | Add a provider API key |
| /permission | /perm | View or set permission mode |
| /tools | | List available tools |
| /retry | /r | Retry the last message |
| /init | | Create .ava/instructions.md |
| /exit | /quit, /q | Exit Ava |

## History
| Command | Aliases | Description |
|---------|---------|-------------|
| /history | /ls | List saved conversations |
| /resume <id> | | Resume a saved conversation |
| /search <query> | /s | Search conversations |
| /delete <id> | /rm | Delete a conversation |
| /rename <id> <title> | | Rename a conversation |
| /pin <id> | | Pin a conversation |
| /unpin <id> | | Unpin a conversation |
| /export <id> | | Export as Markdown or JSON |`,
  },

  // ── Languages ────────────────────────────────────────────────────────────
  {
    topic: 'languages',
    keywords: ['language', 'i18n', 'locale', 'translation', 'chinese', 'japanese', 'korean', 'spanish', 'french', 'german', 'russian', 'arabic', 'hindi', 'multilingual'],
    title: 'Language Support',
    content: `# Language Support

Ava supports 20 languages for both the UI and model responses.

## Supported Languages
English, Chinese (Simplified), Chinese (Traditional), Japanese, Korean, Spanish, Portuguese, French, German, Russian, Arabic, Hindi, Vietnamese, Thai, Turkish, Italian, Polish, Ukrainian, Dutch, Indonesian

## How It Works
- **Auto-detect** (default) — Ava uses your VS Code / IDE language setting
- The AI model responds in your preferred language
- Code, file paths, and technical terms always stay in English
- You can override the language in Settings / Dashboard

## Changing Language
- **Extension**: Dashboard > Settings > Language
- **IDE**: Dashboard > Settings > Language
- **CLI**: Set in \`~/.ava/config.json\` under \`preferences.language\``,
  },

  // ── Keyboard Shortcuts ───────────────────────────────────────────────────
  {
    topic: 'keyboard-shortcuts',
    keywords: ['keyboard', 'shortcut', 'hotkey', 'keybinding', 'ctrl', 'shift', 'enter', 'send'],
    title: 'Keyboard Shortcuts',
    content: `# Keyboard Shortcuts

## VS Code Extension
| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+A | Open Ava Chat |
| Enter | Send message |
| Shift+Enter | New line in message |

## IDE
| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+A | Open Ava Chat |
| Ctrl+Shift+D | Open Dashboard |
| Ctrl+Shift+H | Session History |
| Ctrl+Shift+N | New Chat |
| Enter | Send message |
| Shift+Enter | New line in message |

On macOS, use Cmd instead of Ctrl.`,
  },

  // ── Troubleshooting ──────────────────────────────────────────────────────
  {
    topic: 'troubleshooting',
    keywords: ['error', 'problem', 'issue', 'fix', 'not working', 'broken', 'fail', 'crash', 'timeout', 'api error', 'rate limit', '401', '403', '429', '500', 'connection', 'slow', 'stuck', 'hang', 'debug', 'troubleshoot'],
    title: 'Troubleshooting',
    content: `# Troubleshooting

## Common Issues

### "No models available" or empty model list
- **Cause**: No API keys configured
- **Fix**: Add at least one provider API key in Dashboard > Settings, or connect a platform account

### API key not working (401 Unauthorized)
- **Cause**: Invalid, expired, or incorrectly formatted API key
- **Fix**: Verify the key at the provider's dashboard. Regenerate if needed. Make sure you're using the right key format (e.g., sk-ant- for Anthropic, sk- for DeepSeek)

### Rate limit errors (429 Too Many Requests)
- **Cause**: You've exceeded the provider's rate limit
- **Fix**: Wait a moment and retry. Consider switching to a different provider/model temporarily. Check your provider's rate limits and usage dashboard.

### Timeout errors
- **Cause**: The model is taking too long to respond, or network issues
- **Fix**: Try a faster model (e.g., Qwen Turbo, GLM-4 Flash). Check your internet connection. For bash commands, increase the timeout parameter.

### Tool denied / not approved
- **Cause**: Permission mode requires approval for this tool type
- **Fix**: Approve the tool when prompted, or switch to a more permissive permission mode (Balanced or Autonomous) in Settings

### Memory not persisting
- **Cause**: Memory system not initialized, or file permissions issue
- **Fix**: Check that \`~/.ava/\` directory exists and is writable. For project memory, ensure \`.ava/\` is writable in your project root.

### Extension not loading
- **Cause**: VS Code version too old, or conflicting extension
- **Fix**: Requires VS Code 1.85.0 or later. Try disabling other AI extensions temporarily.

### bash tool keeps timing out
- **Cause**: Using default 2-minute timeout for long-running commands
- **Fix**: For dev servers, use \`background: true\`. For long builds, set a higher \`timeout\` value (max 600000ms / 10 minutes).

### Context too large / out of context
- **Cause**: Conversation has grown too long for the model's context window
- **Fix**: Start a new chat (/clear or New Chat button). Context compression happens automatically, but very long sessions may still exceed limits.

## Getting Help
- **Ask Ava to contact support**: Say "I need help with..." or "submit a support ticket" and Ava will use the \`support_request\` tool to send a ticket to the team. You'll get a reply via email.
- **Dashboard**: Visit ava-supernova.com/dashboard/support to view and track your tickets
- **Website**: Visit ava-supernova.com/support for the contact form
- **GitHub Issues**: Report bugs at github.com/AugmentedValueAcceleration/ava-supernova/issues
- **In-app**: Ask Ava about any feature — she can look up her own documentation`,
  },

  // ── Platform Account ─────────────────────────────────────────────────────
  {
    topic: 'platform-account',
    keywords: ['account', 'platform', 'sk-ava', 'sign up', 'register', 'login', 'billing', 'plan', 'pro', 'ultra', 'free', 'tier', 'subscription', 'upgrade', 'tokens', 'usage', 'limit', 'quota'],
    title: 'Platform Account & Billing',
    content: `# Platform Account & Billing

## Plans

### Free Tier
- Bring your own API keys — no account needed
- All 23 tools, all modes, all features
- Local memory and history
- Full open-source experience

### Platform Account (sk-ava- key)
Connect a platform account for additional benefits:
- **Managed API access** — Use models without your own API keys
- **Cloud sync** — Memory and settings sync across machines
- **Usage dashboard** — Track token usage and costs
- **Semantic memory search** — Vector embeddings for intelligent recall

### Pro Plan
- Higher token limits
- Priority API access
- All platform features

### Ultra Plan
- Maximum token limits
- Priority support
- All platform features

## Connecting an Account
1. Sign up at ava-supernova.com
2. Go to Dashboard > API Keys
3. Copy your sk-ava-... key
4. In Ava, go to Dashboard and paste the key in the Connect Account field

## Managing Your Account
- **Usage**: Dashboard > Usage — see token consumption by period and provider
- **Billing**: Dashboard > Billing — manage subscription, view invoices
- **Connections**: Dashboard > Connections — link GitHub, email, Slack, Discord`,
  },

  // ── Dashboard ────────────────────────────────────────────────────────────
  {
    topic: 'dashboard',
    keywords: ['dashboard', 'overview', 'usage', 'connections', 'billing', 'settings', 'sidebar', 'navigation', 'ui', 'panel'],
    title: 'Dashboard',
    content: `# Dashboard

The Dashboard is your control center for Ava. It has 6 pages accessible from the sidebar navigation.

## Pages

### Overview
Quick summary of your account status, active model, usage statistics, and quick actions.

### Usage
Detailed token usage breakdown by period (7 days, 30 days, all time) and by provider/model. Available with platform accounts.

### Memory
View, edit, and delete your saved memories. Shows both global and project-scoped entries.

### Connections
Connect external services for enhanced capabilities:
- **GitHub** — Repository access
- **Email** — Email integration
- **Slack** — Team communication
- **Discord** — Community integration

### Billing
Manage your subscription plan, view invoices, and purchase token top-ups. Options: Pro plan, Ultra plan, or token packs (Starter, Standard, Pro Pack).

### Settings
Configure providers, preferences, and API keys:
- API provider keys (Anthropic, DeepSeek, Kimi, GLM, Qwen, Mistral)
- Language, permission mode, temperature, max tokens
- Auto memory, stream responses

## Access
- **Extension**: Command palette > "Ava: Open Dashboard", or the dashboard icon in the sidebar
- **IDE**: Ctrl+Shift+D, or the Dashboard tab in the Ava panel

## Platform vs BYOK
- **Platform accounts** see all 6 pages
- **BYOK users** (own API keys, no platform account) see Settings with provider key management`,
  },

  // ── Session History ──────────────────────────────────────────────────────
  {
    topic: 'history',
    keywords: ['history', 'session', 'conversation', 'resume', 'load', 'replay', 'pin', 'export', 'import', 'delete', 'rename', 'past', 'previous'],
    title: 'Session History',
    content: `# Session History

Ava saves your conversations so you can resume them later.

## Features
- **Auto-save**: Conversations are saved automatically as you chat
- **Per-project**: History is scoped to each project/workspace
- **Search**: Find past conversations by text query
- **Pin**: Pin important conversations so they stay at the top
- **Rename**: Give conversations meaningful titles
- **Export**: Export as Markdown or JSON for sharing or archiving
- **Import**: Import previously exported conversations

## CLI History Commands
| Command | Description |
|---------|-------------|
| /history | List saved conversations |
| /resume <id> | Resume a conversation |
| /search <query> | Search conversations |
| /delete <id> | Delete a conversation |
| /rename <id> <title> | Rename a conversation |
| /pin <id> | Pin a conversation |
| /export <id> | Export as Markdown or JSON |

## IDE / Extension
- **IDE**: Ctrl+Shift+H or the History tab in the Ava panel
- **Extension**: History is accessible from the chat sidebar

## Session Replay
Load any past conversation to review the full message history, including tool calls and their results. This is read-only — it doesn't affect your active session.`,
  },

  // ── Security Audit ───────────────────────────────────────────────────────
  {
    topic: 'security-audit',
    keywords: ['security', 'audit', 'vulnerability', 'owasp', 'scan', 'injection', 'xss', 'csrf', 'sql', 'secrets', 'credentials', 'cve'],
    title: 'Security Audit Mode',
    content: `# Security Audit Mode

Ava's Security Mode performs an AI-powered OWASP-aligned security audit of your project.

## How to Use
1. Switch to Security Mode (mode bar at bottom of chat)
2. Type your request (e.g., "scan this project" or "check the auth module")
3. Ava systematically scans your codebase using read-only tools
4. Results are presented as a structured report

## What It Scans
- **Injection attacks**: SQL, NoSQL, command, template, path traversal
- **Authentication & Authorization**: Hardcoded credentials, broken access control, JWT issues
- **Secrets & Data Exposure**: API keys in source, .env files in git, sensitive data in logs
- **XSS**: Reflected, stored, DOM-based, dangerouslySetInnerHTML
- **CSRF**: Missing tokens, SameSite misconfiguration
- **Security Misconfiguration**: Debug mode, permissive CORS, missing security headers
- **Insecure Dependencies**: Known CVEs, outdated packages
- **Cryptography Issues**: Weak hashing, insecure random, hardcoded keys
- **SSRF**: Unvalidated URLs in fetch/http calls
- **Insecure Deserialization**: eval(), Function(), dynamic require()
- **Logging**: Sensitive data in logs, missing audit logging

## Finding Format
Each finding includes:
- **Severity**: CRITICAL / HIGH / MEDIUM / LOW / INFO
- **File**: Exact file path and line number
- **Category**: OWASP category
- **Description**: What the issue is and why it matters
- **Code**: The vulnerable code snippet
- **Fix**: Specific remediation with corrected code

## Important
- Security Mode is **read-only** — Ava won't modify files unless you explicitly ask
- Use todo_write tracking to monitor scan progress
- Findings are grouped by severity (CRITICAL first)
- A summary with total findings and risk rating is provided at the end`,
  },
];
