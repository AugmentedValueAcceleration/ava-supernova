/**
 * ToolCallBlock — top-level stream element for a tool call.
 *
 * Renders outside the assistant's chat bubble (distinct from text), with:
 *   - Header: status icon + verb + target (e.g. "Edit packages/core/agent.ts")
 *   - Optional summary chip (+15 −4 lines for diffs, output line count for bash)
 *   - Collapsible preview:
 *       - file_edit / file_write → DiffView (green/red lines)
 *       - bash → live partialOutput during run, final result when done
 *       - everything else → JSON args + text result
 *
 * Design philosophy:
 *   - Tool activity is first-class — it tells the user what's happening
 *     and why, so the header should read naturally.
 *   - Preview defaults to collapsed for anything over ~8 lines; failed
 *     calls auto-expand so errors surface immediately.
 *   - Live bash output streams in the preview (running state) — so users
 *     see what's happening, not just "running..." spinners.
 */

import { useState, useCallback, useEffect } from 'react';
import type { ToolCallDisplay } from '../types/messages';
import { CopyButton } from './CopyButton';
import { getToolHeader } from './tool-header';
import { DiffView, getDiffStats } from './DiffView';
import { t, useLocale } from '../i18n';

interface ToolCallBlockProps {
  toolCall: ToolCallDisplay;
  onConfirmation: (confirmationId: string, approved: boolean, alwaysAllowCategory?: boolean) => void;
}

