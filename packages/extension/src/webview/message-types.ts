// ─── Shared type definitions ─────────────────────────────────────────────────
// Single source of truth for messages between the extension host and the
// chat webview. The webview-ui imports this file directly via a path alias
// (@ava-extension/messages) so drift is impossible.

export type ProviderSource = 'platform' | 'byok';

export type WarningLevel = 'none' | 'approaching' | 'critical' | 'exhausted';

export interface PlatformStatus {
  connected: boolean;
  tier: string | null;
  freeTokensUsed: number;
  freeTokensLimit: number;
  subTokensUsed: number;
  subTokensLimit: number | null;
  /**
   * Optional warning fields — populated by the host when platform usage is
   * approaching / at / beyond a limit. Absent on early inits and BYOK paths.
   */
  warning?: WarningLevel;
  warningPct?: number;
  warningMessage?: string;
}

// ─── Extension Host → Webview ────────────────────────────────────────────────

export type ExtToWebviewMessage =
  | {
      type: 'init';
      models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean; available: boolean }>;
      activeModel: string | null;
      needsSetup: boolean;
      consentRequired: boolean;
      locale?: string;
      localeStrings?: Record<string, string>;
      providerSource?: ProviderSource;
      platformStatus?: PlatformStatus;
      /** True when this install has never completed the first-run
       *  welcome modal. Shown once on first initialization after
       *  sign-in / setup; dismissed permanently via mark_onboarded. */
      showWelcome?: boolean;
    }
  | ({ type: 'platform_status' } & PlatformStatus)
  | { type: 'user_message_ack'; text: string; images?: string[] }
  | { type: 'stream_start' }
  /** Prep/routing status for the thinking indicator during the silent
   *  pre-stream window (classify + intent gate + routing). */
  | { type: 'progress'; labelKey: string; model?: string }
  | { type: 'thinking_delta'; content: string }
  | { type: 'stream_delta'; content: string }
  | { type: 'stream_end' }
  | {
      type: 'tool_call_start';
      toolCall: { id: string; name: string; arguments: string };
    }
  | {
      type: 'tool_call_end';
      toolCallId: string;
      result: string;
      success: boolean;
    }
  | {
      type: 'tool_confirmation_request';
      confirmationId: string;
      /**
       * Model-assigned tool_call ID. The reducer matches by this exact ID
       * so confirmation cards attach to the right tool call instance even
       * when multiple are in flight or when timing races make the broad
       * name/status match unreliable.
       */
      toolCallId?: string;
      toolName: string;
      toolCategory?: string;
      args: Record<string, unknown>;
      summary: string;
      /** The tool's own description from its schema — surfaces 'what does this actually do?' on the confirmation card. */
      toolDescription?: string;
      isAskUser?: boolean;
    }
  | {
      type: 'usage';
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cached_tokens?: number };
      /** Raw USD cost — kept for internal logging; not shown to end users. */
      cost?: number;
      contextWindow?: number;
      /** Credits charged for this turn (cache-hit discount already applied). */
      credits?: number;
    }
  | { type: 'error'; message: string; code?: string; suggestion?: string }
  | { type: 'done' }
  | { type: 'model_switched'; modelId: string; modelName: string }
  | {
      type: 'history_list';
      conversations: Array<{ id: string; title: string; updatedAt: string; pinned?: boolean }>;
    }
  | {
      type: 'history_search_results';
      conversations: Array<{ id: string; title: string; updatedAt: string; pinned?: boolean }>;
    }
  | {
      type: 'conversation_loaded';
      conversationId: string;
      title: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    }
  | { type: 'chat_cleared' }
  | { type: 'focus_input' }
  | { type: 'cloud_sync_changed'; enabled: boolean }
  | { type: 'context_usage'; used: number; limit: number; percent: number }
  | { type: 'compression_start' }
  | { type: 'compression_end'; originalTokens: number; compressedTokens: number }
  | { type: 'memory_content'; global: MemoryEntryUI[]; project: MemoryEntryUI[] }
  | { type: 'system_message'; content: string }
  | { type: 'ping' }
  | { type: 'interjection_ack'; content: string }
  | { type: 'today_tasks'; tasks: TodayTaskUI[] }
  | { type: 'all_tasks'; tasks: TodayTaskUI[] }
  | { type: 'session_tasks'; tasks: SessionTaskUI[] }
  | { type: 'ava_completed_tasks'; tasks: AvaCompletedTaskUI[] }
  | { type: 'conductor_status'; active: boolean; mode?: string }
  | { type: 'persona_status'; persona: string; phase: 'active' | 'complete' | 'error'; description?: string; output?: string; error?: string }
  | { type: 'loop_status'; kind: 'verify_started' | 'verify_passed' | 'verify_failed' | 'fresh_eyes_started' | 'fresh_eyes_complete' | 'refund_eligible'; files?: string[]; signature?: string; tokensInRecovery?: number; reason?: string }
  | { type: 'persona_tool_call'; persona: string; tool: string }
  | { type: 'persona_tool_result'; persona: string; tool: string; success: boolean }
  | { type: 'briefing'; text: string; todayTasks: number; overdueTasks: number; totalActive: number }
  // Secret vault — Ava's grant flow. The host posts a request when she calls
  // the secret_request tool; the webview shows a prompt listing vault entries
  // matching the requested label and replies with secret_grant_response.
  | {
      type: 'secret_grant_request';
      grantId: string;
      label: string;
      reason?: string;
      candidates: Array<{ id: string; label: string; provider?: string; createdAt?: string }>;
    }
  // OAuth sign-in flow (v0.37.0)
  | { type: 'sign_in_started' }
  | {
      type: 'sign_in_complete';
      account: { id: string; email?: string; name?: string; avatar_url?: string; tier?: string };
    }
  | { type: 'sign_in_failed'; error: string }
  | { type: 'sign_in_cancelled' }
  // Cloud-sync refresh responses — carry the number of entries that
  // were merged into the local store. `error` is set when the pull
  // threw (network, auth, etc); UIs should surface it distinctly
  // from a zero-count success.
  | { type: 'memories_refreshed'; global: number; project: number; error?: string }
  | { type: 'tasks_refreshed'; count: number; error?: string }
  | { type: 'journal_refreshed'; count: number; error?: string }
  | { type: 'history_refreshed'; count: number; error?: string }
  // Partial tool output chunks streamed during tool execution (bash stdout,
  // file edit diff previews, etc). Consumer appends to the matching
  // tool_call_start bubble identified by toolCallId.
  | { type: 'tool_call_partial'; toolCallId: string; data: string }
  // Secret vault prompt cleared by the host (e.g. user cancelled or a grant
  // resolved). Webview removes the active grant UI on receipt.
  | { type: 'clear_secret_grant' }
  // Secret vault entries loaded from SecretStorage on request.
  | { type: 'secrets_loaded'; secrets: Array<{ id: string; label: string; value: string }> }
  // Auto Mode — coordinator routing the task to a specific model/agent.
  | { type: 'auto_routing'; category: string; model: string; reason: string }
  // Auto Mode — spawned task agent started on the routed model.
  | { type: 'auto_agent_start'; model: string; category?: string }
  // Auto Mode — task agent finished (summary optional).
  | { type: 'auto_agent_end'; model: string; summary?: string };

