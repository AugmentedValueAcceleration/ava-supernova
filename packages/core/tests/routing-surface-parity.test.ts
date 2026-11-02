import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from '../src/providers/provider-registry.js';
import { ModelRouter, type RoutingMode } from '../src/auto/model-router.js';
import { LONGXIANG_ENABLED, AURORA_ENABLED, VISIBLE_ROUTING_MODES } from '../src/auto/routing-modes.js';
import { AutoCoordinator } from '../src/auto/auto-coordinator.js';
import { resolveCoordinatorModel } from '../src/auto/coordinator-model.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';

/**
 * Fleet routing on the user's own keys. Each fleet must resolve to its
 * intended models — Aurora never silently falls back off Mistral, Supernova's
 * DeepSeek routes never silently fall back to Qwen. (This file also covered
 * the managed platform until accounts went, 1 Nov 2026.)
 */

type Setup = (reg: ProviderRegistry, avail: Set<string>) => void;

const byok = (...providers: string[]): Setup => (reg, avail) => {
  for (const p of providers) { reg.register(p, { apiKey: 'k' }); avail.add(p); }
};

function router(mode: RoutingMode, setup: Setup): ModelRouter {
  const reg = new ProviderRegistry();
  const avail = new Set<string>();
  setup(reg, avail);
  return new ModelRouter(reg, avail, {}, mode);
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
  const ac = AutoCoordinator.create({
    providerRegistry: reg,
    availableProviders: avail,
    toolRegistry: new ToolRegistry(),
    mode,
  });
  return ac ? ac.coordinatorModel.id : null;
}

