import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from '../src/providers/provider-registry.js';
import { PlatformProvider } from '../src/providers/platform/index.js';
import { ModelRouter, type RoutingMode } from '../src/auto/model-router.js';
import { LONGXIANG_ENABLED, AURORA_ENABLED, VISIBLE_ROUTING_MODES } from '../src/auto/routing-modes.js';
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

describe('Aurora — Mistral-only, and BYOK-only (EU-stack guarantee)', () => {
  // Rewritten 9 Oct 2026. This block used to assert the guarantee on the
  // MANAGED surface too. Of the five vendors approached, only Qwen and
  // DeepSeek came back on rates, so there is no managed Mistral to route to
  // and the fleet is retired from the picker. The guarantee itself still
  // matters and is still asserted — on the surface where it is still real,
  // which is a user's own Mistral key.
  for (const [label, setup, suffix] of [
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

  it('is retired from the picker, and a stored preference still resolves', () => {
    // Both halves matter. The flag keeps a fleet we cannot staff out of the
    // picker; the fallback keeps a preference saved while it WAS offered from
    // becoming a dead end. A user who picked Aurora months ago gets a working
    // model, not null — which is why the mode still parses rather than being
    // deleted outright.
    expect(AURORA_ENABLED).toBe(false);
    expect(VISIBLE_ROUTING_MODES).not.toContain('aurora');
    const r = router('aurora', platform);
    expect(modelFor(r, 'coding')).toBeTruthy();
  });
});

describe('Supernova — DeepSeek reachable on both surfaces', () => {
  for (const [label, setup, suffix] of [
    ['platform', platform, '-platform'],
    ['BYOK deepseek+qwen', byok('deepseek', 'qwen'), ''],
  ] as const) {
    it(`routes deep work to V4 Pro and mid-tier to V4 Flash (${label})`, () => {
      const r = router('supernova', setup);
      for (const c of ['planning', 'security', 'long_context'] as const) {
        expect(modelFor(r, c)).toBe(`deepseek-flash${suffix}`);
      }
      for (const c of ['chat', 'teach', 'brainstorm'] as const) {
        expect(modelFor(r, c)).toBe(`deepseek-flash${suffix}`);
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

  it('puts vision + long context on Qwen and volume on DeepSeek Flash', () => {
    const r = router('longxiang', fleet);
    // Moved off 3.7 Plus on 2026-09-10: same seats, newer Qwen. 3.8 Flash reads
    // images AND video, scores higher on the agentic sets, and costs a third.
    for (const c of ['vision', 'long_context', 'teach'] as const) {
      expect(modelFor(r, c)).toBe('qwen3.8-flash');
    }
    for (const c of ['chat', 'brainstorm', 'image_gen'] as const) {
      expect(modelFor(r, c)).toBe('deepseek-flash');
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

  it('launch flag is DOWN again — the fleet could not be staffed', () => {
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
    //
    // Flipped back 2026-10-06. Of the five vendors approached on rates and a
    // partnership, only Qwen and DeepSeek replied, so an "open-weights fleet"
    // built on Kimi K3 is a product we cannot staff. The tripwire now guards
    // the other direction: turning this back on makes the fleet visible on
    // every surface at once, and must not ride along in a refactor.
    expect(LONGXIANG_ENABLED).toBe(false);
    expect(VISIBLE_ROUTING_MODES).not.toContain('longxiang');
  });
});

describe('Chat routes to the cheap tier, never the coordinator', () => {
  // Regression guard for the direct-category billing bug (2026-07-18).
  //
  // `chat` is in DIRECT_CATEGORIES, meaning "no specialist team needed". That
  // was conflated with "run on the coordinator", so chat turns skipped the
  // router and ran on each fleet's most expensive model. Every fleet's cheap
  // chat tier was dead code, and the credits page quoted prices we were not
  // charging: Aurora chat cost 7 credits against a quoted 2, Longxiang 15
  // against a quoted 1.
  //
  // Asserting the ROUTE here — that chat resolves to the volume tier and not
  // the fleet's lead seat — is what stops it silently reverting.
  //
  // `sharesCoordinator` is Supernova only, since 2026-09-10. DeepSeek retired
  // V4 Pro into V4.1 Flash, so the fleet's lead seat and its volume seat are
  // now the SAME model — there is no cheaper DeepSeek to drop to. That is not
  // a regression: chat moved from V4 Flash at $0.22/$0.60 to V4.1 Flash at
  // $0.15/$0.60, so it got cheaper AND better at once.
  //
  // The rule this file protects is "chat must not burn the expensive tier".
  // With one model in the line there is no expensive tier to burn, and
  // reaching for another vendor's small model purely to keep two names would
  // be a worse model for no reason.
  const cases = [
    { mode: 'aurora'    as const, setup: byok('mistral'),                  chat: 'mistral-small-4', coordinator: 'mistral-medium-3.5', sharesCoordinator: false },
    { mode: 'supernova' as const, setup: byok('deepseek', 'qwen'),         chat: 'deepseek-flash',  coordinator: 'deepseek-flash',     sharesCoordinator: true  },
    { mode: 'longxiang' as const, setup: byok('kimi', 'qwen', 'deepseek'), chat: 'deepseek-flash',  coordinator: 'kimi-k3',            sharesCoordinator: false },
  ];

  for (const c of cases) {
    it(`${c.mode}: chat -> ${c.chat}${c.sharesCoordinator ? ' (shared with the lead seat — one model in the line)' : `, not ${c.coordinator}`}`, () => {
      const r = router(c.mode, c.setup);
      expect(modelFor(r, 'chat')).toBe(c.chat);
      if (!c.sharesCoordinator) expect(modelFor(r, 'chat')).not.toBe(c.coordinator);
    });
  }

  it('only Supernova is allowed to share its lead seat with chat', () => {
    // A guard on the exemption itself. If another fleet's chat quietly drifts
    // onto its coordinator, that is the regression this file exists to catch,
    // and the exemption must not become the habit.
    expect(cases.filter(c => c.sharesCoordinator).map(c => c.mode)).toEqual(['supernova']);
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
  it('Aurora coordinator is Mistral Medium 3.5 on a Mistral key, and nothing on the plan', () => {
    // Null on the plan is correct, not a hole: there is no managed Mistral to
    // seat, and seating a Qwen coordinator for a fleet sold as an EU stack
    // would be the one outcome worse than refusing.
    expect(coordinatorFor('aurora', platform)).toBeNull();
    expect(coordinatorFor('aurora', byok('mistral'))).toBe('mistral-medium-3.5');
  });
  it('Supernova coordinator is DeepSeek V4 Pro on both surfaces', () => {
    expect(coordinatorFor('supernova', platform)).toBe('deepseek-flash-platform');
    expect(coordinatorFor('supernova', byok('deepseek', 'qwen'))).toBe('deepseek-flash');
  });
  it('Supernova falls through gracefully when DeepSeek is absent', () => {
    // qwen-only Supernova user — polyglot fallback, never null.
    expect(coordinatorFor('supernova', byok('qwen'))).not.toBeNull();
  });
  it('Maestro coordinator is a Qwen flagship on both surfaces', () => {
    // Regression this guards: the flagship was absent from the BYOK ladder, so
    // a qwen-only user got 3.5 Plus as the classifier-brain.
    //
    // The two surfaces legitimately differ. Coordinating is classify-and-pick,
    // which is a light job, so the managed plan seats 3.8 Flash and spends the
    // budget on the specialists doing the work. A BYOK user has no managed
    // ladder to fall back to, so the strongest key they hold takes the seat.
    expect(coordinatorFor('auto', platform)).toBe('qwen3.8-flash');
    expect(coordinatorFor('auto', byok('qwen'))).toBe('qwen3.7-plus');
  });
  it('reasoning-capable flagship outranks the non-reasoning Mistral Large 3', () => {
    // The BYOK ladder is "ordered by reasoning capability — best first", so the
    // reasoning-capable 3.7 Plus must beat non-reasoning Large 3 for multi-key users.
    expect(coordinatorFor('auto', byok('qwen', 'mistral'))).toBe('qwen3.7-plus');
  });
});
