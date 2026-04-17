// ─── C3: Desktop Conductor — Wave Orchestration ──────────────────────────
//
// Runs the Scout → Planner → Actor → Verifier → Narrator wave per step
// until the task is complete, the user kills it, or a budget cap trips.
//
// This is the production evolution of prototype C3 (Session 1). Key
// differences from the prototype:
//   - Uses real grounding (C1) instead of mock ScreenState
//   - Uses real execution (C2) instead of mock ActorThe executor is deliberately dumb
//   - Enforces gates (C4) between Planner and Actor
//   - Emits typed events for the frontend trajectory view
//   - Tracks budget (A4) per step and stops on breach
//   - Writes to memory via Narrator on successful trajectories

import type {
  ScreenState, ProposedAction, ExecutionResult,
  VerificationResult, UserUpdate, TrajectoryStep, Trajectory,
} from './types.js';
import type { StepTokens } from './budget.js';
import type { PermissionLevel } from './safety.js';
import type { GateResult } from './gates.js';
import { BudgetTracker } from './budget.js';
import { GroundingLayer } from './grounding.js';
import { ExecutorLayer } from './executor.js';
import { runGates } from './gates.js';
import type { GateConfig } from './gates.js';

// ── Events ────────────────────────────────────────────────────────────────
// The frontend subscribes to these to render the live trajectory view.

export type DesktopConductorEvent =
  | { type: 'trajectory_start'; task: string; estimatedSteps: number }
  | { type: 'step_start'; step: number; budgetHeader: string }
  | { type: 'scout_complete'; step: number; screenState: ScreenState; groundingMs: number }
  | { type: 'planner_complete'; step: number; action: ProposedAction }
  | { type: 'gate_result'; step: number; gate: GateResult }
  | { type: 'approval_needed'; step: number; action: ProposedAction; summary: string }
  | { type: 'approval_received'; step: number; approved: boolean }
  | { type: 'actor_complete'; step: number; result: ExecutionResult }
  | { type: 'verifier_complete'; step: number; result: VerificationResult }
  | { type: 'narrator_complete'; step: number; update: UserUpdate }
  | { type: 'step_complete'; step: number; budgetHeader: string }
  | { type: 'budget_exceeded'; step: number; reason: string }
  | { type: 'trajectory_complete'; outcome: Trajectory['outcome']; steps: number }
  | { type: 'error'; step: number; error: string };

export type DesktopConductorEventHandler = (event: DesktopConductorEvent) => void;

// ── LLM interface ─────────────────────────────────────────────────────────
// The conductor doesn't call LLMs directly — it goes through this
// interface so the IDE can inject its provider (platform Qwen, BYOK, etc.)

export interface PersonaLLM {
  /** Call the LLM with a system prompt and user message, get structured JSON back. */
  call(systemPrompt: string, userMessage: string): Promise<{ output: string; tokensUsed: number }>;
}

// ── Approval handler ──────────────────────────────────────────────────────

export interface ApprovalHandler {
  /** Show an approval card and wait for the user's decision. */
  requestApproval(action: ProposedAction, summary: string): Promise<{
    approved: boolean;
    reason?: string;
    editedParams?: Record<string, unknown>;
  }>;
}

// ── Conductor config ──────────────────────────────────────────────────────

export interface DesktopConductorConfig {
  task: string;
  whitelist: string[];
  permissionLevel: PermissionLevel;
  privilegedOptIn?: boolean;
  maxSteps?: number;
  maxTokens?: number;
  maxWallMs?: number;
}

// ── Conductor ─────────────────────────────────────────────────────────────

export class DesktopConductor {
  private grounding: GroundingLayer;
  private executor: ExecutorLayer;
  private llm: PersonaLLM;
  private approvalHandler: ApprovalHandler;
  private onEvent: DesktopConductorEventHandler;
  private budget: BudgetTracker;
  private config: DesktopConductorConfig;
  private gateConfig: GateConfig;
  private steps: TrajectoryStep[] = [];
  private aborted = false;