describe('Aurora — Mistral only, on the user\'s key', () => {
  // Back in the picker from 2 Nov 2026 (his call), on Mistral Large 4 and
  // Small 4. Medium 3.5 and Large 3 left the fleet: Mistral deprecated both.
  for (const [label, setup, suffix] of [
    ['BYOK mistral', byok('mistral'), ''],
  ] as const) {
    it(`routes deep work to Large 4 and volume to Small 4 (${label})`, () => {
      const r = router('aurora', setup);
      // Deep work and long context (1M) → Large 4.
      for (const c of ['coding', 'planning', 'security', 'teach', 'vision', 'long_context'] as const) {
        expect(modelFor(r, c)).toBe(`mistral-large-4${suffix}`);
      }
      // Volume → Small 4.
      for (const c of ['chat', 'brainstorm', 'image_gen'] as const) {
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

  it('is offered in the picker again', () => {
    expect(AURORA_ENABLED).toBe(true);
    expect(VISIBLE_ROUTING_MODES).toContain('aurora');
  });
});

describe('Supernova — DeepSeek on the user\'s key', () => {
  for (const [label, setup, suffix] of [
    ['BYOK deepseek+qwen', byok('deepseek', 'qwen'), ''],
  ] as const) {
    it(`runs everything but images on DeepSeek V4.1 Flash (${label})`, () => {
      const r = router('supernova', setup);
      // Coding moved onto DeepSeek on 2 Nov 2026 (his call), with the Builder.
      for (const c of ['coding', 'planning', 'security', 'long_context', 'chat', 'teach', 'brainstorm'] as const) {
        expect(modelFor(r, c)).toBe(`deepseek-flash${suffix}`);
      }
      // Images — reading them and generating them — on Qwen 3.8 Flash.
      expect(modelFor(r, 'vision')).toBe('qwen3.8-flash');
      expect(modelFor(r, 'image_gen')).toBe('qwen3.8-flash');
    });
  }
});

describe('Longxiang — open-weights fleet, on the user\'s keys', () => {
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

describe('Maestro — Qwen on the user\'s key', () => {
  for (const [label, setup] of [['BYOK qwen', byok('qwen')]] as const) {
    it(`deep work on Qwen 3.7 Plus, the rest on Qwen 3.8 Flash (${label})`, () => {
      const r = router('auto', setup);
      for (const c of ['coding', 'planning', 'security', 'teach', 'brainstorm'] as const) {
        expect(modelFor(r, c)).toBe('qwen3.7-plus');
      }
      // Moved off 3.5 Flash / 3.7 Plus on 2 Nov 2026 (his call).
      for (const c of ['chat', 'image_gen', 'vision', 'long_context'] as const) {
        expect(modelFor(r, c)).toBe('qwen3.8-flash');
      }
    });
  }
});

describe('Coordinator pinning per mode', () => {
  it('Aurora coordinator is Mistral Large 4 on a Mistral key, and nothing without one', () => {
    // Null without a Mistral key is correct, not a hole: Aurora is Mistral
    // only, and the surface says the Mistral key is missing.
    expect(coordinatorFor('aurora', byok('qwen', 'deepseek', 'kimi'))).toBeNull();
    expect(coordinatorFor('aurora', byok('mistral'))).toBe('mistral-large-4');
  });
  it('Supernova coordinator is DeepSeek Flash', () => {
    expect(coordinatorFor('supernova', byok('deepseek', 'qwen'))).toBe('deepseek-flash');
  });
  it('Supernova without a DeepSeek key has NO coordinator — never another key', () => {
    // It used to fall through to the generic ladder, which seats whatever the
    // user holds. Supernova's coordinator is DeepSeek V4.1 Flash or nothing,
    // and the surface says DeepSeek is missing.
    expect(coordinatorFor('supernova', byok('qwen'))).toBeNull();
    expect(coordinatorFor('supernova', byok('qwen', 'kimi', 'mistral'))).toBeNull();
  });
  it('Maestro coordinator is Qwen 3.8 Flash', () => {
    expect(coordinatorFor('auto', byok('qwen'))).toBe('qwen3.8-flash');
  });
  it('Maestro without a Qwen key has NO coordinator — never another key', () => {
    expect(coordinatorFor('auto', byok('kimi', 'deepseek', 'mistral'))).toBeNull();
  });
  it('the generic ladder ranks the reasoning-capable flagship above Mistral Large 3', () => {
    // No live fleet uses this ladder any more; an explicit pin still goes
    // through it. Ordered by reasoning capability — best first.
    const reg = new ProviderRegistry();
    const avail = new Set<string>();
    byok('qwen', 'mistral')(reg, avail);
    expect(resolveCoordinatorModel(reg, avail)?.model.id).toBe('qwen3.7-plus');
  });
});

describe('a pinned coordinator that cannot be reached (fully BYOK, 1 Nov 2026)', () => {
  // An older surface pinned Supernova to an account-era PLATFORM model. That
  // pin never resolves; it used to be treated as the override anyway,
  // skipping the Supernova branch, so an own-key user got the generic ladder.
  const pinned = (setup: Setup, preferredCoordinatorId: string) => {
    const reg = new ProviderRegistry();
    const avail = new Set<string>();
    setup(reg, avail);
    const ac = AutoCoordinator.create({
      providerRegistry: reg, availableProviders: avail, toolRegistry: new ToolRegistry(),
      cwd: '.', sharedState: {}, mode: 'supernova', preferredCoordinatorId,
    });
    return ac ? ac.coordinatorModel.id : null;
  };

  it('falls back to Supernova\'s own DeepSeek coordinator on the user\'s key', () => {
    // With a Kimi key as well, the generic ladder ranks Kimi first — so the
    // old code ran Supernova on Kimi. With only DeepSeek and Qwen the ladder
    // happened to pick DeepSeek anyway, which is why the bug hid.
    expect(pinned(byok('deepseek', 'qwen', 'kimi'), 'platform:deepseek-flash-platform')).toBe('deepseek-flash');
  });

  it('still honours a pin that CAN be reached', () => {
    expect(pinned(byok('deepseek', 'qwen'), 'qwen:qwen3.5-flash')).toBe('qwen3.5-flash');
  });
});

describe('an account-era platform: model id (fully BYOK, 1 Nov 2026)', () => {
  // Choices saved on an account still name `platform:` models. With no
  // platform they used to resolve to nothing — "no provider".
  it('resolves on the user\'s own key, bridging the -platform suffix', () => {
    const reg = new ProviderRegistry();
    byok('qwen', 'deepseek')(reg, new Set());
    expect(reg.resolveModel('platform:qwen3.7-plus')?.model.id).toBe('qwen3.7-plus');
    expect(reg.resolveModel('platform:deepseek-flash-platform')?.model.id).toBe('deepseek-flash');
  });

  it('does not invent a provider that is not there', () => {
    const reg = new ProviderRegistry();
    byok('qwen')(reg, new Set());
    expect(reg.resolveModel('mistral:mistral-large-3')).toBeUndefined();
  });
});

describe('the live fleets never leave their own providers (his call, 2 Nov 2026)', () => {
  // Maestro is Qwen only; Supernova is Qwen + DeepSeek. Given EVERY key a
  // user can hold, no seat may land anywhere else: Maestro's coordinator used
  // to be Kimi K3 for anyone with a Moonshot key.
  const everyKey = byok('qwen', 'deepseek', 'kimi', 'mistral', 'zhipu', 'tencent', 'nvidia', 'xiaomi', 'minimax');
  const categories = ['coding', 'vision', 'image_gen', 'planning', 'chat', 'long_context', 'teach', 'security', 'brainstorm'] as const;
  const fleet = (mode: RoutingMode) => {
    const reg = new ProviderRegistry();
    const avail = new Set<string>();
    everyKey(reg, avail);
    const ac = AutoCoordinator.create({
      providerRegistry: reg, availableProviders: avail, toolRegistry: new ToolRegistry(), cwd: '.', sharedState: {}, mode,
    })!;
    return { ac, r: new ModelRouter(reg, avail, {}, mode), reg, avail };
  };
  const seats = (mode: RoutingMode) => {
    const { ac, r } = fleet(mode);
    const internals = ac as unknown as {
      coordinatorProvider: { name: string };
      builderProvider: { name: string };
      visionProvider: { name: string } | null;
      intentGate: { provider: { name: string } } | null;
    };
    return {
      coordinator: internals.coordinatorProvider.name,
      builder: internals.builderProvider.name,
      vision: internals.visionProvider?.name,
      gate: internals.intentGate?.provider.name,
      routes: categories.map((c) => r.route(c)?.provider.name),
    };
  };

  it('Builders: Maestro on Qwen 3.7 Plus, Supernova on DeepSeek V4.1 Flash', () => {
    const builder = (mode: RoutingMode) => (fleet(mode).ac as unknown as { builderModel: { id: string } }).builderModel.id;
    expect(builder('auto')).toBe('qwen3.7-plus');
    expect(builder('supernova')).toBe('deepseek-flash');
  });

  it('Maestro: every seat is Qwen', () => {
    const s = seats('auto');
    expect(fleet('auto').ac.coordinatorModel.id).toBe('qwen3.8-flash');
    for (const p of [s.coordinator, s.builder, s.vision, s.gate, ...s.routes]) expect(p).toBe('qwen');
  });

  it('Aurora: every seat is Mistral, Large 4 coordinating and building', () => {
    const s = seats('aurora');
    expect(fleet('aurora').ac.coordinatorModel.id).toBe('mistral-large-4');
    for (const p of [s.coordinator, s.builder, s.vision, s.gate, ...s.routes]) expect(p).toBe('mistral');
    const internals = fleet('aurora').ac as unknown as { builderModel: { id: string }; intentGate: { model: { id: string } } | null };
    expect(internals.builderModel.id).toBe('mistral-large-4');
    expect(internals.intentGate?.model.id).toBe('mistral-small-4');
  });

  it('Supernova: every seat is Qwen or DeepSeek, DeepSeek coordinating', () => {
    const s = seats('supernova');
    expect(fleet('supernova').ac.coordinatorModel.id).toBe('deepseek-flash');
    for (const p of [s.coordinator, s.builder, s.vision, s.gate, ...s.routes]) expect(['qwen', 'deepseek']).toContain(p);
  });

  it('a pin cannot take Maestro off Qwen', () => {
    const reg = new ProviderRegistry();
    const avail = new Set<string>();
    everyKey(reg, avail);
    const ac = AutoCoordinator.create({
      providerRegistry: reg, availableProviders: avail, toolRegistry: new ToolRegistry(), cwd: '.', sharedState: {},
      mode: 'auto', preferredCoordinatorId: 'kimi:kimi-k3',
    });
    expect(ac?.coordinatorModel.id).toBe('qwen3.8-flash');
  });

  it('an explicit @model is still the user\'s own choice', () => {
    const { r } = fleet('auto');
    expect(r.route('coding', 'kimi:kimi-k3')?.model.id).toBe('kimi-k3');
  });
});
