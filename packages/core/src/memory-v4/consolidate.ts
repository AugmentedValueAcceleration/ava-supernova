/**
 * The end-of-session tidy-up (memory v4, Part 4): the ONE writer that reads a
 * conversation. It replaces the four old writers (regex extraction, per-turn
 * model extraction, ambient capture and the session reflection), which between
 * them saved the same rule five times in one day.
 *
 * One call to the fleet's own low-cost model, once per session, never per
 * message. From the transcript it writes:
 *   - the day: what was done or decided, a few lines, under the open project;
 *   - open threads: new ones, and ones the conversation finished;
 *   - facts: only durable ones. Told → saved with their words. Noticed →
 *     waits on the Memory page for a yes;
 *   - changes: a fact that is no longer true. Told → replaced, the old one kept
 *     as history. Noticed → the new version waits; the old stays current.
 *
 * It is shown the facts it might be repeating or changing (searched from the
 * conversation), so it updates instead of duplicating.
 */

import type { Message, ModelDefinition } from '../core/types.js';
import { getTextContent } from '../core/types.js';
import type { Provider } from '../providers/types.js';
import { containsCredentials } from '../tools/security.js';
import type { MemorySession } from './reader.js';
import type { FactKind } from './types.js';
import { FACT_KINDS } from './types.js';
import { today as todayFn } from './files.js';
import { logger } from '../core/logger.js';
import { stripModePrefix } from '../memory/ambient-capture.js';
import { suggestPromotion } from './promotion.js';
import {
  getWorkModePrefix, getWorkTalkPrefix, getChatModePrefix, getPlanModePrefix,
  getWriteModePrefix, getSecurityModePrefix, getDesktopModePrefix, getTeachModePrefix,
} from '../agent/system-prompt.js';

/**
 * Their words without the mode instructions the app wraps around every
 * message ("[Work Mode] You are Ava the Builder…"). Exact match against each
 * mode's current wrapper first; older conversations, written under earlier
 * wrappers, fall back to stripModePrefix.
 */
const WRAPPERS = [getWorkModePrefix, getWorkTalkPrefix, getChatModePrefix, getPlanModePrefix, getWriteModePrefix, getSecurityModePrefix, getDesktopModePrefix, (t: string) => getTeachModePrefix(t)]
  .map((fn) => { try { return fn('').trimEnd(); } catch { return ''; } })
  .filter((w) => w.length > 20);

export function theirWords(text: string): string {
  for (const w of WRAPPERS) if (text.startsWith(w)) return text.slice(w.length).trim();
  return stripModePrefix(text).trim();
}

const TRANSCRIPT_BUDGET = 40_000;
/** Search score at which a new fact is taken as a re-wording of one already held. */
const NEAR_REPEAT = 0.6;

const SYSTEM = `You keep the long-term memory of Ava, an AI partner, for one person. You are given one conversation between them. Write down only what will still matter in another conversation weeks from now.

Return JSON only:
{
  "day": ["…"],
  "threads_open": [{"text": "…", "due": "YYYY-MM-DD or empty"}],
  "threads_done": ["<thread id>"],
  "facts": [{"text": "…", "kind": "person|preference|rule|project|event", "scope": "everywhere|project", "source": "said|noticed", "quote": "…"}],
  "changes": [{"id": "<fact id>", "text": "…", "quote": "…"}]
}

day: what was actually done, built, fixed or decided in this conversation, at most 6 short concrete lines (names, files, commit hashes when given). Empty if nothing happened beyond chat.
threads_open: things agreed to come back to, promised, deferred or blocked. Not tasks finished in this conversation. Never repeat a thread already listed as open.
threads_done: ids of listed open threads this conversation finished.
facts: durable facts only: who they are, how they want to work, decisions with their reasons, project facts that would cost time to rediscover. One fact per item, plain words, with its specifics. NOT moods or frustration, NOT chit-chat, NOT what Ava did, NOT anything already in the listed facts, even in other words (unless it changed: then use changes), NOT what lives in its own record elsewhere (brand kits, health and meal plans, courses, tasks, the project's Decisions folder). scope "everywhere" for anything about them or how they work; "project" only for facts about the open project. source "said" ONLY if they stated it in their own message, with their exact words in quote; otherwise "noticed".
changes: a listed fact this conversation shows is no longer true: its id, and text = the WHOLE fact as it is now, standing alone (not "superseded by…", not a description of the change). quote their exact words if they said it.
Never write keys, tokens or passwords. When in doubt, leave it out: an empty list is a good answer.`;

