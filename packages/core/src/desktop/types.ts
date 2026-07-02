// ─── Desktop Automation Types ──────────────────────────────────────────────
//
// Typed schemas for inter-persona data flow during a desktop automation
// trajectory. Each persona produces one of these; the next persona consumes
// the previous one(s). This is the single source of truth — prototypes,
// sidecar, and IDE all import from here.

import type { RiskClass } from './safety.js';

// ── Grounding ─────────────────────────────────────────────────────────────

export type GroundingSource = 'uia' | 'playwright' | 'omniparser' | 'merged';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ScreenElement {
  /** Stable ID from the grounding source (UIA RuntimeId, DOM selector, OmniParser index) */
  id: string;
  /** Element kind — button, textbox, link, menuitem, icon, text, etc. */
  kind: string;
  /** Display name / accessible name / caption */
  name: string;
  /** Bounding box as normalised [x, y, width, height] (0–1 range) */
  bbox?: [number, number, number, number];
  /** CSS selector (Playwright-sourced elements only) */
  selector?: string;
  /** Which grounding tier produced this element */
  source: GroundingSource;
  /** Whether the element is interactable (clickable, typeable) */
  interactable: boolean;
  /** Another window is physically covering this element — a click would hit
   *  the covering window instead. Clear the occlusion (minimize_all / focus)
   *  before targeting it. */
  occluded?: boolean;
  /** Whether this element contains sensitive content (password field, API key, etc.) */
  sensitive: boolean;
}

/** Scout's output — what's visible on screen right now. */
export interface ScreenState {
  /** ISO timestamp when the screen was captured */
  capturedAt: string;
  /** Primary grounding source for this state */
  groundingSource: GroundingSource;
  /** How much Scout trusts this snapshot */
  confidence: ConfidenceLevel;
  /** Structured elements visible on screen */
  elements: ScreenElement[];
  /** The active window/app name */
  activeApp?: string;
  /** The active page URL (for Playwright-sourced states) */
  activeUrl?: string;
  /** The page title */
  activeTitle?: string;
  /** Anything Planner should know — partial tree, loading, obstruction */
  notes?: string;
}

// ── Planning ──────────────────────────────────────────────────────────────

export type ActionKind =
  | 'click'
  | 'double_click'
  | 'right_click'
  | 'type'
  | 'key'
  | 'scroll'
  | 'drag'
  | 'minimize_all'
  | 'navigate'
  | 'launch'
  | 'wait'
  | 'observe_more'
  | 'stuck'
  | 'done';

/** Planner's output — the single next action. */
export interface ProposedAction {
  /** Exactly one action per step */
  kind: ActionKind;
  /** Element ID from ScreenState that this action targets (null for non-targeted actions) */
  target?: string;
  /** Action-specific parameters */
  params?: Record<string, unknown>;
  /** Risk classification per the safety ontology */
  riskClass: RiskClass;
  /** Planner's reasoning for this action (for audit, not for Actor) */
  reasoning: string;
  /** One-sentence prediction of what the screen should look like after this action */
  expectedPostState: string;
  /**
   * Where the impetus for this action came from (anti-prompt-injection spine):
   * 'user' — carries out something the USER asked for in the task;
   * 'observed' — prompted by text READ OFF THE SCREEN (a page/email/dialog
   * saying "click X to continue"). Observed-origin mutative actions force a
   * fresh confirm even in Drive, with a "this came from the page, not you"
   * banner. Primary signal: the Planner self-declares; a conductor heuristic
   * backstops it. Never the only guard — the irreversible floor stands.
   */
  origin?: 'user' | 'observed';
}

// ── Execution ─────────────────────────────────────────────────────────────

/** Actor's output — what happened when the action ran. */
export interface ExecutionResult {
  /** Whether the action executed successfully */
  ok: boolean;
  /** Error message if ok=false */
  error?: string;
  /** Wall-clock time from action start to result */
  latencyMs: number;
  /** Observable side effects — popup, URL change, focus shift */
  sideEffects?: string[];
}

// ── Verification ──────────────────────────────────────────────────────────

export type VerificationStatus = 'verified' | 'deviated' | 'rollback_needed';

/** Verifier's output — did the action land? */
export interface VerificationResult {
  /** Whether post-state matches Planner's prediction */
  status: VerificationStatus;
  /** Evidence — "Compose window visible, subject field focused" */
  detail: string;
  /** Description of what happened instead (for 'deviated' or 'rollback_needed') */
  deviation?: string;
}

// ── Narration ─────────────────────────────────────────────────────────────

/** Narrator's output — user-facing + audit record. */
export interface UserUpdate {
  /** One-line past-tense summary for the user: "Opened Gmail." */
  line: string;
  /** Full structured audit record */
  audit: {
    step: number;
    action: ProposedAction;
    result: ExecutionResult;
    verification: VerificationResult;
    timestamp: string;
  };
}

// ── Trajectory ────────────────────────────────────────────────────────────

/** One complete step in a trajectory. */
export interface TrajectoryStep {
  stepNumber: number;
  screenState: ScreenState;
  proposedAction: ProposedAction;
  executionResult: ExecutionResult;
  verificationResult: VerificationResult;
  userUpdate: UserUpdate;
  tokensConsumed: {
    scout: number;
    planner: number;
    actor: number;
    verifier: number;
    narrator: number;
    omniParser: number;
  };
}

/** A complete trajectory from start to finish. */
export interface Trajectory {
  id: string;
  task: string;
  startedAt: string;
  endedAt?: string;
  steps: TrajectoryStep[];
  whitelist: string[];
  permissionLevel: 'watch' | 'drive';
  outcome: 'completed' | 'stopped' | 'stuck' | 'budget_exceeded' | 'error';
}
