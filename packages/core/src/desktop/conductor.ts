// ─── Desktop Automation Conductor ──────────────────────────────────────────
//
// Orchestrates the five-persona wave (Scout → Planner → Actor → Verifier →
// Narrator) into a real trajectory loop. This is the brain that the persona
// definitions, types, safety ontology, and budget tracker were all built for
// but which never existed — until now.
//
// Design (Phase A):
//   - Scout    — DETERMINISTIC. Structures the raw accessibility blob into a
//                typed ScreenState. (LLM/vision merge lands in Phase C.)
//   - Planner  — LLM. The single reasoning call per step: picks the next action.
//   - [gate]   — classifyAction → decideApproval. Irreversible always confirms;
//                privileged forbidden without opt-in. Prompts the host when needed.
//   - Actor    — DETERMINISTIC. Executes the exact ProposedAction via providers.
//   - Verifier — LLM. Re-reads the screen, judges against expectedPostState.
//   - Narrator — DETERMINISTIC (Phase A). Plain-English line + audit record.
//
// Host-agnostic: the host (IDE sidecar) injects the providers, the model-call,
// the approval prompt, and an emit callback. Core never imports Tauri.

import type {
  ScreenState, ScreenElement,
  ProposedAction, ActionKind, ExecutionResult,
  VerificationResult, UserUpdate, TrajectoryStep, Trajectory,
} from './types.js';
import { mergeTiers, browserSnapshotToTier, type PerceptionTier } from './perception.js';
import {
  DESKTOP_PLANNER, DESKTOP_VERIFIER,
  ACTION_KINDS as PLANNER_ACTION_KINDS,
  type DesktopPersonaName,
} from './personas.js';
import {
  classifyAction, decideApproval, escalateRisk, IRREVERSIBLE_VERBS,
  type PermissionLevel, type RiskClass, type ClassificationResult,
} from './safety.js';
import { BudgetTracker, type BudgetConfig, type BudgetSnapshot, type StepTokens } from './budget.js';
import type {
  UIAProvider, InputProvider, BrowserProvider, AppLauncherProvider, VisionProvider, UIAElement,
} from '../tools/desktop-providers.js';

// ── Injected host capabilities ─────────────────────────────────────────────

export interface DesktopProviders {
  uia?: UIAProvider;
  input?: InputProvider;
  browser?: BrowserProvider;
  appLauncher?: AppLauncherProvider;
  /** Phase C3 — visual grounding fallback for windows the tree can't see. */
  vision?: VisionProvider;
}

/** The host calls the LLM for a persona and returns the raw text + token counts. */
export type PersonaModelCall = (opts: {
  persona: DesktopPersonaName;
  systemPrompt: string;
  userContent: string;
}) => Promise<{ text: string; tokensIn: number; tokensOut: number }>;

export interface ApprovalRequest {
  action: ProposedAction;
  classification: ClassificationResult;
  element?: ScreenElement;
}
export type ApprovalFn = (req: ApprovalRequest) => Promise<boolean>;

export type ConductorEvent =
  | { type: 'step'; step: TrajectoryStep; budget: BudgetSnapshot; header: string }
  | { type: 'narrate'; line: string }
  | { type: 'approval_required'; action: ProposedAction; classification: ClassificationResult }
  | { type: 'done'; trajectory: Trajectory }
  | { type: 'error'; message: string };
export type EmitFn = (event: ConductorEvent) => void;

export interface RunTrajectoryOptions {
  task: string;
  permissionLevel: PermissionLevel;
  whitelist?: string[];
  privilegedOptIn?: boolean;
  budget?: Partial<BudgetConfig>;
  providers: DesktopProviders;
  callModel: PersonaModelCall;
  requestApproval: ApprovalFn;
  emit: EmitFn;
  /** Kill switch (Ctrl+Alt+K). Checked at the top of every step. */
  signal?: AbortSignal;
  /**
   * Optional diagnostic trace — one line per persona boundary (Scout saw /
   * Planner chose / gate decided / Verifier verdict). Host routes it to its
   * log (stderr); never user-facing. No-op if omitted.
   */
  log?: (line: string) => void;
}

// ── Runtime constants ──────────────────────────────────────────────────────

// Single source of truth: the exact set of kinds the Planner is TOLD it can
// use (personas.ts). Keeping a separate hand-maintained copy here is what let
// 'drag' and 'minimize_all' be advertised to the model but rejected by
// coerceAction as "invalid planner output" — derive it instead so it can never
// drift again.
const ACTION_KINDS: ReadonlySet<ActionKind> = new Set(PLANNER_ACTION_KINDS);

// Advisory only — the authoritative credential gate is classifyAction(). This
// just flags fields so the user sees the lock icon and the Planner is warned.
const SENSITIVE_NAME = /password|secret|token|api.?key|credential|card.?number|cvv|cvc|pin\b/i;

const MAX_OBSERVE_MORE = 3;       // consecutive re-reads before we call it stuck
const MAX_CONSECUTIVE_DEVIATIONS = 3;

// ── Public entry point ─────────────────────────────────────────────────────

/**
 * Run a full desktop-automation trajectory. Returns when the task is done,
 * the user stops it, it gets stuck, the budget is exhausted, or an error
 * aborts it. Every step is gated, verified, and narrated.
 */
