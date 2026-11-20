import { describe, it, expect } from 'vitest';
import type { ModelDefinition } from '../src/core/types.js';
import { DEEPSEEK_MODELS, DEEPSEEK_RETIRED_IDS } from '../src/providers/deepseek/models.js';
import { KIMI_MODELS } from '../src/providers/kimi/models.js';
import { TENCENT_MODELS } from '../src/providers/tencent/models.js';
import { resolveApiModel } from '../src/providers/request-shaping/model-ids.js';
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

    it('offers one model — deepseek-flash — and sends V4 Pro there', () => {
      // V4 Pro is still served, but DeepSeek's own V4.1 Flash notice puts Flash
      // ahead of it on performance, cost and speed, at a quarter of the price
      // (his call, 20 Nov 2026: leave Pro out).
      expect(DEEPSEEK_MODELS.map((m) => m.id)).toEqual(['deepseek-flash']);
      expect(DEEPSEEK_RETIRED_IDS['deepseek-v4-pro']).toBe('deepseek-flash');
    });

    it('deepseek-flash thinks, sees, and takes 384K of output', () => {
      const m = DEEPSEEK_MODELS.find((x) => x.id === 'deepseek-flash');
      expect(m?.supportsThinking).toBe(true);
      // Both predecessors were text-only at the API level. This one is not,
      // and the vision bridge depends on the flag being right.
      expect(m?.supportsVision).toBe(true);
      // Was 8192 on both merged entries — a 47x understatement that truncates
      // long work quietly rather than failing.
      expect(m?.maxOutputTokens).toBe(384_000);
    });

    it('every retired id maps to something that still exists', () => {
      // We rewrite these ourselves rather than trusting DeepSeek's redirect:
      // a request leaving us with a retired id is one whose behaviour someone
      // else controls, including how it is billed.
      const live = new Set(DEEPSEEK_MODELS.map((m) => m.id));
      for (const [retired, target] of Object.entries(DEEPSEEK_RETIRED_IDS)) {
        expect(live.has(target) || target.endsWith('-platform'), `${retired} -> ${target}`).toBe(true);
        expect(live.has(retired), `${retired} is retired and must not be live`).toBe(false);
      }
    });
  });

  describe('Kimi', () => {
    it('all models have valid structure and provider="kimi"', () => {
      expect(KIMI_MODELS.length).toBeGreaterThan(0);
      for (const model of KIMI_MODELS) {
        assertValidModel(model, 'kimi');
      }
    });

    it('K3.1 Pro leads, and the retiring K2 line rolls forward to it', () => {
      const pro = KIMI_MODELS.find((m) => m.id === 'kimi-k3.1-pro');
      expect(pro).toMatchObject({ supportsThinking: true, supportsVision: true, supportsToolCalls: true });
      expect(pro?.pricing).toEqual({ inputPerMillion: 2.00, outputPerMillion: 10.00 });
      // K2.7 Code and K2.6 retire at the end of December 2026: hidden, still
      // resolvable, and sent to Moonshot as K3.1 Pro.
      for (const id of ['kimi-k2.7-code', 'kimi-k2.6', 'kimi-k2.7-code-platform']) {
        expect(resolveApiModel(id)).toBe('kimi-k3.1-pro');
      }
      for (const id of ['kimi-k2.7-code', 'kimi-k2.6']) {
        expect(KIMI_MODELS.find((m) => m.id === id)?.hiddenFromPicker).toBe(true);
      }
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

  describe('Tencent', () => {
    it('offers Hy4 and Hy4 Flash, both seeing, 1M context', () => {
      const shown = TENCENT_MODELS.filter((m) => !m.hiddenFromPicker).map((m) => m.id);
      expect(shown).toEqual(['hy4', 'hy4-flash']);
      for (const id of shown) {
        expect(TENCENT_MODELS.find((m) => m.id === id)).toMatchObject({ supportsVision: true, contextWindow: 1048576 });
      }
    });

    it('Hy3 and its preview roll forward to Hy4', () => {
      expect(resolveApiModel('hy3')).toBe('hy4');
      expect(resolveApiModel('hy3-preview')).toBe('hy4');
      expect(TENCENT_MODELS.find((m) => m.id === 'hy3')?.hiddenFromPicker).toBe(true);
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
