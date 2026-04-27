// Audit log — every tool call Ava makes, persisted locally so users
// can audit what an autonomous agent did on their machine. Shared
// across extension + IDE via @ava/core/audit; both surfaces append
// to the same on-disk log at ~/.ava/audit-log.jsonl.
//
// Why JSONL not JSON: append-only writes are O(1) and we can stream
// in older entries without parsing the whole file. A single-blob JSON
// would force a read+parse+rewrite on every tool call which gets
// slow fast on a long session.

/** A single audited tool call. The shape extends the existing in-memory
 *  audit shape used by extension/AvaViewProvider + ide/sidecar so an
 *  in-place migration to persistent storage doesn't break anything
 *  that already writes entries. */
export interface AuditEntry {
  /** ISO 8601 timestamp of when the tool call started. */
  timestamp: string;
  /** Tool name as registered (file_read, bash, web_search, generate_image, etc.) */
  toolName: string;
  /** Coarse grouping for filter UIs. Comes from the tool registry. */
  category: string;
  /** safe / write / dangerous — drives the colour chip in the audit row. */
  riskLevel: string;
  /** auto / first-time / user-approved / denied — explains how the call passed the gate. */
  approvalMethod: string;
  /** success / failed / denied. */
  status: string;
  /** Short human-readable summary of the args (e.g. "wrote 4.2KB to /src/foo.ts"). */
  argsSummary: string;
  /** Full structured args — only included when the user expands the row. */
  fullArgs?: Record<string, unknown>;
  /** Tool result — truncated to a sensible length to keep the log
   *  bounded. Full result still lives in the conversation history. */
  result?: string;
  /** Cost of this tool call. Filled in client-side when known —
   *  platform users see credits (via creditsForTurn for chat-style
   *  tools) and BYOK users see the underlying provider cost in USD
   *  estimated from token counts. */
  cost?: AuditCost;
  /** Optional link back to the conversation + message that triggered
   *  this call. Lets the audit row jump back to the chat where it
   *  happened. Filled when the surface knows the IDs; absent for
   *  legacy entries. */
  conversationId?: string;
  messageId?: string;
  /** For file-mutation tools (file_write, file_edit), captures enough
   *  state to verify the on-disk effect after the fact: short git SHA at
   *  start of tool call, target path, and content hashes before/after.
   *  Lets a user reconstruct "what changed" from the audit log alone
   *  without relying on the truncated `result` field. Absent for
   *  non-mutation tools. */
  fileMutation?: {
    path: string;
    gitSha?: string;       // short hash from git rev-parse HEAD at tool start
    bytesBefore?: number;
    bytesAfter?: number;
    sha256Before?: string; // sha256 of the file content before the change
    sha256After?: string;  // sha256 after
  };
}

export interface AuditCost {
  /** Which billing model this entry is on. */
  mode: 'platform' | 'byok';
  /** Credits charged (platform users only). */
  credits?: number;
  /** Estimated USD cost (BYOK users only — based on provider rate cards). */
  usd?: number;
  /** Underlying token counts so the receipt is auditable. */
  tokens?: { input: number; output: number };
  /** Provider key for BYOK cost attribution ('deepseek', 'kimi', etc.). */
  provider?: string;
  /** Model id used for this call (drives the per-model cost rate). */
  model?: string;
}

/** Filter applied when querying the persistent log. All fields optional;
 *  empty filter returns the full corpus. Used by both UI search panels
 *  + the export bundler. */
export interface AuditFilter {
  /** ISO date strings, inclusive. */
  since?: string;
  until?: string;
  /** Substring match against toolName (case-insensitive). */
  toolName?: string;
  /** Exact category match. */
  category?: string;
  /** Risk level filter. */
  riskLevel?: 'safe' | 'write' | 'dangerous';
  /** Status filter. */
  status?: 'success' | 'failed' | 'denied';
  /** Maximum number of entries to return — newest first. */
  limit?: number;
}
