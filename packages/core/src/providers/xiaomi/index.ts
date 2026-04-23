import { BaseProvider } from '../base-provider.js';
import type { ModelDefinition } from '../../core/types.js';
import { XIAOMI_MODELS } from './models.js';

export class XiaomiProvider extends BaseProvider {
  readonly name = 'xiaomi';
  readonly displayName = 'Xiaomi (MiMo)';

  protected getDefaultBaseUrl(): string {
    return 'https://api.mimo.xiaomi.com/v1';
  }

  listModels(): ModelDefinition[] {
    return XIAOMI_MODELS;
  }
}
