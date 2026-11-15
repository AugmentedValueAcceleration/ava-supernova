/**
 * Where a new document is saved.
 *
 * Why (14–15 Nov 2026): Ava made a PDF in `DawnSets/Docs/`, and neither the
 * Library nor "Open a document" could see it — they show the project's
 * `documents/` folder. His direction: a document Ava creates is saved in the
 * project, in the folder the Library views. So a bare file name goes to
 * `documents/`; a folder is used only when the person names one.
 *
 * Dependency-free (no node: modules), so any surface can import it.
 */

export const DOCUMENTS_FOLDER = 'documents';

/**
 * A bare file name ("overview.md") → `documents/overview.md`. Anything with a
 * folder in it ("Docs/x.md", an absolute path) is where the person chose, and
 * is left alone.
 */
export function documentPathFor(filePath: string): string {
  const p = filePath.trim();
  if (!p || /[\\/]/.test(p)) return p;
  return `${DOCUMENTS_FOLDER}/${p}`;
}
