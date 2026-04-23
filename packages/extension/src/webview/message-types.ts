// ─── Shared Types ────────────────────────────────────────────────────────────

export type ProviderSource = 'platform' | 'byok';

export type WarningLevel = 'none' | 'approaching' | 'critical' | 'exhausted';

export interface PlatformStatus {
  connected: boolean;
  tier: string | null;
  freeTokensUsed: number;
  freeTokensLimit: number;
  subTokensUsed: number;
  subTokensLimit: number | null;
  warning: WarningLevel;
  warningPct: number;
  warningMessage: string;
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
  | { type: 'context_usage'; used: number; limit: number; percent: number }
  | { type: 'compression_start' }
  | { type: 'compression_end'; originalTokens: number; compressedTokens: number }
  | { type: 'memory_content'; global: MemoryEntryUI[]; project: MemoryEntryUI[] }
  | { type: 'system_message'; content: string }
  | { type: 'ping' }
  | { type: 'interjection_ack'; content: string }
  | { type: 'today_tasks'; tasks: Array<{ id: string; title: string; priority: string; status: string; dueDate?: string; category: string }> }
  | { type: 'all_tasks'; tasks: Array<{ id: string; title: string; priority: string; status: string; dueDate?: string; category: string }> }
  | { type: 'session_tasks'; tasks: Array<{ id: string; title: string; status: string }> }
  | { type: 'ava_completed_tasks'; tasks: Array<{ id: string; title: string; completedAt: string }> }
  | { type: 'conductor_status'; active: boolean; mode?: string }
  | { type: 'persona_status'; persona: string; phase: 'active' | 'complete' | 'error'; description?: string; output?: string }
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
  | { type: 'history_refreshed'; count: number; error?: string };

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

export type WebviewToExtMessage =
  | { type: 'send_message'; text: string; mode: AvaMode; attachments?: Array<{ type: 'image'; data: string; name: string }> }
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
  | { type: 'accept_consent' }
  // OAuth sign-in flow (v0.37.0)
  | { type: 'start_sign_in'; method: 'github' | 'email' }
  | { type: 'cancel_sign_in' };
