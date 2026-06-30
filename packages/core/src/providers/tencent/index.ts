import { BaseProvider } from '../base-provider.js';
import type { CompletionResponse, ModelDefinition, StreamChunk } from '../../core/types.js';
import { TENCENT_MODELS } from './models.js';

/**
 * Tencent Hunyuan — BYOK provider (OpenAI-compatible).
 *
 * Talks to Tencent's TokenHub gateway (tokenhub.tencentmaas.com), which mirrors
 * the OpenAI chat-completions shape including tool calling + reasoning_effort.
 * Bring your own Tencent Hunyuan key.
 */
export class TencentProvider extends BaseProvider {
  readonly name = 'tencent';
  readonly displayName = 'Tencent Hunyuan';

  protected getDefaultBaseUrl(): string {
    return 'https://tokenhub.tencentmaas.com/v1';
  }

  listModels(): ModelDefinition[] {
    return TENCENT_MODELS;
  }

  // Hunyuan's OpenAI-compatible endpoint can return tool_call arguments as
  // objects rather than JSON strings (same quirk as Zhipu). Normalize to a
  // string so the agent's JSON.parse never chokes.
  protected normalizeResponse(raw: unknown): CompletionResponse {
    const response = raw as CompletionResponse;
    for (const choice of response.choices) {
      if (choice.message.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          if (typeof tc.function.arguments !== 'string') {
            tc.function.arguments = JSON.stringify(tc.function.arguments);
          }
        }
      }
    }
    return response;
  }

  protected normalizeStreamChunk(raw: unknown): StreamChunk {
    const chunk = raw as StreamChunk;
    for (const choice of chunk.choices) {
      if (choice.delta.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          if (tc.function?.arguments && typeof tc.function.arguments !== 'string') {
            tc.function.arguments = JSON.stringify(tc.function.arguments);
          }
        }
      }
    }
    return chunk;
  }
}
