// Shared message types — mirrors the extension host definitions

export type ExtToWebviewMessage =
  | {
      type: 'init';
      models: Array<{ id: string; name: string; provider: string }>;
      activeModel: string | null;
      needsSetup: boolean;
    }
  | { type: 'user_message_ack'; text: string }
  | { type: 'stream_start' }
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
    }
  | {
      type: 'usage';
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      cost?: number;
    }
  | { type: 'error'; message: string }
  | { type: 'done' }
  | { type: 'model_switched'; modelId: string; modelName: string };

export type WebviewToExtMessage =
  | { type: 'send_message'; text: string }
  | { type: 'tool_confirmation_response'; confirmationId: string; approved: boolean }
  | { type: 'switch_model'; modelId: string }
  | { type: 'clear_chat' }
  | { type: 'cancel' }
  | { type: 'webview_ready' };

// UI state types

export interface ToolCallDisplay {
  id: string;
  name: string;
  arguments: string;
  status: 'pending_confirmation' | 'running' | 'success' | 'failed';
  result?: string;
  confirmationId?: string;
  summary?: string;
}

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  toolCalls: ToolCallDisplay[];
  isStreaming: boolean;
}

export interface ChatState {
  messages: UIMessage[];
  models: Array<{ id: string; name: string; provider: string }>;
  activeModel: string | null;
  isStreaming: boolean;
  isThinking: boolean;
  needsSetup: boolean;
  lastUsage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
  } | null;
}