export async function runDesktopTrajectory(opts: RunTrajectoryOptions): Promise<Trajectory> {
  const { task, permissionLevel, providers, callModel, requestApproval, emit, signal } = opts;
  const log = opts.log ?? (() => {});
  const budget = new BudgetTracker(opts.budget ?? {});

  const trajectory: Trajectory = {
    id: genId(),
    task,
    startedAt: new Date().toISOString(),
    steps: [],
    whitelist: opts.whitelist ?? [],
    permissionLevel,
    outcome: 'error',
  };

  let observeMore = 0;
  let consecutiveDeviations = 0;
  // Hard cycle brake: count verified successes per action signature. A small
  // Planner re-runs the task like a checklist forever (click → arrive →
  // re-navigate → re-click …); the second verified success of an IDENTICAL
  // action means the work is done and the model has lost track — end the
  // trajectory deterministically instead of letting it lap.
  const successSignatures = new Map<string, number>();
  const actionSignature = (a: ProposedAction) =>
    JSON.stringify([a.kind, a.target ?? '', a.params ?? {}]);

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (signal?.aborted) { trajectory.outcome = 'stopped'; emit({ type: 'narrate', line: 'Stopped.' }); break; }
      if (budget.snapshot().breached) { trajectory.outcome = 'budget_exceeded'; break; }

      const stepNumber = trajectory.steps.length + 1;

      // 1 — Scout: perceive (deterministic structuring of the accessibility blob).
      const { state: screenState, raw } = await scout(providers);
      log(`step ${stepNumber} · Scout: ${screenState.elements.length} elements, activeApp=${screenState.activeApp ?? '?'}, confidence=${screenState.confidence}`);

      // 2 — Planner: the one reasoning call. Decide the single next action.
      const planned = await runPlanner(callModel, task, trajectory, screenState, providers.vision?.isAvailable() ?? false, log);
      const action = planned.action;
      log(`step ${stepNumber} · Planner: ${action.kind}${action.target ? ` → "${action.target}"` : ''} [${action.riskClass}] — ${truncate(action.reasoning, 120)}`);

      // Terminal / control kinds short-circuit the wave.
      if (action.kind === 'done') {
        trajectory.outcome = 'completed';
        emit({ type: 'narrate', line: action.reasoning?.trim() || 'Task complete.' });
        break;
      }
      if (action.kind === 'stuck') {
        trajectory.outcome = 'stuck';
        emit({ type: 'narrate', line: `Stuck: ${String(action.params?.reason ?? action.reasoning ?? 'no progress')}` });
        break;
      }
      if (action.kind === 'observe_more') {
        if (++observeMore > MAX_OBSERVE_MORE) { trajectory.outcome = 'stuck'; emit({ type: 'narrate', line: 'Kept needing another look without acting — pausing.' }); break; }
        continue; // re-scout next iteration without acting
      }
      observeMore = 0;

      // 3 — Safety gate. Resolve the target, classify, decide.
      const element = action.target
        ? screenState.elements.find(e => e.id === action.target || e.name === action.target)
        : undefined;
      // For a drag, the DROP target drives the risk (dragging a file onto
      // "Trash" is irreversible even though the file itself is innocuous).
      const dropRef = action.kind === 'drag' ? (action.params?.dropTarget ?? action.params?.to) : undefined;
      const dropEl = dropRef ? screenState.elements.find(e => e.id === dropRef || e.name === dropRef) : undefined;
      const classification = classifyAction({
        kind: action.kind,
        targetName: element?.name,
        dropTargetName: dropRef ? (dropEl?.name ?? String(dropRef)) : undefined,
        targetType: element?.kind,
        isMaskedField: element?.sensitive,
        appName: screenState.activeApp,
      });
      // Defence in depth: the computed classification may only ESCALATE
      // relative to what the Planner itself declared — never launder it down.
      // (Observed: Planner said "Empty Recycle Bin" was irreversible, "empty"
      // wasn't in the verb list, and the gate auto-ran it as reversible.)
      const escalated = escalateRisk(classification.riskClass, action.riskClass);
      if (escalated !== classification.riskClass) {
        classification.riskClass = escalated;
        classification.reasons.push(`escalated: the Planner itself declared this ${escalated}`);
      }
      const decision = decideApproval(classification.riskClass, permissionLevel, opts.privilegedOptIn ?? false);

      // Screen-said-so containment (Phase 1): if the impetus for a mutative
      // action came from CONTENT ON THE SCREEN rather than the user's task —
      // Planner self-declared, or the backstop heuristic caught an
      // irreversible verb in the target the task never mentioned — it always
      // gets a fresh confirm, even in Drive. A webpage must never be able to
      // drive Ava's hands unattended. Defence in depth: this stacks ON TOP of
      // the irreversible floor, it never replaces it.
      action.origin = inferObservedOrigin(action, task, element?.name);
      const MUTATIVE = new Set<RiskClass>(['mutative-reversible', 'mutative-irreversible', 'privileged']);
      if (action.origin === 'observed' && MUTATIVE.has(classification.riskClass)
          && !decision.forbidden && !decision.requiresApproval) {
        decision.requiresApproval = true;
        decision.reason = 'This action was prompted by content on the screen (the page asked for it), not by your instructions — confirming with you first.';
        classification.reasons.push('observed-origin: impetus came from screen content, not the user task');
      }

      const inOwnBrowser = action.kind === 'navigate'
        || action.kind === 'scroll' && !!providers.browser?.isLive?.()
        || element?.source === 'playwright';
      log(`step ${stepNumber} · Gate: ${decision.forbidden ? 'FORBIDDEN' : decision.requiresApproval ? 'approval required' : 'auto-allowed'} (${classification.riskClass}${inOwnBrowser ? ', own-browser' : ''})`);

      if (decision.forbidden) {
        emit({ type: 'narrate', line: `Blocked a ${classification.riskClass} action — ${decision.reason}.` });
        trajectory.outcome = 'stopped';
        break;
      }
      if (decision.requiresApproval) {
        emit({ type: 'approval_required', action, classification });
        const approved = await requestApproval({ action, classification, element });
        if (!approved) {
          emit({ type: 'narrate', line: `You declined: ${describeAction(action, element)}.` });
          trajectory.outcome = 'stopped';
          break;
        }
      }

      // Kill-switch: never execute an action after the stop fired — this catches
      // an abort during the (abortable) Planner call OR the approval wait, so a
      // mutating action can't land after Ctrl+Alt+K.
      if (signal?.aborted) { trajectory.outcome = 'stopped'; emit({ type: 'narrate', line: 'Stopped.' }); break; }

      // 4 — Actor: execute exactly (deterministic). In Drive, the Actor flashes
      // a preview box on the target first (Phase 0D) — Ask/Watch already show
      // the approval card, so the preview is Drive's "watch me work" signal.
      const executionResult = await runActor(providers, action, raw, screenState.elements, permissionLevel === 'drive');
      log(`step ${stepNumber} · Actor: ${executionResult.ok ? `ok (${executionResult.latencyMs}ms)` : `FAILED — ${executionResult.error ?? 'unknown'}`}`);

      // Stop the instant the kill lands — don't scout/verify/plan another step.
      // Bounds the residual after Ctrl+Alt+K to the one action just executed.
      if (signal?.aborted) { trajectory.outcome = 'stopped'; emit({ type: 'narrate', line: 'Stopped.' }); break; }

      // 5 — Verifier: re-read the screen, judge against the prediction — WITH
      // measured evidence (URL/title/element-count deltas). The LLM's
      // impression of "did anything change" is unreliable; the deltas aren't.
      // Let the UI settle first: context menus, dialogs and window transitions
      // take a few hundred ms to render, and a scout that races the animation
      // hands the Verifier a half-drawn screen — the source of false
      // "menu did not appear" / "0 elements" deviations on successful actions.
      if (executionResult.ok) await delay(600);
      const { state: freshState } = await scout(providers);
      const evidence = {
        urlBefore: screenState.activeUrl ?? null,
        urlAfter: freshState.activeUrl ?? null,
        urlChanged: (screenState.activeUrl ?? null) !== (freshState.activeUrl ?? null),
        titleBefore: screenState.activeTitle ?? null,
        titleAfter: freshState.activeTitle ?? null,
        elementCountBefore: screenState.elements.length,
        elementCountAfter: freshState.elements.length,
      };
      const verified = await runVerifier(callModel, action, executionResult, freshState, evidence);
      const verificationResult = verified.verification;
      log(`step ${stepNumber} · Verifier: ${verificationResult.status} — ${truncate(verificationResult.detail, 120)}`);
      consecutiveDeviations = verificationResult.status === 'verified' ? 0 : consecutiveDeviations + 1;

      // 6 — Narrator: the user-facing line + audit (deterministic in Phase A).
      // `element` resolves the target to its human name — the user must never
      // see a raw selector or internal id in chat.
      const userUpdate = narrate(stepNumber, action, executionResult, verificationResult, element);

      // 7 — Record the step + advance the budget.
      const tokensConsumed: StepTokens = {
        scout: 0,
        planner: planned.tokens,
        actor: 0,
        verifier: verified.tokens,
        narrator: 0,
        omniParser: 0,
      };
      const step: TrajectoryStep = {
        stepNumber, screenState, proposedAction: action,
        executionResult, verificationResult, userUpdate, tokensConsumed,
      };
      trajectory.steps.push(step);
      const snap = budget.recordStep(tokensConsumed);
      emit({ type: 'step', step, budget: snap, header: budget.formatHeader() });

      if (consecutiveDeviations >= MAX_CONSECUTIVE_DEVIATIONS) {
        emit({ type: 'narrate', line: 'Three steps without progress — pausing for you.' });
        trajectory.outcome = 'stuck';
        break;
      }
      if (executionResult.ok && verificationResult.status === 'verified') {
        const sig = actionSignature(action);
        const count = (successSignatures.get(sig) ?? 0) + 1;
        successSignatures.set(sig, count);
        if (count >= 2) {
          trajectory.outcome = 'completed';
          log(`step ${stepNumber} · Brake: action repeated successfully (${action.kind}) — task treated as complete`);
          emit({ type: 'narrate', line: 'Done — everything the task asked for has been carried out.' });
          break;
        }
      }
      if (snap.breached) { trajectory.outcome = 'budget_exceeded'; break; }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A request rejected by the kill-switch surfaces as a thrown 'aborted' —
    // that's a clean stop, not an error to alarm the user with.
    if (signal?.aborted || msg === 'aborted') {
      trajectory.outcome = 'stopped';
      emit({ type: 'narrate', line: 'Stopped.' });
    } else {
      trajectory.outcome = 'error';
      emit({ type: 'error', message: msg });
    }
  }

  trajectory.endedAt = new Date().toISOString();
  emit({ type: 'done', trajectory });
  return trajectory;
}

