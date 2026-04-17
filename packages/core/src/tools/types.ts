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
  /**
   * When true, the tool handles approval inside its own execute() (e.g. the
   * desktop-safety-gate pattern) and the generic ToolRegistry confirmation
   * flow is skipped. Avoids double-prompting the user when per-invocation
   * classification is richer than static category-level permission.
   * Default: false.
   */
  readonly usesDynamicConfirmation?: boolean;
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
  /**
   * The model-assigned tool_call ID for this invocation. Threaded through
   * to confirmation handlers so the UI can attach confirmation cards to the
   * exact tool call instance instead of guessing by name.
   */
  toolCallId?: string;
  /**
   * Capability granter for the secret_request tool. The host implementation
   * resolves vault candidates by label, prompts the user, and returns the
   * granted entry's id (handle) — never the value itself, which lives in the
   * host's working set and is substituted into downstream tool args.
   *
   * Returns null when the user denies the grant.
   */
  secretGranter?: (label: string, reason?: string) => Promise<{ id: string; label: string } | null>;
}

// Returns boolean (true=approved, false=denied) or a string (approved with custom tool result).
// When a string is returned, the ToolRegistry uses it as the tool output directly,
// bypassing the tool's execute() method. Used by present_plan for rich approval messages.
//
// toolCallId is the model's tool_call ID — passed through so UI hosts can
// match confirmation prompts to the exact tool call instance instead of by
// name (which races with multiple parallel tool calls).
export type ToolConfirmationHandler = (
  toolName: string,
  args: Record<string, unknown>,
  toolCallId?: string,
) => Promise<boolean | string>;
