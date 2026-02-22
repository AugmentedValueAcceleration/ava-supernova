import { BaseProvider } from '../base-provider.js';
import type { ModelDefinition } from '../../core/types.js';
import { DEEPSEEK_MODELS } from './models.js';

export class DeepSeekProvider extends BaseProvider {
  readonly name = 'deepseek';
  readonly displayName = 'DeepSeek';
  protected getDefaultBaseUrl(): string {
    return 'https://api.deepseek.com';
  }

  listModels(): ModelDefinition[] {
    return DEEPSEEK_MODELS;
  }
}
