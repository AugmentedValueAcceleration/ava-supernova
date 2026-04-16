// Canonical tool fact table — single source of truth for all 63 built-in tools.
// Rendered by the website, extension DocsPanel, and IDE DocumentationPage.
// Update here when tools are added/renamed/recategorised, not in any surface renderer.

export type ToolCategory =
  | 'file_ops' | 'shell' | 'git' | 'web' | 'media'
  | 'database' | 'system' | 'documents' | 'memory' | 'learning';

export type ToolRisk = 'safe' | 'write' | 'dangerous';

export interface ToolFact {
  name: string;
  category: ToolCategory;
  description: string;
  risk: ToolRisk;
}

export const TOOLS: ToolFact[] = [
  { name: 'analyze_architecture', category: 'file_ops', description: 'Analyse project architecture — dependency graph, circular imports, coupling hotspots, file metrics.', risk: 'safe' },
  { name: 'apply_plan', category: 'documents', description: 'Apply a batch of file edits atomically with a git checkpoint for safe rollback.', risk: 'write' },
  { name: 'ask_user', category: 'system', description: 'Ask the user a question and wait for their response.', risk: 'safe' },
  { name: 'audit_dependencies', category: 'system', description: 'Run a security audit on project dependencies and report vulnerabilities.', risk: 'safe' },
  { name: 'bash', category: 'shell', description: 'Execute shell commands with output capture, error handling, and safety sandboxing.', risk: 'dangerous' },
  { name: 'benchmark', category: 'shell', description: 'Run a command and measure execution time, optionally comparing against a stored baseline.', risk: 'safe' },
  { name: 'browse_library', category: 'file_ops', description: 'Browse the project creative asset library — images, videos, audio, documents.', risk: 'safe' },
  { name: 'browser', category: 'web', description: 'Automate browser interactions — navigate, click, fill, screenshot, extract text, run JS.', risk: 'dangerous' },
  { name: 'computer_use', category: 'system', description: 'See the screen and interact with desktop applications using vision-guided automation.', risk: 'dangerous' },
  { name: 'curator', category: 'system', description: 'Consult the Curator specialist for a design or taste decision.', risk: 'safe' },
  { name: 'database_query', category: 'database', description: 'Execute read-only database queries and visualise results in tables.', risk: 'dangerous' },
  { name: 'debug_logs', category: 'shell', description: 'Read and filter log files or command output for debugging.', risk: 'safe' },
  { name: 'detect_language', category: 'system', description: 'Detect the human language of a text snippet from 20+ supported languages.', risk: 'safe' },
  { name: 'doc_generate', category: 'documents', description: 'Generate project documentation (README, API docs, architecture overview) from source code.', risk: 'write' },
  { name: 'docs_lookup', category: 'file_ops', description: 'Search Ava documentation to help users with features, setup, and troubleshooting.', risk: 'safe' },
  { name: 'document_manage', category: 'documents', description: 'Create, read, edit, and export documents (Word, Excel, PDF, CSV, Markdown).', risk: 'write' },
  { name: 'email_draft', category: 'documents', description: 'Draft an email with structured content, tone control, and .docx file output.', risk: 'safe' },
  { name: 'env_write', category: 'system', description: 'Write a granted secret to the project env file. Hard-fails if the env file is not in .gitignore.', risk: 'write' },
  { name: 'file_edit', category: 'file_ops', description: 'Replace an exact string in a file with new content.', risk: 'write' },
  { name: 'file_read', category: 'file_ops', description: 'Read the contents of a file with line numbers.', risk: 'safe' },
  { name: 'file_write', category: 'file_ops', description: 'Create or overwrite a file with the given content.', risk: 'write' },
  { name: 'find_symbol', category: 'file_ops', description: 'Find where functions, classes, types, and other symbols are defined or referenced.', risk: 'safe' },
  { name: 'generate_image', category: 'media', description: 'Generate AI images from a text prompt with quality verification via a vision model.', risk: 'write' },
  { name: 'generate_music', category: 'media', description: 'Generate AI music from a text prompt. Supports instrumental and vocal tracks with lyrics.', risk: 'write' },
  { name: 'generate_video', category: 'media', description: 'Generate a short AI video from a text prompt using MiniMax Hailuo.', risk: 'write' },
  { name: 'generate_voice', category: 'media', description: 'Generate AI voice/speech from text using MiniMax TTS.', risk: 'write' },
  { name: 'get_datetime', category: 'system', description: 'Get the current date, time, and timezone from the host system.', risk: 'safe' },
  { name: 'git_commit', category: 'git', description: 'Stage and commit changes with an auto-generated or custom commit message.', risk: 'write' },
  { name: 'git_create_pr', category: 'git', description: 'Create a GitHub pull request from the current branch with an auto-generated title and description.', risk: 'write' },
  { name: 'git_diff', category: 'git', description: 'Show formatted git diffs with structured modes (staged, unstaged, all, branch).', risk: 'safe' },
  { name: 'git_status', category: 'git', description: 'Run read-only git commands (status, diff, log, branch, show).', risk: 'safe' },
  { name: 'glob', category: 'file_ops', description: 'Find files matching a glob pattern.', risk: 'safe' },
  { name: 'grep', category: 'file_ops', description: 'Search file contents using regex patterns.', risk: 'safe' },
  { name: 'http_request', category: 'web', description: 'Make HTTP requests (GET, POST, etc.) with automatic retries and response parsing.', risk: 'dangerous' },
  { name: 'journal_write', category: 'documents', description: 'Write to the dual journal — Ava session observations and the user reflection log.', risk: 'safe' },
  { name: 'learning_create', category: 'learning', description: 'Create a structured learning curriculum with modules and lessons for the user.', risk: 'write' },
  { name: 'learning_progress', category: 'learning', description: 'View learning progress, list curriculums, find next lesson, check review schedule, or search learning content.', risk: 'safe' },
  { name: 'learning_teach', category: 'learning', description: 'Deliver a lesson, write teaching content, give feedback, run a quiz, or trigger a review.', risk: 'write' },
  { name: 'list_directory', category: 'file_ops', description: 'List the contents of a directory with file types and sizes.', risk: 'safe' },
  { name: 'memory_delete', category: 'memory', description: 'Delete a specific memory entry by ID.', risk: 'safe' },
  { name: 'memory_recall', category: 'memory', description: 'Search persistent memory for information from past conversations using semantic queries.', risk: 'safe' },
  { name: 'memory_save', category: 'memory', description: 'Save information to persistent memory that survives across conversations.', risk: 'safe' },
  { name: 'memory_update', category: 'memory', description: 'Update an existing memory entry by ID.', risk: 'safe' },
  { name: 'news', category: 'web', description: 'Fetch curated tech and AI news, filterable by category or keyword.', risk: 'safe' },
  { name: 'present_plan', category: 'documents', description: 'Present a structured plan for the user to review and approve before execution.', risk: 'write' },
  { name: 'project_index', category: 'file_ops', description: 'Scan, refresh, or display the project structure index.', risk: 'safe' },
  { name: 'propose_tool', category: 'system', description: 'Propose a new tool to the development team when a capability gap is hit.', risk: 'write' },
  { name: 'release_notes', category: 'web', description: 'Fetch published release notes for Ava | Supernova.', risk: 'safe' },
  { name: 'remove_background', category: 'media', description: 'Remove the background from an image, making it transparent.', risk: 'write' },
  { name: 'report_generate', category: 'documents', description: 'Generate a structured .docx report from tasks, journal, memory, and project data.', risk: 'write' },
  { name: 'rollback', category: 'git', description: 'Restore, discard, or check the status of a git checkpoint.', risk: 'dangerous' },
  { name: 'screenshot', category: 'media', description: 'Capture a screenshot of the current screen for visual analysis.', risk: 'safe' },
  { name: 'secret_request', category: 'system', description: 'Request access to a secret from the user vault. Returns an opaque handle the host substitutes at execution time.', risk: 'safe' },
  { name: 'self_inspect', category: 'file_ops', description: 'Read Ava own source code when the actual implementation needs to be quoted or examined.', risk: 'safe' },
  { name: 'support_request', category: 'system', description: 'Submit a support ticket to the Ava development team.', risk: 'write' },
  { name: 'switch_mode', category: 'documents', description: 'Offer to transition to a different mode when the current mode work is complete.', risk: 'safe' },
  { name: 'task_manage', category: 'documents', description: 'Manage the personal task list — list, create, complete, update, delete.', risk: 'safe' },
  { name: 'test_generate', category: 'shell', description: 'Generate test scaffolding for a source file using the detected test framework.', risk: 'write' },
  { name: 'test_run', category: 'shell', description: 'Detect the project test framework and run tests (full suite or specific file).', risk: 'safe' },
  { name: 'todo_write', category: 'documents', description: 'Create or update a visual task list for tracking progress in the current session.', risk: 'safe' },
  { name: 'weather', category: 'web', description: 'Get current weather and 3-day forecast. Auto-detects location if none specified.', risk: 'safe' },
  { name: 'web_search', category: 'web', description: 'Search the web for current information.', risk: 'safe' },
];

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  file_ops: 'File operations',
  shell: 'Shell',
  git: 'Git',
  web: 'Web',
  media: 'Media',
  database: 'Database',
  system: 'System',
  documents: 'Documents',
  memory: 'Memory',
  learning: 'Learning',
};

export const TOTAL_TOOL_COUNT = TOOLS.length;
