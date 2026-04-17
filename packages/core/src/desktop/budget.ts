// ─── Desktop Automation Budget Tracker ─────────────────────────────────────
//
// Tracks token usage, step count, and wall-clock time during a desktop
// automation trajectory. Enforces the three hard caps from spec 8:
//   - Step count (default 30)
//   - Token budget (default 500K)
//   - Wall-clock time (default 5 minutes)
//
// OR'd — first-hit wins. Breach never silently continues.
//
// The tracker is instantiated per-trajectory and is the single source of
// truth for the live counter displayed in the trajectory view header:
//   "Step 7/30 · 82K / 500K tokens · 01:14"

// ── Configuration ─────────────────────────────────────────────────────────

export interface BudgetConfig {
  /** Maximum number of steps before the trajectory pauses for user decision. */
  maxSteps: number;
  /** Maximum tokens (model-side) before pause. */
  maxTokens: number;
  /** Maximum wall-clock milliseconds before pause. */
  maxWallMs: number;
}

export const DEFAULT_BUDGET: BudgetConfig = {
  maxSteps: 30,
  maxTokens: 500_000,
  maxWallMs: 5 * 60 * 1000,  // 5 minutes
};

// ── Step record ───────────────────────────────────────────────────────────

export interface StepTokens {
  /** Tokens consumed by each persona in this step */
  scout: number;
  planner: number;
  actor: number;
  verifier: number;
  narrator: number;
  /** OmniParser billing units consumed (0 or 10_000) */
  omniParser: number;
}

// ── Budget state ──────────────────────────────────────────────────────────

export type BudgetBreachReason = 'step_limit' | 'token_limit' | 'wall_clock';

export interface BudgetSnapshot {
  /** Current step number (1-indexed) */
  step: number;
  /** Total tokens consumed so far */
  tokensUsed: number;
  /** Wall-clock elapsed since trajectory start */
  elapsedMs: number;
  /** Whether a cap has been hit */
  breached: boolean;
  /** Which cap was hit (null if not breached) */
  breachReason: BudgetBreachReason | null;
  /** Remaining budget in all three dimensions */
  remaining: {
    steps: number;
    tokens: number;
    wallMs: number;
  };
}

// ── Tracker ───────────────────────────────────────────────────────────────

export class BudgetTracker {
  private config: BudgetConfig;
  private startedAt: number;
  private stepCount: number = 0;
  private totalTokens: number = 0;
  private steps: StepTokens[] = [];

  constructor(config: Partial<BudgetConfig> = {}) {
    // Skip undefined entries so `{ maxSteps: undefined }` doesn't clobber
    // the default. Callers sometimes pass the un-narrowed config object
    // (e.g. from DesktopConductorConfig where maxSteps is optional).
    const cleaned: Partial<BudgetConfig> = {};
    if (config.maxSteps !== undefined) cleaned.maxSteps = config.maxSteps;
    if (config.maxTokens !== undefined) cleaned.maxTokens = config.maxTokens;
    if (config.maxWallMs !== undefined) cleaned.maxWallMs = config.maxWallMs;
    this.config = { ...DEFAULT_BUDGET, ...cleaned };
    this.startedAt = Date.now();
  }

  /** Record a completed step's token consumption. */
  recordStep(tokens: StepTokens): BudgetSnapshot {
    this.stepCount += 1;
    const stepTotal =
      tokens.scout + tokens.planner + tokens.actor +
      tokens.verifier + tokens.narrator + tokens.omniParser;
    this.totalTokens += stepTotal;
    this.steps.push(tokens);
    return this.snapshot();
  }