  constructor(
    grounding: GroundingLayer,
    executor: ExecutorLayer,
    llm: PersonaLLM,
    approvalHandler: ApprovalHandler,
    onEvent: DesktopConductorEventHandler,
    config: DesktopConductorConfig,
  ) {
    this.grounding = grounding;
    this.executor = executor;
    this.llm = llm;
    this.approvalHandler = approvalHandler;
    this.onEvent = onEvent;
    this.config = config;
    this.budget = new BudgetTracker({
      maxSteps: config.maxSteps,
      maxTokens: config.maxTokens,
      maxWallMs: config.maxWallMs,
    });
    this.gateConfig = {
      whitelist: config.whitelist,
      permissionLevel: config.permissionLevel,
      privilegedOptIn: config.privilegedOptIn ?? false,
    };
  }

  /** Abort the trajectory externally (kill switch, companion kill, etc.) */
  abort(): void {
    this.aborted = true;
  }

  /** Run the trajectory to completion, budget breach, or abort. */
  async run(): Promise<Trajectory> {
    const trajectoryId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    this.onEvent({ type: 'trajectory_start', task: this.config.task, estimatedSteps: this.config.maxSteps ?? 30 });

    let outcome: Trajectory['outcome'] = 'completed';

    try {
      while (!this.aborted) {
        const snap = this.budget.snapshot();
        if (snap.breached) {
          this.onEvent({ type: 'budget_exceeded', step: snap.step, reason: snap.breachReason ?? 'unknown' });
          outcome = 'budget_exceeded';
          break;
        }

        const step = await this.runStep(snap.step + 1);
        if (!step) break;

        this.steps.push(step);

        // Check for terminal actions
        if (step.proposedAction.kind === 'done') {
          outcome = 'completed';
          break;
        }
        if (step.proposedAction.kind === 'stuck') {
          outcome = 'stuck';
          break;
        }
      }

      if (this.aborted) {
        outcome = 'stopped';
      }
    } catch (e) {
      outcome = 'error';
      this.onEvent({ type: 'error', step: this.steps.length, error: e instanceof Error ? e.message : String(e) });
    }

    this.onEvent({ type: 'trajectory_complete', outcome, steps: this.steps.length });

    return {
      id: trajectoryId,
      task: this.config.task,
      startedAt,
      endedAt: new Date().toISOString(),
      steps: this.steps,
      whitelist: this.config.whitelist,
      permissionLevel: this.config.permissionLevel,
      outcome,
    };
  }