/** Task entry for today panel display. */
export interface TodayTaskUI {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent' | string;
  status: 'todo' | 'in-progress' | 'done' | string;
  dueDate?: string;
  category: string;
}

/** Session task from Ava's active work. */
export interface SessionTaskUI {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | string;
}

/** Completed task from Ava's past sessions in this project. */
export interface AvaCompletedTaskUI {
  id: string;
  title: string;
  completedAt: string;
}

/** Structured memory entry for webview display. */
export interface MemoryEntryUI {
  id: string;
  category: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  lastRecalledAt: string | null;
  recallCount: number;
  tags?: string[];
  archived?: boolean;
  archivedAt?: string | null;
  branch?: string | null;
}

// ─── Webview → Extension Host ────────────────────────────────────────────────

export type AvaMode = 'code' | 'plan' | 'chat' | 'teach' | 'security' | 'brainstorm';

/**
 * Command palette — the user-aid tool categories a palette button can target.
 * A palette button fires a pre-classified intent so Ava skips intent
 * detection and goes straight to gathering the tool's fields.
 * See COMMAND_PALETTE_PLAN.md.
 */
export type PaletteTool = 'task' | 'journal' | 'memory' | 'support' | 'learning' | 'creative' | 'plans';

export type WebviewToExtMessage =
  | { type: 'send_message'; text: string; mode: AvaMode; attachments?: Array<{ type: 'image'; data: string; name: string }> }
  /**
   * Fired by a command-palette button. Carries the pre-classified intent
   * (tool + action) and the mode the input is currently in. The host turns
   * it into a directive turn — the user sees a short label, Ava receives the
   * confirmed intent. `action` is 'create' for most tools; for `creative`
   * it is one of 'image' | 'music' | 'video' | 'voice'.
   */
  | { type: 'palette_intent'; tool: PaletteTool; action: string; mode: AvaMode }
  /**
   * Sent by the error-message Retry button. Unlike send_message, the
   * extension first runs a conversation repair pass (fix orphan tool
   * pairings, prune null-content assistants) before issuing the request.
   * Without this, clicking Retry on a 400-error just re-sends the same
   * broken state and hits the same 400 again — the canonical stuck loop.
   */
  | { type: 'retry_after_error'; mode: AvaMode }
  | { type: 'tool_confirmation_response'; confirmationId: string; approved: boolean; alwaysAllowCategory?: boolean; planSelection?: string; userResponse?: string }
  | {
      type: 'secret_grant_response';
      grantId: string;
      /** When approved, the chosen vault entry's id. Empty string = denied. */
      secretId: string;
      /** When true, also persist 'always grant for this project' on the entry. */
      alwaysForProject?: boolean;
    }
  | { type: 'switch_model'; modelId: string }
  | { type: 'clear_chat' }
  | { type: 'cancel' }
  | { type: 'interrupt' }
  | { type: 'open_dashboard' }
  | { type: 'open_docs' }
  /** Fired by the webview when the first-run welcome modal is
   *  dismissed / completed. Host persists the flag in globalState so
   *  future sessions skip the modal. */
  | { type: 'mark_onboarded' }
  /** Dashboard-page deep-links triggered from the welcome modal's
   *  "Open docs" / "Creative Studio" / "Settings" shortcuts. */
  | { type: 'open_dashboard_page'; page: 'documentation' | 'creative-studio' | 'account' }
  | { type: 'request_history' }
  | { type: 'load_conversation'; conversationId: string }
  | { type: 'delete_conversation'; conversationId: string }
  | { type: 'search_history'; query: string }
  | { type: 'rename_conversation'; conversationId: string; newTitle: string }
  | { type: 'pin_conversation'; conversationId: string; pinned: boolean }
  | { type: 'export_conversation'; conversationId: string; format: 'markdown' | 'json' }
  | { type: 'new_chat' }
  | { type: 'webview_ready' }
  | { type: 'compress_context' }
  | { type: 'set_provider_source'; source: ProviderSource }
  | { type: 'set_cloud_sync'; enabled: boolean }
  | { type: 'request_memory' }
  | { type: 'save_memory'; scope: 'global' | 'project'; content: string }
  | { type: 'clear_memory'; scope: 'global' | 'project' }
  | { type: 'archive_memory'; scope: 'global' | 'project'; id: string }
  | { type: 'restore_memory'; scope: 'global' | 'project'; id: string }
  | { type: 'delete_memory_entry'; scope: 'global' | 'project'; id: string }
  // Manual cloud sync pulls — user-initiated refresh from the Sync
  // page (or a panel refresh button). Extension responds with
  // 'memories_refreshed' / 'tasks_refreshed' / 'journal_refreshed'
  // carrying the merge count.
  | { type: 'refresh_memories' }
  | { type: 'refresh_tasks' }
  | { type: 'refresh_journal' }
  | { type: 'refresh_history' }
  | { type: 'pong' }
  | { type: 'request_today_tasks' }
  | { type: 'request_all_tasks' }
  | { type: 'toggle_task'; taskId: string }
  | { type: 'rate_message'; messageId: string; rating: 'up' | 'down'; reason?: string; model?: string; mode?: string }
  | { type: 'save_secrets'; secrets: Array<{ id: string; label: string; value: string }> }
  | { type: 'accept_consent' }
  // OAuth sign-in flow (v0.37.0)
  | { type: 'start_sign_in'; method: 'github' | 'email' }
  | { type: 'cancel_sign_in' };