  /** Get the current budget state without recording a step. */
  snapshot(): BudgetSnapshot {
    const elapsedMs = Date.now() - this.startedAt;

    let breached = false;
    let breachReason: BudgetBreachReason | null = null;

    if (this.stepCount >= this.config.maxSteps) {
      breached = true;
      breachReason = 'step_limit';
    } else if (this.totalTokens >= this.config.maxTokens) {
      breached = true;
      breachReason = 'token_limit';
    } else if (elapsedMs >= this.config.maxWallMs) {
      breached = true;
      breachReason = 'wall_clock';
    }

    return {
      step: this.stepCount,
      tokensUsed: this.totalTokens,
      elapsedMs,
      breached,
      breachReason,
      remaining: {
        steps: Math.max(0, this.config.maxSteps - this.stepCount),
        tokens: Math.max(0, this.config.maxTokens - this.totalTokens),
        wallMs: Math.max(0, this.config.maxWallMs - elapsedMs),
      },
    };
  }

  /** Extend the budget (user chose "another 30 steps" at the breach prompt). */
  extend(extra: Partial<BudgetConfig>): void {
    if (extra.maxSteps) this.config.maxSteps += extra.maxSteps;
    if (extra.maxTokens) this.config.maxTokens += extra.maxTokens;
    if (extra.maxWallMs) this.config.maxWallMs += extra.maxWallMs;
  }

  /** Format the header line for the trajectory view. */
  formatHeader(estimatedSteps?: number): string {
    const snap = this.snapshot();
    const stepsLabel = estimatedSteps
      ? `Step ${snap.step} of ~${estimatedSteps}`
      : `Step ${snap.step}/${this.config.maxSteps}`;
    const tokensLabel = `${formatTokenCount(snap.tokensUsed)} / ${formatTokenCount(this.config.maxTokens)} tokens`;
    const timeLabel = formatElapsed(snap.elapsedMs);
    return `${stepsLabel} · ${tokensLabel} · ${timeLabel}`;
  }

  /** Per-step breakdown for the results JSON. */
  getStepBreakdown(): StepTokens[] {
    return [...this.steps];
  }

  /** Average tokens per step — feeds the cost estimator. */
  getAverageStepTokens(): number {
    if (this.steps.length === 0) return 0;
    return Math.round(this.totalTokens / this.steps.length);
  }
}

// ── Cost estimator ────────────────────────────────────────────────────────
// Pre-task heuristic: "Looks medium — ~200K, ~$0.15."

export interface CostEstimate {
  label: string;         // "simple" | "medium" | "complex"
  estimatedSteps: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
}

const QWEN_3_6_BLENDED_PER_TOKEN_USD = 0.000001;  // ~$1/M blended I/O

export function estimateCost(taskDescription: string): CostEstimate {
  // Rough heuristic based on task description length and keywords.
  // This is intentionally simple — gets replaced by learned estimates
  // once we have trajectory data in memory.
  const desc = taskDescription.toLowerCase();
  const complexitySignals = [
    'triage', 'multiple', 'three', 'several', 'all', 'each',
    'compare', 'analyse', 'investigate', 'debug', 'fix',
  ];
  const simpleSignals = ['open', 'search', 'find', 'check', 'look'];

  const complexHits = complexitySignals.filter(s => desc.includes(s)).length;
  const simpleHits = simpleSignals.filter(s => desc.includes(s)).length;

  if (complexHits >= 2 || desc.length > 200) {
    return {
      label: 'complex',
      estimatedSteps: 28,
      estimatedTokens: 380_000,
      estimatedCostUsd: 380_000 * QWEN_3_6_BLENDED_PER_TOKEN_USD,
    };
  }
  if (simpleHits >= 1 && complexHits === 0 && desc.length < 80) {
    return {
      label: 'simple',
      estimatedSteps: 8,
      estimatedTokens: 100_000,
      estimatedCostUsd: 100_000 * QWEN_3_6_BLENDED_PER_TOKEN_USD,
    };
  }
  return {
    label: 'medium',
    estimatedSteps: 20,
    estimatedTokens: 250_000,
    estimatedCostUsd: 250_000 * QWEN_3_6_BLENDED_PER_TOKEN_USD,
  };
}

// ── Formatting helpers ────────────────────────────────────────────────────

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
