export { AutoCoordinator } from './auto-coordinator.js';
export { ModelRouter } from './model-router.js';
// The routing-mode union was never exported, so every surface hand-copied it
// and they drifted the moment a fourth fleet landed. One export now.
export type { RoutingMode } from './model-router.js';
export { classifyTask } from './task-classifier.js';
export { generateBrief, formatBriefAsSystem } from './brief-generator.js';
export { ContextTracker } from './context-tracker.js';
export { resolveCoordinatorModel } from './coordinator-model.js';
// Longxiang's launch flag is exported (the routing tables are not) so every
// surface gates off the SAME boolean instead of each keeping its own copy.
export { LONGXIANG_ENABLED } from './longxiang-router.js';
export type { CoordinatorModelResult } from './coordinator-model.js';
export type {
  TaskCategory,
  ClassificationResult,
  RouteResult,
  UserRoutePreferences,
  TaskBrief,
  AutoEvent,
  ContextThresholds,
} from './types.js';
