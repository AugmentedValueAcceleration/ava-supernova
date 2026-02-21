import type { Provider, ChatCompletionRequest, ToolSchema } from '../providers/types.js';
import type {
  Message,
  AssistantMessage,
  ToolCall,
  ModelDefinition,
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
  | { type: 'tool_call_end'; toolCall: ToolCall; result: string; success: boolean }
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
    const toolCallsAccumulator = new Map<
      number,
      {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }
    >();

    for await (const chunk of this.provider.createStreamingCompletion(request)) {
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
    return message;
  }
}
