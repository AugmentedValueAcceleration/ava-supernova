/**
 * Context continuity helpers — preserve task state through compression and
 * truncation, and keep per-turn token cost in check.
 *
 * Background: when a long agent session hits the auto-compression threshold,
 * the conversation history gets summarised and older messages are dropped.
 * Without the helpers in this file, the agent can lose awareness of its
 * active task — it sees the compression summary, can't tell what it was
 * working on, and fresh-greets the user as if starting over. That's the
 * "she acted like it was a new chat" failure mode observed on long runs.
 *
 * This file provides:
 *   - findOriginalUserTaskIndex — locate the first real user request so it
 *     can be preserved verbatim through all compression paths (it's "the
 *     root of everything downstream" and never should be summarised away)
 *   - formatSessionTasksBlock — render active session tasks from TaskManager
 *     as a system-style block that gets re-injected after compression so the
 *     post-compression model has direct visibility into what's in flight
 *   - buildCompressionContinuationHeader — wrap the compression summary in
 *     a continuation-first header that tells the model "resume the current
 *     task, do not greet, do not start over"
 *   - isMetaPrefix — recognise meta-prefixed user messages (summaries,
 *     internal planning, memory briefs) that should NOT be treated as the
 *     original user task
 *
 * All helpers are pure and stateless — they operate on the message array
 * and read-only TaskManager access only.
 */

import type { Message, UserMessage } from '../core/types.js';
import { getTextContent } from '../core/types.js';

// Known prefixes that mark a user-role message as machine-generated meta
// content rather than a real user request. These messages should not be
// treated as "the original user task" when pinning.
const META_PREFIXES = [
  '[Context Summary',
  '[CONTEXT WAS COMPRESSED',
  '[CONTEXT LIMIT]',
  '[Internal Planning',
  '[Memory Brief]',
  '[System notice]',
  '[ACTIVE TASKS',
  '[Design context refresh',
  '[Image captured',
  '[Interjection]',
  '[User pressed Stop',
  '[Earlier user messages',
];

export function isMetaPrefix(content: string): boolean {
  const trimmed = content.trimStart();
  return META_PREFIXES.some(prefix => trimmed.startsWith(prefix));
}

/**
 * Find the index of the first user-role message that represents a real
 * user request (not a meta-injection like a compression summary). Returns
 * -1 if no such message exists. Used by compression and truncation paths
 * to preserve the original task description verbatim — it's the one piece
 * of context that should survive every compression pass because it's the
 * root intent of the whole session.
 */
export function findOriginalUserTaskIndex(messages: Message[]): number {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const text = getTextContent(m.content);
    if (!text.trim()) continue;
    if (isMetaPrefix(text)) continue;
    return i;
  }
  return -1;
}

/**
 * Return the first real user-task message if one exists, else null.
 */
export function findOriginalUserTask(messages: Message[]): UserMessage | null {
  const idx = findOriginalUserTaskIndex(messages);
  if (idx === -1) return null;
  return messages[idx] as UserMessage;
}

/**
 * Build a verbatim record of the user's own turns from the compress zone.
 *
 * The summariser distils assistant actions and decisions well, but it
 * paraphrases the user — and the user's exact words are the truest record of
 * intent ("I told you X and you forgot" is the most common context-loss
 * complaint). User turns are short and cheap, so we keep them verbatim through
 * compression instead of letting them survive only as a paraphrase.
 *
 * Framed explicitly as a historical reference, never as new requests — the
 * same discipline that stops the pinned original task from being re-executed.
 * Each turn is capped, and if there are very many we keep the most RECENT
 * within a total budget (older ones remain in the summary and are retrievable
 * via conversation_recall — the backstop covers the tail).
 *
 * Returns null when the compress zone holds no real user turns.
 */
