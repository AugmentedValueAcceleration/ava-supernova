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
  ScreenState, ScreenElement, ConfidenceLevel,
  ProposedAction, ActionKind, ExecutionResult,
  VerificationResult, UserUpdate, TrajectoryStep, Trajectory,
} from './types.js';
import {
  DESKTOP_PLANNER, DESKTOP_VERIFIER,
  type DesktopPersonaName,
} from './personas.js';
import {
  classifyAction, decideApproval,
  type PermissionLevel, type RiskClass, type ClassificationResult,
} from './safety.js';
import { BudgetTracker, type BudgetConfig, type BudgetSnapshot, type StepTokens } from './budget.js';
import type {
  UIAProvider, InputProvider, BrowserProvider, AppLauncherProvider, UIAElement,
} from '../tools/desktop-providers.js';

// ── Injected host capabilities ─────────────────────────────────────────────

export interface DesktopProviders {
  uia?: UIAProvider;
  input?: InputProvider;
  browser?: BrowserProvider;
  appLauncher?: AppLauncherProvider;
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
}

// ── Runtime constants ──────────────────────────────────────────────────────

const ACTION_KINDS: ReadonlySet<ActionKind> = new Set([
  'click', 'double_click', 'right_click', 'type', 'key',
  'scroll', 'navigate', 'wait', 'observe_more', 'stuck', 'done',
]);

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

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (signal?.aborted) { trajectory.outcome = 'stopped'; emit({ type: 'narrate', line: 'Stopped.' }); break; }
      if (budget.snapshot().breached) { trajectory.outcome = 'budget_exceeded'; break; }

      const stepNumber = trajectory.steps.length + 1;

      // 1 — Scout: perceive (deterministic structuring of the accessibility blob).
      const { state: screenState, raw } = await scout(providers);

      // 2 — Planner: the one reasoning call. Decide the single next action.
      const planned = await runPlanner(callModel, task, trajectory, screenState);
      const action = planned.action;

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
      const classification = classifyAction({
        kind: action.kind,
        targetName: element?.name,
        targetType: element?.kind,
        isMaskedField: element?.sensitive,
        appName: screenState.activeApp,
      });
      const decision = decideApproval(classification.riskClass, permissionLevel, opts.privilegedOptIn ?? false);

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

      // 4 — Actor: execute exactly (deterministic).
      const executionResult = await runActor(providers, action, raw);

      // 5 — Verifier: re-read the screen, judge against the prediction.
      const { state: freshState } = await scout(providers);
      const verified = await runVerifier(callModel, action, executionResult, freshState);
      const verificationResult = verified.verification;
      consecutiveDeviations = verificationResult.status === 'verified' ? 0 : consecutiveDeviations + 1;

      // 6 — Narrator: the user-facing line + audit (deterministic in Phase A).
      const userUpdate = narrate(stepNumber, action, executionResult, verificationResult);

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
      if (snap.breached) { trajectory.outcome = 'budget_exceeded'; break; }
    }
  } catch (err) {
    trajectory.outcome = 'error';
    emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }

  trajectory.endedAt = new Date().toISOString();
  emit({ type: 'done', trajectory });
  return trajectory;
}

// ── Scout (deterministic) ──────────────────────────────────────────────────

async function scout(providers: DesktopProviders): Promise<{ state: ScreenState; raw: UIAElement[] }> {
  const raw = providers.uia ? await providers.uia.listElements() : [];

  const elements: ScreenElement[] = raw.map((e, i) => ({
    id: e.name && e.name.trim() ? e.name : `${e.control_type || 'el'}-${i}`,
    kind: e.control_type || 'unknown',
    name: e.name || '',
    source: 'uia',
    interactable: true,
    sensitive: SENSITIVE_NAME.test(e.name || ''),
  }));

  const confidence: ConfidenceLevel = elements.length > 8 ? 'high' : elements.length > 0 ? 'medium' : 'low';

  return {
    state: {
      capturedAt: new Date().toISOString(),
      groundingSource: 'uia',
      confidence,
      elements,
      notes: elements.length === 0
        ? 'No elements from the accessibility tree — the window may be custom-rendered (vision fallback arrives in Phase C).'
        : undefined,
    },
    raw,
  };
}

// ── Planner (LLM) ──────────────────────────────────────────────────────────

async function runPlanner(
  callModel: PersonaModelCall,
  task: string,
  trajectory: Trajectory,
  screen: ScreenState,
): Promise<{ action: ProposedAction; tokens: number }> {
  const userContent = JSON.stringify({
    task,
    recentSteps: summariseTrajectory(trajectory),
    screen: { activeApp: screen.activeApp, confidence: screen.confidence, notes: screen.notes, elements: screen.elements },
  });
  const { text, tokensIn, tokensOut } = await callModel({
    persona: 'planner', systemPrompt: DESKTOP_PLANNER.systemPrompt, userContent,
  });
  const parsed = parseJson<ProposedAction>(text);
  const action = coerceAction(parsed);
  return { action, tokens: tokensIn + tokensOut };
}

