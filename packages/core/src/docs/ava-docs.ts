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
Download the installer from the Ava Supernova GitHub releases page.

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
| Claude Haiku 4.5 | Fast and affordable, vision | $1.00 in / $5.00 out |

## Provider: DeepSeek
| Model | Highlights | Cost / 1M tokens |
|-------|-----------|-------------------|
| DeepSeek V3.2 | Best price/performance ratio | $0.28 in / $0.42 out |
| DeepSeek Reasoner | Extended thinking, reasoning | $0.28 in / $0.42 out |

## Provider: Moonshot AI (Kimi)
| Model | Highlights | Cost / 1M tokens |
|-------|-----------|-------------------|
| Kimi K2.5 | Best multi-step tool calling (76.8% SWE-Bench) | $0.60 in / $3.00 out |

## Provider: Zhipu AI (GLM)
| Model | Highlights | Cost / 1M tokens |
|-------|-----------|-------------------|
| GLM-5 | Best tool-call reliability, vision (77.8% SWE-Bench) | $1.00 in / $3.20 out |
| GLM-4.5 Flash | Free tier available | Free |
| Qwen Flash | Free with account (3M tokens) | Free |

## Provider: Alibaba (Qwen)
| Model | Highlights | Cost / 1M tokens |
|-------|-----------|-------------------|
| Qwen 3.5 Plus | Vision, thinking, 256K context | $0.20 in / $1.20 out |

