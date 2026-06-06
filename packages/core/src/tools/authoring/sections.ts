/**
 * Markdown section addressing — locate, slice, and target sections by heading
 * for surgical, non-destructive edits.
 *
 * A "section" runs from an ATX heading (`## Pricing`) to the next heading of the
 * same-or-higher level (so editing an H2 includes its H3 subsections), or to end
 * of file. These are pure string helpers: the document_author tool uses them to
 * compute the exact old/new text for a `file_edit`, so editing a section never
 * touches the rest of the document. Fenced code blocks are skipped so a `#`
 * inside a code sample isn't mistaken for a heading.
 */

export interface Section {
  level: number;
  title: string;
  /** 0-based index of the heading line. */
  headingLine: number;
  /** 0-based start (== headingLine). */
  startLine: number;
  /** 0-based exclusive end (next same-or-higher heading, or line count). */
  endLine: number;
}

const HEADING_RE = /^(#{1,6})[ \t]+(.+?)[ \t]*#*$/;
const FENCE_RE = /^(```|~~~)/;

export function listSections(md: string): Section[] {
  const lines = md.split(/\r?\n/);
  const heads: { level: number; title: string; line: number }[] = [];
  let fence: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const fm = FENCE_RE.exec(trimmed);
    if (fm) {
      const marker = fm[1][0];
      if (!fence) fence = marker;
      else if (trimmed.startsWith(fence)) fence = null;
      continue;
    }
    if (fence) continue;
    const hm = HEADING_RE.exec(lines[i]);
    if (hm) heads.push({ level: hm[1].length, title: hm[2].trim(), line: i });
  }

  return heads.map((h, idx) => {
    let end = lines.length;
    for (let j = idx + 1; j < heads.length; j++) {
      if (heads[j].level <= h.level) { end = heads[j].line; break; }
    }
    return { level: h.level, title: h.title, headingLine: h.line, startLine: h.line, endLine: end };
  });
}

/** Resolve a section by heading text. Exact (case-insensitive) match wins; falls
 *  back to a unique substring match. Returns `{ ambiguous: true }` when more than
 *  one section matches, `null` when none do. */
export function findSection(md: string, name: string): Section | { ambiguous: true } | null {
  const target = name.trim().toLowerCase();
  const all = listSections(md);

  const exact = all.filter(s => s.title.toLowerCase() === target);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return { ambiguous: true };

  const loose = all.filter(s => s.title.toLowerCase().includes(target));
  if (loose.length === 1) return loose[0];
  if (loose.length > 1) return { ambiguous: true };
  return null;
}

/** The full text of a section, heading line included. */
export function sectionText(md: string, s: Section): string {
  return md.split(/\r?\n/).slice(s.startLine, s.endLine).join('\n');
}

/** The heading line text exactly as it appears (e.g. `## Pricing`). */
export function headingLineText(md: string, s: Section): string {
  return md.split(/\r?\n/)[s.headingLine] ?? '';
}

/** A human-readable outline: indented heading list with 1-based positions. */
export function formatOutline(md: string): string {
  const sections = listSections(md);
  if (sections.length === 0) return '(no headings)';
  return sections
    .map(s => `${'  '.repeat(s.level - 1)}${'#'.repeat(s.level)} ${s.title}`)
    .join('\n');
}