export function buildVerbatimUserTurnsBlock(compressedMessages: Message[]): Message | null {
  const PER_TURN_CAP = 500;
  const TOTAL_CAP = 6000;

  const turns: string[] = [];
  for (const m of compressedMessages) {
    if (m.role !== 'user') continue;
    const text = getTextContent(m.content).trim();
    if (!text || isMetaPrefix(text)) continue;
    turns.push(text.length > PER_TURN_CAP ? text.slice(0, PER_TURN_CAP).trimEnd() + ' …' : text);
  }
  if (turns.length === 0) return null;

  // Keep the most recent turns within the total budget; count what we drop.
  const kept: string[] = [];
  let used = 0;
  let omitted = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const cost = turns[i].length + 8; // rough per-line overhead
    if (used + cost > TOTAL_CAP && kept.length > 0) {
      omitted = i + 1;
      break;
    }
    kept.unshift(turns[i]);
    used += cost;
  }

  const header =
    '[Earlier user messages in this session, verbatim — the user\'s own words, kept exactly as a reference record. These are NOT new requests to act on; they are context for what has already been said and asked.]';
  const lines = kept.map((t, i) => `${i + 1}. "${t}"`);
  if (omitted > 0) {
    lines.unshift(
      `(${omitted} earlier user message(s) omitted here — they remain in the summary above and are retrievable with conversation_recall.)`,
    );
  }

  return { role: 'user', content: [header, ...lines].join('\n') };
}

// ─── Session task formatting ────────────────────────────────────────────────

/**
 * Shape of a task entry we read from TaskManager. Kept narrow on purpose
 * so this module doesn't have to import the whole TaskManager surface.
 */
export interface TaskEntrySnapshot {
  id: string;
  title: string;
  status: string;
}

/**
 * Format the active session tasks as a continuation-focused system block
 * for injection after compression. The wording is deliberately imperative:
 * the post-compression model must NOT treat the compressed state as a new
 * conversation, so the block tells it directly what's in flight and forbids
 * greeting or "what are we working on" responses.
 *
 * Returns null if there are no active tasks — in that case the caller
 * should use the compression summary alone without a task block.
 */
export function formatSessionTasksBlock(tasks: TaskEntrySnapshot[]): string | null {
  const active = tasks.filter(t => t.status !== 'done' && t.status !== 'completed');
  if (active.length === 0) return null;

  const lines = active.map((t, i) => {
    const marker = t.status === 'in-progress' || t.status === 'in_progress' ? ' ← IN PROGRESS' : '';
    return `  ${i + 1}. [${t.status}] ${t.title}${marker}`;
  });

  return [
    '[ACTIVE TASKS — you are mid-session. Do NOT greet. Do NOT ask what we are working on. Continue the in-progress task below.]',
    '',
    ...lines,
    '',
    '[Resume the task marked IN PROGRESS. If no task is marked in progress, resume the first pending task. Your context was compressed — the tasks above are the source of truth for what you should be doing.]',
  ].join('\n');
}

// ─── Compression continuation header ────────────────────────────────────────

/**
 * Wrap a compression summary in a continuation-first header. The header
 * is what the post-compression model sees first when scanning its context,
 * and the wording is deliberately directive: "resume the current task, do
 * not start over." Without this framing, the summary gets treated as
 * historical reference rather than active-state continuation instructions.
 *
 * The optional `structured` parameter accepts pre-extracted task-state
 * fields (current task, last step, next step, blockers) which are shown
 * prominently above the free-form summary body. If the summariser couldn't
 * produce those fields, just the body is used — graceful degradation.
 */
export interface CompressionStructuredFields {
  currentTask?: string;
  lastStep?: string;
  nextStep?: string;
  blockers?: string;
}