export function ToolCallBlock({ toolCall, onConfirmation }: ToolCallBlockProps) {
  useLocale();
  const { verb, target } = getToolHeader(toolCall.name, toolCall.arguments);
  const isFailed = toolCall.status === 'failed';
  const isPending = toolCall.status === 'pending_confirmation';
  const isRunning = toolCall.status === 'running';

  // Expand automatically on failure so the user sees the error;
  // keep collapsed otherwise for density.
  const [expanded, setExpanded] = useState(isFailed || isPending);
  useEffect(() => {
    if (isFailed || isPending) setExpanded(true);
  }, [isFailed, isPending]);

  const getResult = useCallback(() => toolCall.result || '', [toolCall.result]);

  // Diff stats for file ops — shown as a chip in the header.
  const diffStats = getDiffStats(toolCall.name, toolCall.arguments);

  // Bash live output line count for running processes.
  const liveOutput = toolCall.partialOutput;
  const liveLineCount = liveOutput ? liveOutput.split('\n').length : 0;

  // Result line count for finished bash calls.
  const resultLines = toolCall.result ? toolCall.result.split('\n').length : 0;

  return (
    <div className="my-1">
      {/* Inline tool row — a thin accent left-rule instead of a boxed card, so
          it reads as part of the conversation flow (one consistent log for
          coding + every other tool), not a widget dropped on top. */}
      <div
        className="overflow-hidden transition-colors"
        style={{
          borderLeft: `2px solid ${isFailed
            ? 'var(--vscode-inputValidation-errorBorder, #f85149)'
            : 'color-mix(in srgb, var(--accent) 38%, transparent)'}`,
        }}
      >
        {/* Header row — clickable to toggle expansion */}
        <button
          aria-expanded={expanded}
          aria-label={`${verb}${target ? ' ' + target : ''} — ${toolCall.status}`}
          className="w-full flex items-center gap-2 pl-2.5 pr-2 py-1.5 text-left
                     hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]
                     transition-colors border-none bg-transparent cursor-pointer
                     text-[var(--vscode-foreground)]"
          onClick={() => setExpanded(!expanded)}
        >
          <StatusIcon status={toolCall.status} />
          <span className="font-semibold text-[12px] flex-shrink-0">{verb}</span>
          {target && (
            <span className="text-[12px] opacity-70 font-mono truncate">
              {target}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            {diffStats && (diffStats.added > 0 || diffStats.removed > 0) && (
              <DiffChip added={diffStats.added} removed={diffStats.removed} />
            )}
            {!diffStats && resultLines > 0 && !isRunning && !isPending && (
              <span className="text-[10px] opacity-50">
                {resultLines} line{resultLines === 1 ? '' : 's'}
              </span>
            )}
            {isRunning && liveLineCount > 0 && (
              <span className="text-[10px] opacity-60">
                {liveLineCount} line{liveLineCount === 1 ? '' : 's'}…
              </span>
            )}
            <span className="text-[9px] opacity-40">
              {expanded ? '▲' : '▼'}
            </span>
          </div>
        </button>

        {/* Confirmation bar — always visible for pending_confirmation */}
        {isPending && toolCall.confirmationId && (
          <div className="pl-2.5 pr-2 py-2 space-y-2">
            <span className="opacity-70 block text-[11px]">
              {toolCall.summary || t('tool.allow_prompt', { tool: toolCall.name })}
            </span>
            {/* Tool's own description — answers 'what does this tool actually do?'
                instead of leaving the user staring at a bare tool name. */}
            {toolCall.toolDescription && (
              <span className="opacity-50 block text-[10px] italic leading-snug">
                {toolCall.toolDescription}
              </span>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className="px-3 py-1 rounded-md text-xs font-medium border border-transparent
                           bg-[var(--color-accent)] text-white
                           hover:brightness-110 cursor-pointer transition"
                onClick={() => onConfirmation(toolCall.confirmationId!, true)}
              >
                {t('tool.allow')}
              </button>
              <button
                className="px-3 py-1 rounded-md text-xs font-medium bg-transparent
                           border border-[var(--color-accent)] text-[var(--color-accent)]
                           hover:bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)]
                           cursor-pointer transition"
                onClick={() => onConfirmation(toolCall.confirmationId!, true, true)}
                title={t('tool.always_allow_category_tip')}
              >
                {t('tool.always_allow')}
              </button>
              <button
                className="px-3 py-1 rounded-md text-xs font-medium bg-transparent ml-auto
                           border border-[color-mix(in_srgb,currentColor_18%,transparent)]
                           text-[var(--vscode-descriptionForeground)]
                           hover:text-[var(--vscode-foreground)] cursor-pointer transition"
                onClick={() => onConfirmation(toolCall.confirmationId!, false)}
              >
                {t('tool.deny')}
              </button>
            </div>
          </div>
        )}

        {/* Expanded preview */}
        {expanded && !isPending && (
          <div className="pl-2.5 pr-1 pb-1.5">
            {/* File diffs get a dedicated view */}
            {diffStats ? (
              <DiffView
                toolName={toolCall.name}
                argsJson={toolCall.arguments}
                expanded={expanded}
              />
            ) : (
              <div
                className="rounded-md px-2.5 py-2 space-y-2"
                style={{ background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}
              >
                {/* Arguments — skipped for edits (diff view is the args) */}
                {toolCall.arguments && toolCall.arguments !== '{}' && (
                  <details className="group">
                    <summary className="opacity-40 cursor-pointer hover:opacity-60 text-[10px]">
                      {t('tool.arguments')}
                    </summary>
                    <pre className="mt-1 text-[11px] overflow-x-auto whitespace-pre-wrap opacity-75 max-h-40 overflow-y-auto font-mono">
                      {formatArgs(toolCall.arguments)}
                    </pre>
                  </details>
                )}

                {/* Live streaming output (bash during run) */}
                {isRunning && liveOutput && (
                  <pre className="text-[11px] overflow-x-auto whitespace-pre-wrap opacity-80 max-h-40 overflow-y-auto font-mono">
                    {liveOutput}
                  </pre>
                )}

                {/* Final result */}
                {toolCall.result && (
                  <div className="relative group/output">
                    <pre
                      className={`text-[11px] overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto font-mono
                                  ${isFailed ? 'text-[var(--vscode-errorForeground)]' : 'opacity-85'}`}
                    >
                      {toolCall.result.slice(0, 4000)}
                      {toolCall.result.length > 4000 && `\n${t('tool.truncated')}`}
                    </pre>
                    <CopyButton
                      getText={getResult}
                      className="absolute top-1 right-1 w-5 h-5
                                 opacity-0 group-hover/output:opacity-60 hover:!opacity-100"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DiffChip({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="text-[10px] font-mono flex items-center gap-1">
      {added > 0 && (
        <span style={{ color: 'var(--vscode-gitDecoration-addedResourceForeground, #2ea043)' }}>
          +{added}
        </span>
      )}
      {removed > 0 && (
        <span style={{ color: 'var(--vscode-gitDecoration-deletedResourceForeground, #f85149)' }}>
          −{removed}
        </span>
      )}
    </span>
  );
}

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
      <span
        className="text-[11px] flex-shrink-0 leading-none"
        style={{ color: 'var(--vscode-testing-iconPassed, #4caf50)' }}
      >
        ✓
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span
        className="text-[11px] flex-shrink-0 leading-none"
        style={{ color: 'var(--vscode-testing-iconFailed, #f44336)' }}
      >
        ✗
      </span>
    );
  }
  return (
    <span className="text-[11px] flex-shrink-0 leading-none opacity-40">
      ○
    </span>
  );
}

function formatArgs(argsJson: string): string {
  try {
    return JSON.stringify(JSON.parse(argsJson), null, 2);
  } catch {
    return argsJson;
  }
}
