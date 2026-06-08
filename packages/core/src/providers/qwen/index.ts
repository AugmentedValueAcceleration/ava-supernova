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

  // Request shaping — frequency_penalty drop, reasoning_content strip, and the
  // system-message reorder Qwen requires — is handled by the shared shaper in
  // BaseProvider.transformRequest (keyed on this.name === 'qwen'). The reorder
  // is new here: previously only the platform route did it, so BYOK Qwen could
  // fail on out-of-order system messages. That gap is now closed.
}
