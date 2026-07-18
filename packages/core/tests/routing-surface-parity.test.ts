import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from '../src/providers/provider-registry.js';
import { PlatformProvider } from '../src/providers/platform/index.js';
import { ModelRouter, type RoutingMode } from '../src/auto/model-router.js';
import { LONGXIANG_ENABLED } from '../src/auto/longxiang-router.js';
import { AutoCoordinator } from '../src/auto/auto-coordinator.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';

/**
 * Surface-parity regression. The managed platform serves DeepSeek/Mistral
 * under `-platform`-suffixed ids and Qwen under native ids; BYOK providers
 * list native ids. A routing table written in either form must resolve to the
 * intended fleet model on BOTH surfaces. This locks in the registry-bridge fix
 * so Aurora can never silently fall back to Qwen on platform, and Supernova's
 * DeepSeek routes can never silently fall back to Qwen on BYOK.
 */

type Setup = (reg: ProviderRegistry, avail: Set<string>) => void;

const platform: Setup = (reg, avail) => {
  reg.registerCustom('platform', new PlatformProvider({ apiKey: 'pk' }));
  avail.add('platform');
};
const byok = (...providers: string[]): Setup => (reg, avail) => {
  for (const p of providers) { reg.register(p, { apiKey: 'k' }); avail.add(p); }
};

function router(mode: RoutingMode, setup: Setup): ModelRouter {
  const reg = new ProviderRegistry();
  const avail = new Set<string>();
  setup(reg, avail);
  const platformKey = avail.has('platform') ? 'pk' : undefined;
  return new ModelRouter(reg, avail, platformKey, {}, mode);
}

/** Concrete resolved model id for a category (strips the provider prefix). */
function modelFor(r: ModelRouter, category: Parameters<ModelRouter['route']>[0]): string | null {
  const res = r.route(category);
  return res ? res.model.id : null;
}

function coordinatorFor(mode: RoutingMode, setup: Setup): string | null {
  const reg = new ProviderRegistry();
  const avail = new Set<string>();
  setup(reg, avail);
  const platformKey = avail.has('platform') ? 'pk' : undefined;
  const ac = AutoCoordinator.create({
    providerRegistry: reg,
    availableProviders: avail,
    platformKey,
    toolRegistry: new ToolRegistry(),
    mode,
  });
  return ac ? ac.coordinatorModel.id : null;
}

describe('Aurora — Mistral-only on both surfaces (EU-stack guarantee)', () => {
  for (const [label, setup, suffix] of [
    ['platform', platform, '-platform'],
    ['BYOK mistral', byok('mistral'), ''],
  ] as const) {
    it(`routes deep work to Medium 3.5 and volume to Small 4 (${label})`, () => {
      const r = router('aurora', setup);
      // Deep / hard routes → frontier Medium 3.5.
      for (const c of ['coding', 'planning', 'security', 'teach', 'vision'] as const) {
        expect(modelFor(r, c)).toBe(`mistral-medium-3.5${suffix}`);
      }
      // High-volume routes → cheap-but-capable Small 4.
      for (const c of ['chat', 'long_context', 'brainstorm', 'image_gen'] as const) {
        expect(modelFor(r, c)).toBe(`mistral-small-4${suffix}`);
      }
    });

    it(`never silently falls back to a non-Mistral model (${label})`, () => {
      const r = router('aurora', setup);
      for (const c of ['coding', 'planning', 'chat', 'vision', 'brainstorm'] as const) {
        expect(modelFor(r, c)).toMatch(/^mistral-/);
      }
    });
  }
});

describe('Supernova — DeepSeek reachable on both surfaces', () => {
  for (const [label, setup, suffix] of [
    ['platform', platform, '-platform'],
    ['BYOK deepseek+qwen', byok('deepseek', 'qwen'), ''],
  ] as const) {
    it(`routes deep work to V4 Pro and mid-tier to V4 Flash (${label})`, () => {
      const r = router('supernova', setup);
      for (const c of ['planning', 'security', 'long_context'] as const) {
        expect(modelFor(r, c)).toBe(`deepseek-v4-pro${suffix}`);
      }
      for (const c of ['chat', 'teach', 'brainstorm'] as const) {
        expect(modelFor(r, c)).toBe(`deepseek-v4-flash${suffix}`);
      }
      // Builder + vision stay on Qwen per the polyglot map.
      expect(modelFor(r, 'coding')).toBe('qwen3.7-plus');
    });
  }
});

