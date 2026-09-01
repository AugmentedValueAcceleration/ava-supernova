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

    it('contains the V4 variants (deepseek-v4-pro and deepseek-v4-flash)', () => {
      // Legacy aliases deepseek-chat / deepseek-reasoner are deliberately
      // not exposed — see deepseek/models.ts (they deprecate 2026-07-24).
      const ids = DEEPSEEK_MODELS.map((m) => m.id);
      expect(ids).toContain('deepseek-v4-pro');
      expect(ids).toContain('deepseek-v4-flash');
    });

    it('deepseek-v4-pro supports thinking', () => {
      const pro = DEEPSEEK_MODELS.find((m) => m.id === 'deepseek-v4-pro');
      expect(pro?.supportsThinking).toBe(true);
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

    // Moonshot switches kimi-k2.5 off on 2026-08-31 and it is already closed to
    // new accounts, so it is gone from the catalogue and from the router's
    // fallback chain. This asserts it STAYS gone: a retired model creeping back
    // into a fallback is the kind of thing that only shows up as a 404 in
    // somebody else's terminal.
    it('kimi-k2.5 is retired and no longer offered', () => {
      expect(KIMI_MODELS.find((m) => m.id === 'kimi-k2.5')).toBeUndefined();
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

    it('contains the 5.3 flagship and the Flash tier', () => {
      const flagship = ZHIPU_MODELS.find((m) => m.id === 'glm-5.3');
      expect(flagship).toBeDefined();
      expect(flagship?.pricing?.inputPerMillion).toBe(1.4);

      const flash = ZHIPU_MODELS.find((m) => m.id === 'glm-5.3-flash');
      expect(flash).toBeDefined();
      // List price. The launch promotion ($0.075/M to 2026-09-09) does not
      // belong in a catalogue that outlives it.
      expect(flash?.pricing?.inputPerMillion).toBe(0.15);
    });

    it('keeps the main line text-only and vision on Flash alone', () => {
      // This has been wrong in production once: 5.2 carried
      // supportsVision: true until 2026-07-17 and every attached image hit
      // a 1210 from Zhipu. Nothing failed at build time, and the same claim
      // then sat uncorrected in three other files for six weeks. The GLM
      // naming trap is that a higher number does not mean it can see, and
      // 5.3 Flash is the single exception - verified at docs.z.ai, which is
      // the only source that has ever been right about this.
      const flagship = ZHIPU_MODELS.find((m) => m.id === 'glm-5.3');
      expect(flagship?.supportsVision).toBe(false);

      const flash = ZHIPU_MODELS.find((m) => m.id === 'glm-5.3-flash');
      expect(flash?.supportsVision).toBe(true);
    });
  });

  describe('Mistral (hidden)', () => {
    it('all models have valid structure and provider="mistral"', () => {
      expect(MISTRAL_MODELS.length).toBeGreaterThan(0);
      for (const model of MISTRAL_MODELS) {
        assertValidModel(model, 'mistral');
      }
    });

    // Codestral and Devstral are not offered. This test asserted the opposite
    // and had been failing for long enough to be treated as background noise —
    // which is how the website came to advertise both as BYOK-available for
    // models nobody could actually select. A red test that everyone steps over
    // stops being a warning and becomes decoration.
    it('does not claim coder models we do not serve', () => {
      const ids = MISTRAL_MODELS.map((m) => m.id);
      expect(ids).not.toContain('codestral-latest');
      expect(ids.some((id) => id.includes('devstral'))).toBe(false);
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
