/**
 * When a model WRITES a tool call instead of making one.
 *
 * Every model we serve supports native tool calls, and they are always offered.
 * Some still occasionally emit the call as text — an XML-ish tag wrapping a JSON
 * argument block:
 *
 *   <present_plan>
 *   { "title": "Inventory System Completion Plan", "steps": [ … ] }
 *   </present_plan>
 *
 * That is a shape several open-weight models were trained on, and they fall back
 * to it under uncertainty even when the schemas are right there. Nothing in our
 * prompt shows them the format; they arrive with it.
 *
 * Untreated, the user gets a wall of raw JSON where a plan card should be, and
 * the turn ends "successfully" — the agent sees no tool_calls, so it closes.
 * Seen 2026-08-19 on a Plan-mode turn: a complete, correct plan, rendered as
 * markup.
 *
 * Instructing the model not to do this is unreliable, because the models that do
 * it are the ones least likely to follow that instruction. Recovering is
 * reliable, so we recover.
 *
 * DELIBERATELY CONSERVATIVE. Only a tag whose name is a tool actually offered
 * this turn counts, and only when the body parses as a JSON object. Anything
 * else is left exactly where it is — prose that merely looks like a call is far
 * more likely than a real one, and turning a sentence into a tool call is a much
 * worse failure than showing one badly.
 */
import type { ToolCall } from '../core/types.js';

export interface RecoveredCalls {
  /** Calls lifted out of the text, ready to run. */
  calls: ToolCall[];
  /** The reply with those blocks removed. */
  text: string;
}

/** `<name> … </name>` where the body is a JSON object. */
const WRITTEN_CALL = /<([a-z][a-z0-9_]*)>\s*(\{[\s\S]*?\})\s*<\/\1>/gi;

/**
 * Lift written tool calls out of an assistant reply.
 *
 * @param content   the assistant's visible text
 * @param offered   names of tools offered this turn — the allowlist for recovery
 * @param makeId    id generator, injected so tests are deterministic
 */
export function recoverWrittenToolCalls(
  content: string,
  offered: ReadonlySet<string>,
  makeId: () => string = () => `recovered_${Math.random().toString(36).slice(2, 10)}`,
): RecoveredCalls {
  if (!content || offered.size === 0) return { calls: [], text: content };

  const calls: ToolCall[] = [];
  let text = content;

  for (const match of [...content.matchAll(WRITTEN_CALL)]) {
    const [block, rawName, body] = match;
    const name = rawName.toLowerCase();
    if (!offered.has(name)) continue;

    // Must be a JSON object. A tag around prose is prose.
    let args: string;
    try {
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      args = JSON.stringify(parsed);
    } catch {
      continue;
    }

    calls.push({ id: makeId(), type: 'function', function: { name, arguments: args } });
    text = text.replace(block, '');
  }

  // Only tidy whitespace if something was actually removed — an untouched reply
  // should come back byte-identical, so this can never reformat normal prose.
  if (calls.length > 0) {
    text = text.replace(/\n{3,}/g, '\n\n').trim();
  }

  return { calls, text };
}
