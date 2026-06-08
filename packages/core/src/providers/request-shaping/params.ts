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
}

/** Zhipu fast models that ship with thinking ON by default but where we want
 *  it OFF (30–60s latency hit otherwise). Reconciles two previously-divergent
 *  checks: the platform route used a `flash` substring; core used an explicit
 *  set `{glm-4.5-air}` (no "flash" in the name). The union preserves both. */
const ZHIPU_FAST_MODELS = new Set(['glm-4.5-air']);
export function isZhipuFlashModel(provider: string, model: string): boolean {
  if (provider !== 'zhipu') return false;
  return ZHIPU_FAST_MODELS.has(model) || model.includes('flash') || model.includes('Flash');
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
    ...(isZhipuFlash && { enable_thinking: false }),
  };
}
