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
  /** File-mutation diff metadata — populated by file_write / file_edit so
   *  audit consumers can reconstruct what changed without parsing the
   *  truncated result. Path, optional git SHA, byte counts, sha256 hashes
   *  before/after. */
  fileMutation?: {
    path: string;
    gitSha?: string;
    bytesBefore?: number;
    bytesAfter?: number;
    sha256Before?: string;
    sha256After?: string;
  };
}

export type AuditCallback = (entry: AuditLogEntry) => void;

export interface ToolResult {
  success: boolean;
  output: string;
  metadata?: Record<string, unknown>;
}

// ─── Output Trust ───────────────────────────────────────────────────────────
// Declares whether a tool's output is trusted (came from the user, our own
// state, deterministic computation) or untrusted (third-party content that
// could carry prompt-injection payloads). Untrusted outputs get wrapped at
// the registry level with <tool_output trust="untrusted">…</tool_output>
// before they re-enter the model context, so the model has an architectural
// cue to treat the content as data, not instruction.
//
// Default: 'trusted'. Tools that fetch external content MUST set 'untrusted'.
export type ToolOutputTrust = 'trusted' | 'untrusted';

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly schema: FunctionSchema;
  readonly riskLevel: ToolRiskLevel;
  /**
   * Declares whether output content is safe to treat as instruction. Defaults
   * to 'trusted'. Web/file/doc fetch tools should set 'untrusted' so the
   * registry wraps the result in trust tags before returning to the agent.
   */
  readonly outputTrust?: ToolOutputTrust;
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
  /**
   * Which product surface Ava is running on ('ext' | 'ide' | 'cli' |
   * 'companion' | 'web'). Lets surface-aware tools (e.g. docs_lookup) tailor
   * answers — "that's an IDE-only feature, you're on the extension". Optional:
   * absent just means no current-surface tailoring. Mirrors the docs Surface.
   */
  surface?: 'ext' | 'ide' | 'cli' | 'companion' | 'web';
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
