import { BaseProvider } from '../base-provider.js';
import type { ModelDefinition } from '../../core/types.js';
import { KIMI_MODELS } from './models.js';

export class KimiProvider extends BaseProvider {
  readonly name = 'kimi';
  readonly displayName = 'Kimi (Moonshot AI)';

  protected getDefaultBaseUrl(): string {
    return 'https://api.moonshot.ai/v1';
  }

  listModels(): ModelDefinition[] {
    return KIMI_MODELS;
  }
}
