import { BaseProvider } from '../base-provider.js';
import type { ChatCompletionRequest } from '../types.js';
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

  protected transformRequest(request: ChatCompletionRequest): Record<string, unknown> {
    const transformed = { ...request } as Record<string, unknown>;

    // DashScope doesn't support frequency_penalty — strip it
    delete transformed.frequency_penalty;

    // Strip reasoning_content from messages — Qwen uses its own thinking
    // format (enable_thinking param) and rejects this DeepSeek/Zhipu field.
    if (Array.isArray(transformed.messages)) {
      transformed.messages = (transformed.messages as Record<string, unknown>[]).map((msg) => {
        if ('reasoning_content' in msg) {
          const { reasoning_content: _rc, ...rest } = msg;
          return rest;
        }
        return msg;
      });
    }

    return transformed;
  }
}
