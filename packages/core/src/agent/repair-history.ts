/**
 * Repairing a conversation the provider has refused.
 *
 * A 400 from a model is usually a complaint about the HISTORY, not about the
 * message just sent. That distinction is the whole problem: the user types
 * something new, we replay the same malformed history behind it, and it fails
 * identically. Every time. Forever. The only escape is starting a new chat,
 * which throws away everything the conversation knew.
 *
 * On 2026-10-16 a DeepSeek thinking-mode conversation died exactly this way
 * mid-stream, and the error text even said "that's ours to fix — try again",
 * which was the one thing that could not work.
 *
 * So: when the provider names a structural fault, fix that fault in the
 * history and send it once more.
 *
 * THREE RULES, and they matter more than the repairs themselves.
 *
 * 1. STRUCTURAL ONLY. A repair may change the SHAPE of the history, never its
 *    meaning. Dropping a tool call with no result is a repair. Dropping
 *    something the user said is data loss wearing a repair's clothes, and no
 *    provider complaint justifies it.
 *
 * 2. ONCE, AND NEVER THE SAME WAY TWICE. One retry per turn. If the second
 *    attempt fails with the same complaint, the repair did not take — stop and
 *    surface it. The difference between a self-healing system and one that
 *    burns an allowance in a circle is this rule.
 *
 * 3. SAY SO. A silent repair hides the bug that caused it. The DeepSeek fault
 *    above would have been absorbed invisibly and the two contradicting files
 *    that caused it would still be contradicting each other. Recovering is
 *    good; recovering quietly is how a product rots without anyone noticing.
 */

import type { Message, AssistantMessage } from '../core/types.js';
import { logger } from '../core/logger.js';

/** A repair that was applied, for the log and for telling the user. */
export interface HistoryRepair {
  /** Stable id, so the same failure twice can be detected. */
  kind: 'reasoning-reattach' | 'drop-dangling-tool-calls' | 'drop-orphan-tool-results' | 'trim-oldest';
  /** One line, in the operator's language, not the provider's. */
  summary: string;
  messages: Message[];
}

/** Does this look like an assistant turn that asked for tools? */
function hasToolCalls(m: Message): m is AssistantMessage {
  return m.role === 'assistant'
    && Array.isArray((m as AssistantMessage).tool_calls)
    && ((m as AssistantMessage).tool_calls?.length ?? 0) > 0;
}

/**
 * Pick a repair for what the provider actually said.
 *
 * Deliberately narrow. An unrecognised complaint gets no repair at all, which
 * is correct: guessing at a fault we do not understand is how a "fix" deletes
 * someone's conversation. Unknown stays unknown, and the error surfaces.
 */
export function repairHistory(detail: string, messages: Message[]): HistoryRepair | null {
  const d = (detail || '').toLowerCase();

  // ── DeepSeek thinking mode: the reasoning must come back with the turn ──
  // The field is stripped on the way out for every other provider, which is
  // right for them and exactly wrong here.
  if (d.includes('reasoning_content') && (d.includes('must be passed back') || d.includes('thinking mode'))) {
    // We cannot invent reasoning we no longer hold. What we CAN do is remove
    // the tool-call turns that are missing it, along with their results, so
    // the conversation continues without the fragment the model objects to.
    const keep: Message[] = [];
    let removed = 0;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const rc = (m as AssistantMessage).reasoning_content;
      if (hasToolCalls(m) && (typeof rc !== 'string' || rc.length === 0)) {
        const ids = new Set(((m as AssistantMessage).tool_calls ?? []).map(c => c.id));
        removed++;
        // Its results go with it, or they become orphans and the next
        // complaint is about those instead.
        while (i + 1 < messages.length
          && messages[i + 1].role === 'tool'
          && ids.has((messages[i + 1] as { tool_call_id?: string }).tool_call_id ?? '')) {
          i++;
        }
        continue;
      }
      keep.push(m);
    }
    if (removed === 0) return null;
    return {
      kind: 'reasoning-reattach',
      summary: `dropped ${removed} tool exchange${removed === 1 ? '' : 's'} this model will not accept without its own reasoning`,
      messages: keep,
    };
  }

  // ── A tool call with no result, or a result with no call ────────────────
  // Providers describe this a dozen ways; the shape is always the same.
  if (d.includes('tool_call') || d.includes('tool call') || d.includes('last role')
    || d.includes('invalid_request_message_order') || d.includes('tool_call_id')) {
    const ids = new Set<string>();
    for (const m of messages) {
      if (hasToolCalls(m)) for (const c of (m as AssistantMessage).tool_calls ?? []) ids.add(c.id);
    }

    // Orphan results first — they are the safer of the two to lose.
    const withoutOrphans = messages.filter(m =>
      m.role !== 'tool' || ids.has((m as { tool_call_id?: string }).tool_call_id ?? ''));
    if (withoutOrphans.length !== messages.length) {
      return {
        kind: 'drop-orphan-tool-results',
        summary: `dropped ${messages.length - withoutOrphans.length} tool result${messages.length - withoutOrphans.length === 1 ? '' : 's'} whose call was no longer in the conversation`,
        messages: withoutOrphans,
      };
    }

    // Then a trailing call that never got answered.
    const answered = new Set<string>();
    for (const m of messages) {
      if (m.role === 'tool') answered.add((m as { tool_call_id?: string }).tool_call_id ?? '');
    }
    const keep = messages.filter(m =>
      !(hasToolCalls(m) && ((m as AssistantMessage).tool_calls ?? []).every(c => !answered.has(c.id))));
    if (keep.length !== messages.length) {
      return {
        kind: 'drop-dangling-tool-calls',
        summary: `dropped ${messages.length - keep.length} tool call${messages.length - keep.length === 1 ? '' : 's'} that never returned a result`,
        messages: keep,
      };
    }
  }

  return null;
}

/** Log a repair the same way everywhere, so these are greppable in the wild. */
export function logRepair(repair: HistoryRepair, attempt: number): void {
  logger.warn(`[agent] history repair (${repair.kind}, attempt ${attempt}): ${repair.summary}`);
}
