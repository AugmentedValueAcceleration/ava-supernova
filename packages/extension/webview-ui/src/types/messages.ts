// Shared message types — mirrors the extension host definitions

export type ProviderSource = 'platform' | 'byok';

export interface PlatformStatus {
  connected: boolean;
  tier: string | null;
  freeTokensUsed: number;
  freeTokensLimit: number;
  subTokensUsed: number;
  subTokensLimit: number | null;
}

export type ExtToWebviewMessage =
  | {
      type: 'init';
      models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean; available: boolean }>;
      activeModel: string | null;
      needsSetup: boolean;
      consentRequired?: boolean;
      locale?: string;
      localeStrings?: Record<string, string>;
      providerSource?: ProviderSource;
      platformStatus?: PlatformStatus;
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
      /**
       * Model-assigned tool_call ID. The reducer matches by this exact ID
       * so confirmation cards attach to the right tool call instance even
       * when multiple are in flight or when timing races make the broad
       * name/status match unreliable.
       */
      toolCallId?: string;
      toolName: string;
      args: Record<string, unknown>;
      summary: string;
      isAskUser?: boolean;
    }
  | {
      type: 'usage';
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      cost?: number;
      contextWindow?: number;
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
  | { type: 'persona_status'; persona: string; phase: 'active' | 'complete' | 'error'; description?: string; output?: string }
  | { type: 'persona_tool_call'; persona: string; tool: string }
  | { type: 'persona_tool_result'; persona: string; tool: string; success: boolean }
  | { type: 'briefing'; text: string; todayTasks: number; overdueTasks: number; totalActive: number };

/** Task entry for today panel display. */
export interface TodayTaskUI {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in-progress' | 'done';
  dueDate?: string;
  category: string;
}

/** Session task from Ava's active work. */
export interface SessionTaskUI {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
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

export type AvaMode = 'code' | 'plan' | 'chat' | 'teach' | 'security' | 'brainstorm';

export type WebviewToExtMessage =
  | { type: 'send_message'; text: string; mode: AvaMode; attachments?: Array<{ type: 'image'; data: string; name: string }> }
  | { type: 'tool_confirmation_response'; confirmationId: string; approved: boolean; alwaysAllowCategory?: boolean; planSelection?: string; userResponse?: string }
  | { type: 'switch_model'; modelId: string }
  | { type: 'clear_chat' }
  | { type: 'cancel' }
  | { type: 'interrupt' }
  | { type: 'open_dashboard' }
  | { type: 'open_docs' }
  | { type: 'mark_onboarded' }
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
  | { type: 'pong' }
  | { type: 'request_today_tasks' }
  | { type: 'request_all_tasks' }
  | { type: 'toggle_task'; taskId: string }
  | { type: 'rate_message'; messageId: string; rating: 'up' | 'down'; reason?: string; model?: string; mode?: string }
  | { type: 'save_secrets'; secrets: Array<{ id: string; label: string; value: string }> }
  | { type: 'accept_consent' };

// UI state types

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

/** Helper: get all visible text from an assistant message (for copy, rating, etc). */
export function getMessageText(msg: UIMessage): string {
  if (msg.events) {
    return msg.events
      .filter((e): e is Extract<MessageEvent, { kind: 'text' }> => e.kind === 'text')
      .map((e) => e.content)
      .join('');
  }
  return msg.content || '';
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
  needsSetup: boolean;
  consentRequired: boolean;
  initialized: boolean;
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
  providerSource: ProviderSource;
  platformStatus: {
    connected: boolean;
    tier: string | null;
    freeTokensUsed: number;
    freeTokensLimit: number;
    subTokensUsed: number;
    subTokensLimit: number | null;
  } | null;
  memoryOpen: boolean;
  memoryGlobal: MemoryEntryUI[];
  memoryProject: MemoryEntryUI[];
  tasksOpen: boolean;
  todayTasks: TodayTaskUI[];
  allTasks: TodayTaskUI[];
  sessionTasks: SessionTaskUI[];
  avaCompletedTasks: AvaCompletedTaskUI[];
  tasksPanelWidth: number;
}