// ── Scout (deterministic) ──────────────────────────────────────────────────
//
// Phase C1: Scout gathers every perception tier that is already live and
// merges them into one ranked ScreenState (perception.ts). The UIA tree is
// always attempted; the Playwright DOM contributes only when a browser is
// already open (observation never launches anything). Vision joins in C3.

async function scout(providers: DesktopProviders): Promise<{ state: ScreenState; raw: UIAElement[] }> {
  const raw = providers.uia ? await providers.uia.listElements() : [];

  const uiaTier: PerceptionTier = {
    source: 'uia',
    elements: raw.map((e, i) => ({
      id: e.name && e.name.trim() ? e.name : `${e.control_type || 'el'}-${i}`,
      kind: e.control_type || 'unknown',
      name: e.name || '',
      source: 'uia',
      // Real enabled-state from UIA: a greyed-out control is visible but NOT
      // interactable — and often the fact itself is the answer (a disabled
      // "Empty Recycle Bin" means the bin is already empty).
      interactable: e.enabled !== false,
      // A covered element (desktop icon behind an app window) is enumerable
      // but untouchable — the Planner must clear the occlusion first.
      occluded: e.occluded === true || undefined,
      // Surface provenance: without it the Verifier reads an open context
      // menu as "a list of search results" and misjudges the step.
      surface: e.surface,
      sensitive: SENSITIVE_NAME.test(e.name || ''),
    })),
  };

  const tiers: PerceptionTier[] = [uiaTier];
  if (providers.browser?.isLive?.()) {
    try {
      tiers.push(browserSnapshotToTier(await providers.browser.snapshot()));
    } catch {
      uiaTier.notes = 'A browser is open but its DOM snapshot failed — web elements may be missing.';
    }
  } else if (providers.browser) {
    // Affordance, not just absence: the Planner needs to know the door
    // exists, or an empty screen reads as a dead end instead of a start.
    uiaTier.notes = [uiaTier.notes, "Ava's built-in browser is closed — the 'navigate' action opens it automatically."]
      .filter(Boolean).join(' ');
  }

  const state = mergeTiers(tiers);
  // Phase C3 — when the structured tiers came back thin and a vision lane is
  // enabled, tell the Planner it can target by DESCRIPTION: the Actor will
  // locate described elements visually. Advertise the lane HONESTLY — if it's
  // an unverified lane (local Holo, platform preview), say so, so the Planner
  // leans on the accessibility tree first and treats visual hits with caution.
  const cap = providers.vision?.capability?.();
  const visionAvailable = cap ? cap.available : !!providers.vision?.isAvailable();
  if (state.elements.length < 3 && visionAvailable) {
    const caveat = cap && !cap.verified ? ' (this vision lane is unverified — prefer accessibility-tree targets, and treat visual results with a little caution)' : '';
    state.notes = [state.notes,
      `Vision is available${caveat}: you may 'click' elements by DESCRIBING them in plain words (e.g. "the blue Save button") — the system locates them visually on screen.`]
      .filter(Boolean).join(' ');
  }
  return { state, raw };
}

