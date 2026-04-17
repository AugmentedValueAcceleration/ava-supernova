/**
 * Desktop automation module — safety ontology, budget tracking, and shared types
 * for the desktop mode (prefix @@) trajectory system.
 */

// Safety ontology
export {
  classifyAction,
  decideApproval,
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

// Grounding layer (C1)
export { GroundingLayer, DEFAULT_GROUNDING_CONFIG } from './grounding.js';
export type { GroundingBackend, GroundingConfig, GroundingResult } from './grounding.js';

// Executor layer (C2)
export { ExecutorLayer } from './executor.js';
export type { ExecutorBackend } from './executor.js';

// Conductor (C3)
export { DesktopConductor } from './conductor.js';
export type {
  DesktopConductorEvent,
  DesktopConductorEventHandler,
  PersonaLLM,
  ApprovalHandler,
  DesktopConductorConfig,
} from './conductor.js';

// Gates (C4)
export { runGates } from './gates.js';
export type { GateVerdict, GateResult, GateConfig } from './gates.js';

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
