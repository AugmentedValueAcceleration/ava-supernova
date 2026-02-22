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
}

export type ToolConfirmationHandler = (
  toolName: string,
  args: Record<string, unknown>,
) => Promise<boolean>;
