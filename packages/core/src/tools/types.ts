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

export type PermissionMode = 'strict' | 'balanced' | 'autonomous' | 'custom';

// ─── Tool Categories ────────────────────────────────────────────────────────
// Group tools by functional area for granular permission control.

export type ToolCategory =
  | 'file_ops' | 'shell' | 'git' | 'web' | 'media'
  | 'database' | 'system' | 'documents' | 'memory' | 'learning';

// ─── Category Permission Levels ─────────────────────────────────────────────
// auto        — never ask, execute immediately
// first_time  — ask once per session, then remember
// always_ask  — confirm every call

export type CategoryPermission = 'auto' | 'first_time' | 'always_ask';

// ─── Audit Log ──────────────────────────────────────────────────────────────

export type AuditApprovalMethod = 'auto' | 'first-time' | 'user-approved' | 'denied';

export interface AuditLogEntry {
  timestamp: string;
  toolName: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  approvalMethod: AuditApprovalMethod;
  status: 'success' | 'failed' | 'denied';
  argsSummary: string;
  fullArgs?: Record<string, unknown>;
  result?: string;
}

export type AuditCallback = (entry: AuditLogEntry) => void;

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
  /** Current conversation ID (for memory traceability). */
  conversationId?: string;
}

// Returns boolean (true=approved, false=denied) or a string (approved with custom tool result).
// When a string is returned, the ToolRegistry uses it as the tool output directly,
// bypassing the tool's execute() method. Used by present_plan for rich approval messages.
export type ToolConfirmationHandler = (
  toolName: string,
  args: Record<string, unknown>,
) => Promise<boolean | string>;
