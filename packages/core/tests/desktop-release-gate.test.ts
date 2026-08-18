/**
 * 0G regression suite — Phase 4: the release-gate contracts that weren't
 * already locked by earlier test files. Each block maps to a bar in the
 * release-ready definition:
 *   #4 screen never leaves the machine without consent (probe contract)
 *   #5 secrets never reach args/reasoning/memory (secret-handle flag)
 *   perf: screen-key matching stays effectively free per step
 */
import { describe, it, expect } from 'vitest';
import { probeVisionCapability } from '../src/desktop/capability.js';
import { classifyAction } from '../src/desktop/safety.js';
import { imageKey, matchScreen, averageHash } from '../src/desktop/screen-key.js';

describe('vision consent contract (release bar #4)', () => {
  it('OFF means unavailable — regardless of what keys/models exist', () => {
    const cap = probeVisionCapability({
      visionMode: 'off', localModelInstalled: true, hasHCompanyKey: true, hasPlatformKey: true,
    });
    expect(cap.available).toBe(false);
    expect(cap.lane).toBe('off');
  });

  it('LOCAL never falls through to cloud: model missing = unavailable, even with keys present', () => {
    const cap = probeVisionCapability({
      visionMode: 'local', localModelInstalled: false, hasHCompanyKey: true, hasPlatformKey: true,
    });
    expect(cap.available).toBe(false);
    expect(cap.lane).toBe('local'); // stays on the local lane — no silent cloud switch
  });

  it('LOCAL stays honestly unverified until H Company confirms', () => {
    const cap = probeVisionCapability({
      visionMode: 'local', localModelInstalled: true, hasHCompanyKey: false, hasPlatformKey: false,
    });
    expect(cap.available).toBe(true);
    expect(cap.verified).toBe(false);
  });

  it('CLOUD requires the user\'s OWN key (BYOK-only): the verified lane', () => {
    const withKey = probeVisionCapability({
      visionMode: 'cloud', localModelInstalled: false, hasHCompanyKey: true, hasPlatformKey: false,
    });
    expect(withKey.available).toBe(true);
    expect(withKey.lane).toBe('cloud-byok');
    expect(withKey.verified).toBe(true);

    const withoutKey = probeVisionCapability({
      visionMode: 'cloud', localModelInstalled: false, hasHCompanyKey: false, hasPlatformKey: false,
    });
    expect(withoutKey.available).toBe(false);
  });
});

describe('secret handling (release bar #5)', () => {
  it('typing into a masked field raises the secret-handle flag AND escalates risk', () => {
    const c = classifyAction({ kind: 'type', targetName: 'Password', isMaskedField: true });
    expect(c.requiresSecretHandle).toBe(true);
    expect(['mutative-irreversible', 'privileged']).toContain(c.riskClass);
  });

  it('a normal text field does not', () => {
    const c = classifyAction({ kind: 'type', targetName: 'Search' });
    expect(c.requiresSecretHandle).toBe(false);
  });
});

describe('screen-key perf gate (sub-100ms per step)', () => {
  it('hashing a thumbnail + matching against 200 stored keys stays under 100ms', () => {
    const W = 32, H = 32;
    const mk = (seed: number) =>
      Uint8Array.from({ length: W * H }, (_, i) => ((i * 31 + seed * 97) ^ (seed << 3)) % 256);
    const candidates = Array.from({ length: 200 }, (_, s) => imageKey(mk(s), W, H));
    const current = imageKey(mk(42), W, H);

    let matched: ReturnType<typeof matchScreen> = null;

    const once = () => {
      const t0 = performance.now();
      averageHash(mk(7), W, H);                   // per-step hash cost
      matched = matchScreen(current, candidates); // per-step match cost at full store
      return performance.now() - t0;
    };

    // Warm up, then take the FASTEST of several runs.
    //
    // The old version timed exactly one call — the first one — and failed about
    // one run in five. Measured on 2026-08-18, the work itself takes 3.9ms at
    // best and 13.6ms at worst once warm. Nowhere near the 100ms bound. What
    // the old test was actually measuring was the cold call: JIT compilation and
    // first-touch allocation, which swamp a few milliseconds of real work and
    // vary with whatever else the runner is doing.
    //
    // So it was never really a performance gate; it was a JIT-warmth detector
    // that happened to be right most of the time. It once reported a regression
    // where the new code was quicker than the baseline it was blamed against —
    // 132ms against 196ms. A flaky gate is worse than no gate, because it
    // teaches you to re-run until green, which is the habit that lets a real
    // regression through.
    //
    // Warm up first, then take the minimum: noise and JIT can only ADD time,
    // never subtract it, so the fastest run is the closest estimate of the true
    // cost. 100ms is left as the bound deliberately — it is 25x the measured
    // floor, so it will not nag, but this going quadratic in the number of
    // stored keys lands around 800ms and still trips it.
    for (let i = 0; i < 3; i++) once();
    let best = Infinity;
    for (let i = 0; i < 7; i++) best = Math.min(best, once());

    expect(matched?.index).toBe(42); // and it finds the right screen
    expect(best).toBeLessThan(100);
  });
});
