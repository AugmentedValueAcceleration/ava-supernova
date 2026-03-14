// ─── Shared Types ────────────────────────────────────────────────────────────

export type ProviderSource = 'platform' | 'byok';

export interface PlatformStatus {
  connected: boolean;
  tier: string | null;
  freeTokensUsed: number;
  freeTokensLimit: number;
  subTokensUsed: number;
  subTokensLimit: number | null;
  claudeTokensUsed: number;
  claudeTokensLimit: number | null;
}

// ─── Extension Host → Webview ────────────────────────────────────────────────

export type ExtToWebviewMessage =
  | {
      type: 'init';
      models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean; available: boolean }>;
      activeModel: string | null;
      needsSetup: boolean;
      locale?: string;
      localeStrings?: Record<string, string>;
      providerSource?: ProviderSource;
      platformStatus?: PlatformStatus;
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
  | { type: 'today_tasks'; tasks: Array<{ id: string; title: string; priority: string; status: string; dueDate?: string; category: string }> }
  | { type: 'session_tasks'; tasks: Array<{ id: string; title: string; status: string }> }
  | { type: 'ava_completed_tasks'; tasks: Array<{ id: string; title: string; completedAt: string }> };

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

export type AvaMode = 'code' | 'plan' | 'chat' | 'security';

export type WebviewToExtMessage =
  | { type: 'send_message'; text: string; mode: AvaMode; attachments?: Array<{ type: 'image'; data: string; name: string }> }
  | { type: 'tool_confirmation_response'; confirmationId: string; approved: boolean; alwaysAllow?: boolean; allowAll?: boolean; planSelection?: string; userResponse?: string }
  | { type: 'switch_model'; modelId: string }
  | { type: 'clear_chat' }
  | { type: 'cancel' }
  | { type: 'open_dashboard' }
  | { type: 'open_docs' }
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
  | { type: 'toggle_task'; taskId: string };
