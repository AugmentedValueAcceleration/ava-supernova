/**
 * Shared message-array shaping for OpenAI-compatible chat requests.
 *
 * Same rationale as model-ids: the platform path (web routes) and the BYOK
 * path (core providers) both have to massage the messages array into a shape
 * the upstream provider accepts, and the copies drifted (the `reasoning_content`
 * 422 on Mistral was exactly this — web stripped it for Qwen only, core kept it
 * for thinking models). One implementation, both paths import it.
 *
 * Loosely typed (Record<string, unknown>) so both a web route's plain JSON and
 * a core provider's typed messages can pass through without a type dance.
 *
 * Scope note: ANSI/control-char + null-content cleaning is deliberately NOT here
 * yet — it's a core-only concern (raw shell output reaching the model) and the
 * web path doesn't do it today. Core keeps its existing inline cleaning; folding
 * it in is a later convergence step, kept out now to preserve exact web parity.
 */

import { logger } from '../../core/logger.js';

type LooseMessage = Record<string, unknown>;

/**
 * reasoning_content is an OUTPUT-only field that reasoning models EMIT, and
 * most of them reject it as INPUT: Qwen and Mistral 422 `extra_forbidden`.
 * So it is stripped by default.
 *
 * DEEPSEEK IN THINKING MODE IS THE EXACT OPPOSITE, and that is what this
 * parameter exists for. An assistant turn that produced tool_calls must carry
 * its reasoning_content back on every later request or the API answers 400:
 * "The `reasoning_content` in the thinking mode must be passed back to the
 * API."
 *
 * Both halves of that were already known and written down — in two files that
 * never met. trimOldToolResults in agent.ts deliberately PRESERVES the field
 * on tool-calling turns, quoting that very 400, and then this function threw
 * it away again on the way out of the door. The agent's care was undone on
 * every single request, on the BYOK path through base-provider and on the
 * platform path through /api/chat alike.
 *
 * Narrow on purpose. Only assistant turns, only with tool_calls, only with
 * something actually in the field — which is precisely the set DeepSeek
 * demands and no wider, so nothing extra is replayed and no other provider
 * sees a field it would refuse.
 */
export function stripReasoningContent<T extends LooseMessage>(
  messages: ReadonlyArray<T>,
  keepOnToolCalls = false,
): T[] {
  return messages.map((m) => {
    if (!('reasoning_content' in m)) return m;
    if (keepOnToolCalls && keepsReasoning(m)) return m;
    const { reasoning_content: _rc, ...rest } = m;
    void _rc;
    return rest as T;
  });
}

/** An assistant tool-call turn whose reasoning DeepSeek requires back. */
function keepsReasoning(m: LooseMessage): boolean {
  if (m.role !== 'assistant') return false;
  if (!Array.isArray(m.tool_calls) || m.tool_calls.length === 0) return false;
  const rc = m.reasoning_content;
  return typeof rc === 'string' && rc.length > 0;
}

/**
 * Is this request bound for a DeepSeek model?
 *
 * The provider key alone is not enough. A CUSTOM provider pointed at
 * DeepSeek's endpoint arrives here as 'generic' (or whatever the user named
 * it), and that is the configuration the 400 was first reported from — the
 * error read "Custom Provider API error", not "deepseek". So the model id is
 * checked too, which is the thing that actually decides who serves the call.
 */
function isDeepSeekTarget(provider: string, model?: string): boolean {
  if (provider.toLowerCase() === 'deepseek') return true;
  return typeof model === 'string' && /deepseek/i.test(model);
}

/**
 * Qwen (DashScope) requires system messages at the very start of the array.
 * Merge multiple system messages into one leading block; if a single system
 * message exists but isn't first, move it to the front. No-op when already valid.
 */
export function reorderSystemForQwen<T extends LooseMessage>(messages: ReadonlyArray<T>): T[] {
  const sys = messages.filter((m) => m.role === 'system');
  const nonSys = messages.filter((m) => m.role !== 'system');
  if (sys.length > 1) {
    const merged = sys.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n\n');
    return [{ role: 'system', content: merged } as unknown as T, ...nonSys];
  }
  if (sys.length === 1 && messages[0]?.role !== 'system') {
    return [sys[0], ...nonSys];
  }
  return messages as T[];
}

/**
 * Mistral refuses a conversation whose last message is an assistant turn:
 *
 *   400 invalid_request_message_order — "Expected last role User or Tool
 *   (or Assistant with prefix True) for serving but got assistant"
 *
 * That state is reachable. The agent appends a PARTIAL assistant reply and
 * loops when a stream is interrupted mid-answer, relying on the interjection
 * drain to add a user message behind it — and the queue can be emptied in
 * between (a stop clears it). Interrupting a stream went from impossible to a
 * button people press on 2026-08-17, so this stopped being theoretical.
 *
 * Mistral's own error names the fix: `prefix: true` marks a trailing assistant
 * message as one to CONTINUE rather than one to reply to — which is exactly
 * what a half-finished reply is. So the message is kept and completed rather
 * than thrown away, which is the honest handling: the user already watched
 * that text stream onto their screen.
 *
 * Only Mistral is strict about this today. The others accept it, so nothing
 * else is touched — a rule applied where it isn't needed is how "why is this
 * here?" comments start.
 */
export function markTrailingAssistantPrefix<T extends LooseMessage>(
  provider: string,
  messages: ReadonlyArray<T>,
): T[] {
  if (provider !== 'mistral' || messages.length === 0) return messages as T[];
  const last = messages[messages.length - 1];
  if (last?.role !== 'assistant' || 'prefix' in last) return messages as T[];
  // A trailing assistant WITH tool_calls used to be skipped here, on the
  // reasoning that it is a different fault — dangling calls with no results —
  // which prefix would not rescue, so better to fail loudly.
  //
  // It failed loudly and rescued nothing. The operator hit it on 2026-08-19
  // after a present_plan turn:
  //
  //   Provider mistral returned 400: Expected last role User or Tool
  //   (or Assistant with prefix True) for serving but got assistant
  //
  // Mistral's own message names prefix:true as an accepted shape — it does not
  // exclude assistant turns carrying tool_calls. So the skip turned a
  // recoverable request into a hard error, and the user saw a raw provider 400
  // at the end of a turn that had otherwise worked.
  //
  // Marked rather than skipped now. If the underlying state really is a
  // dangling call, a continuation is still a better outcome than a 400 the user
  // has to read — and it is logged so the state is visible rather than silent.
  const trailingCall = Array.isArray(last.tool_calls) && last.tool_calls.length > 0;
  if (trailingCall) {
    logger.warn(
      '[mistral] Trailing assistant carries tool_calls with no results — marking as a ' +
      'prefix continuation. Provider rejects it outright otherwise.',
    );
  }
  return [...messages.slice(0, -1), { ...last, prefix: true } as T];
}

/**
 * The shared OpenAI-compatible message pipeline: strip reasoning_content
 * (except where DeepSeek requires it back), reorder system messages for Qwen,
 * and mark a trailing assistant as a Mistral prefix continuation.
 *
 * `model` is optional only so existing callers keep compiling. Pass it —
 * without it a custom provider pointed at DeepSeek cannot be recognised, and
 * that is the case this was written for.
 */
export function shapeMessages<T extends LooseMessage>(
  provider: string,
  messages: ReadonlyArray<T>,
  model?: string,
): T[] {
  const stripped = stripReasoningContent(messages, isDeepSeekTarget(provider, model));
  const ordered = provider === 'qwen' ? reorderSystemForQwen(stripped) : stripped;
  return markTrailingAssistantPrefix(provider, ordered);
}