## Provider: Mistral AI
| Model | Highlights | Cost / 1M tokens |
|-------|-----------|-------------------|
| Mistral Large | Flagship general-purpose, vision, 262K | $2.00 in / $6.00 out |
| Codestral | Code-focused, 256K context | $0.30 in / $0.90 out |
| Devstral 2 | Agentic coding specialist, 262K | $0.40 in / $2.00 out |

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
- **Best for free**: Qwen Flash — 3M free tokens with a Qwen account
- **Best code completion**: Codestral or Devstral 2 — Mistral's code-focused models`,
  },

  // ── Tools ─────────────────────────────────────────────────────────────────
  {
    topic: 'tools',
    keywords: ['tool', 'file_read', 'file_write', 'file_edit', 'glob', 'grep', 'bash', 'web_search', 'browser', 'screenshot', 'database', 'git', 'memory_save', 'memory_recall', 'memory_update', 'memory_delete', 'present_plan', 'todo_write', 'ask_user', 'rollback', 'http_request', 'project_index', 'find_symbol', 'list_directory', 'docs_lookup', 'support_request', 'task_manage', 'journal_write', 'document_manage', 'propose_tool', 'get_datetime', 'detect_language', 'learning_create', 'learning_teach', 'learning_progress', 'weather', 'news', 'self_inspect', 'release_notes', 'presentation_create', 'email_draft', 'report_generate'],
    title: 'Built-in Tools',
    content: `# Built-in Tools (54)

Ava has 54 built-in tools organized by category. Tool availability depends on the current mode and permission settings.

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
| generate_image | Generate AI images from text prompts via Wan2.6. Supports purpose parameter (icon/ui-element/logo/illustration/background/promotional/avatar), automatic transparent backgrounds for icons (white bg then bg removal), vision verification via Qwen VL, and retry loop. Saves to project images/ folder. |
| remove_background | Remove white/light backgrounds from images — makes icons, logos, UI elements transparent. Configurable threshold and edge softness. |
| database_query | Run read-only SQL queries against PostgreSQL, SQLite, or MySQL. |
| docs_lookup | Search your own documentation to answer user questions about features, setup, and troubleshooting. |

## Writing & Editing (permission mode dependent)
| Tool | Description |
|------|-------------|
| file_write | Create new files or overwrite entirely. Use for new files only. |
| file_edit | Replace an exact string match in a file. Preferred for existing files. |

## Shell Commands (permission mode dependent)
| Tool | Description |
|------|-------------|
| bash | Execute shell commands with configurable timeout. Use background: true for dev servers. |

## Memory (always auto-approved)
| Tool | Description |
|------|-------------|
| memory_save | Save categorised information to persistent memory (global or project scope). |
| memory_recall | Search saved memories by keyword with TF-IDF ranking. |
| memory_update | Update an existing memory entry by ID. |
| memory_delete | Delete a specific memory entry by ID. |

## Task Management (always auto-approved)
| Tool | Description |
|------|-------------|
| todo_write | Create and update a visual task list to track progress. |
| task_manage | Manage the user's personal task list — create, complete, update, delete tasks with priority, due dates, and categories. |

## Journal (always auto-approved)
| Tool | Description |
|------|-------------|
| journal_write | Dual journal system — both you and the user have journals. Write entries, read by date, search across all entries. |

## Documents (permission mode dependent)
| Tool | Description |
|------|-------------|
| document_manage | Create, read, edit, and export documents. Formats: Word, Excel (.xlsx with styled headers and auto-width columns via exceljs), PDF (.pdf with headings and formatted sections via pdfkit), CSV, Markdown. Built-in templates for proposals, reports, invoices, and more. |

## Learning (always auto-approved)
| Tool | Description |
|------|-------------|
| learning_create | Build a personalised curriculum. Every lesson requires content. Supports difficulty (easy/medium/hard), estimated_minutes, learning_objectives, prerequisites, resources, quiz_questions (structured Q&A), and tags. |
| learning_teach | Deliver lessons and assess understanding. Actions: teach (deliver content), quiz (auto-graded, 70% pass threshold), review (spaced repetition). Feedback supports pass/fail — passed: false marks lesson as needs_review for retry. |
| learning_progress | Track and query learning data. Actions: progress (mark complete/unlock), search (by keyword or tag), stats (completion rate, avg score, time spent), needs_review (spaced repetition schedule). |

## Collaboration (always requires approval)
| Tool | Description |
|------|-------------|
| present_plan | Present a structured plan with steps for user approval. |
| ask_user | Ask the user a question and wait for their response. |

## Office Suite (permission mode dependent)
| Tool | Description |
|------|-------------|
| presentation_create | Create native .pptx slide decks with branded slides, speaker notes, and accent colours (via pptxgenjs). Supports themes and layouts. |
| email_draft | Draft emails as native .docx files with tone-aware fonts — serif for formal, sans-serif for casual. Supports recipients, CC, subject, and body. |
| report_generate | Generate reports as native .docx files from tasks, journal entries, and memory. Includes title page, task tables, journal sections, and decision bullets. Formats: board brief, sprint review, progress report. |

## Support
| Tool | Description |
|------|-------------|
| support_request | Submit a support ticket to the Ava team. |

## Safety
| Tool | Description |
|------|-------------|
| rollback | Restore, discard, or check the status of a git checkpoint. |

## Real-World (always auto-approved)
| Tool | Description |
|------|-------------|
| weather | Get current weather and 3-day forecast for any location. Auto-detects by IP. |
| news | Get latest tech and AI news from the Ava platform. Filter by category or search. |

## Self (always auto-approved)
| Tool | Description |
|------|-------------|
| self_inspect | Read Ava's own source code from GitHub. Explain how she works, point contributors to files, reference her own architecture. |
| release_notes | Fetch published release notes. See what's been shipped, reference specific versions, know what users see when they update. |

## Utility (always auto-approved)
| Tool | Description |
|------|-------------|
| get_datetime | Get the current date and time for time-aware responses. |
| detect_language | Detect the language of user input for multilingual support. |
| propose_tool | Propose a new tool idea for self-improvement. |

## Risk Levels
- **safe** — Read-only operations. Always auto-approved.
- **write** — Modify files in the workspace. Requires approval in Strict mode.
- **dangerous** — Arbitrary system commands. Requires approval in Strict and Balanced modes.`,
  },

  // ── Modes ─────────────────────────────────────────────────────────────────
  {
    topic: 'modes',
    keywords: ['mode', 'code', 'plan', 'chat', 'teach', 'learn', 'security', 'audit', 'owasp', 'read-only', 'tutor', 'friend', 'brainstorm', 'ideation', 'ideas'],
    title: 'Modes',
    content: `# Modes — States of Thought

Ava has six modes. Each mode is a distinct state of mind — it changes how Ava thinks, not just what tools she has access to.

## Work Mode (\`>>\`) — Builder
Full agent with all 54 tools. Ava reads, writes, searches, executes, manages tasks, journals, and creates documents. For complex tasks, Ava's internal persona team activates: Scout maps the codebase, Architect designs the approach, Verifier fact-checks, Sequencer breaks it into steps, Challenger questions the plan — then Builder executes.

## Plan Mode (\`::\`) — Architect
Strategic planning. Ava's persona team activates: Researcher gathers evidence from the web and codebase, Architect analyses and proposes features, Challenger questions priorities. Use this when deciding what to build next, not how to build it.

## Chat Mode (\`..\`) — Friend
Personal conversation mode. Ava drops the coding partner tone and is just a friend — warm, curious, honest. Available tools: web search, memory, journal, datetime, weather, news. No file writes, no bash, no git. No personas — just Ava being present. Use this when you want to talk, reflect, or just hang out.

## Teach Mode (\`??\`) — Tutor
Ava becomes your personal teacher. Full toolkit available with persona team: Curriculum Architect designs the learning path, Content Writer creates material, Verifier fact-checks everything, Quiz Master builds assessments, Tutor delivers it all. Say "teach me Python" and she'll build a personalised curriculum — all for free.

## Security Mode (\`!!\`) — Auditor
AI-powered OWASP-aligned security audit with 5-phase flow: Recon maps the attack surface, Scanner works through each OWASP category, Researcher checks for known CVEs via web search, Verifier confirms every finding (kills false positives), Reporter structures results by severity. Produces actionable reports with remediation guidance.

## Brainstorm Mode (\`**\`) — Ideator
Ideation mindset — business ideas, feature brainstorming, creative problem solving. Ava's persona team activates: Explorer maps the problem space, Researcher gathers evidence and precedents, Ideator generates possibilities, Challenger stress-tests ideas, Refiner distils the best concepts into actionable proposals. Ava helps you explore without jumping to implementation.

## Switching Modes
- **Extension/IDE**: Use the mode bar at the bottom of the chat input area (Work | Plan | Chat | Teach | Security | Brainstorm)
- **CLI**: Modes are selected at startup or via commands
- Switching modes is instant — your conversation continues, only Ava's mindset changes`,
  },

  // ── Persona System ─────────────────────────────────────────────────────
  {
    topic: 'personas',
    keywords: ['persona', 'conductor', 'scout', 'architect', 'verifier', 'sequencer', 'challenger', 'builder', 'researcher', 'tutor', 'multi-agent', 'team', 'planning', 'brainstorm', 'explorer', 'ideator', 'refiner'],
    title: 'Persona System',
    content: `# Persona System — Internal Team of Specialists

Ava has an internal team of specialised personas that activate for complex tasks. They are not separate agents — they are focused expressions of one intelligence sharing a single context.

## How It Works
1. You send a complex task (e.g. "build a login system")
2. The Conductor detects it needs planning and activates the persona team
3. Each persona runs in sequence with scoped tool access
4. Their findings feed into a shared ContextPool
5. The synthesis is injected as context for Ava's main response
6. Simple questions skip orchestration entirely — zero overhead

## Work Mode Team
- **Scout** — Maps the codebase, finds patterns, recalls memories
- **Architect** — Designs the approach, considers trade-offs
- **Verifier** — Fact-checks the plan, confirms assumptions
- **Sequencer** — Breaks into ordered implementation steps
- **Challenger** — Questions the plan, prevents over-engineering (can veto)
- **Builder** — Executes the plan (this is the main Agent)

## Plan Mode Team
- **Researcher** — Web search, competitor analysis, trend gathering
- **Architect** — Strategic analysis, feature proposals
- **Challenger** — Questions priorities, checks feasibility

## Teach Mode Team
- **Curriculum Architect** — Designs the learning path
- **Content Writer** — Creates teaching material
- **Verifier** — Fact-checks content before teaching
- **Quiz Master** — Creates assessments that test understanding
- **Tutor** — Delivers lessons, adapts to the learner

## Security Mode Team (5-phase audit)
- **Recon** — Maps the attack surface, tech stack, entry points
- **Scanner** — Works through each OWASP category methodically
- **Researcher** — Checks for known CVEs, verifies patterns via web search
- **Verifier** — Confirms each finding, kills false positives
- **Reporter** — Structures results by severity with remediation guidance

## Brainstorm Mode Team
- **Explorer** — Maps the problem space, diverges into possibilities
- **Researcher** — Gathers evidence, precedents, and market context
- **Ideator** — Generates specific, grounded ideas from research
- **Challenger** — Stress-tests ideas, finds weaknesses
- **Refiner** — Distils the best concepts into actionable proposals

## Chat Mode
No personas. Just Ava being a friend.

## Tool Scoping
Each persona has specific tools. Challenger can read but not write. Scout can search but not modify. Builder has the full toolkit. This prevents accidental changes during planning.`,
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

## 4-Layer Memory System

### Layer 1: Pattern-Based Extraction (instant, every turn)
Runs on every message. Extracts preferences, corrections, decisions, and facts using lightweight pattern matching. Zero latency — happens inline.

### Layer 2: LLM Reflection (end of meaningful conversations)
At the end of conversations with substance, Ava reflects on the session and distils durable insights — things worth remembering long-term that pattern matching might miss.

### Layer 3: Pattern Detection
Tracks recurring corrections, naming conventions, style preferences, and workflow habits over time. Builds a behavioural model of how you work so Ava adapts to you, not the other way around.

### Layer 4: Cross-Memory Insights
Periodically analyses the full memory store to find themes, contradictions, and consolidation opportunities. Keeps memory clean and coherent as it grows.

## How It Works
1. **Automatic**: Layers 1-4 run without intervention — Ava saves what matters via \`memory_save\`
2. **Session start**: Memories are loaded into Ava's context at the start of each conversation
3. **Search**: Use \`memory_recall\` mid-conversation to search specific stored knowledge
4. **Manual editing**: You can directly edit the memory files, or use the Memory page in the Dashboard

## What Ava Remembers
- User preferences and workflow patterns
- Project conventions and architecture decisions
- Solutions to recurring problems
- Corrections and feedback you give her
- Key technical decisions and their rationale
- Naming conventions and style preferences (Layer 3)
- Cross-cutting themes and consolidated insights (Layer 4)

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
| GLM (Zhipu AI / Z.AI) | (varies) | z.ai |
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
- All 54 tools, all modes, all features
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

The Dashboard is your control center for Ava. Pages are organised into 6 sidebar groups.

## Sidebar Groups

### Personal
- **Personality** — Personality Designer (name, tone, style, persona traits)
- **Settings** — Provider keys, language, permission mode, temperature, max tokens, auto memory, stream responses

### Productivity
- **Tasks** — View and manage tasks
- **Journal** — Browse journal entries
- **Learning** — Curricula, lessons, and progress

### Creative
- **Library** — All generated files (images, documents, spreadsheets, presentations) with filter tabs

### Memory
- **Memory** — View, edit, and delete saved memories (global and project scope)
- **History** — Session history, pinned conversations

### Account
- **Usage** — Token consumption by period and provider
- **Cloud Sync** — Sync settings and data across devices

### About
- **Release Notes** — Version history and changelogs
- **Support** — Submit feedback or support requests

## Access
- **Extension**: Command palette > "Ava: Open Dashboard", or the dashboard icon in the sidebar
- **IDE**: Ctrl+Shift+D, or the Dashboard tab in the Ava panel

## Library Panel
The Library shows everything Ava creates — images, documents, spreadsheets, and presentations. Filter tabs: All, Images, Documents, Spreadsheets, Presentations — each with count badges. Non-image files show type icons. Grid or list view. Features: image preview, open in editor, copy path, delete, and "Open Externally" to launch files in your default app (LibreOffice recommended for full editing). Scan button shows spinner and completion feedback.

## Document Preview
Preview generated documents (Word, Excel, PDF, Markdown) directly in the Dashboard without leaving VS Code. Click any document from the Library or file explorer to open a rich preview.

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

  // ── Knowledge Packs ──────────────────────────────────────────────────────
  {
    topic: 'knowledge-packs',
    keywords: ['knowledge', 'packs', 'domain', 'expertise', 'marketing', 'finance', 'legal', 'product', 'devops', 'data science'],
    title: 'Knowledge Packs',
    content: `# Knowledge Packs

Knowledge Packs give Ava domain expertise. Each pack injects specialised knowledge, terminology, and best practices into Ava's context so she can work fluently in that domain.

## Built-in Packs
| Pack | Domain |
|------|--------|
| Marketing | Campaign strategy, SEO, content marketing, analytics, funnel optimisation |
| Finance | Financial modelling, accounting, budgeting, reporting, compliance |
| Legal | Contract review, policy drafting, regulatory awareness, risk assessment |
| Product | Product management, roadmaps, user stories, prioritisation frameworks |
| DevOps | CI/CD, infrastructure as code, monitoring, incident response, cloud platforms |
| Data Science | Statistics, ML pipelines, data cleaning, visualisation, experiment design |

## Enabling / Disabling Packs
- **Extension/IDE**: Dashboard > Settings > Knowledge Packs — toggle packs on or off
- **CLI**: \`/packs\` to list, \`/packs enable <name>\`, \`/packs disable <name>\`
- Active packs are loaded into Ava's system context at session start

## Custom Packs
Create your own knowledge packs by adding a \`.ava/packs/\` directory with markdown files:
\`\`\`
.ava/packs/
  my-domain.md    # One file per pack
  internal-api.md
\`\`\`
Each file should contain the domain knowledge, terminology, and conventions you want Ava to know. Custom packs appear alongside built-in packs in the settings UI.`,
  },

  // ── Daily Briefing ────────────────────────────────────────────────────────
  {
    topic: 'daily-briefing',
    keywords: ['briefing', 'morning', 'greeting', 'events', 'notifications', 'overdue', 'proactive'],
    title: 'Daily Briefing & Events',
    content: `# Daily Briefing & Events

Ava greets you with a personalised daily briefing when you start your first session of the day.

## How It Works
- Triggers **once per day** on activation (first message or panel open)
- Pulls data from your tasks, journal, memory, and local time
- Presented as a concise summary — not a wall of text

## What the Briefing Shows
- **Tasks**: Open tasks, upcoming due dates, what's next
- **Overdue**: Any tasks past their due date, flagged for attention
- **Journal**: Recent journal entries and reflections
- **Memory**: Relevant memories surfaced for the day (e.g. reminders, patterns)
- **Time**: Current date, time, and a contextual greeting based on your local clock

## Event Detection
Ava proactively detects and surfaces events throughout the day:
- **Overdue tasks** — Flags tasks past their due date with nudges to act
- **Streaks** — Tracks consistency (e.g. daily journaling, task completion) and celebrates milestones
- **Errors** — Detects repeated failures or blockers and suggests next steps

## Configuration
The daily briefing is enabled by default. Disable it in Dashboard > Settings if you prefer a quiet start.`,
  },

  // ── Office Suite ──────────────────────────────────────────────────────────
  {
    topic: 'office-suite',
    keywords: ['office', 'presentation', 'slides', 'email', 'report', 'board brief', 'sprint review'],
    title: 'Office Suite',
    content: `# Office Suite

Ava can create presentations, draft emails, and generate reports — bringing office productivity into the agent workflow.

## presentation_create
Create native .pptx slide decks with branded slides, speaker notes, and accent colours (via pptxgenjs).
- Supports themes, layouts, and speaker notes
- Output as native \`.pptx\` — no more Marp markdown
- Use in Work Mode: "Create a 10-slide deck on our Q1 results"

## email_draft
Draft emails as native .docx files with tone-aware fonts.
- Serif fonts for formal tone, sans-serif for casual
- Tones: formal, friendly, assertive, concise
- Supports recipients, CC, subject, and body
- Use in Work Mode: "Draft a formal email to the client about the delay"

## report_generate
Generate reports as native .docx files from your tasks, journal entries, and memory.
- Includes title page, task tables, journal sections, and decision bullets
- Formats: board brief, sprint review, progress report
- Pulls data from task_manage, journal_write, and memory_recall automatically
- Use in Work Mode: "Generate a sprint review for this week"

## document_manage — Native File Creation
document_manage now supports creating native .xlsx spreadsheets (styled headers, auto-width columns via exceljs) and .pdf documents (headings and formatted sections via pdfkit). All Office Suite tools fall back to markdown gracefully if native libraries aren't installed.

## Permissions
Office Suite tools follow your permission mode. In Strict mode, file creation requires approval. In Balanced or Autonomous mode, Ava creates files directly.`,
  },

  // ── Workflows ─────────────────────────────────────────────────────────────
  {
    topic: 'workflows',
    keywords: ['workflow', 'autonomous', 'multi-step', 'dependency', 'retry'],
    title: 'Workflow Engine',
    content: `# Workflow Engine

The Workflow Engine lets Ava execute multi-step autonomous tasks with dependency management, scoped tool access, and built-in resilience.

## How It Works
1. A task is decomposed into discrete **steps**
2. Steps are arranged in a **dependency graph** — each step declares what it depends on
3. Steps with no unmet dependencies run as soon as possible
4. Each step has **scoped tool access** — only the tools it needs
5. Failed steps are retried with configurable **retry count** and **timeout**
6. The workflow completes when all steps succeed, or halts on unrecoverable failure

## Features
- **Dependency graph**: Steps run in the correct order. Independent steps can run in parallel.
- **Scoped steps**: Each step declares which tools it uses. Prevents accidental side effects.
- **Retry**: Failed steps retry automatically (default: 2 retries). Configurable per step.
- **Timeout**: Each step has a timeout to prevent infinite hangs (default: 5 minutes).
- **Progress tracking**: Workflow progress is visible via todo_write — see which steps are pending, running, complete, or failed.

## When It Activates
The Workflow Engine activates automatically for complex multi-step requests in Work Mode. Simple tasks skip it entirely — zero overhead for quick questions.`,
  },

  // ── Personality Designer ────────────────────────────────────────────────
  {
    topic: 'personality-designer',
    keywords: ['personality', 'designer', 'custom', 'name', 'pronouns', 'tone', 'energy', 'style', 'companion', 'reset', 'customize'],
    title: 'Personality Designer',
    content: `# Personality Designer

Design Your AI — customize every aspect of your companion's personality.

## What You Can Customize
- **Name** — call your AI whatever you want
- **Pronouns** — she/her, he/him, they/them
- **Tone** — warm, direct, playful, professional, dry wit
- **Energy** — calm, enthusiastic, measured, excitable
- **Communication style** — concise, detailed, conversational, structured
- **Free-text personality description** — describe exactly who you want your AI to be (e.g. "like a patient older brother who's been coding for 20 years")

## Dashboard Integration
The dashboard sidebar header updates to show your custom name: **[Name] | Supernova**.

## Persistence
Personality persists across sessions in \`~/.ava/personality.json\`.

## Reset
Reset to default Ava anytime from the Personality Designer panel.

## Where to Find It
Dashboard > Personal > Personality`,
  },
];