// ── Planner (LLM) ──────────────────────────────────────────────────────────

async function runPlanner(
  callModel: PersonaModelCall,
  task: string,
  trajectory: Trajectory,
  screen: ScreenState,
  visionAvailable = false,
  log: (line: string) => void = () => {},
): Promise<{ action: ProposedAction; tokens: number }> {
  // Explicit completion ledger — a small model can't reliably infer "I already
  // did that" from raw step history, so we hand it the conclusion: a plain
  // list of everything that has already succeeded this run.
  const alreadyCompleted = trajectory.steps
    .filter(s => s.executionResult.ok && s.verificationResult.status === 'verified')
    .map(s => pastTense(s.proposedAction));
  const userContent = JSON.stringify({
    task,
    alreadyCompletedThisRun: alreadyCompleted.length > 0
      ? { actions: alreadyCompleted, rule: 'These are DONE. Never repeat them. If they cover the whole task, output kind "done" now.' }
      : undefined,
    recentSteps: summariseTrajectory(trajectory),
    // activeUrl/activeTitle matter as much as the elements: without them the
    // Planner cannot recognise "the page I'm on IS the destination" and
    // re-navigates to confirm instead of declaring done.
    screen: {
      activeApp: screen.activeApp, activeUrl: screen.activeUrl, activeTitle: screen.activeTitle,
      confidence: screen.confidence, notes: screen.notes, elements: screen.elements,
    },
  });
  const { text, tokensIn, tokensOut } = await callModel({
    persona: 'planner', systemPrompt: DESKTOP_PLANNER.systemPrompt, userContent,
  });
  let tokens = tokensIn + tokensOut;
  let action = coerceAction(parseJson<ProposedAction>(text));

  // Diagnostic: when the model's reply won't parse into an action, log what it
  // actually returned. An empty reply almost always means the active model put
  // everything into a reasoning channel (or ran out of tokens mid-think) and
  // left `content` blank — the Planner needs plain JSON, not a thinking model.
  if (action.kind === 'stuck' && action.params?.reason === 'invalid planner output') {
    const raw = (text ?? '').trim();
    log(`Planner RAW reply unparseable — len=${raw.length}, tokensOut=${tokensOut}, first200=${JSON.stringify(raw.slice(0, 200))}`);
  }

  // Structural validation + ONE corrective retry. Smaller local models drop
  // required fields (a click with no target executes as a guaranteed miss and
  // burns a whole wave on it) — a pointed correction usually snaps them back.
  const problem = validateAction(action, screen, visionAvailable) ?? validatePrediction(action);
  if (problem) {
    const retry = await callModel({
      persona: 'planner',
      systemPrompt: DESKTOP_PLANNER.systemPrompt,
      userContent: `${userContent}\n\nYour previous output was INVALID: ${problem}\nPrevious output: ${text.slice(0, 400)}\nReturn ONE corrected JSON ProposedAction now. No prose.`,
    });
    tokens += retry.tokensIn + retry.tokensOut;
    const retried = coerceAction(parseJson<ProposedAction>(retry.text));
    if (!(validateAction(retried, screen, visionAvailable) ?? validatePrediction(retried))) {
      action = retried;
    } else {
      // Still malformed — take another look next cycle rather than crash
      // or execute a doomed action.
      action = {
        kind: 'observe_more',
        riskClass: 'observational',
        reasoning: `Planner output stayed invalid after a retry (${problem}).`,
        expectedPostState: 'n/a',
        params: { reason: problem },
      };
    }
  }
  return { action, tokens };
}

