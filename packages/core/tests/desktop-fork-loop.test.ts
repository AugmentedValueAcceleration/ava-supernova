/**
 * 0G regression suite — Phase 3: the fork-point loop through the conductor.
 * The key is captured per step, hindsight reaches the Planner as text, and
 * the step record carries the key so hosts can pair failures/corrections.
 */
import { describe, it, expect, vi } from 'vitest';
import { runDesktopTrajectory, type PersonaModelCall, type DesktopProviders } from '../src/desktop/conductor.js';
import { imageKey, type ScreenKey } from '../src/desktop/screen-key.js';
import type { UIAElement } from '../src/tools/desktop-providers.js';

const W = 32, H = 32;
const gray = Uint8Array.from({ length: W * H }, (_, i) => i % 256);

const el = (name: string): UIAElement =>
  ({ name, control_type: 'button', x: 10, y: 10, width: 100, height: 20, cx: 60, cy: 20, enabled: true });

const DONE = { kind: 'done', riskClass: 'observational', reasoning: 'done', expectedPostState: 'n/a' };

function makeMocks(plans: Array<Record<string, unknown>>, elements: UIAElement[]) {
  const plannerContents: string[] = [];
  let i = 0;
  const callModel: PersonaModelCall = vi.fn(async ({ persona, userContent }: { persona: string; userContent: string }) => {
    if (persona === 'planner') {
      plannerContents.push(userContent);
      return { text: JSON.stringify(plans[Math.min(i++, plans.length - 1)]), tokensIn: 1, tokensOut: 1 };
    }
    return { text: JSON.stringify({ status: 'verified', detail: 'ok' }), tokensIn: 1, tokensOut: 1 };
  }) as unknown as PersonaModelCall;
  const providers = {
    uia: { listElements: vi.fn(async () => elements), findElement: vi.fn(async () => null), clickElement: vi.fn(async (n: string) => ({ name: n, cx: 60, cy: 20 })), focusWindow: vi.fn(async () => null) },
    input: { click: vi.fn(async () => {}), doubleClick: vi.fn(async () => {}), rightClick: vi.fn(async () => {}), typeText: vi.fn(async () => {}), keyPress: vi.fn(async () => {}), scroll: vi.fn(async () => {}), moveMouse: vi.fn(async () => {}), drag: vi.fn(async () => {}) },
  } as unknown as DesktopProviders;
  return { callModel, providers, plannerContents };
}

const CLICK = { kind: 'click', target: 'OK', riskClass: 'mutative-reversible', reasoning: 'confirm', expectedPostState: 'The dialog closes.' };

describe('fork-point loop through the conductor', () => {
  it('captures the key, passes it to the hint hook, injects hindsight into the Planner, and stamps the step', async () => {
    const m = makeMocks([CLICK, DONE], [el('OK')]);
    const key = imageKey(gray, W, H);
    const captureScreenKey = vi.fn(async () => key);
    const forkPointHint = vi.fn(async () => '[Learned on screens matching this one] - "click → Cancel" failed (wrong button); "click → OK" worked instead');

    const t = await runDesktopTrajectory({
      task: 'confirm the dialog', permissionLevel: 'drive', whitelist: [],
      providers: m.providers, callModel: m.callModel,
      requestApproval: vi.fn(async () => true), emit: () => {},
      budget: { maxSteps: 3, maxTokens: 50_000, maxWallMs: 60_000 },
      captureScreenKey, forkPointHint,
    });

    expect(forkPointHint).toHaveBeenCalledWith(key);
    expect(m.plannerContents[0]).toContain('learnedAtThisScreen');
    expect(m.plannerContents[0]).toContain('worked instead');
    expect(t.steps[0].screenKey).toEqual(key);
  });

  it('degrades honestly to a ctx key when capture is forbidden (vision off)', async () => {
    const m = makeMocks([CLICK, DONE], [el('OK')]);
    const t = await runDesktopTrajectory({
      task: 'confirm the dialog', permissionLevel: 'drive', whitelist: [],
      providers: m.providers, callModel: m.callModel,
      requestApproval: vi.fn(async () => true), emit: () => {},
      budget: { maxSteps: 3, maxTokens: 50_000, maxWallMs: 60_000 },
      captureScreenKey: async () => null, // host: consent forbids capture
    });
    const k = t.steps[0].screenKey as ScreenKey;
    expect(k.kind).toBe('ctx');
    expect((k as { ctx: string }).ctx).toContain('confirm the dialog');
  });

  it('a failing hint hook never blocks the turn', async () => {
    const m = makeMocks([CLICK, DONE], [el('OK')]);
    const t = await runDesktopTrajectory({
      task: 'confirm the dialog', permissionLevel: 'drive', whitelist: [],
      providers: m.providers, callModel: m.callModel,
      requestApproval: vi.fn(async () => true), emit: () => {},
      budget: { maxSteps: 3, maxTokens: 50_000, maxWallMs: 60_000 },
      captureScreenKey: async () => imageKey(gray, W, H),
      forkPointHint: async () => { throw new Error('store corrupted'); },
    });
    expect(t.outcome).toBe('completed');
  });
});
