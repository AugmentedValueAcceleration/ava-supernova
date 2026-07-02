/**
 * 0G regression suite — the conductor loop, run headlessly with mocked
 * providers and a scripted model. These are the end-to-end trust checks:
 * what the system DOES when the model proposes something dangerous, when an
 * element is covered or greyed out, and when the kill-switch fires.
 */
import { describe, it, expect, vi } from 'vitest';
import { runDesktopTrajectory, type PersonaModelCall, type DesktopProviders } from '../src/desktop/conductor.js';
import type { UIAElement } from '../src/tools/desktop-providers.js';

// ── Fixtures ───────────────────────────────────────────────────────────────

function el(name: string, over: Partial<UIAElement> = {}): UIAElement {
  return { name, control_type: 'menu item', x: 10, y: 10, width: 100, height: 20, cx: 60, cy: 20, enabled: true, ...over };
}

interface MockOpts {
  elements?: UIAElement[];
  plans: Array<Record<string, unknown>>; // planner replies, in order
  approve?: boolean;
}

function makeMocks({ elements = [], plans, approve = true }: MockOpts) {
  const clickElement = vi.fn(async (name: string) => ({ name, cx: 60, cy: 20 }));
  const input = {
    click: vi.fn(async () => {}),
    doubleClick: vi.fn(async () => {}),
    rightClick: vi.fn(async () => {}),
    typeText: vi.fn(async () => {}),
    keyPress: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    moveMouse: vi.fn(async () => {}),
    drag: vi.fn(async () => {}),
  };
  const providers: DesktopProviders = {
    uia: {
      listElements: vi.fn(async () => elements),
      findElement: vi.fn(async () => null),
      clickElement,
      focusWindow: vi.fn(async () => null),
    },
    input,
  } as unknown as DesktopProviders;

  let planIdx = 0;
  const callModel: PersonaModelCall = vi.fn(async ({ persona }: { persona: string }) => {
    if (persona === 'planner') {
      const plan = plans[Math.min(planIdx, plans.length - 1)];
      planIdx += 1;
      return { text: JSON.stringify(plan), tokensIn: 10, tokensOut: 10 };
    }
    // verifier — always accept; these tests exercise the gate/actor, not verification
    return { text: JSON.stringify({ status: 'verified', detail: 'looks right' }), tokensIn: 10, tokensOut: 10 };
  }) as unknown as PersonaModelCall;

  const requestApproval = vi.fn(async () => approve);
  return { providers, callModel, requestApproval, input, clickElement };
}

const run = (m: ReturnType<typeof makeMocks>, over: Record<string, unknown> = {}) =>
  runDesktopTrajectory({
    task: 'test task',
    permissionLevel: 'drive',
    whitelist: [],
    providers: m.providers,
    callModel: m.callModel,
    requestApproval: m.requestApproval,
    emit: () => {},
    budget: { maxSteps: 4, maxTokens: 100_000, maxWallMs: 60_000 },
    ...over,
  });

const CLICK_EMPTY = {
  kind: 'click', target: 'Empty Recycle Bin', riskClass: 'mutative-irreversible',
  reasoning: 'empty the bin', expectedPostState: 'A confirmation dialog appears asking to permanently delete.',
};
const DONE = { kind: 'done', riskClass: 'observational', reasoning: 'Task complete.', expectedPostState: 'n/a' };

// ── The trust floor, end to end ────────────────────────────────────────────

describe('irreversible actions confirm in Drive (release bar #1)', () => {
  it('asks for approval and stops cleanly when declined — nothing executes', async () => {
    const m = makeMocks({ elements: [el('Empty Recycle Bin')], plans: [CLICK_EMPTY], approve: false });
    const t = await run(m);
    expect(m.requestApproval).toHaveBeenCalledTimes(1);
    expect(m.clickElement).not.toHaveBeenCalled();
    expect(m.input.click).not.toHaveBeenCalled();
    expect(t.outcome).toBe('stopped');
  });

  it('executes after approval', async () => {
    const m = makeMocks({ elements: [el('Empty Recycle Bin')], plans: [CLICK_EMPTY, DONE], approve: true });
    const t = await run(m);
    expect(m.requestApproval).toHaveBeenCalledTimes(1);
    expect(m.clickElement).toHaveBeenCalledWith('Empty Recycle Bin');
    expect(t.outcome).toBe('completed');
  });

  it('confirms even when the PLANNER under-declares but the verb list catches it', async () => {
    // Planner claims reversible; "Empty" is on the blocklist → still confirms.
    const m = makeMocks({
      elements: [el('Empty Recycle Bin')],
      plans: [{ ...CLICK_EMPTY, riskClass: 'mutative-reversible' }, DONE],
      approve: false,
    });
    await run(m);
    expect(m.requestApproval).toHaveBeenCalled();
  });

  it('confirms when the verb list MISSES but the Planner declared irreversible (escalateRisk)', async () => {
    // "Obliterate widget" isn't on any blocklist — the Planner's own
    // declaration must force the confirm. This is the laundering bug.
    const m = makeMocks({
      elements: [el('Obliterate widget')],
      plans: [{ ...CLICK_EMPTY, target: 'Obliterate widget' }, DONE],
      approve: false,
    });
    await run(m);
    expect(m.requestApproval).toHaveBeenCalled();
  });
});

