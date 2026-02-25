// Shared message types — mirrors the extension host definitions

export type ExtToWebviewMessage =
  | {
      type: 'init';
      models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean }>;
      activeModel: string | null;
      needsSetup: boolean;
      locale?: string;
      localeStrings?: Record<string, string>;
    }
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
  | { type: 'compression_start' }
  | { type: 'compression_end'; originalTokens: number; compressedTokens: number };

export type AvaMode = 'code' | 'plan' | 'chat';

export type WebviewToExtMessage =
  | { type: 'send_message'; text: string; mode: AvaMode; attachments?: Array<{ type: 'image'; data: string; name: string }> }
  | { type: 'tool_confirmation_response'; confirmationId: string; approved: boolean; alwaysAllow?: boolean; allowAll?: boolean; planSelection?: string; userResponse?: string }
  | { type: 'switch_model'; modelId: string }
  | { type: 'clear_chat' }
  | { type: 'cancel' }
  | { type: 'open_dashboard' }
  | { type: 'request_history' }
  | { type: 'load_conversation'; conversationId: string }
  | { type: 'delete_conversation'; conversationId: string }
  | { type: 'search_history'; query: string }
  | { type: 'rename_conversation'; conversationId: string; newTitle: string }
  | { type: 'pin_conversation'; conversationId: string; pinned: boolean }
  | { type: 'export_conversation'; conversationId: string; format: 'markdown' | 'json' }
  | { type: 'new_chat' }
  | { type: 'webview_ready' }
  | { type: 'compress_context' };

// UI state types

export interface ToolCallDisplay {
  id: string;
  name: string;
  arguments: string;
  status: 'pending_confirmation' | 'running' | 'success' | 'failed';
  result?: string;
  confirmationId?: string;
  summary?: string;
  isAskUser?: boolean;
}

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'error' | 'system';
  content: string;
  thinking?: string;
  images?: string[];
  toolCalls: ToolCallDisplay[];
  isStreaming: boolean;
  errorCode?: string;
  errorSuggestion?: string;
}

export interface ChatState {
  messages: UIMessage[];
  models: Array<{ id: string; name: string; provider: string; supportsVision?: boolean }>;
  activeModel: string | null;
  isStreaming: boolean;
  isThinking: boolean;
  needsSetup: boolean;
  lastUsage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
    contextWindow?: number;
  } | null;
  isCompressing: boolean;
  historyOpen: boolean;
  historyList: Array<{ id: string; title: string; updatedAt: string; pinned?: boolean }>;
  currentConversationId: string | null;
}