/**
 * Structural check — does the action carry what its kind requires, and does
 * its target actually exist on the CURRENT screen? The second half matters
 * because recalled memories contain element ids from past sessions; small
 * models copy them verbatim and click ghosts (observed: a planner repeating
 * a dead selector from memory while 21 live elements sat in front of it).
 */
function validateAction(action: ProposedAction, screen?: ScreenState, visionAvailable = false): string | null {
  switch (action.kind) {
    case 'click':
    case 'double_click':
    case 'right_click': {
      if (!action.target) {
        return `"${action.kind}" requires "target" — the exact id or name of an element from the screen list`;
      }
      // With a vision lane available, a descriptive target the structured
      // tiers can't see is legitimate — the Actor will ground it visually.
      if (!visionAvailable && screen && screen.elements.length > 0) {
        const t = action.target.toLowerCase();
        const onScreen = screen.elements.some(e =>
          e.id === action.target || e.name.toLowerCase() === t || (!!e.name && e.name.toLowerCase().includes(t)));
        if (!onScreen) {
          return `target "${action.target}" is NOT on the current screen — it may be a stale id from notes of a previous session. Pick the exact "id" of an element from the CURRENT screen.elements list`;
        }
      }
      return null;
    }
    case 'drag': {
      if (!action.target) return '"drag" requires "target" — the id/name of the element to drag';
      if (!action.params?.dropTarget && !action.params?.to) return '"drag" requires params.dropTarget — the id/name of the element to drop onto';
      return null;
    }
    case 'type':
      return typeof action.params?.text === 'string' && String(action.params.text).length > 0
        ? null : '"type" requires params.text (the text to type)';
    case 'key':
      return action.params?.key ? null : '"key" requires params.key (e.g. "Enter")';
    case 'navigate':
      return action.params?.url ? null : '"navigate" requires params.url';
    case 'launch':
      return (action.params?.app || action.target) ? null : '"launch" requires params.app (the application name)';
    default:
      return null;
  }
}

/**
 * Acting kinds must carry a real expectedPostState. Without a prediction the
 * Verifier has nothing to check and confabulates verdicts — observed: it ruled
 * "no navigation happened" while standing on the destination page, sending the
 * Planner into an undo/redo loop of its own completed task.
 */
const ACTING_KINDS: ReadonlySet<ActionKind> = new Set([
  'click', 'double_click', 'right_click', 'type', 'key', 'scroll', 'drag', 'minimize_all', 'navigate', 'launch',
]);

function validatePrediction(action: ProposedAction): string | null {
  if (!ACTING_KINDS.has(action.kind)) return null;
  const p = (action.expectedPostState ?? '').trim();
  return p.length >= 5
    ? null
    : '"expectedPostState" is required — one concrete sentence describing what the screen should show after this action (the Verifier checks against it)';
}

/** Defensive: a malformed Planner output becomes a controlled 'stuck', never a crash.
 *  Exported for the regression suite (0G) — pure function, no side effects. */
export function coerceAction(parsed: Partial<ProposedAction> | null): ProposedAction {
  // Some models wrap the action: {"action": {"kind": ...}, "riskClass": ...}
  // — kind inside, siblings outside (observed live; it killed a perfectly
  // good recovery plan as "invalid"). Unwrap and merge, inner fields winning.
  const wrapped = (parsed as Record<string, unknown> | null)?.action;
  if (parsed && typeof parsed.kind !== 'string' && wrapped && typeof wrapped === 'object') {
    parsed = { ...parsed, ...(wrapped as Partial<ProposedAction>) };
  }
  if (!parsed || typeof parsed.kind !== 'string' || !ACTION_KINDS.has(parsed.kind as ActionKind)) {
    return {
      kind: 'stuck',
      riskClass: 'observational',
      reasoning: 'Planner returned an unparseable or invalid action.',
      expectedPostState: 'n/a',
      params: { reason: 'invalid planner output' },
    };
  }
  return {
    kind: parsed.kind as ActionKind,
    target: parsed.target,
    params: parsed.params,
    riskClass: (parsed.riskClass as RiskClass) ?? 'mutative-reversible',
    reasoning: parsed.reasoning ?? '',
    expectedPostState: parsed.expectedPostState ?? '',
    // Anti-injection origin (Phase 1). Anything that isn't an explicit 'user'
    // declaration stays 'observed'-eligible downstream — but we only trust an
    // explicit value here; the conductor's heuristic may still override.
    origin: parsed.origin === 'user' || parsed.origin === 'observed' ? parsed.origin : undefined,
  };
}

