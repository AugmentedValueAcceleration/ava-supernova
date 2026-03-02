import type { FunctionSchema } from '../providers/types.js';

// ─── Risk Levels ────────────────────────────────────────────────────────────
// safe     — read-only operations (file_read, glob, grep)
// write    — modify files in the workspace (file_write, file_edit)
// dangerous — arbitrary system commands, destructive potential (bash)

export type ToolRiskLevel = 'safe' | 'write' | 'dangerous';

// ─── Permission Modes ───────────────────────────────────────────────────────
// strict     — confirm write + dangerous tools (safest, default)
// balanced   — auto-approve writes, confirm dangerous only
// autonomous — auto-approve everything (YOLO mode)

export type PermissionMode = 'strict' | 'balanced' | 'autonomous';

export interface ToolResult {
  success: boolean;
  output: string;
  metadata?: Record<string, unknown>;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly schema: FunctionSchema;
  readonly riskLevel: ToolRiskLevel;
  /** @deprecated Use riskLevel instead. Kept for backwards compat. */
  readonly requiresConfirmation: boolean;
  execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult>;
}

export interface ToolExecutionContext {
  cwd: string;
  signal?: AbortSignal;
  /** Called with incremental output chunks (stdout/stderr) for real-time streaming. */
  onOutput?: (data: string) => void;
  /** Shared state across tools within a session (e.g. memoryManager, checkpointManager). */
  sharedState?: Record<string, unknown>;
}

// Returns boolean (true=approved, false=denied) or a string (approved with custom tool result).
// When a string is returned, the ToolRegistry uses it as the tool output directly,
// bypassing the tool's execute() method. Used by present_plan for rich approval messages.
export type ToolConfirmationHandler = (
  toolName: string,
  args: Record<string, unknown>,
) => Promise<boolean | string>;
