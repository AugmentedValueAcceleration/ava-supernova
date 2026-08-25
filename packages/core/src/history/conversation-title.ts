// ─── Conversation titles ─────────────────────────────────────────────────────
//
// A conversation's name comes from the first thing the operator actually SAID.
// That sounds obvious, and it's precisely what was going wrong.
//
// Two kinds of text get filed into the conversation as `role: 'user'` without
// the operator ever typing them:
//
//   1. PROMPT SCAFFOLD — mode and room prefixes. `getChatModePrefix(userText)`
//      and friends return a long preamble with the operator's words appended at
//      the end, and THAT whole string is the user message. So the naive
//      "first user message, first 80 chars" gave titles like
//      `[Chat Mode] You're off the clock — this is personal conversation…`
//      and `[Design Studio] You are Ava — the same Ava, with your full…`.
//
//   2. INTERNAL PRIMERS — [Memory Brief], [Honesty check …], the mid-run
//      interjection, and friends. Pure machinery. If one of these lands first,
//      it becomes the conversation's name.
//
// The result was a history list where almost nothing was named after what the
// conversation was about. This module is the single place that knows how to
// undo both, so the surfaces stop each keeping their own half-right copy.

import { ALL_SCAFFOLD_TAGS } from '../agent/mode-tags.js';
import type { Message } from '../core/types.js';
import { getTextContent } from '../core/types.js';

/**
 * Text the host injects into the conversation for the MODEL's benefit. Never
 * the operator's words — skip entirely when naming a conversation.
 *
 * Matched on the content marker rather than the role, because older transcripts
 * saved several of these as `role: 'user'`.
 */
export const INTERNAL_MARKERS = [
  // Memory / context primers
  '[Memory Brief]',
  '[Memory pointer]',
  '[Project Brain]',
  '[Cross-session pattern',
  '[Learned pattern',
  '[Insight]',
  // Agent-loop nudges — Ava talking to herself, filed as `user`
  '[Honesty check',
  '[Closure check',
  '[System notice]',
  '[Internal Planning',
  '[The user added this while you were working',
  // Conductor / persona pool
  '[Task]:',
  '[Context from team]',
] as const;

/**
 * Mode / room tags. The operator's real message is appended AFTER the preamble
 * these introduce, so the preamble must be peeled off — the tag itself is not
 * the title, and neither is the first line of Ava's own briefing.
 *
 * Derived from agent/mode-tags.ts rather than kept in step with it by hand —
 * including the legacy spellings, which appear only in already-saved
 * transcripts but still have to strip so old conversations get readable
 * names.
 */
export const SCAFFOLD_TAGS: readonly string[] = ALL_SCAFFOLD_TAGS;

/**
 * Which surface a conversation belongs to.
 *
 * The rooms each keep their own thread but save into the SAME history folder,
 * with nothing on the record to say where they came from — so the Conversations
 * list mixes a code chat, a logo experiment and a workout plan with no way to
 * tell them apart. This is the missing distinction.
 *
 * Note MODE tags ([Chat Mode], [Plan Mode], …) are modes *within* the main chat,
 * not rooms — they all belong to 'main'.
 */
export type ConversationSurface = 'main' | 'design' | 'health' | 'learning' | 'social';

/** Room tag → surface. Anything not listed here (mode tags, or no tag at all)
 *  is the main chat. */
const ROOM_TAGS: Array<[string, ConversationSurface]> = [
  ['[Design Studio]', 'design'],
  ['[Health Room]', 'health'],
  ['[Learning Room]', 'learning'],
  ['[Social Studio]', 'social'],
];

/**
 * Work out which room a conversation came from, from the scaffold tag its
 * messages carry. Needs no schema change and no migration: the tags are already
 * in every transcript, old and new — the very same tags that were wrecking the
 * titles are what identify the room.
 *
 * Scans all user messages rather than just the first, because a conversation can
 * open with an internal primer.
 */
export function deriveConversationSurface(messages: Message[]): ConversationSurface {
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const text = getTextContent(m.content);
    if (!text) continue;
    for (const [tag, surface] of ROOM_TAGS) {
      if (text.startsWith(tag)) return surface;
    }
  }
  return 'main';
}

/** True when the text is host machinery rather than something the user said. */
export function isInternalMessage(text: string): boolean {
  const t = text.trimStart();
  return INTERNAL_MARKERS.some((m) => t.startsWith(m));
}

/**
 * Strip a mode/room preamble, returning the operator's actual words.
 *
 * Every prefix builder appends the user's text as the final block, either bare
 * (`…\n\n${userText}`, chat mode) or under a heading
 * (`…\n\n## Their request\n${userText}`, the rooms). So: take everything after
 * the last blank line, then drop a leading `## …` heading if there is one.
 *
 * Caveat, stated plainly: if the operator's own message contains a blank line,
 * only its final paragraph survives. For an 80-char title that's an acceptable
 * trade against parsing every preamble shape by hand — and it is strictly better
 * than naming the conversation after Ava's briefing.
 */
export function stripPromptScaffold(text: string): string {
  if (!SCAFFOLD_TAGS.some((tag) => text.startsWith(tag))) return text;

  const lastBlank = text.lastIndexOf('\n\n');
  let body = lastBlank > 0 ? text.slice(lastBlank + 2) : text;

  // `## Their request` / `## User's Request` etc — the heading isn't the title.
  if (body.startsWith('## ')) {
    const nl = body.indexOf('\n');
    body = nl === -1 ? '' : body.slice(nl + 1);
  }
  return body.trim();
}

/** True when a stored title is scaffold/machinery rather than a real name —
 *  i.e. one this module would have produced before it knew better. Used to
 *  repair existing records without clobbering a genuine manual rename. */
export function isJunkTitle(title: string | undefined): boolean {
  if (!title) return true;
  const t = title.trim();
  if (!t || t === 'Untitled') return true;
  return isInternalMessage(t) || SCAFFOLD_TAGS.some((tag) => t.startsWith(tag));
}

/**
 * Name a conversation after the first thing the operator actually said —
 * skipping host primers and peeling off any mode/room preamble.
 */
export function deriveConversationTitle(messages: Message[]): string {
  const clean = (raw: string): string => {
    const said = stripPromptScaffold(raw).trim();
    // Collapse newlines so a multi-line message doesn't produce a ragged title.
    return said.replace(/\s+/g, ' ').trim();
  };

  // First choice: the first thing the operator actually said.
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const raw = getTextContent(m.content);
    if (!raw || isInternalMessage(raw)) continue;
    const flat = clean(raw);
    if (flat) return flat.slice(0, 80);
  }

  // Fallback: Ava's first substantive reply. Some conversations genuinely have
  // no usable operator text — every user-role message is machinery, or the turn
  // was an attachment / a room seed. Naming those after her opening line still
  // tells you what the conversation was ABOUT, which is the whole job. Silently
  // shrugging "Untitled" at eight conversations is worse than an honest guess.
  for (const m of messages) {
    if (m.role !== 'assistant') continue;
    const raw = getTextContent(m.content);
    if (!raw || isInternalMessage(raw)) continue;
    const flat = clean(raw);
    if (flat) return flat.slice(0, 80);
  }

  return 'Untitled';
}
