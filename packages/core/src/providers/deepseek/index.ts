import { BaseProvider } from '../base-provider.js';
import type { ModelDefinition } from '../../core/types.js';
import { DEEPSEEK_MODELS } from './models.js';

export class DeepSeekProvider extends BaseProvider {
  readonly name = 'deepseek';
  readonly displayName = 'DeepSeek';
  // DeepSeek V4 ships on the OpenAI-compatible endpoint at
  // https://api.deepseek.com/v1/chat/completions. The non-/v1 base
  // worked for V3 (deepseek-chat / deepseek-reasoner) but rejects V4
  // model ids — confirmed against api-docs.deepseek.com 2026-04-25.
  // Keeping the /v1 in the base URL so BaseProvider's `${baseUrl}/chat/completions`
  // join produces the canonical V4 URL.
  protected getDefaultBaseUrl(): string {
    return 'https://api.deepseek.com/v1';
  }

  listModels(): ModelDefinition[] {
    return DEEPSEEK_MODELS;
  }
}
