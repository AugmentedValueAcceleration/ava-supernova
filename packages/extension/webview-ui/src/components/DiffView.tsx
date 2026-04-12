/**
 * DiffView — unified-diff style rendering for file_edit / file_write tool
 * calls.
 *
 * Philosophy: show enough that the user understands what changed without
 * leaving flow. Red lines are what was removed, green lines are what was
 * added. No LSP-grade character-level highlighting — that's overkill for
 * a chat surface. Whole-line additions/removals are what matters.
 *
 * - file_edit: render old_string → new_string as two blocks (removed / added)
 * - file_write: render content as a new-file preview (all added)
 *
 * If the combined output is very long, show the first N lines and a
 * "…expand" affordance. The parent ToolCallBlock handles expand state.
 */

interface DiffViewProps {
  toolName: string;
  argsJson: string;
  /** If true, show the whole diff unabridged. If false, show a preview. */
  expanded: boolean;
}

const PREVIEW_LINE_LIMIT = 8;

export function DiffView({ toolName, argsJson, expanded }: DiffViewProps) {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson);
  } catch {
    return null;
  }

  const isEdit = toolName === 'file_edit' || toolName === 'edit';
  const isWrite = toolName === 'file_write' || toolName === 'write';
  if (!isEdit && !isWrite) return null;

  const removed = isEdit ? (args.old_string as string) || '' : '';
  const added = isEdit ? (args.new_string as string) || '' : (args.content as string) || '';

  const removedLines = removed ? removed.split('\n') : [];
  const addedLines = added.split('\n');

  const totalLines = removedLines.length + addedLines.length;
  const showPreview = !expanded && totalLines > PREVIEW_LINE_LIMIT;

  const displayRemoved = showPreview
    ? removedLines.slice(0, Math.min(removedLines.length, PREVIEW_LINE_LIMIT / 2))
    : removedLines;
  const displayAdded = showPreview
    ? addedLines.slice(0, Math.max(1, PREVIEW_LINE_LIMIT - displayRemoved.length))
    : addedLines;

  const removedHidden = removedLines.length - displayRemoved.length;
  const addedHidden = addedLines.length - displayAdded.length;

  return (
    <div className="font-mono text-[11px] leading-[1.5] overflow-x-auto">
      {displayRemoved.length > 0 && (
        <div>
          {displayRemoved.map((line, i) => (
            <DiffLine key={`r-${i}`} kind="removed" line={line} />
          ))}
          {removedHidden > 0 && (
            <div className="px-2 py-0.5 text-[10px] opacity-40 italic">
              … {removedHidden} more removed lines hidden (expand to see all)
            </div>
          )}
        </div>
      )}
      {displayAdded.length > 0 && (
        <div>
          {displayAdded.map((line, i) => (
            <DiffLine key={`a-${i}`} kind="added" line={line} />
          ))}
          {addedHidden > 0 && (
            <div className="px-2 py-0.5 text-[10px] opacity-40 italic">
              … {addedHidden} more added lines hidden (expand to see all)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiffLine({ kind, line }: { kind: 'added' | 'removed'; line: string }) {
  // Use VSCode's own diff background tokens where available; fall back to
  // the classic green/red for themes that don't expose them.
  const isAdded = kind === 'added';
  return (
    <div
      className="flex gap-2 px-2 py-[1px]"
      style={{
        backgroundColor: isAdded
          ? 'var(--vscode-diffEditor-insertedLineBackground, rgba(46, 160, 67, 0.15))'
          : 'var(--vscode-diffEditor-removedLineBackground, rgba(248, 81, 73, 0.15))',
      }}
    >
      <span
        className="flex-shrink-0 select-none w-3 text-center"
        style={{
          color: isAdded
            ? 'var(--vscode-gitDecoration-addedResourceForeground, #2ea043)'
            : 'var(--vscode-gitDecoration-deletedResourceForeground, #f85149)',
        }}
      >
        {isAdded ? '+' : '−'}
      </span>
      <span className="whitespace-pre">{line || ' '}</span>
    </div>
  );
}

/**
 * Count added/removed lines for a summary chip shown in the ToolCallBlock
 * header. Example: "+15 −4" for edits, "+42" for writes.
 */
export function getDiffStats(toolName: string, argsJson: string): { added: number; removed: number } | null {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson);
  } catch {
    return null;
  }

  const isEdit = toolName === 'file_edit' || toolName === 'edit';
  const isWrite = toolName === 'file_write' || toolName === 'write';
  if (!isEdit && !isWrite) return null;

  const removed = isEdit ? ((args.old_string as string) || '').split('\n').length - (((args.old_string as string) || '') ? 0 : 1) : 0;
  const added = isEdit
    ? ((args.new_string as string) || '').split('\n').length - (((args.new_string as string) || '') ? 0 : 1)
    : ((args.content as string) || '').split('\n').length - (((args.content as string) || '') ? 0 : 1);

  return { added: Math.max(0, added), removed: Math.max(0, removed) };
}
