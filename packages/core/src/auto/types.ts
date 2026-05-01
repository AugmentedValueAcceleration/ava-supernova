import type { ModelDefinition } from '../core/types.js';
import type { Provider } from '../providers/types.js';

// ─── Task Classification ─────────────────────────────────────────────────────

export type TaskCategory =
  | 'coding'
  | 'vision'
  | 'image_gen'
  | 'planning'
  | 'chat'
  | 'long_context'
  | 'teach'
  | 'security'
  | 'brainstorm';

export interface ClassificationResult {
  category: TaskCategory;
  /** Model ID to force-route to (from user inline override like "@kimi") */
  modelOverride?: string;
  /** Why this classification was chosen — for logging/debugging */
  reason: string;
}

// ─── Model Routing ───────────────────────────────────────────────────────────

export interface RouteResult {
  /** Qualified model ID e.g. 'platform:kimi-k2.5' */
  modelId: string;
  provider: Provider;
  model: ModelDefinition;
  /** Human-readable reason — "Best agentic coding model" */
  reason: string;
  /** Warning if routing is suboptimal — "No vision model available" */
  warning?: string;
}

/** Per-category model preferences set by the user in settings */
export type UserRoutePreferences = Partial<Record<TaskCategory, string>>;

// ─── Task Brief ──────────────────────────────────────────────────────────────

export interface TaskBrief {
  /** The user's request */
  task: string;
  /** Summary of recent conversation (last few exchanges, truncated) */
  context: string;
  /** Relevant memories for this query */
  relevantMemories: string;
  /** Project instructions (CLAUDE.md, etc.) */
  projectContext: string;
  /** Model-specific constraints — context window, capabilities */
  constraints: string;
  /** File paths mentioned in recent messages */
  files: string[];
}

// ─── Auto Events ─────────────────────────────────────────────────────────────

export type AutoEvent =
  | { type: 'auto_routing'; category: TaskCategory; model: string; reason: string }
  | { type: 'auto_agent_start'; model: string; category: TaskCategory }
  | { type: 'auto_agent_end'; model: string; summary?: string };

// ─── Context Tracking ────────────────────────────────────────────────────────

export interface ContextThresholds {
  /** Warning threshold (0-1), default 0.80 */
  warning: number;
  /** Critical threshold (0-1), default 0.90 */
  critical: number;
}
