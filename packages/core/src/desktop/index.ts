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
