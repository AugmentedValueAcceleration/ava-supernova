import { BaseProvider } from '../base-provider.js';
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

  // Shaping — reasoning_content strip and the max_tokens -> max_completion_tokens
  // remap MiniMax requires — is handled by the shared shaper in
  // BaseProvider.transformRequest (keyed on this.name === 'minimax'). The remap
  // is new on the BYOK path: previously only the platform route did it, so BYOK
  // MiniMax requests would fail outright. Gap closed.
}