/**
 * Backstop heuristic for the origin flag (Phase 1) — never the only guard.
 * If the action's target text carries an irreversible verb that the USER'S
 * OWN TASK never mentioned, the impetus likely came from the screen (a page
 * saying "click Delete to continue"), whatever the Planner declared. We only
 * ever UPGRADE user→observed, never launder observed→user.
 * Exported for the regression suite.
 */
export function inferObservedOrigin(action: ProposedAction, task: string, elementName?: string): 'user' | 'observed' | undefined {
  if (action.origin === 'observed') return 'observed';
  const text = `${elementName ?? ''} ${action.target ?? ''}`.toLowerCase();
  const taskLower = task.toLowerCase();
  for (const verb of IRREVERSIBLE_VERBS) {
    const pattern = new RegExp(`\\b${verb}\\b`, 'i');
    if (pattern.test(text) && !pattern.test(taskLower)) {
      return 'observed';
    }
  }
  return action.origin;
}

// ── Actor (deterministic) ──────────────────────────────────────────────────

async function runActor(
  providers: DesktopProviders,
  action: ProposedAction,
  raw: UIAElement[],
  merged: ScreenElement[] = [],
  preview = false,
): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const input = providers.input;
    // Visual preview (Phase 0D) — in Drive, flash a click-through box on the
    // target BEFORE acting so autonomous operation is legible. Best-effort:
    // a host without an overlay (or a failed flash) never blocks the action,
    // and this is never a safety guard — irreversible actions still confirm.
    const PREVIEW_MS = 450;
    const showPreview = async (bx: number, by: number, bw: number, bh: number) => {
      if (!preview || !input?.highlight || bw <= 0 || bh <= 0) return;
      try { await input.highlight(bx, by, bw, bh, PREVIEW_MS); } catch { /* preview is cosmetic */ }
    };
    // Phase C2: a target grounded by the DOM tier carries a selector — those
    // actions route through the browser (exact under scroll/resize), while
    // UIA-grounded targets keep the native coordinate path.
    const webEl = action.target ? resolveWebTarget(action.target, merged) : null;
    switch (action.kind) {
      case 'click': {
        if (webEl?.selector && providers.browser) {
          await providers.browser.click(webEl.selector);
          break;
        }
        const el = resolveTarget(action.target, raw);
        if (el) {
          // A greyed-out control can't be clicked — and the disabled state is
          // usually the answer itself (disabled "Empty Recycle Bin" = already
          // empty). Fail with the meaning so the Planner can conclude 'done'.
          if (el.enabled === false) {
            throw new Error(`'${el.name}' is visible but DISABLED (greyed out) — Windows disables an action when there is nothing for it to do, so its purpose is likely already satisfied. Do not retry it; if the task's goal is already met, declare done.`);
          }
          if (el.occluded === true) {
            throw new Error(`'${el.name}' is COVERED by another window — a click would hit that window instead. Clear the occlusion first (minimize_all for desktop icons, or focus the right window), then retry.`);
          }
          await showPreview(el.x, el.y, el.width, el.height);
          // Native clicks go through UIA's name-based invoke (exact, and the
          // host may not wire coordinate input at all); coords are the fallback.
          if (providers.uia?.clickElement) {
            const clicked = await providers.uia.clickElement(el.name);
            if (clicked) break;
            // The invoke does its OWN fresh lookup, which can land on a
            // different surface if focus bounced (e.g. straight after an
            // approval card closed). The coordinates from the planning scout
            // still stand — fall back to them rather than stranding the step.
            if (input && typeof input.click === 'function') {
              await input.click(el.cx, el.cy);
              break;
            }
            throw new Error(`could not click '${el.name}' via UIA`);
          }
          if (!input || typeof input.click !== 'function') throw new Error('no click provider');
          await input.click(el.cx, el.cy);
          break;
        }
        // Phase C3 — vision fallback: the target isn't in any structured
        // tier (custom-rendered UI), so locate it visually from the
        // description and click the returned screen coordinates.
        if (providers.vision?.isAvailable() && action.target) {
          const pt = await providers.vision.localize(action.target);
          if (!pt) throw new Error(`couldn't locate '${action.target}' visually on the screen`);
          if (!input || typeof input.click !== 'function') throw new Error('vision located the element but no coordinate click is available');
          await showPreview(pt.x - 16, pt.y - 16, 32, 32); // no bbox from vision — box the point
          await input.click(pt.x, pt.y);
          return { ok: true, latencyMs: Date.now() - start, sideEffects: ['located visually'] };
        }
        throw new Error(`target '${action.target ?? '?'}' not found on screen`);
      }
      case 'double_click':
      case 'right_click': {
        if (!input) throw new Error('no input provider');
        const el = resolveTarget(action.target, raw);
        if (!el) {
          throw new Error(webEl
            ? `'${action.target}' is a web element — ${action.kind} on web elements isn't supported yet; use click`
            : `target '${action.target ?? '?'}' not found on screen`);
        }
        if (el.occluded === true) {
          throw new Error(`'${el.name}' is COVERED by another window — the ${action.kind} would hit that window instead. Clear the occlusion first (minimize_all for desktop icons, or focus the right window), then retry.`);
        }
        await showPreview(el.x, el.y, el.width, el.height);
        if (action.kind === 'double_click') await input.doubleClick(el.cx, el.cy);
        else await input.rightClick(el.cx, el.cy);
        break;
      }
      case 'type': {
        if (webEl?.selector && providers.browser) {
          await providers.browser.type(String(action.params?.text ?? ''), webEl.selector);
          break;
        }
        if (!input) throw new Error('no input provider');
        const el = action.target ? resolveTarget(action.target, raw) : null;
        if (el) {
          await showPreview(el.x, el.y, el.width, el.height);
          await input.click(el.cx, el.cy); // focus the field first
        }
        await input.typeText(String(action.params?.text ?? ''));
        break;
      }
      case 'key': {
        if (!input) throw new Error('no input provider');
        await input.keyPress(String(action.params?.key ?? ''));
        break;
      }
      case 'scroll': {
        const dir = (action.params?.direction as 'up' | 'down' | 'left' | 'right') ?? 'down';
        const amount = Number(action.params?.amount) || undefined;
        // Web scroll rides the browser when it's open; native wheel input is
        // a Phase D primitive, so fail with the truth rather than a TypeError.
        if (providers.browser?.isLive?.() && providers.browser.scroll) {
          await providers.browser.scroll(dir, amount);
          break;
        }
        if (input && typeof input.scroll === 'function') {
          await input.scroll(dir, amount);
          break;
        }
        throw new Error('native scroll is not available yet — only the browser can scroll for now');
      }
      case 'drag': {
        if (!input || typeof input.drag !== 'function') throw new Error('no drag provider');
        const src = resolveTarget(action.target, raw);
        if (!src) throw new Error(`drag source '${action.target ?? '?'}' not found on screen`);
        const dropRef = String(action.params?.dropTarget ?? action.params?.to ?? '');
        const dst = dropRef ? resolveTarget(dropRef, raw) : null;
        if (!dst) throw new Error(`drop target '${dropRef || '?'}' not found on screen — pass params.dropTarget (the id/name of where to drop)`);
        await showPreview(src.x, src.y, src.width, src.height); // box the element being dragged
        await input.drag(src.cx, src.cy, dst.cx, dst.cy);
        break;
      }
      case 'minimize_all': {
        // Reveal the desktop so its icons (Recycle Bin, This PC, files) become
        // visible + clickable — the fix for "the icon's behind a window".
        if (!input || typeof input.minimizeAll !== 'function') throw new Error('no minimize provider');
        await input.minimizeAll();
        break;
      }
      case 'navigate': {
        if (!providers.browser) throw new Error('no browser provider for navigate');
        await providers.browser.navigate(String(action.params?.url ?? ''));
        break;
      }
      case 'launch': {
        if (!providers.appLauncher) throw new Error('no app launcher provider');
        const app = String(action.params?.app ?? action.target ?? '').trim();
        if (!app) throw new Error('launch requires params.app (the app name or path)');
        // The host's launcher is the trust boundary — it rejects shell
        // interpreters and admin tools by basename. Core just forwards the name.
        const { launched } = await providers.appLauncher.launch(app);
        return { ok: true, latencyMs: Date.now() - start, sideEffects: [`launched ${launched}`] };
      }
      case 'wait': {
        await delay(Math.min(5000, Number(action.params?.ms) || 500));
        break;
      }
      default:
        throw new Error(`actor cannot execute kind '${action.kind}'`);
    }
    return { ok: true, latencyMs: Date.now() - start, sideEffects: [] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start };
  }
}

