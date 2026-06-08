/**
 * Shared LLM request-shaping — the single source of truth both the PLATFORM
 * path (packages/web routes) and the BYOK path (core providers) import so the
 * outbound request body is identical regardless of who holds the key.
 *
 * Transport-free by design: callers do their own fetch/auth; this only shapes
 * the body. OpenAI-compatible providers use `shapeOpenAICompatBody` (or the
 * granular pieces); Anthropic's distinct format is handled separately.
 */

export {
  MODEL_API_NAMES,
  VISION_REROUTE,
  resolveApiModel,
  messagesHaveImages,
} from './model-ids.js';

export {
  stripReasoningContent,
  reorderSystemForQwen,
  shapeMessages,
} from './messages.js';

export {
  isZhipuFlashModel,
  shapeParams,
} from './params.js';
export type { ShapeableParams } from './params.js';

import { resolveApiModel, messagesHaveImages } from './model-ids.js';
import { shapeMessages } from './messages.js';
import { shapeParams, type ShapeableParams } from './params.js';

export interface ShapeOpenAICompatInput extends ShapeableParams {
  /** Provider key: 'qwen' | 'deepseek' | 'mistral' | 'zhipu' | 'minimax' | ... */
  provider: string;
  /** Friendly model id (pre-translation). */
  model: string;
  messages: ReadonlyArray<Record<string, unknown>>;
}

/**
 * Build a complete OpenAI-compatible chat-completion request body: translate
 * the model id (with vision reroute when images are present), shape the
 * messages array, and apply per-provider parameter quirks. Returns the body
 * object ready to JSON.stringify — minus auth, which the caller supplies.
 */
export function shapeOpenAICompatBody(input: ShapeOpenAICompatInput): Record<string, unknown> {
  const { provider, model, messages, ...params } = input;
  const hasImages = messagesHaveImages(messages);
  return {
    model: resolveApiModel(model, hasImages),
    messages: shapeMessages(provider, messages),
    ...shapeParams(provider, model, params),
  };
}