/** Defensive: a malformed Planner output becomes a controlled 'stuck', never a crash. */
function coerceAction(parsed: Partial<ProposedAction> | null): ProposedAction {
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
  };
}

// ── Actor (deterministic) ──────────────────────────────────────────────────

async function runActor(providers: DesktopProviders, action: ProposedAction, raw: UIAElement[]): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const input = providers.input;
    switch (action.kind) {
      case 'click':
      case 'double_click':
      case 'right_click': {
        if (!input) throw new Error('no input provider');
        const el = resolveTarget(action.target, raw);
        if (!el) throw new Error(`target '${action.target ?? '?'}' not found on screen`);
        if (action.kind === 'click') await input.click(el.cx, el.cy);
        else if (action.kind === 'double_click') await input.doubleClick(el.cx, el.cy);
        else await input.rightClick(el.cx, el.cy);
        break;
      }
      case 'type': {
        if (!input) throw new Error('no input provider');
        const el = action.target ? resolveTarget(action.target, raw) : null;
        if (el) await input.click(el.cx, el.cy); // focus the field first
        await input.typeText(String(action.params?.text ?? ''));
        break;
      }
      case 'key': {
        if (!input) throw new Error('no input provider');
        await input.keyPress(String(action.params?.key ?? ''));
        break;
      }
      case 'scroll': {
        if (!input) throw new Error('no input provider');
        const dir = (action.params?.direction as 'up' | 'down' | 'left' | 'right') ?? 'down';
        const amount = Number(action.params?.amount) || undefined;
        await input.scroll(dir, amount);
        break;
      }
      case 'navigate': {
        if (!providers.browser) throw new Error('no browser provider for navigate');
        await providers.browser.navigate(String(action.params?.url ?? ''));
        break;
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

// ── Verifier (LLM) ─────────────────────────────────────────────────────────

async function runVerifier(
  callModel: PersonaModelCall,
  action: ProposedAction,
  result: ExecutionResult,
  freshScreen: ScreenState,
): Promise<{ verification: VerificationResult; tokens: number }> {
  const userContent = JSON.stringify({
    proposedAction: action,
    executionResult: result,
    freshScreen: { activeApp: freshScreen.activeApp, confidence: freshScreen.confidence, notes: freshScreen.notes, elements: freshScreen.elements },
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

function narrate(step: number, action: ProposedAction, result: ExecutionResult, vr: VerificationResult): UserUpdate {
  let line: string;
  if (!result.ok) {
    line = `Tried to ${describeAction(action)}, but it failed${result.error ? `: ${result.error}` : '.'}`;
  } else if (vr.status === 'deviated') {
    line = `${capitalise(describeAction(action))} — but ${vr.deviation ?? 'the screen didn’t change as expected'}.`;
  } else if (vr.status === 'rollback_needed') {
    line = `${capitalise(describeAction(action))} — that left things worse than before; pausing.`;
  } else {
    line = `${capitalise(pastTense(action))}.`;
  }
  return {
    line,
    audit: { step, action, result, verification: vr, timestamp: new Date().toISOString() },
  };
}

function describeAction(action: ProposedAction, element?: ScreenElement): string {
  const target = element?.name || action.target;
  switch (action.kind) {
    case 'click': return target ? `click "${target}"` : 'click';
    case 'double_click': return target ? `double-click "${target}"` : 'double-click';
    case 'right_click': return target ? `right-click "${target}"` : 'right-click';
    case 'type': return target ? `type into "${target}"` : 'type';
    case 'key': return `press ${String(action.params?.key ?? 'a key')}`;
    case 'scroll': return `scroll ${String(action.params?.direction ?? 'down')}`;
    case 'navigate': return `open ${String(action.params?.url ?? 'a page')}`;
    case 'wait': return 'wait';
    default: return action.kind;
  }
}

function pastTense(action: ProposedAction): string {
  const target = action.target;
  switch (action.kind) {
    case 'click': return target ? `clicked "${target}"` : 'clicked';
    case 'double_click': return target ? `double-clicked "${target}"` : 'double-clicked';
    case 'right_click': return target ? `right-clicked "${target}"` : 'right-clicked';
    case 'type': return target ? `typed into "${target}"` : 'typed';
    case 'key': return `pressed ${String(action.params?.key ?? 'a key')}`;
    case 'scroll': return `scrolled ${String(action.params?.direction ?? 'down')}`;
    case 'navigate': return `opened ${String(action.params?.url ?? 'a page')}`;
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

function parseJson<T>(text: string): T | null {
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
function delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
function genId(): string {
  return `traj-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
