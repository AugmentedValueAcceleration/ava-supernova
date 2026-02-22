import type { Provider, ChatCompletionRequest, ToolSchema } from '../providers/types.js';
import type {
  Message,
  AssistantMessage,
  ToolCall,
  ModelDefinition,
  TokenUsage,
} from '../core/types.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ToolExecutionContext } from '../tools/types.js';
import { MAX_TOOL_CALL_ITERATIONS } from '../core/constants.js';

// ─── Event system ────────────────────────────────────────────────────────────

export type AgentEvent =
  | { type: 'stream_start' }
  | { type: 'stream_delta'; content: string }
  | { type: 'stream_end'; message: AssistantMessage }
  | { type: 'tool_call_start'; toolCall: ToolCall }
  | { type: 'tool_call_end'; toolCall: ToolCall; result: string; success: boolean; metadata?: Record<string, unknown> }
  | { type: 'usage'; usage: TokenUsage; cost?: number }
  | { type: 'error'; error: Error }
  | { type: 'done'; finalMessage: AssistantMessage };

export type AgentEventHandler = (event: AgentEvent) => void;

// ─── Agent ───────────────────────────────────────────────────────────────────

export class Agent {
  private readonly provider: Provider;
  private readonly model: ModelDefinition;
  private readonly toolRegistry: ToolRegistry;
  private readonly toolContext: ToolExecutionContext;

  constructor(opts: {
    provider: Provider;
    model: ModelDefinition;
    toolRegistry: ToolRegistry;
    cwd: string;
  }) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.toolRegistry = opts.toolRegistry;
    this.toolContext = { cwd: opts.cwd };
  }

  async run(messages: Message[], onEvent: AgentEventHandler): Promise<Message[]> {
    const toolSchemas: ToolSchema[] = this.model.supportsToolCalls
      ? this.toolRegistry.getSchemas()
      : [];

    let iterations = 0;

    while (iterations < MAX_TOOL_CALL_ITERATIONS) {
      iterations++;

      // Auto-truncate to fit context window (reserve 20% for output)
      const maxInputTokens = Math.floor(this.model.contextWindow * 0.8);
      messages = this.truncateMessages(messages, maxInputTokens);

      const request: ChatCompletionRequest = {
        model: this.model.id,
        messages,
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
        tool_choice: toolSchemas.length > 0 ? 'auto' : undefined,
        stream: true,
      };

      const assistantMessage = await this.streamResponse(request, onEvent);
      messages = [...messages, assistantMessage];

      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        onEvent({ type: 'done', finalMessage: assistantMessage });
        return messages;
      }

      for (const toolCall of assistantMessage.tool_calls) {
        onEvent({ type: 'tool_call_start', toolCall });

        let parsedArgs: Record<string, unknown>;
        try {
          parsedArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          parsedArgs = {};
        }

        const result = await this.toolRegistry.execute(
          toolCall.function.name,
          parsedArgs,
          this.toolContext,
        );

        onEvent({
          type: 'tool_call_end',
          toolCall,
          result: result.output,
          success: result.success,
          metadata: result.metadata,
        });

        messages = [
          ...messages,
          {
            role: 'tool' as const,
            tool_call_id: toolCall.id,
            content: result.output,
          },
        ];
      }
    }

    onEvent({
      type: 'error',
      error: new Error(`Agent loop exceeded ${MAX_TOOL_CALL_ITERATIONS} iterations`),
    });
    return messages;
  }

  private async streamResponse(
    request: ChatCompletionRequest,
    onEvent: AgentEventHandler,
  ): Promise<AssistantMessage> {
    onEvent({ type: 'stream_start' });

    let content = '';
    let usage: TokenUsage | undefined;
    const toolCallsAccumulator = new Map<
      number,
      {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }
    >();

    for await (const chunk of this.provider.createStreamingCompletion(request)) {
      if (chunk.usage) {
        usage = chunk.usage;
      }

      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        onEvent({ type: 'stream_delta', content: delta.content });
      }

      if (delta.tool_calls) {
        for (const tcDelta of delta.tool_calls) {
          if (!toolCallsAccumulator.has(tcDelta.index)) {
            toolCallsAccumulator.set(tcDelta.index, {
              id: tcDelta.id ?? '',
              type: 'function',
              function: { name: '', arguments: '' },
            });
          }
          const acc = toolCallsAccumulator.get(tcDelta.index)!;
          if (tcDelta.id) acc.id = tcDelta.id;
          if (tcDelta.function?.name) acc.function.name += tcDelta.function.name;
          if (tcDelta.function?.arguments) acc.function.arguments += tcDelta.function.arguments;
        }
      }
    }

    const toolCalls: ToolCall[] =
      toolCallsAccumulator.size > 0 ? Array.from(toolCallsAccumulator.values()) : [];

    const message: AssistantMessage = {
      role: 'assistant',
      content: content || null,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    };

    onEvent({ type: 'stream_end', message });

    if (usage) {
      let cost: number | undefined;
      if (this.model.pricing) {
        cost =
          (usage.prompt_tokens / 1_000_000) * this.model.pricing.inputPerMillion +
          (usage.completion_tokens / 1_000_000) * this.model.pricing.outputPerMillion;
      }
      onEvent({ type: 'usage', usage, cost });
    }

    return message;
  }

  private truncateMessages(messages: Message[], maxTokens: number): Message[] {
    const estimateTokens = (msg: Message): number => {
      const content = msg.content ?? '';
      return Math.ceil(content.length / 4) + 4;
    };

    const total = messages.reduce((sum, m) => sum + estimateTokens(m), 0);
    if (total <= maxTokens) return messages;

    // Keep system prompt (first message) and trim from the beginning of the rest
    const systemMsg = messages[0]?.role === 'system' ? messages[0] : null;
    const rest = systemMsg ? messages.slice(1) : [...messages];
    const systemTokens = systemMsg ? estimateTokens(systemMsg) : 0;
    const budget = maxTokens - systemTokens;

    const kept: Message[] = [];
    let used = 0;

    for (let i = rest.length - 1; i >= 0; i--) {
      const msgTokens = estimateTokens(rest[i]);
      if (used + msgTokens > budget) break;
      kept.unshift(rest[i]);
      used += msgTokens;
    }

    return systemMsg ? [systemMsg, ...kept] : kept;
  }
}
