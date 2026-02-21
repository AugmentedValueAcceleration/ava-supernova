import { BaseProvider } from '../base-provider.js';
import type { ChatCompletionRequest } from '../types.js';
import type { ModelDefinition } from '../../core/types.js';
import { MISTRAL_MODELS } from './models.js';

export class MistralProvider extends BaseProvider {
  readonly name = 'mistral';
  readonly displayName = 'Mistral AI';

  protected getDefaultBaseUrl(): string {
    return 'https://api.mistral.ai/v1';
  }

  listModels(): ModelDefinition[] {
    return MISTRAL_MODELS;
  }

  // Mistral uses "any" instead of "required" for forced tool use
  protected transformRequest(request: ChatCompletionRequest): Record<string, unknown> {
    const transformed = { ...request } as Record<string, unknown>;
    if (request.tool_choice === 'required') {
      transformed.tool_choice = 'any';
    }
    return transformed;
  }
}
