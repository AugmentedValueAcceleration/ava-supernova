import { BaseProvider } from '../base-provider.js';
import type { ChatCompletionRequest } from '../types.js';
import type { ModelDefinition } from '../../core/types.js';
import { MISTRAL_MODELS } from './models.js';

/**
 * Mistral's API uses date-stamped model IDs, not the friendly product
 * names we use internally. Translate at the boundary so the rest of
 * Ava can keep referring to "mistral-large-3" / "mistral-small-4" in
 * router tables, persona maps, and credit-pricing entries.
 *
 * The friendly id stays our canonical key everywhere else; only the
 * outbound HTTP request to api.mistral.ai/v1 swaps it for the
 * date-stamped form Mistral actually accepts.
 */
const MISTRAL_API_ID: Record<string, string> = {
  'mistral-large-3':    'mistral-large-2512',   // Mistral Large 3, Dec 2025 release
  'mistral-small-4':    'mistral-small-2603',   // Mistral Small 4, March 2026 release
  'mistral-medium-3.5': 'mistral-medium-2604',  // Apr 28 2026 / v26.04 snapshot id (Mistral docs)
};

export class MistralProvider extends BaseProvider {
  readonly name = 'mistral';
  readonly displayName = 'Mistral AI';

  protected getDefaultBaseUrl(): string {
    return 'https://api.mistral.ai/v1';
  }

  listModels(): ModelDefinition[] {
    return MISTRAL_MODELS;
  }

  // Mistral uses "any" instead of "required" for forced tool use, and
  // expects date-stamped model ids (mistral-large-2512) rather than
  // the friendly names we use internally (mistral-large-3).
  protected transformRequest(request: ChatCompletionRequest): Record<string, unknown> {
    const transformed = { ...request } as Record<string, unknown>;
    if (request.tool_choice === 'required') {
      transformed.tool_choice = 'any';
    }
    const apiId = MISTRAL_API_ID[request.model];
    if (apiId) {
      transformed.model = apiId;
    }
    return transformed;
  }
}
