/**
 * The making record: how a piece of Design Studio work was made, step by step.
 *
 * Stores that take AI-assisted work want it declared, and Unity wants it
 * described plainly — which AI tools, what was generated, what the person
 * changed. That is hard to reconstruct afterwards, so it is written as it
 * happens (Library folders and packs plan, 7 Nov 2026).
 *
 * WHO WRITES IT: this code, as a side effect of each action — never Ava. She
 * has no tool that touches it, so it cannot be misreported. One file per work,
 * making.jsonl in the work's own folder, one JSON line per event. Lines are
 * only ever added, never rewritten.
 *
 * WHAT IT NEVER DOES: claim less AI involvement than there was, or fill a gap
 * by guessing. Work made before the record existed says so in its first line,
 * and an AI model that isn't known is written as null — "not recorded".
 *
 * Hand edits are a FACT, not a guess: after every action that changes the
 * source files (.blend, .xcf) their fingerprints are stored; before the next
 * one they are compared. A difference nothing in core explains is recorded as
 * a change made outside Ava. Failed runs are not recorded: they save nothing,
 * so they did not shape the work (his call, 9 Nov 2026).
 */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { AVA_HOME } from '../core/constants.js';
import type { ToolExecutionContext } from './types.js';

export type MakingTool = 'blender' | 'gimp';

/** The AI model Ava was running on. null in a record means "not recorded". */
export interface MakingAi { id: string; name?: string; provider?: string }

export interface MakingFont {
  /** As the file names it: a GIMP font name, or a Blender font file. */
  name: string;
  /** OFL, Apache-2.0, UFL — from Google's own fonts repository. */
  licence: 'OFL' | 'Apache-2.0' | 'UFL' | 'not-google' | 'alias' | 'builtin' | 'unchecked' | 'unread';
}

export type MakingEventName =
  | 'record_started' | 'brief_proposed' | 'brief_edited' | 'brief_agreed'
  | 'step' | 'outside_change' | 'restored' | 'copied_from' | 'version_kept' | 'version_deleted'
  | 'brought_in' | 'options_shown' | 'option_picked' | 'main_chosen' | 'marked_final' | 'final_removed';

export interface MakingEvent {
  v: 1;
  at: string;
  event: MakingEventName;
  /** Who did it. 'ava' is always paired with `ai`. */
  by: 'ava' | 'person' | 'outside' | 'system';
  ai?: MakingAi | null;
  /** The person's last message before Ava acted, word for word: their direction. */
  ask?: string | null;
  /** Fingerprints of the source files AFTER this event (sha256 by file name). */
  sources?: Record<string, string>;
  [field: string]: unknown;
}

const RECORD = 'making.jsonl';
const MAX_ASK = 2000;

export const makingFile = (dir: string) => join(dir, RECORD);

// ── Writing ──────────────────────────────────────────────────────────────────
// One queue per file: two events from the same turn must not interleave.
const queues = new Map<string, Promise<void>>();

export function appendMaking(dir: string, event: Omit<MakingEvent, 'v' | 'at'>): Promise<void> {
  const file = makingFile(dir);
  const line = JSON.stringify({ v: 1, at: new Date().toISOString(), ...event }) + '\n';
  const next = (queues.get(file) ?? Promise.resolve())
    .then(async () => { await mkdir(dir, { recursive: true }); await appendFile(file, line, 'utf-8'); })
    .catch(() => { /* the record must never break the work */ });
  queues.set(file, next);
  return next;
}

export async function readMaking(dir: string): Promise<MakingEvent[]> {
  let text: string;
  try { text = await readFile(makingFile(dir), 'utf-8'); } catch { return []; }
  const out: MakingEvent[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line) as MakingEvent); } catch { /* a torn last line is skipped, not fatal */ }
  }
  return out;
}

// ── Who acted ────────────────────────────────────────────────────────────────

const THEIR_REQUEST = '\n## Their request\n';

/**
 * Only the person's own words from a user message. The design room sends its
 * whole briefing in front of them (getDesignStudioPrefix), ending in "## Their
 * request". A room message without that heading gives null: the record holds
 * their words or nothing, never the room's instructions.
 */
export function personsWords(text: string | null | undefined): string | null {
  if (!text) return null;
  const at = text.lastIndexOf(THEIR_REQUEST);
  if (at >= 0) return text.slice(at + THEIR_REQUEST.length).trim() || null;
  if (/^\[[^\]\n]{2,40}\]/.test(text)) return null;
  return text.trim() || null;
}

/** The model Ava is running on and the person's last message, from the turn. */
export function avaContext(context?: ToolExecutionContext): { ai: MakingAi | null; ask: string | null } {
  const s = context?.sharedState as Record<string, unknown> | undefined;
  const ai = s?.designModel as MakingAi | undefined;
  const ask = typeof s?.designAsk === 'string' ? (s.designAsk as string).trim().slice(0, MAX_ASK) : null;
  return { ai: ai?.id ? { id: ai.id, ...(ai.name ? { name: ai.name } : {}), ...(ai.provider ? { provider: ai.provider } : {}) } : null, ask: ask || null };
}

// ── Source fingerprints (hand edits) ─────────────────────────────────────────

function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

/** The files a person could open and change: the .blend, or every top-level .xcf. */
export async function sourceFingerprints(dir: string, tool: MakingTool): Promise<Record<string, string>> {
  const names = tool === 'blender'
    ? [`${basename(dir)}.blend`].filter((f) => existsSync(join(dir, f)))
    : (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isFile() && e.name.endsWith('.xcf')).map((e) => e.name).sort();
  const out: Record<string, string> = {};
  for (const n of names) {
    try { out[n] = await hashFile(join(dir, n)); } catch { /* gone between listing and reading */ }
  }
  return out;
}

