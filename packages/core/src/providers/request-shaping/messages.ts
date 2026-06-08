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

type LooseMessage = Record<string, unknown>;

/**
 * reasoning_content is an OUTPUT-only field that reasoning models EMIT — they
 * reject it as INPUT (Qwen + Mistral 422 `extra_forbidden`, DeepSeek 400). No
 * provider needs its own prior thinking replayed. Strip it for every provider.
 */
export function stripReasoningContent<T extends LooseMessage>(messages: ReadonlyArray<T>): T[] {
  return messages.map((m) => {
    if ('reasoning_content' in m) {
      const { reasoning_content: _rc, ...rest } = m;
      void _rc;
      return rest as T;
    }
    return m;
  });
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
 * The shared OpenAI-compatible message pipeline: always strip reasoning_content,
 * then reorder system messages for Qwen. Provider-aware.
 */
export function shapeMessages<T extends LooseMessage>(
  provider: string,
  messages: ReadonlyArray<T>,
): T[] {
  const stripped = stripReasoningContent(messages);
  return provider === 'qwen' ? reorderSystemForQwen(stripped) : stripped;
}