export interface ConsolidateResult {
  dayLines: number;
  threadsOpened: number;
  threadsClosed: number;
  saved: number;
  waiting: number;
  changed: number;
}

function transcriptOf(messages: Message[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const raw = getTextContent(m.content).trim();
    // Host primers ride as system messages; a user message that is only a primer is skipped too.
    if (!raw || raw.startsWith('[Memory Brief]')) continue;
    const text = m.role === 'user' ? theirWords(raw) : raw;
    if (!text) continue;
    lines.push(`${m.role === 'user' ? 'THEM' : 'AVA'}: ${text.slice(0, 3000)}`);
  }
  let out = lines.join('\n\n');
  // Keep the end of a long session: that is where it landed.
  if (out.length > TRANSCRIPT_BUDGET) out = `…\n${out.slice(out.length - TRANSCRIPT_BUDGET)}`;
  return out;
}

function parseReply(text: string): Record<string, unknown> | null {
  const t = text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Tidy one finished session into memory. Never throws; returns null when
 * there was nothing to do or the model could not be reached.
 */
export async function consolidateSession(opts: {
  session: MemorySession;
  messages: Message[];
  provider: Provider;
  model: ModelDefinition;
  now?: Date;
  /** Where to say why a tidy-up wrote nothing (the app's log). */
  log?: (message: string) => void;
}): Promise<ConsolidateResult | null> {
  const { session, provider, model } = opts;
  const say = (m: string) => { opts.log?.(`memory tidy-up: ${m}`); logger.debug(`[memory-v4] tidy-up: ${m}`); };
  const userTurns = opts.messages.filter((m) => m.role === 'user').length;
  if (userTurns < 2) { say('skipped, fewer than 2 messages'); return null; }
  const transcript = transcriptOf(opts.messages);
  if (transcript.length < 200) { say('skipped, conversation too short'); return null; }

  try {
    const mem = session.mem;
    const date = todayFn(opts.now);
    // The facts it might repeat or change: searched message by message (one
    // long query dilutes every match below the search's coverage bar).
    const seen = new Map<string, Awaited<ReturnType<typeof mem.search>>[number]>();
    const theirMessages = opts.messages.filter((m) => m.role === 'user').map((m) => theirWords(getTextContent(m.content))).filter(Boolean).slice(-30);
    for (const text of theirMessages) {
      for (const hit of await mem.search(text.slice(0, 600), { project: session.project?.id, limit: 5 })) {
        if (!seen.has(hit.fact.id)) seen.set(hit.fact.id, hit);
      }
    }
    const related = [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 25);
    const threads = await mem.listThreads();

    const user = [
      `Today: ${date}. Open project: ${session.project?.name ?? 'none'}.`,
      '',
      'Facts already in memory that this conversation may repeat or change:',
      ...(related.length ? related.map((h) => `- [${h.fact.id}] ${h.fact.text.slice(0, 300)}`) : ['- (none)']),
      '',
      'Open threads:',
      ...(threads.length ? threads.map((t) => `- [${t.id}] ${t.text}`) : ['- (none)']),
      '',
      'The conversation:',
      transcript,
    ].join('\n');

    const response = await provider.createCompletion({
      model: model.id,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      temperature: 0.1,
      // Room for a model that thinks before answering: on reasoning models the
      // thinking counts against this limit, and 2,500 left no room for the answer.
      max_tokens: 12000,
      stream: false,
    });
    const r = response as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>; content?: unknown };
    const replyText = typeof r.choices?.[0]?.message?.content === 'string'
      ? (r.choices[0].message!.content as string)
      : typeof r.content === 'string' ? r.content : '';
    const out = parseReply(replyText);
    if (!out) {
      say(`${model.id} gave no usable answer (finish: ${r.choices?.[0]?.finish_reason ?? '?'}; ${replyText ? `starts "${replyText.slice(0, 120).replace(/\s+/g, ' ')}"` : 'empty'})`);
      return null;
    }

    const result: ConsolidateResult = { dayLines: 0, threadsOpened: 0, threadsClosed: 0, saved: 0, waiting: 0, changed: 0 };
    const safe = (s: string) => s && !containsCredentials(s);

    const day = arr(out.day).map(str).filter(safe).slice(0, 6);
    if (day.length) {
      await mem.addToDay(date, session.project ? { project: session.project.id, name: session.project.name } : { name: 'Everywhere' }, day);
      result.dayLines = day.length;
    }

    const known = new Set(threads.map((t) => t.id));
    for (const id of arr(out.threads_done).map(str)) {
      if (known.has(id) && await mem.closeThread(id)) result.threadsClosed++;
    }
    for (const t of arr(out.threads_open)) {
      const text = str((t as Record<string, unknown>)?.text);
      if (!safe(text)) continue;
      const dueRaw = str((t as Record<string, unknown>)?.due);
      await mem.addThread({ text, project: session.project?.id, due: /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : undefined });
      result.threadsOpened++;
    }

    const relatedIds = new Set(related.map((h) => h.fact.id));
    for (const c of arr(out.changes)) {
      const rec = c as Record<string, unknown>;
      const id = str(rec.id);
      const text = str(rec.text);
      const quote = str(rec.quote);
      if (!relatedIds.has(id) || !safe(text)) continue;
      // A change must state the fact as it now stands. "Superseded by…" or
      // "Updated: …" describes the change and would read as nonsense on its own.
      if (/^(superseded|updated|changed|replaced|no longer)\b/i.test(text)) continue;
      const current = await mem.getFact(id);
      if (!current || current.state !== 'fact') continue;
      if (quote && transcript.includes(quote)) {
        await mem.replaceFact(id, { text, source: 'said', quote });
        result.changed++;
      } else {
        await mem.addFact({ text, kind: current.kind, scope: current.scope, source: 'inferred', replaces: id });
        result.waiting++;
      }
    }

    for (const f of arr(out.facts)) {
      const rec = f as Record<string, unknown>;
      const text = str(rec.text);
      if (!safe(text)) continue;
      // A near-repeat of a fact already held is not saved again, however it
      // is worded (exact repeats are caught by the store itself).
      const nearest = (await mem.search(text, { project: session.project?.id, limit: 1 }))[0];
      if (nearest && nearest.match === 'words' && nearest.score >= NEAR_REPEAT) continue;
      const quote = str(rec.quote);
      // "said" only holds if their words are really in this conversation.
      const said = str(rec.source) === 'said' && quote.length > 0 && transcript.includes(quote);
      const kind = FACT_KINDS.includes(str(rec.kind) as FactKind) ? (str(rec.kind) as FactKind) : undefined;
      const scope = str(rec.scope) === 'project' && session.project ? (`project:${session.project.id}` as const) : 'everywhere';
      const { fact, created } = await mem.addFact({ text, kind, scope, source: said ? 'said' : 'inferred', quote: said ? quote : undefined });
      if (!created) continue;
      if (fact.state === 'pending') result.waiting++; else result.saved++;
      // The same lesson in another project: suggest it as how they always work.
      if (await suggestPromotion(mem, fact)) result.waiting++;
    }
    return result;
  } catch (err) {
    say(`failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
