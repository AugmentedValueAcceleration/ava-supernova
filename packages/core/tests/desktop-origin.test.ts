/**
 * 0G regression suite — Phase 1: the screen-said-so origin flag.
 *
 * Anti-prompt-injection spine: content on the screen is DATA, never
 * instructions. A page saying "click X to continue" must not be able to
 * drive a mutative action unattended, even in Drive. Defence in depth —
 * this stacks on the irreversible floor, it never replaces it.
 */
import { describe, it, expect, vi } from 'vitest';
import { runDesktopTrajectory, inferObservedOrigin, type PersonaModelCall, type DesktopProviders } from '../src/desktop/conductor.js';
import type { UIAElement } from '../src/tools/desktop-providers.js';
import type { ProposedAction } from '../src/desktop/types.js';

const el = (name: string, over: Partial<UIAElement> = {}): UIAElement =>
  ({ name, control_type: 'button', x: 10, y: 10, width: 100, height: 20, cx: 60, cy: 20, enabled: true, ...over });

const action = (over: Partial<ProposedAction>): ProposedAction => ({
  kind: 'click', riskClass: 'mutative-reversible', reasoning: 'r',
  expectedPostState: 'The button was clicked and the view updates.', ...over,
});

describe('inferObservedOrigin (backstop heuristic)', () => {
  it('upgrades to observed when the target carries an irreversible verb the task never mentioned', () => {
    expect(inferObservedOrigin(action({ target: 'Unsubscribe now' }), 'open my newsletter and read it', 'Unsubscribe now'))
      .toBe('observed');
  });

  it('stays user-origin when the USER asked for that verb', () => {
    expect(inferObservedOrigin(action({ target: 'Unsubscribe', origin: 'user' }), 'unsubscribe me from the newsletter', 'Unsubscribe'))
      .toBe('user');
  });

  it('never launders observed back to user', () => {
    expect(inferObservedOrigin(action({ target: 'OK', origin: 'observed' }), 'delete the draft', 'OK'))
      .toBe('observed');
  });

  it('leaves benign targets alone', () => {
    expect(inferObservedOrigin(action({ target: 'Save', origin: 'user' }), 'save the document', 'Save'))
      .toBe('user');
  });
});

// ── End to end: observed origin forces a confirm even in Drive ─────────────

function makeMocks(plans: Array<Record<string, unknown>>, elements: UIAElement[]) {
  const clickElement = vi.fn(async (name: string) => ({ name, cx: 60, cy: 20 }));
  const providers = {
    uia: { listElements: vi.fn(async () => elements), findElement: vi.fn(async () => null), clickElement, focusWindow: vi.fn(async () => null) },
    input: { click: vi.fn(async () => {}), doubleClick: vi.fn(async () => {}), rightClick: vi.fn(async () => {}), typeText: vi.fn(async () => {}), keyPress: vi.fn(async () => {}), scroll: vi.fn(async () => {}), moveMouse: vi.fn(async () => {}), drag: vi.fn(async () => {}) },
  } as unknown as DesktopProviders;
  let i = 0;
  const callModel: PersonaModelCall = vi.fn(async ({ persona }: { persona: string }) => persona === 'planner'
    ? { text: JSON.stringify(plans[Math.min(i++, plans.length - 1)]), tokensIn: 1, tokensOut: 1 }
    : { text: JSON.stringify({ status: 'verified', detail: 'ok' }), tokensIn: 1, tokensOut: 1 }) as unknown as PersonaModelCall;
  const requestApproval = vi.fn(async () => true);
  return { providers, callModel, requestApproval, clickElement };
}

const DONE = { kind: 'done', riskClass: 'observational', reasoning: 'done', expectedPostState: 'n/a' };

describe('observed-origin containment in Drive', () => {
  it('a REVERSIBLE action the page asked for confirms in Drive (would otherwise auto-run)', async () => {
    const m = makeMocks([
      { kind: 'click', target: 'Continue', origin: 'observed', riskClass: 'mutative-reversible', reasoning: 'the page says to click Continue', expectedPostState: 'The next page loads.' },
      DONE,
    ], [el('Continue')]);
    await runDesktopTrajectory({
      task: 'read the article', permissionLevel: 'drive', whitelist: [],
      providers: m.providers, callModel: m.callModel, requestApproval: m.requestApproval,
      emit: () => {}, budget: { maxSteps: 3, maxTokens: 50_000, maxWallMs: 60_000 },
    });
    expect(m.requestApproval).toHaveBeenCalledTimes(1);
  });

  it('the same reversible action with user origin auto-runs in Drive (no false friction)', async () => {
    const m = makeMocks([
      { kind: 'click', target: 'Continue', origin: 'user', riskClass: 'mutative-reversible', reasoning: 'user asked to continue', expectedPostState: 'The next page loads.' },
      DONE,
    ], [el('Continue')]);
    await runDesktopTrajectory({
      task: 'click continue on the article', permissionLevel: 'drive', whitelist: [],
      providers: m.providers, callModel: m.callModel, requestApproval: m.requestApproval,
      emit: () => {}, budget: { maxSteps: 3, maxTokens: 50_000, maxWallMs: 60_000 },
    });
    expect(m.requestApproval).not.toHaveBeenCalled();
  });

  it('the heuristic catches an undeclared page-verb: "Delete forever" during a read task confirms', async () => {
    const m = makeMocks([
      // Planner "forgets" to declare origin — the backstop must catch it.
      { kind: 'click', target: 'Delete forever', riskClass: 'mutative-reversible', reasoning: 'clearing the banner', expectedPostState: 'The banner closes.' },
      DONE,
    ], [el('Delete forever')]);
    await runDesktopTrajectory({
      task: 'read my inbox', permissionLevel: 'drive', whitelist: [],
      providers: m.providers, callModel: m.callModel, requestApproval: m.requestApproval,
      emit: () => {}, budget: { maxSteps: 3, maxTokens: 50_000, maxWallMs: 60_000 },
    });
    // Confirms via irreversible verb AND carries the observed origin.
    expect(m.requestApproval).toHaveBeenCalled();
    const arg = (m.requestApproval as ReturnType<typeof vi.fn>).mock.calls[0][0] as { action: ProposedAction };
    expect(arg.action.origin).toBe('observed');
  });
});