function lastSources(events: MakingEvent[]): Record<string, string> | null {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].sources) return events[i].sources!;
  return null;
}

/**
 * Call BEFORE anything in core changes a work. Starts the record if there is
 * none, and records any change to the source files that nothing explains.
 */
export async function beforeChange(dir: string, tool: MakingTool): Promise<void> {
  try {
    const events = await readMaking(dir);
    const now = await sourceFingerprints(dir, tool);
    if (events.length === 0) {
      const made = Object.keys(now).length > 0 || existsSync(join(dir, 'scripts'));
      await appendMaking(dir, made
        ? { event: 'record_started', by: 'system', tool, earlier: true,
            note: 'This work existed before the making record. Earlier steps, the AI model that made them, and any changes by hand are not recorded.',
            sources: now }
        : { event: 'record_started', by: 'system', tool, earlier: false, sources: now });
      return;
    }
    const before = lastSources(events) ?? {};
    const changed = Object.keys(now).filter((f) => f in before && before[f] !== now[f]);
    const added = Object.keys(now).filter((f) => !(f in before));
    const removed = Object.keys(before).filter((f) => !(f in now));
    if (changed.length || added.length || removed.length) {
      await appendMaking(dir, { event: 'outside_change', by: 'outside', tool, changed, added, removed,
        note: 'These source files changed outside Ava since the last recorded step.', sources: now });
    }
  } catch { /* the record must never break the work */ }
}

/** Fingerprints now, for the line that records the change just made. */
export const sourcesNow = (dir: string, tool: MakingTool) => sourceFingerprints(dir, tool).catch(() => ({}));

// ── Font licences ────────────────────────────────────────────────────────────
// Google Fonts are not all one licence: about 1,900 families are OFL, 44 are
// Apache 2.0 and 5 are the Ubuntu Font Licence (google/fonts, 9 Nov 2026).
// Google's repository files every family under its licence folder, so the
// folder it sits in IS its licence. Unity refuses Apache licences that require
// attribution, so this matters to anyone selling a pack.

const GOOGLE_FONTS_RAW = 'https://raw.githubusercontent.com/google/fonts/main';
const LICENCE_DIRS: Array<[string, MakingFont['licence']]> = [['ofl', 'OFL'], ['apache', 'Apache-2.0'], ['ufl', 'UFL']];
const GENERIC = /^(sans-serif|sans|serif|monospace|system-ui)\b/i;
const STYLE_WORDS = /\s+(Regular|Normal|Roman|Bold|Italic|Oblique|Thin|Hairline|Light|Medium|Book|Black|Heavy|(?:Semi|Demi|Extra|Ultra)[- ]?(?:Bold|Light)|Condensed|Expanded)$/i;
const licencesFile = () => join(process.env.AVA_FONTS_DIR ?? AVA_HOME, 'font-licences.json');

/** "Space Grotesk Bold" → "spacegrotesk"; "SpaceGrotesk-700.ttf" → "spacegrotesk". */
export function fontStem(name: string): string {
  let n = name.replace(/\.(ttf|otf|woff2?|ttc)$/i, '');
  if (/^[^\s]+-[^\s]+$/.test(n)) n = n.split('-')[0];
  for (let next = n.replace(STYLE_WORDS, ''); next !== n; next = n.replace(STYLE_WORDS, '')) n = next;
  return n.toLowerCase().replace(/[^a-z0-9]/g, '');
}

let cache: Record<string, MakingFont['licence']> | null = null;
async function loadCache(): Promise<Record<string, MakingFont['licence']>> {
  if (cache) return cache;
  try { cache = JSON.parse(await readFile(licencesFile(), 'utf-8')); } catch { cache = {}; }
  return cache!;
}

async function lookUpStem(stem: string): Promise<MakingFont['licence']> {
  const known = (await loadCache())[stem];
  if (known) return known;
  let reached = 0;
  const found = await Promise.all(LICENCE_DIRS.map(async ([dir, licence]) => {
    try {
      const res = await fetch(`${GOOGLE_FONTS_RAW}/${dir}/${stem}/METADATA.pb`, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
      reached++;
      return res.ok ? licence : null;
    } catch { return null; }
  }));
  const licence = found.find(Boolean) ?? (reached === LICENCE_DIRS.length ? 'not-google' : 'unchecked');
  if (licence !== 'unchecked') {
    cache![stem] = licence;
    await mkdir(dirname(licencesFile()), { recursive: true }).catch(() => {});
    await writeFile(licencesFile(), JSON.stringify(cache, null, 2), 'utf-8').catch(() => {});
  }
  return licence;
}

/** Each font with its licence. Never throws; an unknown is said as unknown. */
export async function fontLicences(names: string[]): Promise<MakingFont[]> {
  const out: MakingFont[] = [];
  for (const raw of [...new Set(names)]) {
    if (raw === '?') { out.push({ name: 'a text layer whose font could not be read', licence: 'unread' }); continue; }
    if (raw.endsWith('|builtin')) { out.push({ name: raw.slice(0, -'|builtin'.length), licence: 'builtin' }); continue; }
    if (GENERIC.test(raw)) { out.push({ name: raw, licence: 'alias' }); continue; }
    const stem = fontStem(raw);
    out.push({ name: raw, licence: stem ? await lookUpStem(stem) : 'not-google' });
  }
  return out;
}