// ─── Webview UI state types ──────────────────────────────────────────────────
// Shapes that live entirely inside the chat webview (reducer state, bubble
// rendering). Kept here so the host can reference them where needed, but
// they never cross the postMessage boundary.

export interface ToolCallDisplay {
  id: string;
  name: string;
  arguments: string;
  status: 'pending_confirmation' | 'running' | 'success' | 'failed';
  result?: string;
  /** Live output chunks streamed via tool_call_partial (bash stdout, file edit diff previews, etc). */
  partialOutput?: string;
  confirmationId?: string;
  summary?: string;
  /** Tool's own schema description — shown beneath the summary on confirmation cards. */
  toolDescription?: string;
  isAskUser?: boolean;
}

/**
 * A single event in an assistant message's chronological timeline.
 *
 * Each turn (between two user messages) produces one assistant UIMessage.
 * That message contains an ordered array of events showing exactly what
 * happened in sequence: thinking → text → tool call → thinking → text etc.
 *
 * Consecutive events of the same kind are merged so the UI doesn't render
 * 200 individual thinking chunks — one thinking event grows as new deltas
 * arrive, and a new thinking event only starts when a non-thinking event
 * breaks the run.
 */
export type MessageEvent =
  | { kind: 'thinking'; content: string }
  | { kind: 'text'; content: string }
  | { kind: 'tool_call'; toolCall: ToolCallDisplay };

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'error' | 'system';
  /**
   * Simple text body. Used for user, system, error messages. For legacy
   * assistant messages loaded from old conversation history this may
   * hold the full concatenated text — new assistant messages use `events`.
   */
  content: string;
  /**
   * Legacy field — kept for loaded history compatibility. New assistant
   * messages from this session put thinking inside `events` as a
   * `thinking` event so it can appear chronologically interleaved with
   * text and tool calls.
   */
  thinking?: string;
  images?: string[];
  /**
   * Legacy field — kept for loaded history compatibility. New assistant
   * messages put tool calls inside `events` as `tool_call` events so
   * they render in-order in the timeline.
   */
  toolCalls: ToolCallDisplay[];
  /**
   * Canonical chronological timeline for assistant messages.
   *
   * When present, MessageBubble renders this instead of the legacy
   * content/thinking/toolCalls fields. The reducer creates one
   * assistant UIMessage per user turn and accumulates events into this
   * array as the agent streams through think → tool → text → think → ...
   *
   * Undefined for user/system/error messages (they only use `content`)
   * and for legacy assistant history messages loaded from disk before
   * this refactor (they use the legacy fields above).
   */
  events?: MessageEvent[];
  isStreaming: boolean;
  errorCode?: string;
  errorSuggestion?: string;
  timestamp?: number;
  rating?: 'up' | 'down';
  ratingReason?: string;
}

