/**
 * Desktop automation module — safety ontology, budget tracking, and shared types
 * for the desktop mode (prefix @@) trajectory system.
 */

// Safety ontology
export {
  classifyAction,
  decideApproval,
  escalateRisk,
  isWhitelisted,
  IRREVERSIBLE_VERBS,
} from './safety.js';

export type {
  RiskClass,
  PermissionLevel,
  ActionClassificationInput,
  ClassificationResult,
  ApprovalDecision,
} from './safety.js';

// Budget tracking
export {
  BudgetTracker,
  estimateCost,
  DEFAULT_BUDGET,
} from './budget.js';

export type {
  BudgetConfig,
  BudgetSnapshot,
  BudgetBreachReason,
  StepTokens,
  CostEstimate,
} from './budget.js';

// Desktop personas
export {
  DESKTOP_SCOUT,
  DESKTOP_PLANNER,
  DESKTOP_ACTOR,
  DESKTOP_VERIFIER,
  DESKTOP_NARRATOR,
  DESKTOP_PERSONAS,
  DESKTOP_WAVE_ORDER,
  ESTIMATED_TOKENS_PER_STEP,
} from './personas.js';

export type {
  DesktopPersonaName,
  DesktopPersonaDefinition,
} from './personas.js';

// Perception merge layer (Phase C1) — one ranked ScreenState from all tiers
export { mergeTiers, browserSnapshotToTier } from './perception.js';
export type { PerceptionTier } from './perception.js';

// Vision capability probe (Phase C3) — structured lane + honesty (verified?)
export { probeVisionCapability } from './capability.js';
export type { VisionLane, VisionCapability, VisionProbeInput } from './capability.js';

// Screen fingerprinting (Phase 3A) — SSIM + aHash "have I seen this screen?"
export {
  imageKey, ctxKey, averageHash, hamming, computeSsim, matchScreen,
  bytesToBase64, base64ToBytes, HAMMING_MAX, SSIM_MIN,
} from './screen-key.js';
export type { ScreenKey, ImageScreenKey, CtxScreenKey } from './screen-key.js';

// Fork-point learning (Phase 3B) — the runtime GRSD loop (the moat)
export {
  createEmptyForkPointStore, recordFailure, recordSuccess, retrieveHints,
  decayStore, FORK_POINT_CAP,
} from './fork-points.js';
export type { ForkPoint, ForkPointStore, ForkPointAction } from './fork-points.js';

// Conductor — orchestrates the five-persona wave into a trajectory loop
export { runDesktopTrajectory } from './conductor.js';
export type {
  DesktopProviders,
  PersonaModelCall,
  ApprovalRequest,
  ApprovalFn,
  ConductorEvent,
  EmitFn,
  RunTrajectoryOptions,
} from './conductor.js';

// Shared types
export type {
  GroundingSource,
  ConfidenceLevel,
  ScreenElement,
  ScreenState,
  ActionKind,
  ProposedAction,
  ExecutionResult,
  VerificationStatus,
  VerificationResult,
  UserUpdate,
  TrajectoryStep,
  Trajectory,
} from './types.js';