describe('Longxiang — open-weights fleet, plan or BYOK', () => {
  const fleet = byok('kimi', 'qwen', 'deepseek');

  it('pins K3 to the depth routes (coding, planning, security)', () => {
    const r = router('longxiang', fleet);
    for (const c of ['coding', 'planning', 'security'] as const) {
      expect(modelFor(r, c)).toBe('kimi-k3');
    }
  });

  it('puts vision + long context on Qwen and volume on V4 Flash', () => {
    const r = router('longxiang', fleet);
    for (const c of ['vision', 'long_context', 'teach'] as const) {
      expect(modelFor(r, c)).toBe('qwen3.7-plus');
    }
    for (const c of ['chat', 'brainstorm', 'image_gen'] as const) {
      expect(modelFor(r, c)).toBe('deepseek-v4-flash');
    }
  });

  it('coordinator is Kimi K3 on BYOK', () => {
    expect(coordinatorFor('longxiang', fleet)).toBe('kimi-k3');
  });

  it('plan access follows the launch flag', () => {
    if (LONGXIANG_ENABLED) {
      // Live: Longxiang is NOT special-cased — a signed-in plan runs it on
      // credits, exactly like Maestro / Supernova / Aurora.
      expect(coordinatorFor('longxiang', platform)).not.toBeNull();
    } else {
      // Dark: the managed K3 entry is gated out of PLATFORM_MODELS entirely,
      // so a plan cannot reach it. This is the leak guard — a bookable
      // managed model must not exist for a fleet nobody can select yet.
      // BYOK still resolves (see the test above), because that runs on the
      // user's own key and costs us nothing.
      expect(coordinatorFor('longxiang', platform)).toBeNull();
    }
  });

  it('launch flag is LIVE — operator activated 2026-07-18', () => {
    // Tripwire. Flipping LONGXIANG_ENABLED makes the fleet visible across
    // every surface at once, so this test exists to force that flip to be a
    // deliberate, reviewable diff rather than something riding along in a
    // refactor. Operator activated it on 2026-07-18.
    //
    // Still open at activation, and deliberately NOT blocking it:
    //   - "Longxiang" trademark search (classes 9 + 42) — uncleared. This is
    //     the real risk; the name is public the moment this ships.
    //   - Kimi K3 weights due 2026-07-27 — not yet published.
    //   - Qwen 3.7 Plus is still closed.
    // The shipped copy deliberately never claims "open weights end to end",
    // so none of the above makes any user-facing string false today. If that
    // wording is ever strengthened, it must wait on the weights.
    expect(LONGXIANG_ENABLED).toBe(true);
  });
});

describe('Maestro — Qwen on both surfaces', () => {
  for (const [label, setup] of [['platform', platform], ['BYOK qwen', byok('qwen')]] as const) {
    it(`routes core work to Qwen 3.7 Plus (${label})`, () => {
      const r = router('auto', setup);
      for (const c of ['coding', 'planning', 'security', 'long_context'] as const) {
        expect(modelFor(r, c)).toBe('qwen3.7-plus');
      }
    });
  }
});

describe('Coordinator pinning per mode', () => {
  it('Aurora coordinator is Mistral Medium 3.5 on both surfaces', () => {
    expect(coordinatorFor('aurora', platform)).toBe('mistral-medium-3.5-platform');
    expect(coordinatorFor('aurora', byok('mistral'))).toBe('mistral-medium-3.5');
  });
  it('Supernova coordinator is DeepSeek V4 Pro on both surfaces', () => {
    expect(coordinatorFor('supernova', platform)).toBe('deepseek-v4-pro-platform');
    expect(coordinatorFor('supernova', byok('deepseek', 'qwen'))).toBe('deepseek-v4-pro');
  });
  it('Supernova falls through gracefully when DeepSeek is absent', () => {
    // qwen-only Supernova user — polyglot fallback, never null.
    expect(coordinatorFor('supernova', byok('qwen'))).not.toBeNull();
  });
  it('Maestro coordinator is the Qwen 3.7 Plus flagship on both surfaces', () => {
    // Regression: the flagship was absent from the BYOK ladder, so a
    // qwen-only user got 3.5 Plus as the classifier-brain instead of 3.7 Plus.
    expect(coordinatorFor('auto', platform)).toBe('qwen3.7-plus');
    expect(coordinatorFor('auto', byok('qwen'))).toBe('qwen3.7-plus');
  });
  it('reasoning-capable flagship outranks the non-reasoning Mistral Large 3', () => {
    // The BYOK ladder is "ordered by reasoning capability — best first", so the
    // reasoning-capable 3.7 Plus must beat non-reasoning Large 3 for multi-key users.
    expect(coordinatorFor('auto', byok('qwen', 'mistral'))).toBe('qwen3.7-plus');
  });
});
