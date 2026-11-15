/**
 * Open threads and episodes: the two memory files that are about time.
 *
 * threads.md — promises and loose ends ("remind me on the 19th", "finish the
 * export next"), carried until done. One readable checklist; the machine
 * details ride in an HTML comment at the end of each line, so the file reads
 * cleanly in any Markdown viewer.
 *
 * episodes/YYYY-MM-DD.md — what happened that day, a few lines per project.
 * This is the "what did we do on Tuesday?" memory, the one a person with
 * memory loss needs most and that the old system could not answer at all.
 */

import { randomBytes } from 'node:crypto';
import type { Thread } from './types.js';

// ── Threads ───────────────────────────────────────────────────────────────

const THREAD_LINE = /^- \[( |x)\] (.*?)\s*<!--\s*(.*?)\s*-->\s*$/;

export function parseThreads(content: string | null): Thread[] {
  if (!content) return [];
  const out: Thread[] = [];
  for (const line of content.replace(/\r\n/g, '\n').split('\n')) {
    const m = line.match(THREAD_LINE);
    if (!m) continue;
    const meta = Object.fromEntries(
      m[3].split(/\s+/).map((kv) => {
        const i = kv.indexOf(':');
        return i > 0 ? [kv.slice(0, i), kv.slice(i + 1)] : [kv, ''];
      }),
    ) as Record<string, string>;
    if (!meta.id) continue;
    out.push({
      id: meta.id,
      text: m[2].trim(),
      project: meta.project || undefined,
      added: meta.added ?? '',
      due: meta.due || undefined,
      done: m[1] === 'x' ? (meta.done || meta.added || '') : undefined,
    });
  }
  return out;
}

export function serializeThreads(threads: Thread[]): string {
  const line = (t: Thread) => {
    const meta = [`id:${t.id}`, `added:${t.added}`];
    if (t.due) meta.push(`due:${t.due}`);
    if (t.project) meta.push(`project:${t.project}`);
    if (t.done) meta.push(`done:${t.done}`);
    // A line break in the text would split the checklist item; keep it one line.
    return `- [${t.done ? 'x' : ' '}] ${t.text.replace(/\s*\n\s*/g, ' ')} <!-- ${meta.join(' ')} -->`;
  };
  const open = threads.filter((t) => !t.done);
  const done = threads.filter((t) => t.done);
  const parts = ['# Open threads', '', ...(open.length ? open.map(line) : ['_Nothing open._'])];
  if (done.length) parts.push('', '## Done', '', ...done.map(line));
  parts.push('');
  return parts.join('\n');
}

export function newThreadId(): string {
  return randomBytes(4).toString('hex');
}

// ── Episodes ──────────────────────────────────────────────────────────────

export interface EpisodeSection {
  /** Project id, or undefined for things not tied to a project. */
  project?: string;
  name: string;
  lines: string[];
}

export interface Episode {
  date: string;
  sections: EpisodeSection[];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Saturday 15 November 2026" — the heading a person reads. */
export function dayTitle(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAYS[dt.getDay()]} ${d} ${MONTHS[m - 1]} ${y}`;
}

const SECTION = /^## (.*?)(?:\s*<!--\s*project:(\S+)\s*-->)?\s*$/;

export function parseEpisode(date: string, content: string | null): Episode {
  const sections: EpisodeSection[] = [];
  if (!content) return { date, sections };
  let current: EpisodeSection | null = null;
  for (const line of content.replace(/\r\n/g, '\n').split('\n')) {
    const h = line.match(SECTION);
    if (h) {
      current = { name: h[1].trim(), project: h[2] || undefined, lines: [] };
      sections.push(current);
      continue;
    }
    const item = line.match(/^- (.*)$/);
    if (item && current) current.lines.push(item[1].trim());
  }
  return { date, sections };
}

export function serializeEpisode(ep: Episode): string {
  const parts = [`# ${dayTitle(ep.date)}`, ''];
  for (const s of ep.sections) {
    if (s.lines.length === 0) continue;
    parts.push(s.project ? `## ${s.name} <!-- project:${s.project} -->` : `## ${s.name}`, '');
    for (const l of s.lines) parts.push(`- ${l.replace(/\s*\n\s*/g, ' ')}`);
    parts.push('');
  }
  return parts.join('\n');
}

/** Add lines to one project's section of a day, skipping exact repeats. */
export function addToEpisode(ep: Episode, section: { project?: string; name: string }, lines: string[]): Episode {
  let s = ep.sections.find((x) => (section.project ? x.project === section.project : !x.project));
  if (!s) {
    s = { project: section.project, name: section.name, lines: [] };
    ep.sections.push(s);
  }
  const seen = new Set(s.lines.map((l) => l.toLowerCase()));
  for (const l of lines.map((x) => x.trim()).filter(Boolean)) {
    if (seen.has(l.toLowerCase())) continue;
    s.lines.push(l);
    seen.add(l.toLowerCase());
  }
  return ep;
}
