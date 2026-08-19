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
 * The same thing with no closing tag: `<read>` then a JSON object, nothing after.
 *
 * Seen 2026-08-19, immediately after the paired form was handled. She wrote
 *
 *   <read>
 *   {"file_path": "Decisions/design/inventory-data-model.md"}
 *
 * and stopped. A matcher requiring the closing tag sees nothing at all, and the
 * user reads the markup instead of getting the file. Half a written call is
 * still a written call.
 */
const WRITTEN_CALL_OPEN = /<([a-z][a-z0-9_]*)>\s*\{/gi;

/**
 * The JSON object starting at `start`, found by counting braces.
 *
 * A lazy regex cannot do this — it stops at the first `}`, which truncates any
 * nested object, and a plan or a write call is mostly nested objects. Strings
 * are tracked so a brace inside one (a path, a prompt, a code sample) cannot
 * close the object early.
 */
function balancedObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

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

  // Second pass: the unclosed form. Runs on what survived the first pass, so a
  // properly closed call can never be matched twice.
  for (const match of [...text.matchAll(WRITTEN_CALL_OPEN)]) {
    const name = match[1].toLowerCase();
    if (!offered.has(name)) continue;
    const braceAt = text.indexOf('{', match.index!);
    if (braceAt === -1) continue;
    const body = balancedObject(text, braceAt);
    if (!body) continue;

    let args: string;
    try {
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      args = JSON.stringify(parsed);
    } catch {
      continue;
    }

    calls.push({ id: makeId(), type: 'function', function: { name, arguments: args } });

    // Swallow a closing tag immediately after, even a mismatched one. A model
    // that opens <present_plan> and closes </ask_user> has made a typo, not a
    // different kind of statement — and leaving the orphan tag in the reply is
    // the same cosmetic failure this whole function exists to prevent.
    let end = braceAt + body.length;
    const after = text.slice(end).match(/^\s*<\/[a-z][a-z0-9_]*>/i);
    if (after) end += after[0].length;

    text = text.replace(text.slice(match.index!, end), '');
  }

  // Only tidy whitespace if something was actually removed — an untouched reply
  // should come back byte-identical, so this can never reformat normal prose.
  if (calls.length > 0) {
    text = text.replace(/\n{3,}/g, '\n\n').trim();
  }

  return { calls, text };
}
