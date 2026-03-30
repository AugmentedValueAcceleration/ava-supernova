import { BaseProvider } from '../base-provider.js';
import type { ChatCompletionRequest } from '../types.js';
import type { CompletionResponse, ModelDefinition, StreamChunk } from '../../core/types.js';
import { AVA_FREE_MODELS } from './models.js';

const ALLOWED_FREE_MODELS = new Set(['qwen3-omni-flash', 'qwen3.5-omni-plus']);

/**
 * Ava Free provider — routes through the Ava platform proxy to Qwen models.
 * Free account users get 3M tokens. Default model: qwen-flash.
 * Both qwen-flash and qwen3.5-plus available (3.5-plus uses tokens faster).
 */
export class AvaFreeProvider extends BaseProvider {
  readonly name = 'ava-free';
  readonly displayName = 'Ava Free';

  constructor() {
    // No API key needed — the proxy holds the key server-side
    super({ apiKey: '' });
  }

  protected getDefaultBaseUrl(): string {
    return 'https://ava-supernova.com/api/v1/free';
  }

  protected getCompletionUrl(): string {
    return `${this.baseUrl}/chat`;
  }

  protected getAuthHeaders(): Record<string, string> {
    // No auth — this is the free tier
    return { 'Content-Type': 'application/json' };
  }

  listModels(): ModelDefinition[] {
    return AVA_FREE_MODELS;
  }

  protected transformRequest(request: ChatCompletionRequest): Record<string, unknown> {
    // Only allow Qwen models — default to qwen-flash
    const model = ALLOWED_FREE_MODELS.has(request.model) ? request.model : 'qwen3-omni-flash';
    return { ...request, model };
  }

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
