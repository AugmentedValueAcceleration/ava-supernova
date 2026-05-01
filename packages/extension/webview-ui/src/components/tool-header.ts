/**
 * Tool-header helper — maps a tool call (name + args JSON) to a
 * descriptive (verb, target) pair used by ToolCallBlock.
 *
 * Design principle: every tool gets a verb that reads naturally to a
 * user ("Edit", "Bash", "Browser"), plus a primary target (file path,
 * command, URL, pattern). Users should understand what Ava is doing
 * without expanding the block.
 *
 * Aliases are included so the helper works both for the internal
 * canonical names (file_write, file_read, file_edit) and the model-
 * facing aliases (write, read, edit).
 */

export interface ToolHeader {
  /** Human-readable verb — "Edit", "Bash", "Browser", "Search" */
  verb: string;
  /** Primary target — file path, command, URL, pattern. May be empty. */
  target: string;
}

export function getToolHeader(name: string, argsJson: string | undefined): ToolHeader {
  let args: Record<string, unknown> = {};
  if (argsJson) {
    try {
      args = JSON.parse(argsJson);
    } catch {
      // Streaming partial JSON — fine, we'll get a final update soon
    }
  }

  const filePath = shortenPath(args.file_path as string | undefined);

  switch (name) {
    // File ops (canonical + aliased)
    case 'file_read':
    case 'read':
      return { verb: 'Read', target: filePath || 'file' };
    case 'file_write':
    case 'write':
      return { verb: 'Write', target: filePath || 'file' };
    case 'file_edit':
    case 'edit':
      return { verb: 'Edit', target: filePath || 'file' };

    // Search
    case 'glob':
      return { verb: 'Glob', target: truncate((args.pattern as string) || '...', 80) };
    case 'grep':
      return { verb: 'Grep', target: truncate((args.pattern as string) || '...', 80) };
    case 'list_directory':
      return { verb: 'List', target: shortenPath(args.path as string | undefined) || 'directory' };
    case 'find_symbol':
      return { verb: 'Find symbol', target: (args.name as string) || '' };
    case 'project_index':
      return { verb: 'Index project', target: '' };

    // Shell
    case 'bash':
      return { verb: 'Bash', target: truncate(((args.command as string) || '').split('\n')[0], 100) };

    // Web / browser
    case 'web_search':
      return { verb: 'Search', target: truncate((args.query as string) || '...', 80) };
    case 'http_request':
      return {
        verb: 'HTTP',
        target: `${(args.method as string) || 'GET'} ${truncate((args.url as string) || '', 80)}`.trim(),
      };
    case 'browser':
      return { verb: 'Browser', target: buildBrowserTarget(args) };

    // Git
    case 'git_status':
      return { verb: 'Git', target: 'status' };
    case 'git_diff':
      return { verb: 'Git', target: 'diff' };
    case 'git_commit':
      return { verb: 'Git commit', target: truncate((args.message as string) || '', 80) };
    case 'git_create_pr':
      return { verb: 'Create PR', target: truncate((args.title as string) || '', 80) };
    case 'rollback':
      return { verb: 'Rollback', target: (args.target as string) || '' };

    // Memory
    case 'memory_save':
      return { verb: 'Save memory', target: (args.category as string) || (args.scope as string) || '' };
    case 'memory_recall':
      return { verb: 'Recall memory', target: truncate((args.query as string) || '', 80) };
    case 'memory_update':
      return { verb: 'Update memory', target: truncate((args.id as string) || (args.content as string) || '', 80) };
    case 'memory_delete':
      return { verb: 'Delete memory', target: truncate((args.id as string) || '', 80) };

    // Media
    case 'screenshot':
      return { verb: 'Screenshot', target: 'screen' };
    case 'generate_image':
      return { verb: 'Generate image', target: truncate((args.prompt as string) || '', 80) };
    case 'generate_video':
      return { verb: 'Generate video', target: truncate((args.prompt as string) || '', 80) };
    case 'generate_music':
      return { verb: 'Generate music', target: truncate((args.prompt as string) || '', 80) };
    case 'generate_voice':
      return { verb: 'Generate voice', target: truncate((args.text as string) || '', 80) };
    case 'remove_background':
      return { verb: 'Remove background', target: '' };

    // Planning / collaboration
    case 'present_plan':
      return { verb: 'Present plan', target: truncate((args.title as string) || '', 80) };
    case 'todo_write':
      return { verb: 'Update todos', target: '' };
    case 'task_manage':
      return { verb: 'Task', target: truncate((args.action as string) || '', 80) };
    case 'apply_plan':
      return { verb: 'Apply plan', target: '' };
    case 'ask_user':
      return { verb: 'Ask user', target: '' };
    case 'switch_mode':
      return { verb: 'Switch mode', target: (args.mode as string) || '' };

    // Documents / data
    case 'database_query':
      return { verb: 'Query', target: truncate((args.sql as string) || (args.query as string) || '', 80) };
    case 'document_manage':
      return { verb: 'Document', target: (args.action as string) || '' };
    case 'document_templates':
      return { verb: 'Document template', target: (args.name as string) || '' };
    case 'email_draft':
      return { verb: 'Draft email', target: truncate((args.subject as string) || '', 80) };
    case 'report_generate':
      return { verb: 'Generate report', target: truncate((args.title as string) || '', 80) };

    // Analysis
    case 'analyze_architecture':
      return { verb: 'Analyse architecture', target: '' };
    case 'audit_dependencies':
      return { verb: 'Audit dependencies', target: '' };
    case 'security':
      return { verb: 'Security audit', target: (args.action as string) || '' };
    case 'benchmark':
      return { verb: 'Benchmark', target: (args.target as string) || '' };

    // Tests / docs
    case 'test_run':
      return { verb: 'Run tests', target: truncate((args.pattern as string) || '', 80) };
    case 'test_generate':
      return { verb: 'Generate tests', target: shortenPath(args.file_path as string | undefined) || '' };
    case 'doc_generate':
      return { verb: 'Generate docs', target: shortenPath(args.file_path as string | undefined) || '' };

    // Debug / journal / learning
    case 'debug_logs':
      return { verb: 'Debug logs', target: (args.query as string) || '' };
    case 'journal_write':
      return { verb: 'Journal', target: truncate((args.entry as string) || (args.title as string) || '', 80) };
    case 'learning':
      return { verb: 'Learning', target: (args.action as string) || '' };

    // Self / utility
    case 'docs_lookup':
      return { verb: 'Lookup docs', target: truncate((args.query as string) || '', 80) };
    case 'propose_tool':
      return { verb: 'Propose tool', target: truncate((args.name as string) || '', 80) };
    case 'self_inspect':
      return { verb: 'Self-inspect', target: (args.target as string) || '' };
    case 'release_notes':
      return { verb: 'Release notes', target: '' };
    case 'support_request':
      return { verb: 'Support request', target: '' };
    case 'get_datetime':
      return { verb: 'Time', target: '' };
    case 'detect_language':
      return { verb: 'Detect language', target: '' };

    // Real-world
    case 'weather':
      return { verb: 'Weather', target: (args.location as string) || '' };
    case 'news':
      return { verb: 'News', target: truncate((args.query as string) || (args.category as string) || '', 80) };

    default:
      return { verb: capitalize(name.replace(/_/g, ' ')), target: '' };
  }
}

function buildBrowserTarget(args: Record<string, unknown>): string {
  const action = (args.action as string) || '';
  switch (action) {
    case 'navigate':
    case 'goto':
      return `navigate ${truncate((args.url as string) || '', 80)}`;
    case 'screenshot':
      return `screenshot${args.selector ? ` ${args.selector}` : ''}`;
    case 'click':
      return `click ${truncate((args.selector as string) || '', 60)}`;
    case 'fill':
      return `fill ${truncate((args.selector as string) || '', 60)}`;
    case 'extract':
      return `extract ${(args.selector as string) || 'page'}`;
    case 'evaluate':
      return 'evaluate JS';
    default:
      return action || 'browser';
  }
}

function shortenPath(p: string | undefined): string {
  if (!p) return '';
  const normalized = p.replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (parts.length <= 3) return normalized;
  // Keep last 3 segments — enough to disambiguate in most repos without
  // overwhelming the header on deeply-nested paths.
  return '…/' + parts.slice(-3).join('/');
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
