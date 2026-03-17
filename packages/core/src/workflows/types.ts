/**
 * Workflow Engine — Types for autonomous multi-step execution.
 *
 * A workflow is a dependency graph of steps. Each step is a mini agent run
 * with a scoped objective. Steps can depend on previous steps.
 *
 * This is the "Deeper Autonomy" pillar — Ava handles full workflows end-to-end.
 */

/** Status of a workflow step. */
export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/** Status of an entire workflow. */
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused';

/** A single step in a workflow. */
export interface WorkflowStep {
  /** Unique identifier for this step. */
  id: string;
  /** Human-readable title (e.g. "Research API documentation"). */
  title: string;
  /** The instruction to give the agent for this step. */
  instruction: string;
  /** IDs of steps that must complete before this one starts. */
  dependsOn: string[];
  /** Current status. */
  status: WorkflowStepStatus;
  /** Output from this step (agent's final response). */
  output?: string;
  /** Error message if failed. */
  error?: string;
  /** Number of retry attempts. */
  retries: number;
  /** Maximum retries allowed (default 2). */
  maxRetries: number;
  /** When this step started (ISO 8601). */
  startedAt?: string;
  /** When this step completed (ISO 8601). */
  completedAt?: string;
}

/** A full workflow — a dependency graph of steps. */
export interface Workflow {
  /** Unique identifier. */
  id: string;
  /** Human-readable title. */
  title: string;
  /** The original user request that spawned this workflow. */
  originalRequest: string;
  /** The steps in execution order. */
  steps: WorkflowStep[];
  /** Current status. */
  status: WorkflowStatus;
  /** When this workflow was created. */
  createdAt: string;
  /** When this workflow completed or failed. */
  completedAt?: string;
}

/** Events emitted during workflow execution. */
export type WorkflowEvent =
  | { type: 'workflow_start'; workflowId: string; title: string; totalSteps: number }
  | { type: 'step_start'; workflowId: string; stepId: string; title: string; stepNumber: number; totalSteps: number }
  | { type: 'step_progress'; workflowId: string; stepId: string; content: string }
  | { type: 'step_complete'; workflowId: string; stepId: string; title: string; output: string }
  | { type: 'step_failed'; workflowId: string; stepId: string; title: string; error: string; willRetry: boolean }
  | { type: 'step_retry'; workflowId: string; stepId: string; title: string; attempt: number }
  | { type: 'workflow_complete'; workflowId: string; title: string; completedSteps: number; totalSteps: number }
  | { type: 'workflow_failed'; workflowId: string; title: string; failedStep: string; error: string }
  | { type: 'workflow_paused'; workflowId: string; title: string; reason: string };

/** Handler for workflow events. */
export type WorkflowEventHandler = (event: WorkflowEvent) => void;
