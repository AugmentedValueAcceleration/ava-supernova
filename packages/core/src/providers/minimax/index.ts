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
}
