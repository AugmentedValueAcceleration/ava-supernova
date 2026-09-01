/**
 * Shared per-provider parameter quirks for OpenAI-compatible chat requests.
 *
 * The platform route assembles these inline; the BYOK providers each re-derive
 * a subset. Centralised here so both produce an identical request body and a
 * gap like "core MiniMax never remaps max_tokens" can't survive.
 */

export interface ShapeableParams {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: unknown;
  frequency_penalty?: number;
  presence_penalty?: number;
  tools?: unknown;
  tool_choice?: unknown;
  stream?: boolean;
  stream_options?: Record<string, unknown>;
  /** Explicit opt-out of a hybrid model's reasoning pass. Undefined leaves the
   *  provider default alone; false suppresses it. See ChatCompletionRequest. */
  enable_thinking?: boolean;
  /** NIM/vLLM chat-template arguments. The only lever that stops a Nemotron
   *  reasoning — enable_thinking does nothing on that stack. See
   *  ChatCompletionRequest for what it costs when it is missing. */
  chat_template_kwargs?: Record<string, unknown>;
}

/** Zhipu models named "flash" that are NOT the cheap fast tier the rule below
 *  was written for, and which must keep their reasoning.
 *
 *  GLM-5.3-Flash is a 320B-A18B reasoning MoE where "Flash" marks the price
 *  ($0.15/M), not the size. The substring rule was written for GLM-4.5 Air and
 *  the small glm-*-flash tiers, and it would have switched 5.3-Flash's
 *  thinking off on the strength of its name alone - the same mistake the
 *  Nemotron note below warns about, and a worse one to make here, because the
 *  failure is silent: a frontier model quietly answering below its ability
 *  with nothing in the logs to say why. Operator call, 2026-09-01. If it does
 *  turn out to carry the 30-60s latency hit, move it out of this set.
 *
 *  An id, not a pattern, for the reason the Nemotron note gives. */
const ZHIPU_REASONING_FLASH = new Set(['glm-5.3-flash']);

/** Zhipu fast models that ship with thinking ON by default but where we want
 *  it OFF (30–60s latency hit otherwise). This originally reconciled two
 *  divergent checks: the platform route used a `flash` substring, core used an
 *  explicit set `{glm-4.5-air}` (no "flash" in the name). Air retired on
 *  2026-09-01 and the substring is all that is left, so the set went with it. */
export function isZhipuFlashModel(provider: string, model: string): boolean {
  if (provider !== 'zhipu') return false;
  if (ZHIPU_REASONING_FLASH.has(model)) return false;
  return model.includes('flash') || model.includes('Flash');
}

/** Models that write their reasoning into the CONTENT rather than into
 *  reasoning_content, which makes them unusable at their own defaults.
 *
 *  Measured 2026-08-16 on "In one sentence, what is a race condition?":
 *  Nemotron 3.5 Lightning spent 300 tokens and 14.3 SECONDS emitting
 *  "Here's a thinking process: 1. **Analyze User Input:**" and never reached
 *  an answer. With chat_template_kwargs {thinking:false}: 54 tokens, 0.67s,
 *  correct. There is no stripping our side because it is not in a separate
 *  field — it IS the answer as far as any consumer can tell.
 *
 *  Nemotron 3 Ultra is deliberately NOT here. It keeps its reasoning in
 *  reasoning_content and answers cleanly at its default, so forcing it off
 *  would remove capability to fix a problem it does not have.
 *
 *  An explicit set, not a name pattern: "lightning" and "nemotron" would both
 *  over-match the next model NVIDIA ships, and the failure mode of guessing
 *  wrong here is silently degrading a model that was fine. */
const CONTENT_LEAKING_REASONERS = new Set(['nvidia/nemotron-3.5-lightning-30b-a3b']);
export function leaksReasoningIntoContent(provider: string, model: string): boolean {
  return provider === 'nvidia' && CONTENT_LEAKING_REASONERS.has(model);
}

/**
 * Produce the request-body fragment (everything except `model` and `messages`)
 * with each provider's quirks applied:
 *  - MiniMax wants `max_completion_tokens`, not `max_tokens`.
 *  - Qwen (DashScope) rejects `frequency_penalty`.
 *  - Zhipu Flash: force `enable_thinking: false`.
 *  - Streaming requests opt into usage accounting via `stream_options`.
 */
export function shapeParams(
  provider: string,
  model: string,
  p: ShapeableParams,
): Record<string, unknown> {
  const isMiniMax = provider === 'minimax';
  const isQwen = provider === 'qwen';
  const isZhipuFlash = isZhipuFlashModel(provider, model);
  const leaksReasoning = leaksReasoningIntoContent(provider, model);

  return {
    stream: p.stream ?? false,
    ...(p.temperature !== undefined && { temperature: p.temperature }),
    ...(p.max_tokens !== undefined &&
      (isMiniMax ? { max_completion_tokens: p.max_tokens } : { max_tokens: p.max_tokens })),
    ...(p.top_p !== undefined && { top_p: p.top_p }),
    ...(p.stop !== undefined && { stop: p.stop }),
    ...(!isQwen && p.frequency_penalty !== undefined && { frequency_penalty: p.frequency_penalty }),
    ...(p.presence_penalty !== undefined && { presence_penalty: p.presence_penalty }),
    ...(p.tools !== undefined && { tools: p.tools }),
    ...(p.tool_choice !== undefined && { tool_choice: p.tool_choice }),
    ...(p.stream && { stream_options: { include_usage: true, ...(p.stream_options || {}) } }),
    // Zhipu Flash is forced off unconditionally (see above). Any other caller
    // can opt out explicitly — classifiers and gates want the answer, not the
    // reasoning, and the reasoning pass is not bounded by max_tokens.
    ...(isZhipuFlash
      ? { enable_thinking: false }
      : p.enable_thinking !== undefined && { enable_thinking: p.enable_thinking }),
    // An explicit value always wins; otherwise a content-leaking reasoner gets
    // thinking turned off by default, because its default is not usable. This
    // is applied for EVERY caller, not just the intent gate — the model ships
    // to BYOK users and a plain question is exactly where it fails worst.
    ...(p.chat_template_kwargs !== undefined
      ? { chat_template_kwargs: p.chat_template_kwargs }
      : leaksReasoning ? { chat_template_kwargs: { thinking: false } } : {}),
  };
}
