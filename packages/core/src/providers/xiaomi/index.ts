import { BaseProvider } from '../base-provider.js';
import type { ModelDefinition } from '../../core/types.js';
import { XIAOMI_MODELS } from './models.js';

export class XiaomiProvider extends BaseProvider {
  readonly name = 'xiaomi';
  readonly displayName = 'Xiaomi (MiMo)';

  protected getDefaultBaseUrl(): string {
    // Verified live 2026-06-16: api.mimo.xiaomi.com does not resolve; the
    // official OpenAI-compatible endpoint is api.xiaomimimo.com (platform:
    // platform.xiaomimimo.com). Confirmed with a real 200 from mimo-v2.5-pro.
    return 'https://api.xiaomimimo.com/v1';
  }

  listModels(): ModelDefinition[] {
    return XIAOMI_MODELS;
  }
}
