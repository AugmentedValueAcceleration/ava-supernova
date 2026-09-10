import { t } from '../i18n';

/**
 * Human-readable description of a tool call — "Editing src/player.ts" rather
 * than "file_edit".
 *
 * Lived inside ToolCallCard as a private function until 2026-09-10, when the
 * status line needed the same thing. Extracted rather than copied: two
 * implementations of "what is Ava doing right now" would drift the first time
 * a tool was added, and the transcript and the status line would then describe
 * the same action differently.
 *
 * NOTE the switch matches INTERNAL tool names (file_read, file_write,
 * file_edit), not the short names the model sees (read, write, edit).
 * ToolRegistry resolves model-facing aliases back to the canonical identity
 * before any bookkeeping, so events carry the internal name. If that ever
 * inverts, every label here silently falls through to `default` and the user
 * gets raw identifiers — which is exactly the failure that made the file tools
 * unusable in 0.96.
 */
export function getToolLabel(name: string, argsJson: string): { label: string } {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson);
  } catch {
    // Arguments stream in, so a partial JSON blob is normal early in a call.
    // Fall through to the tool's generic label rather than showing nothing.
  }

  const filePath = shortenPath(args.file_path as string | undefined);
  const pattern = args.pattern as string | undefined;
  const command = args.command as string | undefined;

  switch (name) {
    case 'file_read':
      return { label: t('tool.read', { file: filePath || 'file' }) };
    case 'file_write':
      return { label: t('tool.write', { file: filePath || 'file' }) };
    case 'file_edit':
      return { label: t('tool.edit', { file: filePath || 'file' }) };
    case 'glob':
      return { label: t('tool.find_files', { pattern: pattern || '...' }) };
    case 'grep':
      return { label: t('tool.search', { pattern: pattern ? `/${pattern}/` : '...' }) };
    case 'bash':
      return { label: t('tool.run', { command: truncate(command || '...', 60) }) };
    case 'list_directory':
      return { label: t('tool.list_dir', { path: shortenPath(args.path as string | undefined) || 'directory' }) };
    case 'web_search':
      return { label: t('tool.web_search', { query: truncate((args.query as string) || '...', 50) }) };
    case 'ask_user':
      return { label: t('tool.ask_user') };
    case 'git_status':
      return { label: t('tool.git', { command: (args.command as string) || 'status' }) };
    case 'http_request':
      return { label: t('tool.http', { method: (args.method as string) || 'GET', url: truncate((args.url as string) || '...', 50) }) };
    default:
      return { label: name };
  }
}

export function shortenPath(p: string | undefined): string {
  if (!p) return '';
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.length <= 2 ? p : parts.slice(-2).join('/');
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}
