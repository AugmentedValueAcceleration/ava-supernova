import { BaseProvider } from '../base-provider.js';
import type { CompletionResponse, ModelDefinition, StreamChunk } from '../../core/types.js';
import { ZHIPU_MODELS } from './models.js';

export class ZhipuProvider extends BaseProvider {
  readonly name = 'zhipu';
  readonly displayName = 'Zhipu AI';

  protected getDefaultBaseUrl(): string {
    return 'https://open.bigmodel.cn/api/paas/v4';
  }

  listModels(): ModelDefinition[] {
    return ZHIPU_MODELS;
  }

  // Zhipu sometimes returns tool_call arguments as objects instead of strings
  protected normalizeResponse(raw: unknown): CompletionResponse {
    const response = raw as CompletionResponse;
    for (const choice of response.choices) {
      if (choice.message.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          if (typeof tc.function.arguments !== 'string') {
            tc.function.arguments = JSON.stringify(tc.function.arguments);
          }
        }
      }
    }
    return response;
  }

  protected normalizeStreamChunk(raw: unknown): StreamChunk {
    const chunk = raw as StreamChunk;
    for (const choice of chunk.choices) {
      if (choice.delta.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          if (tc.function?.arguments && typeof tc.function.arguments !== 'string') {
            tc.function.arguments = JSON.stringify(tc.function.arguments);
          }
        }
      }
    }
    return chunk;
  }
}
