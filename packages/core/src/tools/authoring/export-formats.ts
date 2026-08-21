/**
 * Which formats a document can be exported to — and nothing else.
 *
 * Dependency-free on purpose, the same reason routing-modes.ts is: the answer
 * to "can this be exported, and as what?" is needed by the renderer (Node), the
 * extension host (Node) and two webview bundles (no Node at all). A file that
 * imports nothing can be reached from all four, so the list lives in one place
 * instead of being copied into the surfaces that could not cheaply import it.
 *
 * Reachability shapes what people write. Keep this leaf a leaf.
 */

export type RenderTarget = 'docx' | 'pdf' | 'md' | 'odt' | 'ods';

/** What a user can export TO. Markdown is the source format, not a
 *  destination — exporting a .md as .md is a no-op nobody asked for. */
export type ExportFormat = Exclude<RenderTarget, 'md'>;

/** Targets needing no optional peer, so they always work. */
export const ALWAYS_AVAILABLE_TARGETS: readonly RenderTarget[] = ['md', 'odt', 'ods'];

/**
 * Sources that can be re-rendered into another format.
 *
 * Deliberately excludes built documents (.docx, .xlsx, .pdf): turning one of
 * those into another is a lossy conversion wearing an export's clothes. For
 * those the honest actions are Open and Reveal.
 */
export const EXPORTABLE_SOURCE_EXTENSIONS: readonly string[] = ['.md', '.markdown', '.txt', '.csv'];

/** What prose exports as. `.docx` first: it opens everywhere, including in
 *  LibreOffice and the ODF suites. */
export const DOCUMENT_TARGETS: readonly ExportFormat[] = ['docx', 'odt', 'pdf'];

/** What tabular data exports as. */
export const SPREADSHEET_TARGETS: readonly ExportFormat[] = ['ods', 'docx', 'pdf'];

/** Human labels for the buttons, so the surfaces agree on wording too. */
export const TARGET_LABELS: Readonly<Record<RenderTarget, string>> = {
  docx: 'Word (.docx)',
  odt: 'OpenDocument (.odt)',
  ods: 'OpenDocument (.ods)',
  pdf: 'PDF',
  md: 'Markdown',
};

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return dot > slash ? path.slice(dot).toLowerCase() : '';
}

export function canExport(path: string): boolean {
  return EXPORTABLE_SOURCE_EXTENSIONS.includes(extensionOf(path));
}

/** The formats offered for this particular source; empty when it is not a
 *  source we can render. */
export function targetsFor(path: string): readonly ExportFormat[] {
  if (!canExport(path)) return [];
  return extensionOf(path) === '.csv' ? SPREADSHEET_TARGETS : DOCUMENT_TARGETS;
}
