import type { ModelDefinition } from '../core/types.js';
import { DEEPSEEK_MODELS } from './deepseek/models.js';
import { KIMI_MODELS } from './kimi/models.js';
import { QWEN_MODELS } from './qwen/models.js';
import { ZHIPU_MODELS } from './zhipu/models.js';
import { MISTRAL_MODELS } from './mistral/models.js';
import { MINIMAX_MODELS } from './minimax/models.js';
import { XIAOMI_MODELS } from './xiaomi/models.js';
import { TENCENT_MODELS } from './tencent/models.js';
import { NVIDIA_MODELS } from './nvidia/models.js';

/**
 * Every model Ava supports, keyed by provider id.
 *
 * Pure data — this module imports only the per-provider model-definition
 * arrays (no provider classes, no Node built-ins), so it is safe to import
 * from a browser/renderer bundle (e.g. the Tauri IDE's model picker) via the
 * `@ava/core/models` subpath. The ProviderRegistry reads from here too, so the
 * extension host and the IDE renderer share ONE source of truth.
 */
export const ALL_MODELS: Record<string, ModelDefinition[]> = {
  deepseek: DEEPSEEK_MODELS,
  kimi: KIMI_MODELS,
  qwen: QWEN_MODELS,
  zhipu: ZHIPU_MODELS,
  mistral: MISTRAL_MODELS,
  minimax: MINIMAX_MODELS,
  xiaomi: XIAOMI_MODELS,
  tencent: TENCENT_MODELS,
  nvidia: NVIDIA_MODELS,
};

/** Flat list of every non-disabled model (each carries its `provider` id). */
export function listAllModelDefs(): ModelDefinition[] {
  const out: ModelDefinition[] = [];
  for (const models of Object.values(ALL_MODELS)) {
    for (const m of models) {
      if (m.disabled) continue;
      out.push(m);
    }
  }
  return out;
}
