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

  // The shared shaper (BaseProvider.transformRequest) handles the date-stamped
  // model-id translation (mistral-large-3 -> mistral-large-2512, etc.) from the
  // single source of truth. Mistral's one extra quirk: it uses tool_choice
  // "any" instead of OpenAI's "required".
  protected transformRequest(request: ChatCompletionRequest): Record<string, unknown> {
    const body = super.transformRequest(request);
    if (request.tool_choice === 'required') {
      body.tool_choice = 'any';
    }
    return body;
  }
}
