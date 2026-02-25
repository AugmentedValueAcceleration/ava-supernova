import { BaseProvider } from '../base-provider.js';
import type { ModelDefinition } from '../../core/types.js';
import { PLATFORM_MODELS } from './models.js';

export class PlatformProvider extends BaseProvider {
  readonly name = 'platform';
  readonly displayName = 'Ava Platform';

  protected getDefaultBaseUrl(): string {
    return 'https://ava-supernova.com/api';
  }

  listModels(): ModelDefinition[] {
    return PLATFORM_MODELS;
  }
}
