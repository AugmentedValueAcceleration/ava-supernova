/**
 * Shared parser for the Builder's trailing <changes-summary> block.
 *
 * Lives in its own module so both the AutoCoordinator (which runs the
 * post-build verification) and the TaskExecutor (which accumulates the union
 * of changed files across tasks) can use it without a circular import — the
 * coordinator already imports TaskExecutor, so the executor must not import
 * back from the coordinator.
 *
 * The format is intentionally forgiving — the block can appear anywhere in the
 * message and field lines can use : or = as separators. Returns null when no
 * block is found or no files are declared.
 */
export function extractChangesSummary(
  message: string,
): { files: string[]; categories: string[]; notes: string | null } | null {
  const blockMatch = message.match(/<changes-summary>([\s\S]*?)<\/changes-summary>/i);
  if (!blockMatch) return null;
  const body = blockMatch[1];
  const parseLine = (label: string): string | null => {
    const re = new RegExp(`(?:^|\\n)\\s*${label}\\s*[:=]\\s*(.+)$`, 'im');
    const m = body.match(re);
    return m ? m[1].trim() : null;
  };
  const filesLine = parseLine('files');
  if (!filesLine) return null;
  const files = filesLine
    .replace(/^\[|\]$/g, '')
    .split(/[,\n]+/)
    .map((f) => f.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
  if (files.length === 0) return null;
  const categoriesLine = parseLine('categories');
  const categories = categoriesLine
    ? categoriesLine
        .replace(/^\[|\]$/g, '')
        .split(/[,|\s]+/)
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const notes = parseLine('notes');
  return { files, categories, notes };
}
