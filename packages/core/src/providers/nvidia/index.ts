import { BaseProvider } from '../base-provider.js';
import type { ModelDefinition } from '../../core/types.js';
import { NVIDIA_MODELS } from './models.js';

/**
 * NVIDIA — BYOK provider (OpenAI-compatible).
 *
 * Talks to NVIDIA's OpenAI-compatible NIM endpoint (build.nvidia.com). Bring
 * your own NVIDIA key (nvapi-*). BYOK-only by design: never platform-routed
 * and never promoted — offered for users who choose it, nothing more.
 */
export class NvidiaProvider extends BaseProvider {
  readonly name = 'nvidia';
  readonly displayName = 'NVIDIA';

  protected getDefaultBaseUrl(): string {
    return 'https://integrate.api.nvidia.com/v1';
  }

  listModels(): ModelDefinition[] {
    return NVIDIA_MODELS;
  }
}
