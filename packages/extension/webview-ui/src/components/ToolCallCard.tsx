import { useState, useCallback } from 'react';
import type { ToolCallDisplay } from '../types/messages';
import { CopyButton } from './CopyButton';
import { t } from '../i18n';

interface ToolCallCardProps {
  toolCall: ToolCallDisplay;
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllow?: boolean, allowAll?: boolean) => void;
}

// ─── Human-readable tool descriptions ──────────────────────────────────────

function getToolLabel(name: string, argsJson: string): { label: string } {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson);
  } catch {
    // fallback
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

function shortenPath(p: string | undefined): string {
  if (!p) return '';
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.length <= 2 ? p : parts.slice(-2).join('/');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}

// ─── Status icon components ───────────────────────────────────────────────

function StatusIcon({ status }: { status: ToolCallDisplay['status'] }) {
  if (status === 'running') {
    return (
      <span
        className="inline-block w-3 h-3 border-[1.5px] border-t-transparent rounded-full animate-spin flex-shrink-0"
        style={{ borderColor: 'var(--vscode-textLink-foreground, #3794ff)', borderTopColor: 'transparent' }}
      />
    );
  }
  if (status === 'success') {
    return (
      <span className="text-[11px] flex-shrink-0 leading-none" style={{ color: 'var(--vscode-testing-iconPassed, #4caf50)' }}>
        {'\u2713'}
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="text-[11px] flex-shrink-0 leading-none" style={{ color: 'var(--vscode-testing-iconFailed, #f44336)' }}>
        {'\u2717'}
      </span>
    );
  }
  // pending_confirmation or any other
  return (
    <span className="text-[11px] flex-shrink-0 leading-none opacity-40">
      {'\u25CB'}
    </span>
  );
}

// ─── Single timeline row ──────────────────────────────────────────────────

export function ToolCallCard({ toolCall, onConfirmation }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(
    toolCall.status === 'failed' || toolCall.status === 'pending_confirmation',
  );
  const { label } = getToolLabel(toolCall.name, toolCall.arguments);
  const getResult = useCallback(() => toolCall.result || '', [toolCall.result]);
  const isFailed = toolCall.status === 'failed';
  const isPending = toolCall.status === 'pending_confirmation';

  return (
    <div>
      {/* Clickable row — single line */}
      <button
        aria-expanded={expanded}
        aria-label={`${label} — ${toolCall.status}`}
        className="w-full flex items-center gap-1.5 py-[3px] text-left
                   hover:bg-[var(--vscode-list-hoverBackground)]
                   transition-colors border-none bg-transparent cursor-pointer
                   text-[var(--vscode-foreground)] text-[11px] leading-tight px-0"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon status={toolCall.status} />
        <span className={`font-medium truncate ${toolCall.status === 'running' ? 'opacity-80' : ''}`}>
          {label}
        </span>
        {(toolCall.result || isPending) && (
          <span className="ml-auto opacity-20 text-[9px] flex-shrink-0">
            {expanded ? '\u25B2' : '\u25BC'}
          </span>
        )}
      </button>

      {/* Confirmation bar — always visible for pending_confirmation */}
      {isPending && toolCall.confirmationId && (
        <div className="pl-[18px] py-1.5 space-y-1.5">
          <span className="opacity-70 block text-[11px]">
            {toolCall.summary || t('tool.allow_prompt', { tool: toolCall.name })}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              className="px-3 py-1 rounded text-xs font-medium
                         bg-[var(--vscode-button-background)]
                         text-[var(--vscode-button-foreground)]
                         hover:bg-[var(--vscode-button-hoverBackground)]
                         border-none cursor-pointer"
              onClick={() => onConfirmation(toolCall.confirmationId!, true)}
            >
              {t('tool.allow')}
            </button>
            <button
              className="px-3 py-1 rounded text-xs font-medium
                         bg-[var(--color-accent,var(--vscode-button-background))]
                         text-[var(--vscode-button-foreground)]
                         hover:opacity-80
                         border-none cursor-pointer transition-opacity"
              onClick={() => onConfirmation(toolCall.confirmationId!, true, true)}
            >
              {t('tool.always_allow')}
            </button>
            <button
              className="px-2 py-1 rounded text-[10px]
                         bg-transparent
                         text-[var(--vscode-foreground)] opacity-50 hover:opacity-80
                         border-none cursor-pointer transition-opacity"
              onClick={() => onConfirmation(toolCall.confirmationId!, true, false, true)}
            >
              {t('tool.allow_all')}
            </button>
            <button
              className="px-3 py-1 rounded text-xs font-medium
                         bg-[var(--vscode-button-secondaryBackground)]
                         text-[var(--vscode-button-secondaryForeground)]
                         hover:bg-[var(--vscode-button-secondaryHoverBackground)]
                         border-none cursor-pointer ml-auto"
              onClick={() => onConfirmation(toolCall.confirmationId!, false)}
            >
              {t('tool.deny')}
            </button>
          </div>
        </div>
      )}

      {/* Expanded details — arguments + result */}
      {expanded && !isPending && (toolCall.arguments || toolCall.result) && (
        <div className="pl-[18px] py-1 space-y-1.5">
          {toolCall.arguments && (
            <details className="group">
              <summary className="opacity-40 cursor-pointer hover:opacity-60 text-[10px] uppercase tracking-wide">
                {t('tool.arguments')}
              </summary>
              <pre className="mt-1 text-[10px] overflow-x-auto whitespace-pre-wrap opacity-70 max-h-32 overflow-y-auto">
                {formatArgs(toolCall.arguments)}
              </pre>
            </details>
          )}
          {toolCall.result && (
            <details open={isFailed}>
              <summary className="opacity-40 cursor-pointer hover:opacity-60 text-[10px] uppercase tracking-wide">
                {isFailed ? t('tool.error') : t('tool.output')}
              </summary>
              <div className="relative group/output">
                <pre className={`mt-1 text-[10px] overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto
                                ${isFailed ? 'text-[var(--vscode-errorForeground)]' : 'opacity-70'}`}>
                  {toolCall.result.slice(0, 2000)}
                  {toolCall.result.length > 2000 && `\n${t('tool.truncated')}`}
                </pre>
                <CopyButton
                  getText={getResult}
                  className="absolute top-1 right-1 w-5 h-5
                             opacity-0 group-hover/output:opacity-50 hover:!opacity-100"
                />
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function formatArgs(argsJson: string): string {
  try {
    return JSON.stringify(JSON.parse(argsJson), null, 2);
  } catch {
    return argsJson;
  }
}