// ── Honest failures the Planner can reason from ────────────────────────────

describe('element-state guards', () => {
  it('refuses to click a DISABLED element, with the meaning in the error', async () => {
    const m = makeMocks({
      elements: [el('Empty Recycle Bin', { enabled: false })],
      plans: [{ ...CLICK_EMPTY, riskClass: 'mutative-reversible', target: 'Empty Recycle Bin' }, DONE],
    });
    // still confirms (verb list) — approve so we reach the actor
    const t = await run(m);
    const step = t.steps[0];
    expect(step.executionResult.ok).toBe(false);
    expect(step.executionResult.error).toMatch(/DISABLED/);
    expect(m.clickElement).not.toHaveBeenCalled();
  });

  it('refuses to click an OCCLUDED element, with the meaning in the error', async () => {
    const m = makeMocks({
      elements: [el('Recycle Bin', { occluded: true })],
      plans: [
        { kind: 'click', target: 'Recycle Bin', riskClass: 'mutative-reversible', reasoning: 'open it', expectedPostState: 'Recycle Bin window opens.' },
        DONE,
      ],
    });
    const t = await run(m);
    const step = t.steps[0];
    expect(step.executionResult.ok).toBe(false);
    expect(step.executionResult.error).toMatch(/COVERED/);
    expect(m.clickElement).not.toHaveBeenCalled();
  });

  it('falls back to coordinates when the UIA name-invoke misses (focus bounce)', async () => {
    const m = makeMocks({
      elements: [el('OK', { control_type: 'button' })],
      plans: [
        { kind: 'click', target: 'OK', riskClass: 'mutative-reversible', reasoning: 'confirm', expectedPostState: 'The dialog closes.' },
        DONE,
      ],
    });
    (m.clickElement as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null); // fresh lookup lost it
    const t = await run(m);
    expect(m.input.click).toHaveBeenCalledWith(60, 20); // planning-scout coords
    expect(t.steps[0].executionResult.ok).toBe(true);
  });
});

// ── Kill-switch ────────────────────────────────────────────────────────────

describe('kill-switch (unstarvable)', () => {
  it('a pre-aborted signal stops before ANY action executes', async () => {
    const m = makeMocks({ elements: [el('Empty Recycle Bin')], plans: [CLICK_EMPTY] });
    const ac = new AbortController();
    ac.abort();
    const t = await run(m, { signal: ac.signal });
    expect(t.outcome).toBe('stopped');
    expect(m.clickElement).not.toHaveBeenCalled();
    expect(m.input.click).not.toHaveBeenCalled();
  });

  it('an abort during the approval wait means the action never fires', async () => {
    const ac = new AbortController();
    const m = makeMocks({ elements: [el('Empty Recycle Bin')], plans: [CLICK_EMPTY] });
    // approval "granted" — but the kill lands first
    (m.requestApproval as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      ac.abort();
      return true; // even a yes must not execute after the kill
    });
    const t = await run(m, { signal: ac.signal });
    expect(t.outcome).toBe('stopped');
    expect(m.clickElement).not.toHaveBeenCalled();
    expect(m.input.click).not.toHaveBeenCalled();
  });
});

// ── Perception honesty flows through (Phase 2a) ────────────────────────────

describe('element state provenance', () => {
  it('surface / enabled / occluded flow from UIA into the ScreenState the personas read', async () => {
    const m = makeMocks({
      elements: [
        el('Empty Recycle Bin', { surface: 'menu', enabled: false }),
        el('Recycle Bin', { surface: 'desktop-icon', occluded: true }),
      ],
      plans: [
        { kind: 'click', target: 'Recycle Bin', riskClass: 'mutative-reversible', reasoning: 'open', expectedPostState: 'The bin window opens.' },
        DONE,
      ],
    });
    const t = await run(m);
    const els = t.steps[0].screenState.elements;
    const menuItem = els.find(e => e.name === 'Empty Recycle Bin');
    const icon = els.find(e => e.name === 'Recycle Bin');
    expect(menuItem?.surface).toBe('menu');
    expect(menuItem?.interactable).toBe(false); // enabled:false → not interactable
    expect(icon?.surface).toBe('desktop-icon');
    expect(icon?.occluded).toBe(true);
  });
});

// ── Completion honesty ─────────────────────────────────────────────────────

describe('completion', () => {
  it('planner "done" ends the trajectory as completed with the reason narrated', async () => {
    const lines: string[] = [];
    const m = makeMocks({ elements: [], plans: [{ ...DONE, reasoning: 'The Recycle Bin is already empty — nothing to do.' }] });
    const t = await run(m, { emit: (ev: { type: string; line?: string }) => { if (ev.type === 'narrate' && ev.line) lines.push(ev.line); } });
    expect(t.outcome).toBe('completed');
    expect(lines.join(' ')).toMatch(/already empty/);
  });
});