export interface ChatState {
  messages: UIMessage[];
  /**
   * ID of the assistant message currently being built in the active turn.
   * Set when the first stream_start of a turn creates the bubble, and
   * cleared on `done` so the next turn creates a fresh bubble. While set,
   * all streaming events (stream_delta, thinking_delta, tool_call_*) append
   * to this single bubble's events array instead of spawning new bubbles.
   */
  currentAssistantId: string | null;
  models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean; available: boolean }>;
  activeModel: string | null;
  isStreaming: boolean;
  isThinking: boolean;
  /** Localized prep/routing status shown in the thinking indicator while the
   *  coordinator classifies + routes (the silent pre-stream window). Cleared
   *  when real content arrives. Undefined => generic rotating "thinking…". */
  thinkingLabel?: string;
  needsSetup: boolean;
  consentRequired: boolean;
  initialized: boolean;
  /**
   * First-load gates. Both default to true on a session where the extension
   * has a platform key (account fetch + history fetch are both expected).
   * Flipped to false when each fetch resolves so the UI can drop the loading
   * banner + skeleton placeholders in one sweep when both arrive. Local-only
   * BYOK paths skip both gates by setting them false on init since there is
   * no platform fetch to wait on.
   */
  accountLoading: boolean;
  historyLoading: boolean;
  /** Sign-in state — v0.37.0 OAuth flow */
  signInPending: 'github' | 'email' | null;
  signInError: string | null;
  signInAccount: { id: string; email?: string; name?: string; avatar_url?: string; tier?: string } | null;
  /** Active secret-grant prompt (slice 2 of vault overhaul). One at a time. */
  pendingSecretGrant: {
    grantId: string;
    label: string;
    reason?: string;
    candidates: Array<{ id: string; label: string; provider?: string; createdAt?: string }>;
  } | null;
  lastUsage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
    contextWindow?: number;
  } | null;
  contextUsage: { used: number; limit: number; percent: number } | null;
  isCompressing: boolean;
  historyOpen: boolean;
  historyList: Array<{ id: string; title: string; updatedAt: string; pinned?: boolean }>;
  currentConversationId: string | null;
  /** Title of the loaded conversation — chip next to the model picker
   *  in the chat header. null on fresh chat. */
  conversationTitle: string | null;
  providerSource: ProviderSource;
  platformStatus: PlatformStatus | null;
  memoryOpen: boolean;
  memoryGlobal: MemoryEntryUI[];
  memoryProject: MemoryEntryUI[];
  tasksOpen: boolean;
  todayTasks: TodayTaskUI[];
  allTasks: TodayTaskUI[];
  sessionTasks: SessionTaskUI[];
  avaCompletedTasks: AvaCompletedTaskUI[];
  tasksPanelWidth: number;
  /** One-shot first-run banner shown after init until the user dismisses it. */
  showWelcome: boolean;
  /** True while the Conductor is orchestrating a multi-persona turn. */
  conductorActive: boolean;
  /** Optional mode label surfaced by the conductor ("work", "plan", etc). */
  conductorMode?: string | null;
  /** Per-persona state for the conductor status block. */
  activePersonas: Array<{
    id: string;
    phase: 'active' | 'complete' | 'error';
    description?: string;
    output?: string;
    error?: string;
    tools?: Array<{ name: string; done: boolean; success?: boolean }>;
  }>;
  /** Running total of credits consumed in the current session (UI display only). */
  sessionCredits?: number;
}
