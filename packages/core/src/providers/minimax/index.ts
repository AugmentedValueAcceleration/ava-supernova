import { BaseProvider } from '../base-provider.js';
import type { ChatCompletionRequest } from '../types.js';
import type { ModelDefinition } from '../../core/types.js';
import { MINIMAX_MODELS } from './models.js';

export class MiniMaxProvider extends BaseProvider {
  readonly name = 'minimax';
  readonly displayName = 'MiniMax';

  protected getDefaultBaseUrl(): string {
    return 'https://api.minimax.io/v1';
  }

  listModels(): ModelDefinition[] {
    return MINIMAX_MODELS;
  }

  protected transformRequest(request: ChatCompletionRequest): Record<string, unknown> {
    const transformed = { ...request } as Record<string, unknown>;

    // Strip reasoning_content from messages — MiniMax uses <think> tags instead
    if (Array.isArray(transformed.messages)) {
      transformed.messages = (transformed.messages as Record<string, unknown>[]).map((msg) => {
        if ('reasoning_content' in msg) {
          const { reasoning_content: _rc, ...rest } = msg;
          return rest;
        }
        return msg;
      });
    }

    return transformed;
  }
}
