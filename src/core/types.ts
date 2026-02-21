// ─── Message Types ───────────────────────────────────────────────────────────

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: ToolCallFunction;
}

export interface BaseMessage {
  role: MessageRole;
  content: string | null;
}

export interface SystemMessage extends BaseMessage {
  role: 'system';
  content: string;
}

export interface UserMessage extends BaseMessage {
  role: 'user';
  content: string;
}

export interface AssistantMessage extends BaseMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface ToolMessage extends BaseMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

// ─── Streaming Types ─────────────────────────────────────────────────────────

export interface StreamDelta {
  role?: 'assistant';
  content?: string | null;
  tool_calls?: StreamToolCallDelta[];
}

export interface StreamToolCallDelta {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface StreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: StreamDelta;
    finish_reason: string | null;
  }>;
}

// ─── Completion Response (non-streaming) ─────────────────────────────────────

export interface CompletionChoice {
  index: number;
  message: AssistantMessage;
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface CompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: CompletionChoice[];
  usage: TokenUsage;
}

// ─── Model Definition ────────────────────────────────────────────────────────

export interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsToolCalls: boolean;
  supportsStreaming: boolean;
  supportsThinking?: boolean;
}