  private async runStep(stepNumber: number): Promise<TrajectoryStep | null> {
    const tokens: StepTokens = { scout: 0, planner: 0, actor: 0, verifier: 0, narrator: 0, omniParser: 0 };
    this.onEvent({ type: 'step_start', step: stepNumber, budgetHeader: this.budget.formatHeader() });

    // ── Scout ───────────────────────────────────────────────────────
    const groundingResult = await this.grounding.ground({
      activeApp: undefined, // filled by Tauri get_active_window at call site
      isBrowser: false,     // determined by active window detection
    });
    const screenState = groundingResult.screenState;

    // Estimate OmniParser billing if it was used
    const usedOmni = groundingResult.attempted.some(a => a.source === 'omniparser' && a.elementCount > 0);
    tokens.omniParser = usedOmni ? 10_000 : 0;

    // Call Scout LLM to refine the ScreenState
    const trajectoryContext = this.buildTrajectoryContext();
    const scoutPrompt = `Task: ${this.config.task}\n\nTrajectory so far:\n${trajectoryContext}\n\nRaw grounding data:\n${JSON.stringify(screenState, null, 2)}`;
    const scoutResult = await this.llm.call(
      (await import('./personas.js')).DESKTOP_SCOUT.systemPrompt,
      scoutPrompt,
    );
    tokens.scout = scoutResult.tokensUsed;

    let refinedState: ScreenState;
    try {
      refinedState = JSON.parse(scoutResult.output) as ScreenState;
    } catch {
      refinedState = screenState;
    }
    this.onEvent({ type: 'scout_complete', step: stepNumber, screenState: refinedState, groundingMs: groundingResult.totalMs });

    // ── Planner ─────────────────────────────────────────────────────
    const plannerPrompt = `Task: ${this.config.task}\n\nTrajectory so far:\n${trajectoryContext}\n\nCurrent ScreenState:\n${JSON.stringify(refinedState, null, 2)}`;
    const plannerResult = await this.llm.call(
      (await import('./personas.js')).DESKTOP_PLANNER.systemPrompt,
      plannerPrompt,
    );
    tokens.planner = plannerResult.tokensUsed;

    let action: ProposedAction;
    try {
      action = JSON.parse(plannerResult.output) as ProposedAction;
    } catch {
      this.onEvent({ type: 'error', step: stepNumber, error: 'Planner output is not valid JSON' });
      return null;
    }
    this.onEvent({ type: 'planner_complete', step: stepNumber, action });

    // ── Gates ───────────────────────────────────────────────────────
    const gate = runGates(action, refinedState, this.budget.snapshot(), this.gateConfig);
    this.onEvent({ type: 'gate_result', step: stepNumber, gate });

    if (gate.verdict === 'budget_exceeded') {
      this.budget.recordStep(tokens);
      return null;
    }

    if (gate.verdict === 'blocked') {
      // Planner proposed something forbidden — treat as stuck
      action = { ...action, kind: 'stuck', reasoning: `Blocked: ${gate.reasons.join('; ')}` };
    }

    if (gate.verdict === 'needs_approval') {
      const summary = `${action.kind} on ${action.target ?? 'screen'}: ${action.reasoning}`;
      this.onEvent({ type: 'approval_needed', step: stepNumber, action, summary });
      const decision = await this.approvalHandler.requestApproval(action, summary);
      this.onEvent({ type: 'approval_received', step: stepNumber, approved: decision.approved });
      if (!decision.approved) {
        action = { ...action, kind: 'stuck', reasoning: `User rejected: ${decision.reason ?? 'no reason given'}` };
      } else if (decision.editedParams) {
        action = { ...action, params: { ...action.params, ...decision.editedParams } };
      }
    }

    // ── Actor ───────────────────────────────────────────────────────
    const execResult = await this.executor.execute(action, refinedState.groundingSource === 'playwright');
    tokens.actor = 300; // Actor token usage is minimal — estimate
    this.onEvent({ type: 'actor_complete', step: stepNumber, result: execResult });

    // ── Verifier ────────────────────────────────────────────────────
    // Re-ground to see what changed
    const postGrounding = await this.grounding.ground({});
    const verifierPrompt = `ProposedAction:\n${JSON.stringify(action, null, 2)}\n\nExecutionResult:\n${JSON.stringify(execResult, null, 2)}\n\nPost-action ScreenState:\n${JSON.stringify(postGrounding.screenState, null, 2)}`;
    const verifierResult = await this.llm.call(
      (await import('./personas.js')).DESKTOP_VERIFIER.systemPrompt,
      verifierPrompt,
    );
    tokens.verifier = verifierResult.tokensUsed;

    let verification: VerificationResult;
    try {
      verification = JSON.parse(verifierResult.output) as VerificationResult;
    } catch {
      verification = { status: 'deviated', detail: 'Verifier output parse failed', deviation: 'unparseable output' };
    }
    this.onEvent({ type: 'verifier_complete', step: stepNumber, result: verification });

    // ── Narrator ────────────────────────────────────────────────────
    const narratorPrompt = `Step ${stepNumber}:\n${JSON.stringify({ action, result: execResult, verification }, null, 2)}`;
    const narratorResult = await this.llm.call(
      (await import('./personas.js')).DESKTOP_NARRATOR.systemPrompt,
      narratorPrompt,
    );
    tokens.narrator = narratorResult.tokensUsed;

    let userUpdate: UserUpdate;
    try {
      userUpdate = JSON.parse(narratorResult.output) as UserUpdate;
    } catch {
      userUpdate = {
        line: `Step ${stepNumber}: ${action.kind} ${action.target ?? ''} — ${verification.status}`,
        audit: { step: stepNumber, action, result: execResult, verification, timestamp: new Date().toISOString() },
      };
    }
    this.onEvent({ type: 'narrator_complete', step: stepNumber, update: userUpdate });

    // ── Record step ─────────────────────────────────────────────────
    this.budget.recordStep(tokens);
    this.onEvent({ type: 'step_complete', step: stepNumber, budgetHeader: this.budget.formatHeader() });

    return {
      stepNumber,
      screenState: refinedState,
      proposedAction: action,
      executionResult: execResult,
      verificationResult: verification,
      userUpdate,
      tokensConsumed: tokens,
    };
  }

  private buildTrajectoryContext(): string {
    if (this.steps.length === 0) return '(no steps yet)';
    // Include last 5 steps to keep context manageable
    return this.steps.slice(-5).map(s =>
      `Step ${s.stepNumber}: ${s.proposedAction.kind} → ${s.verificationResult.status} — "${s.userUpdate.line}"`
    ).join('\n');
  }
}
