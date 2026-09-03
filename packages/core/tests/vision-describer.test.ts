// Who describes the image, when the chosen model can't see it.
//
// The old answer was a hardcoded Qwen chain — platform Omni, then the user's
// own Qwen Omni — copied into the extension, the IDE sidecar and the fleet
// routers, and missing from the CLI entirely. It asked "is Qwen available?"
// when the question is "does this user hold a key for anything that can see?"
//
// So a BYOK user whose only key was Zhipu, Moonshot, Mistral, Xiaomi or
// MiniMax got told to switch models while holding a working describer. It was
// invisible because the symptom — "this model can't read images" — was true;
// only the "and nothing else can either" part was wrong.
//
// These pin the question, not the chain. A future model shipping or retiring
// should not need this file edited.
import { describe, it, expect } from 'vitest';
import { resolveVisionDescriber } from '../src/agent/vision-bridge.js';
import { listAllModelDefs, PLATFORM_MODELS } from '../src/providers/catalog.js';
import type { Provider } from '../src/providers/types.js';
import type { ModelDefinition } from '../src/core/types.js';

/** A registry that holds keys for exactly the named providers. */
function registryWith(...providers: string[]) {
  const held = new Set(providers);
  return {
    resolveModel(qualifiedId: string): { provider: Provider; model: ModelDefinition } | undefined {
      const [p, id] = qualifiedId.includes(':')
        ? qualifiedId.split(':', 2) as [string, string]
        : [undefined, qualifiedId];
      if (!p || !held.has(p)) return undefined;
      const pool = p === 'platform' ? PLATFORM_MODELS : listAllModelDefs();
      const model = pool.find((m) => m.id === id);
      if (!model) return undefined;
      return { provider: { name: p } as unknown as Provider, model };
    },
  };
}

describe('resolveVisionDescriber', () => {
  it('uses the users own key when they have no Qwen and no platform', () => {
    // The whole bug, one line. Zhipu alone used to resolve to nothing.
    const hit = resolveVisionDescriber(registryWith('zhipu'));
    expect(hit).not.toBeNull();
    expect(hit!.model.provider).toBe('zhipu');
    expect(hit!.model.supportsVision).toBe(true);
  });

  it.each(['kimi', 'mistral', 'xiaomi', 'minimax'])(
    'finds a describer for a %s-only user', (provider) => {
      const hit = resolveVisionDescriber(registryWith(provider));
      expect(hit?.model.provider).toBe(provider);
      expect(hit?.model.supportsVision).toBe(true);
    });

  it('prefers the platform when it is available', () => {
    // Managed users should not spend a BYOK key describing a picture.
    const hit = resolveVisionDescriber(registryWith('platform', 'zhipu'));
    expect(hit?.model.provider).toBe('platform');
  });

  it('picks the cheapest of several keys, not the flashiest', () => {
    // It describes one image for a model that would otherwise be blind. The
    // bar is "better than nothing", so it should not reach for a flagship.
    const hit = resolveVisionDescriber(registryWith('kimi', 'xiaomi', 'zhipu', 'minimax'));
    const held = listAllModelDefs()
      .filter((m) => m.supportsVision && ['kimi', 'xiaomi', 'zhipu', 'minimax'].includes(m.provider));
    const cheapest = Math.min(...held.map((m) => m.pricing?.inputPerMillion ?? Infinity));
    expect(hit?.model.pricing?.inputPerMillion).toBe(cheapest);
  });

  it('returns null when nothing the user holds can see', () => {
    // DeepSeek has no vision model at all, so this is a real state and not a
    // failure to look properly. The caller says so plainly instead of
    // pretending a relay exists.
    expect(resolveVisionDescriber(registryWith('deepseek'))).toBeNull();
    expect(resolveVisionDescriber(registryWith())).toBeNull();
  });

  it('never offers a model that cannot see', () => {
    // The flags this trusts have been wrong before: GLM-5.2 shipped as
    // vision-capable until 2026-07-17 and returned a 1210 on every image.
    // Routing someone ELSE'S image into that is the new failure mode, so the
    // one thing this must never do is hand back a text-only model.
    for (const p of ['zhipu', 'kimi', 'mistral', 'xiaomi', 'minimax', 'qwen', 'platform']) {
      const hit = resolveVisionDescriber(registryWith(p));
      if (hit) expect(hit.model.supportsVision).toBe(true);
    }
  });
});
