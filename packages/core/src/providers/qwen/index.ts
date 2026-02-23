import { BaseProvider } from '../base-provider.js';
import type { ModelDefinition } from '../../core/types.js';
import { QWEN_MODELS } from './models.js';

export class QwenProvider extends BaseProvider {
  readonly name = 'qwen';
  readonly displayName = 'Qwen (Alibaba Cloud)';

  protected getDefaultBaseUrl(): string {
    return 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
  }

  listModels(): ModelDefinition[] {
    return QWEN_MODELS;
  }
}