/** Match a ProposedAction.target back to the raw UIA element (for exact coords). */
function resolveTarget(target: string | undefined, raw: UIAElement[]): UIAElement | null {
  if (!target) return null;
  const t = target.toLowerCase();
  return raw.find(e => (e.name || '').toLowerCase() === t)
    ?? raw.find(e => (e.name || '').toLowerCase().includes(t))
    ?? null;
}

/** Match a target to a DOM-grounded element from the merged ScreenState. */
function resolveWebTarget(target: string, merged: ScreenElement[]): ScreenElement | null {
  const t = target.toLowerCase();
  const web = merged.filter(e => e.source === 'playwright' && e.selector);
  return web.find(e => e.id === target)
    ?? web.find(e => e.name.toLowerCase() === t)
    ?? web.find(e => !!e.name && e.name.toLowerCase().includes(t))
    ?? null;
}

// ── Verifier (LLM) ─────────────────────────────────────────────────────────

async function runVerifier(
  callModel: PersonaModelCall,
  action: ProposedAction,
  result: ExecutionResult,
  freshScreen: ScreenState,
  evidence?: Record<string, unknown>,
): Promise<{ verification: VerificationResult; tokens: number }> {
  const userContent = JSON.stringify({
    proposedAction: action,
    executionResult: result,
    // Measured facts — the Verifier is instructed these outrank impressions.
    evidence,
    freshScreen: {
      activeApp: freshScreen.activeApp, activeUrl: freshScreen.activeUrl, activeTitle: freshScreen.activeTitle,
      confidence: freshScreen.confidence, notes: freshScreen.notes, elements: freshScreen.elements,
    },
  });
  const { text, tokensIn, tokensOut } = await callModel({
    persona: 'verifier', systemPrompt: DESKTOP_VERIFIER.systemPrompt, userContent,
  });
  const parsed = parseJson<VerificationResult>(text);
  const status = parsed && ['verified', 'deviated', 'rollback_needed'].includes(parsed.status as string)
    ? parsed.status as VerificationResult['status']
    : 'deviated';
  return {
    verification: {
      status,
      detail: parsed?.detail ?? 'Verifier returned no detail.',
      deviation: parsed?.deviation,
    },
    tokens: tokensIn + tokensOut,
  };
}