export function buildCompressionContinuationHeader(
  summaryBody: string,
  structured?: CompressionStructuredFields,
): string {
  const lines: string[] = [
    '[CONTEXT WAS COMPRESSED. RESUME YOUR CURRENT TASK — DO NOT GREET OR ASK WHAT WE ARE WORKING ON.]',
    '',
  ];

  if (structured) {
    if (structured.currentTask) lines.push(`**Current task:** ${structured.currentTask}`);
    if (structured.lastStep)    lines.push(`**Last completed step:** ${structured.lastStep}`);
    if (structured.nextStep)    lines.push(`**Next step:** ${structured.nextStep}`);
    if (structured.blockers)    lines.push(`**Blockers:** ${structured.blockers}`);
    if (lines.length > 2) lines.push('');
  }

  lines.push('**Full summary (for reference):**');
  lines.push(summaryBody.trim());
  lines.push('');
  lines.push('[Resume the current task from the state described above. Do NOT treat this as a new conversation. Do NOT greet. Do NOT ask what to do next — the answer is in the summary.]');
  lines.push('[This summary is lossy. If you need an exact detail from earlier — what the user said, a decision, a path or value — call conversation_recall to read the real transcript. Recall it; do not guess it or ask the user to repeat themselves.]');

  return lines.join('\n');
}

/**
 * Parse a compression summary for structured CURRENT_TASK / LAST_STEP /
 * NEXT_STEP / BLOCKERS fields that the summariser was asked to produce.
 * The summariser prompt asks for these explicitly, but LLMs sometimes
 * paraphrase — this parser handles both formal and loose formats.
 *
 * Returns empty object if no structured fields are found (the summary will
 * still render via its free-form body).
 */
export function extractStructuredFields(summary: string): CompressionStructuredFields {
  const result: CompressionStructuredFields = {};

  // Match various prefix styles the summariser might use
  const patterns: Array<[keyof CompressionStructuredFields, RegExp]> = [
    ['currentTask', /(?:^|\n)\s*\**(?:CURRENT[_ ]?TASK|Current task)\**:\s*(.+?)(?=\n\s*\**(?:LAST|NEXT|BLOCK|CURRENT)|\n\n|$)/is],
    ['lastStep',    /(?:^|\n)\s*\**(?:LAST[_ ]?STEP|Last step|Last completed)\**:\s*(.+?)(?=\n\s*\**(?:LAST|NEXT|BLOCK|CURRENT)|\n\n|$)/is],
    ['nextStep',    /(?:^|\n)\s*\**(?:NEXT[_ ]?STEP|Next step)\**:\s*(.+?)(?=\n\s*\**(?:LAST|NEXT|BLOCK|CURRENT)|\n\n|$)/is],
    ['blockers',    /(?:^|\n)\s*\**(?:BLOCKERS?|Blocker)\**:\s*(.+?)(?=\n\s*\**(?:LAST|NEXT|BLOCK|CURRENT)|\n\n|$)/is],
  ];

  for (const [key, pattern] of patterns) {
    const m = summary.match(pattern);
    if (m && m[1]) {
      const value = m[1].trim().replace(/\n+/g, ' ');
      if (value && value.toLowerCase() !== 'none' && value.toLowerCase() !== 'n/a') {
        result[key] = value;
      }
    }
  }

  return result;
}

// ─── Message body trimming for cost control ─────────────────────────────────

/**
 * Threshold above which old (non-recent) user/assistant message bodies get
 * trimmed to a short summary. Chosen to preserve the structural meaning of
 * the conversation (who said what, roughly) while stripping verbose
 * content like inlined file contents or long reasoning traces.
 */
export const OLD_MESSAGE_BODY_MAX_CHARS = 1500;

/**
 * Produce a short trimmed representation of a long message body. Keeps the
 * first N chars so the model can still see what the message was about, and
 * appends a byte-count marker so it's clear content was omitted (not
 * missing).
 */
export function trimMessageBody(content: string, maxChars: number = OLD_MESSAGE_BODY_MAX_CHARS): string {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars).trimEnd()}\n\n[Trimmed — original ${content.length} chars for token-cost control]`;
}
