import { BaseProvider } from '../base-provider.js';
import type { ChatCompletionRequest } from '../types.js';
import type { CompletionResponse, ModelDefinition, StreamChunk } from '../../core/types.js';
import { AVA_FREE_MODELS } from './models.js';

const ALLOWED_FREE_MODELS = new Set(['glm-4.5-flash', 'glm-4.7-flash']);

/**
 * Ava Free provider — routes through the Ava platform proxy to free Zhipu models.
 * No API key required. Always available for all users.
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
    // No auth — this is the unauthenticated free tier
    return { 'Content-Type': 'application/json' };
  }

  listModels(): ModelDefinition[] {
    return AVA_FREE_MODELS;
  }

  protected transformRequest(request: ChatCompletionRequest): Record<string, unknown> {
    // Only allow free models — default to glm-4.7-flash
    const model = ALLOWED_FREE_MODELS.has(request.model) ? request.model : 'glm-4.7-flash';
    return { ...request, model };
  }

  // Zhipu sometimes returns tool_call arguments as objects instead of strings
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
