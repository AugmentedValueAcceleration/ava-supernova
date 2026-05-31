import { describe, it, expect } from 'vitest';
import type { ModelDefinition } from '../src/core/types.js';
import { DEEPSEEK_MODELS } from '../src/providers/deepseek/models.js';
import { KIMI_MODELS } from '../src/providers/kimi/models.js';
import { QWEN_MODELS } from '../src/providers/qwen/models.js';
import { ZHIPU_MODELS } from '../src/providers/zhipu/models.js';
import { MISTRAL_MODELS } from '../src/providers/mistral/models.js';
import { DEFAULT_GENERIC_MODELS } from '../src/providers/generic/models.js';

function assertValidModel(model: ModelDefinition, expectedProvider: string) {
  expect(model.id).toBeTruthy();
  expect(model.name).toBeTruthy();
  expect(model.provider).toBe(expectedProvider);
  expect(model.contextWindow).toBeGreaterThan(0);
  expect(model.maxOutputTokens).toBeGreaterThan(0);
  expect(typeof model.supportsToolCalls).toBe('boolean');
  expect(typeof model.supportsStreaming).toBe('boolean');
}

describe('Model definitions', () => {
  describe('DeepSeek', () => {
    it('all models have valid structure and provider="deepseek"', () => {
      expect(DEEPSEEK_MODELS.length).toBeGreaterThan(0);
      for (const model of DEEPSEEK_MODELS) {
        assertValidModel(model, 'deepseek');
      }
    });

    it('contains deepseek-chat and deepseek-reasoner', () => {
      const ids = DEEPSEEK_MODELS.map((m) => m.id);
      expect(ids).toContain('deepseek-chat');
      expect(ids).toContain('deepseek-reasoner');
    });

    it('deepseek-reasoner supports thinking', () => {
      const reasoner = DEEPSEEK_MODELS.find((m) => m.id === 'deepseek-reasoner');
      expect(reasoner?.supportsThinking).toBe(true);
    });
  });

  describe('Kimi', () => {
    it('all models have valid structure and provider="kimi"', () => {
      expect(KIMI_MODELS.length).toBeGreaterThan(0);
      for (const model of KIMI_MODELS) {
        assertValidModel(model, 'kimi');
      }
    });

    it('kimi-k2.6 supports thinking, vision and tools', () => {
      const k26 = KIMI_MODELS.find((m) => m.id === 'kimi-k2.6');
      expect(k26).toBeDefined();
      expect(k26?.supportsThinking).toBe(true);
      expect(k26?.supportsVision).toBe(true);
      expect(k26?.supportsToolCalls).toBe(true);
    });

    it('kimi-k2.5 supports thinking and vision', () => {
      const k2 = KIMI_MODELS.find((m) => m.id === 'kimi-k2.5');
      expect(k2?.supportsThinking).toBe(true);
      expect(k2?.supportsVision).toBe(true);
    });
  });

  describe('Qwen', () => {
    it('all models have valid structure and provider="qwen"', () => {
      expect(QWEN_MODELS.length).toBeGreaterThan(0);
      for (const model of QWEN_MODELS) {
        assertValidModel(model, 'qwen');
      }
    });

    it('contains qwen3.5-plus with vision support', () => {
      const plus = QWEN_MODELS.find((m) => m.id === 'qwen3.5-plus');
      expect(plus).toBeDefined();
      expect(plus?.supportsVision).toBe(true);
    });
  });

  describe('Zhipu (hidden)', () => {
    it('all models have valid structure and provider="zhipu"', () => {
      expect(ZHIPU_MODELS.length).toBeGreaterThan(0);
      for (const model of ZHIPU_MODELS) {
        assertValidModel(model, 'zhipu');
      }
    });

    it('contains the light-tier Air model (glm-4.5-air)', () => {
      const air = ZHIPU_MODELS.find((m) => m.id === 'glm-4.5-air');
      expect(air).toBeDefined();
      expect(air?.pricing?.inputPerMillion).toBe(0.2);
    });
  });

  describe('Mistral (hidden)', () => {
    it('all models have valid structure and provider="mistral"', () => {
      expect(MISTRAL_MODELS.length).toBeGreaterThan(0);
      for (const model of MISTRAL_MODELS) {
        assertValidModel(model, 'mistral');
      }
    });

    it('contains codestral-latest', () => {
      const ids = MISTRAL_MODELS.map((m) => m.id);
      expect(ids).toContain('codestral-latest');
    });
  });

  describe('Generic', () => {
    it('default generic models have valid structure', () => {
      expect(DEFAULT_GENERIC_MODELS.length).toBeGreaterThan(0);
      for (const model of DEFAULT_GENERIC_MODELS) {
        assertValidModel(model, 'generic');
      }
    });
  });

  describe('Cross-provider', () => {
    it('all model IDs are unique across all providers', () => {
      const allModels = [
        ...DEEPSEEK_MODELS,
        ...KIMI_MODELS,
        ...QWEN_MODELS,
        ...ZHIPU_MODELS,
        ...MISTRAL_MODELS,
        ...DEFAULT_GENERIC_MODELS,
      ];
      const ids = allModels.map((m) => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('all models with pricing have non-negative values', () => {
      const allModels = [
        ...DEEPSEEK_MODELS,
        ...KIMI_MODELS,
        ...QWEN_MODELS,
        ...ZHIPU_MODELS,
        ...MISTRAL_MODELS,
      ];
      for (const model of allModels) {
        if (model.pricing) {
          expect(model.pricing.inputPerMillion).toBeGreaterThanOrEqual(0);
          expect(model.pricing.outputPerMillion).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });
});