// ── Narrator (deterministic, Phase A) ──────────────────────────────────────

function narrate(step: number, action: ProposedAction, result: ExecutionResult, vr: VerificationResult, element?: ScreenElement): UserUpdate {
  let line: string;
  if (!result.ok) {
    line = `Tried to ${describeAction(action, element)}, but it failed${result.error ? `: ${humaniseDetail(result.error)}` : '.'}`;
  } else if (vr.status === 'deviated') {
    line = `${capitalise(describeAction(action, element))} — but ${humaniseDetail(vr.deviation ?? 'the screen didn’t change as expected')}.`;
  } else if (vr.status === 'rollback_needed') {
    line = `${capitalise(describeAction(action, element))} — that left things worse than before; pausing.`;
  } else {
    line = `${capitalise(pastTense(action, element))}.`;
  }
  return {
    line,
    audit: { step, action, result, verification: vr, timestamp: new Date().toISOString() },
  };
}

// The user-facing rule (from the Narrator spec): no selectors, no internal
// identifiers. A target the merge layer can't resolve to a human name is
// shown as a plain phrase, never as raw CSS/ids.
const SELECTOR_LIKE = /^\[|^#|^\.|data-ava-id|^web-\d+$|nth-of-type|^[a-z]+\[/i;

function displayTarget(action: ProposedAction, element?: ScreenElement): string | undefined {
  const name = element?.name?.trim();
  if (name) return name;
  const target = action.target?.trim();
  if (!target || SELECTOR_LIKE.test(target)) return undefined;
  return target;
}

/** Strip selector debris from Verifier/Actor prose before it reaches chat. */
function humaniseDetail(detail: string): string {
  return detail
    // Playwright timeout dumps include a multi-line call log — replace the
    // whole thing with a sentence a person can act on.
    .replace(/page\.\w+: Timeout \d+ms exceeded[\s\S]*/i, "the element couldn't be found on the page in time")
    .replace(/['"`]?\[data-ava-id="[^"]*"\]['"`]?/gi, 'that element')
    .replace(/data-ava-id="?[^\s"\]]*"?\]?/gi, 'that element')
    .replace(/['"`]web-\d+['"`]/gi, 'that element')
    .replace(/\bweb-\d+\b/gi, 'that element');
}

function describeAction(action: ProposedAction, element?: ScreenElement): string {
  const target = displayTarget(action, element);
  switch (action.kind) {
    case 'click': return target ? `click "${target}"` : 'click an element on the page';
    case 'double_click': return target ? `double-click "${target}"` : 'double-click an element';
    case 'right_click': return target ? `right-click "${target}"` : 'right-click an element';
    case 'type': return target ? `type into "${target}"` : 'type';
    case 'key': return `press ${String(action.params?.key ?? 'a key')}`;
    case 'scroll': return `scroll ${String(action.params?.direction ?? 'down')}`;
    case 'drag': return target ? `drag "${target}" onto "${String(action.params?.dropTarget ?? action.params?.to ?? '?')}"` : 'drag an element';
    case 'minimize_all': return 'minimize all windows to show the desktop';
    case 'navigate': return `open ${String(action.params?.url ?? 'a page')}`;
    case 'launch': return `open ${String(action.params?.app ?? action.target ?? 'an app')}`;
    case 'wait': return 'wait';
    default: return action.kind;
  }
}

function pastTense(action: ProposedAction, element?: ScreenElement): string {
  const target = displayTarget(action, element);
  switch (action.kind) {
    case 'click': return target ? `clicked "${target}"` : 'clicked an element on the page';
    case 'double_click': return target ? `double-clicked "${target}"` : 'double-clicked an element';
    case 'right_click': return target ? `right-clicked "${target}"` : 'right-clicked an element';
    case 'type': return target ? `typed into "${target}"` : 'typed';
    case 'key': return `pressed ${String(action.params?.key ?? 'a key')}`;
    case 'scroll': return `scrolled ${String(action.params?.direction ?? 'down')}`;
    case 'drag': return target ? `dragged "${target}"` : 'dragged an element';
    case 'minimize_all': return 'minimized all windows to show the desktop';
    case 'navigate': return `opened ${String(action.params?.url ?? 'a page')}`;
    case 'launch': return `opened ${String(action.params?.app ?? action.target ?? 'an app')}`;
    case 'wait': return 'waited';
    default: return action.kind;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Compact recent trajectory for the Planner prompt — last 5 steps only. */
function summariseTrajectory(trajectory: Trajectory): Array<Record<string, unknown>> {
  return trajectory.steps.slice(-5).map(s => ({
    step: s.stepNumber,
    action: { kind: s.proposedAction.kind, target: s.proposedAction.target, params: s.proposedAction.params },
    ok: s.executionResult.ok,
    verification: s.verificationResult.status,
    detail: s.verificationResult.detail,
  }));
}

/** Exported for the regression suite (0G) — pure function, no side effects. */
export function parseJson<T>(text: string): T | null {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // tolerate prose around the JSON — grab the first {...} block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]) as T; } catch { /* fall through */ } }
    return null;
  }
}

function capitalise(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function truncate(s: string, max: number): string {
  const str = (s ?? '').trim();
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}
function delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
function genId(): string {
  return `traj-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
