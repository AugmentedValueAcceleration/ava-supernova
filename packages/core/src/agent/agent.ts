import type { Provider, ChatCompletionRequest, ToolSchema } from '../providers/types.js';
import type {
  Message,
  AssistantMessage,
  ToolCall,
  ModelDefinition,
  TokenUsage,
  ContentPart,
} from '../core/types.js';
import { getTextContent } from '../core/types.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ToolExecutionContext } from '../tools/types.js';
import { MAX_TOOL_CALL_ITERATIONS, ITERATION_WARNING_THRESHOLD } from '../core/constants.js';
import { t } from '../i18n/index.js';
import { logger } from '../core/logger.js';
import { buildToolPrompt, parseToolCalls, formatToolResult } from './text-tool-parser.js';
import { autoExtractAndSave, reflectAndSave } from '../memory/auto-extract.js';
import { trackAndLearn } from '../memory/patterns.js';
import { analyseAndSave } from '../memory/insights.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import { captureInteraction } from '../dataset/capture.js';

// ─── Mode-aware tool filtering ──────────────────────────────────────────────
// When a non-work mode is active, restrict the tool schema sent to the model
// so it can only call tools listed in that mode's system prompt.
// Without this, the model sees all tools in the schema and ignores text restrictions.

const MODE_ALLOWED_TOOLS: Record<string, Set<string>> = {
  plan: new Set([
    'file_read', 'glob', 'grep', 'list_directory', 'find_symbol', 'project_index',
    'web_search', 'memory_save', 'memory_recall', 'present_plan', 'analyze_architecture',
    'ask_user', 'get_datetime', 'detect_language', 'docs_lookup', 'self_inspect',
    'switch_mode',
  ]),
  chat: new Set([
    'web_search', 'memory_save', 'memory_recall', 'memory_update', 'journal_write',
    'get_datetime', 'weather', 'news', 'ask_user',
    'switch_mode',
  ]),
  brainstorm: new Set([
    'web_search', 'memory_save', 'memory_recall', 'present_plan', 'journal_write',
    'ask_user', 'get_datetime',
    'switch_mode',
  ]),
  teach: new Set([
    'file_read', 'glob', 'grep', 'list_directory', 'find_symbol', 'project_index',
    'web_search', 'memory_save', 'memory_recall', 'bash', 'ask_user',
    'get_datetime', 'detect_language', 'learning_create', 'learning_teach', 'learning_progress',
    'switch_mode',
  ]),
  security: new Set([
    'file_read', 'glob', 'grep', 'list_directory', 'find_symbol', 'project_index',
    'bash', 'git_status', 'git_diff', 'web_search', 'analyze_architecture',
    'audit_dependencies', 'security', 'debug_logs', 'memory_save', 'memory_recall',
    'test_run', 'ask_user',
    'switch_mode',
  ]),
};

function detectModeFromMessages(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'user') continue;
    const text = getTextContent(msg.content);
    if (text.startsWith('[Internal Planning')) continue;
    if (text.startsWith('[Plan Mode]')) return 'plan';
    if (text.startsWith('[Chat Mode]')) return 'chat';
    if (text.startsWith('[Brainstorm Mode]')) return 'brainstorm';
    break;
  }
  return null;
}

// ─── Event system ────────────────────────────────────────────────────────────

export interface ContextUsage {
  used: number;
  limit: number;
  percent: number;
}

export type AgentEvent =
  | { type: 'stream_start' }
  | { type: 'thinking_delta'; content: string }
  | { type: 'stream_delta'; content: string }
  | { type: 'stream_end'; message: AssistantMessage }
  | { type: 'tool_call_start'; toolCall: ToolCall }
  | { type: 'tool_call_partial'; toolCallId: string; data: string }
  | { type: 'tool_call_end'; toolCall: ToolCall; result: string; success: boolean; metadata?: Record<string, unknown> }
  | { type: 'usage'; usage: TokenUsage; cost?: number }
  | { type: 'error'; error: Error }
  | { type: 'context_usage'; context: ContextUsage }
  | { type: 'context_compression_start' }
  | { type: 'context_compression_end'; originalTokens: number; compressedTokens: number }
  | { type: 'context_truncated'; droppedCount: number }
  | { type: 'interjection'; content: string }
  | { type: 'done'; finalMessage: AssistantMessage }
  // Auto Mode events — emitted by AutoCoordinator
  | { type: 'auto_routing'; category: string; model: string; reason: string }
  | { type: 'auto_agent_start'; model: string; category: string }
  | { type: 'auto_agent_end'; model: string; summary?: string };

export type AgentEventHandler = (event: AgentEvent) => void;

// ─── Agent ───────────────────────────────────────────────────────────────────

export class Agent {
  private readonly provider: Provider;
  private readonly model: ModelDefinition;
  private readonly toolRegistry: ToolRegistry;
  private readonly toolContext: ToolExecutionContext;
  private readonly pendingInterjections: string[] = [];
  private _inThinkTag = false;

  constructor(opts: {
    provider: Provider;
    model: ModelDefinition;
    toolRegistry: ToolRegistry;
    cwd: string;
    sharedState?: Record<string, unknown>;
  }) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.toolRegistry = opts.toolRegistry;
    this.toolContext = {
      cwd: opts.cwd,
      sharedState: opts.sharedState,
    };
  }

  /**
   * Update the working directory used by all tool executions.
   * Called when the user opens a different project folder mid-session.
   */
  setCwd(cwd: string): void {
    (this.toolContext as { cwd: string }).cwd = cwd;
  }

  /**
   * Inject a user message mid-run. The message will be appended to the
   * conversation between the current and next agent iteration, allowing
   * the user to steer, add context, or redirect without cancelling.
   */
  inject(message: string): void {
    this.pendingInterjections.push(message);
  }

  async run(messages: Message[], onEvent: AgentEventHandler, signal?: AbortSignal): Promise<Message[]> {
    const useNativeTools = this.model.supportsToolCalls !== false;
    const allSchemas = this.toolRegistry.getSchemas();

    // Mode-aware filtering: restrict tool schemas to only those allowed in the active mode
    const detectedMode = detectModeFromMessages(messages);
    const modeAllowed = detectedMode ? MODE_ALLOWED_TOOLS[detectedMode] : null;
    const filteredSchemas = modeAllowed
      ? allSchemas.filter(s => modeAllowed.has(s.function.name))
      : allSchemas;

    const toolSchemas: ToolSchema[] = useNativeTools ? filteredSchemas : [];
    logger.debug(`[agent] Starting run: model=${this.model.id} supportsToolCalls=${useNativeTools} toolSchemas=${toolSchemas.length}${detectedMode ? ` mode=${detectedMode}` : ''}`);

    // For models without native tool_calls, inject tool descriptions into the system prompt
    if (!useNativeTools && filteredSchemas.length > 0) {
      const toolPrompt = buildToolPrompt(filteredSchemas);
      const firstMsg = messages[0];
      if (firstMsg?.role === 'system') {
        messages = [
          { ...firstMsg, content: firstMsg.content + '\n\n' + toolPrompt },
          ...messages.slice(1),
        ];
      } else {
        messages = [
          { role: 'system' as const, content: toolPrompt },
          ...messages,
        ];
      }
    }

    // Pass signal to tool execution context so tools (esp. bash) can be cancelled
    const runContext = { ...this.toolContext, signal };

    let iterations = 0;
    this._inThinkTag = false;
    let warningInjected = false;
    let lastToolName: string | null = null;
    let repeatCount = 0;
    const MAX_SAME_TOOL_REPEATS = 3;

    while (iterations < MAX_TOOL_CALL_ITERATIONS) {
      iterations++;
      logger.debug(`[agent] ── Iteration ${iterations}/${MAX_TOOL_CALL_ITERATIONS} ── messages=${messages.length}`);

      // ── Sliding Window — compress old messages to memory ─────────────────
      // Keep context lean by saving older exchanges to project memory and
      // removing them from the conversation. The model always has recent
      // context + can recall older work via memory_recall.
      const WINDOW_MAX = 30; // Max non-system messages before compression
      const WINDOW_KEEP = 16; // Messages to keep after compression
      const nonSystem = messages.filter(m => m.role !== 'system');
      if (nonSystem.length > WINDOW_MAX) {
        const systemMsgs = messages.filter(m => m.role === 'system');
        const toCompress = nonSystem.slice(0, nonSystem.length - WINDOW_KEEP);
        const toKeep = nonSystem.slice(nonSystem.length - WINDOW_KEEP);

        // Summarise what's being compressed
        const summary = toCompress
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => {
            const content = typeof m.content === 'string' ? m.content : '';
            return `[${m.role}]: ${content.slice(0, 200)}`;
          })
          .join('\n');

        // Extract memories from messages being compressed BEFORE they're dropped
        // Layer 1 (regex patterns) catches preferences, corrections, decisions
        const mm = (this.toolContext.sharedState as Record<string, unknown> | undefined)?.memoryManager as
          | { saveEntry: (opts: { scope: string; content: string; category: string; tags?: string[] }) => Promise<unknown> }
          | undefined;
        try {
          const { autoExtractAndSave } = await import('../memory/auto-extract.js');
          if (mm) {
            await autoExtractAndSave(toCompress, mm as any);
          }
        } catch { /* non-critical */ }

        // Also save the raw summary as project context
        if (summary.length > 20 && mm?.saveEntry) {
          try {
            await mm.saveEntry({
              scope: 'project',
              content: `[Session context] ${summary.slice(0, 2000)}`,
              category: 'general',
              tags: ['session-context'],
            });
          } catch { /* non-critical */ }
        }

        // Rebuild messages: system (with compression note merged in) + recent messages
        // Merging into the first system message avoids Qwen's "system must be at beginning" error
        const fixedKeep = this.fixToolPairing(toKeep);
        const compressionNote = [
          `[${toCompress.length} earlier messages compressed to memory.]`,
          'Your memory system has saved the important context from those messages.',
          'If the user references something from earlier in the conversation, use memory_recall to retrieve it.',
          'Do NOT say you don\'t have context — check memory first.',
        ].join(' ');

        if (systemMsgs.length > 0) {
          const primary = systemMsgs[0];
          const mergedSystem = { ...primary, content: (typeof primary.content === 'string' ? primary.content : '') + '\n\n' + compressionNote };
          messages = [mergedSystem, ...fixedKeep];
        } else {
          messages = [
            { role: 'system' as const, content: compressionNote },
            ...fixedKeep,
          ];
        }

        // Notify UI about compression (uses 'info' event type)
        logger.debug(`[agent] Sliding window: compressed ${toCompress.length} messages, kept ${fixedKeep.length}`);
      }

      // Check for cancellation before each iteration
      if (signal?.aborted) {
        onEvent({ type: 'done', finalMessage: { role: 'assistant', content: null } });
        return messages;
      }

      // Check for user interjections — messages injected mid-run
      while (this.pendingInterjections.length > 0) {
        const interjection = this.pendingInterjections.shift()!;
        messages = [
          ...messages,
          { role: 'user' as const, content: `[User interjection]: ${interjection}` },
        ];
        onEvent({ type: 'interjection', content: interjection });
      }

      iterations++;

      // Warn the model when approaching the iteration limit
      // Injected as a user-role message to avoid Qwen's "system must be at beginning" error
      const remaining = MAX_TOOL_CALL_ITERATIONS - iterations;
      if (!warningInjected && remaining <= ITERATION_WARNING_THRESHOLD) {
        warningInjected = true;
        messages = [
          ...messages,
          {
            role: 'user' as const,
            content: `[System notice]: ${t('error.msg.iteration_warning', { remaining: String(remaining) })}`,
          },
        ];
      }

      // Trim old tool results to save tokens — after 4 messages, collapse to summary
      messages = this.trimOldToolResults(messages);

      // Auto-truncate to fit context window (reserve 30% for output + safety margin)
      // The 30% buffer accounts for: model output tokens, estimation inaccuracy,
      // and tool call overhead that's hard to predict.
      const maxInputTokens = Math.floor(this.model.contextWindow * 0.7);
      const estimatedTotal = this.estimateTokenCount(messages);

      // Emit context usage so UIs can show a progress bar
      const contextPercent = Math.round((estimatedTotal / this.model.contextWindow) * 100);
      onEvent({
        type: 'context_usage',
        context: { used: estimatedTotal, limit: this.model.contextWindow, percent: contextPercent },
      });

      // Auto-compress at 70% of context window — proportional to model, no hard cap
      if (estimatedTotal > maxInputTokens && messages.length >= 6) {
        messages = await this.compressContext(messages, onEvent, signal);
      }

      // Still over budget? Fall back to truncation — emit warning instead of silent drop
      const preCount = messages.length;
      messages = this.truncateMessages(messages, maxInputTokens);
      const dropped = preCount - messages.length;
      if (dropped > 0) {
        onEvent({
          type: 'error',
          error: Object.assign(
            new Error(`Context window full — ${dropped} older messages were compressed away. Consider starting a new chat for best results.`),
            { code: 'context_compressed' },
          ),
        });
      }

      // ── Sanitize messages for model compatibility ──────────────────────────
      const filteredMessages = !useNativeTools
        ? messages.filter((m) => m.role !== 'tool')  // Drop any stray tool messages in text mode
        : messages;
      let sanitizedMessages = filteredMessages.map((m) => {
        let msg = m;

        // Strip image_url parts for non-vision models (DeepSeek, Mistral Codestral, etc.)
        // The image stays in local history so vision-capable models can still see it.
        if (!this.model.supportsVision && Array.isArray(msg.content)) {
          const textParts = (msg.content as ContentPart[]).filter((p) => p.type === 'text');
          const visionNote = [
            `Your current model (${this.model.name || this.model.id}) doesn't support images.`,
            'To analyse images, switch to one of these vision-capable models:',
            '- Qwen 3.6 Plus (best quality, 1M context)',
            '- Qwen 3.5 Plus (1M context)',
            '- Qwen 3.5 Omni Plus (multimodal)',
            '- Qwen Omni Flash (free tier)',
            '- Kimi K2.5, GLM-5, Mistral Large, Claude (BYOK)',
          ].join('\n');
          if (textParts.length === 0) {
            msg = { ...msg, content: visionNote };
          } else {
            msg = { ...msg, content: textParts.map((p) => p.text).join('\n') + '\n\n' + visionNote };
          }
        }

        // Text-based tool mode: strip tool_calls from assistant messages
        // The model doesn't understand these fields — they're our internal bookkeeping
        if (!useNativeTools && msg.role === 'assistant' && (msg as AssistantMessage).tool_calls) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { tool_calls: _tc, ...rest } = msg as AssistantMessage;
          msg = rest as Message;
        }

        // Handle reasoning_content based on model capability:
        // - Thinking models (DeepSeek Reasoner, etc.): KEEP — required for multi-turn
        // - Non-thinking models: STRIP — providers reject it as input
        if (msg.role === 'assistant' && 'reasoning_content' in msg) {
          const aMsg = msg as AssistantMessage;
          if (this.model.supportsThinking) {
            if (aMsg.reasoning_content && !aMsg.content) {
              return { ...aMsg, content: '' } as Message;
            }
            return msg;
          }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { reasoning_content: _rc, ...rest } = aMsg;
          return rest as Message;
        }

        return msg;
      });

      // Ensure all messages have string content and strip ANSI escape codes
      // Qwen rejects content: null and ANSI codes with 400 Bad Request
      sanitizedMessages = sanitizedMessages.map(m => {
        if (m.content === null || m.content === undefined) {
          return { ...m, content: '' };
        }
        if (typeof m.content === 'string') {
          // Strip all ANSI escape sequences and control characters that APIs reject
          const cleaned = m.content
            .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')  // Standard ANSI escape codes
            .replace(/\u001b\][^\u0007]*\u0007/g, '')  // OSC sequences
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');  // Control chars (keep \n \r \t)
          if (cleaned !== m.content) return { ...m, content: cleaned };
        }
        return m;
      });

      // Fix orphaned tool messages before sending — prevents 400 errors
      sanitizedMessages = this.fixToolPairing(sanitizedMessages);

      // Guard against 413: check estimated body size and truncate if too large
      // Most APIs reject bodies over 4MB. Target 3MB to leave headroom.
      const MAX_BODY_BYTES = 3 * 1024 * 1024;
      let finalMessages = sanitizedMessages;
      const estimatedSize = JSON.stringify(sanitizedMessages).length;
      if (estimatedSize > MAX_BODY_BYTES) {
        logger.warn(`[agent] Request body too large (${(estimatedSize / 1024 / 1024).toFixed(1)}MB). Truncating tool results and old messages.`);
        // First pass: truncate large tool results (keep first 500 chars)
        finalMessages = finalMessages.map(m => {
          if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > 500) {
            return { ...m, content: m.content.slice(0, 500) + '\n\n[Output truncated — original was ' + m.content.length + ' chars]' };
          }
          return m;
        });
        // Second pass: if still too large, drop oldest messages (keep system + last 20)
        if (JSON.stringify(finalMessages).length > MAX_BODY_BYTES) {
          const systemMsg = finalMessages.find(m => m.role === 'system');
          const nonSystem = finalMessages.filter(m => m.role !== 'system');
          const dropped = nonSystem.slice(0, -20);
          const kept = nonSystem.slice(-20);
          // Fix orphaned tool messages after truncation
          const fixedKept = this.fixToolPairing(kept);
          finalMessages = systemMsg ? [systemMsg, ...fixedKept] : fixedKept;
          logger.warn(`[agent] Aggressive truncation: kept system + last ${fixedKept.length} messages, dropped ${dropped.length}`);

          // Save dropped context to memory
          try {
            const mm = (this.toolContext.sharedState as Record<string, unknown> | undefined)?.memoryManager as { saveEntry?: (scope: string, entry: { key: string; content: string; category: string }) => Promise<void> } | undefined;
            if (mm?.saveEntry && dropped.length > 0) {
              const droppedSummary = dropped
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => `[${m.role}]: ${typeof m.content === 'string' ? m.content.slice(0, 200) : '(tool use)'}`)
                .join('\n');
              if (droppedSummary.length > 50) {
                const date = new Date().toISOString().slice(0, 10);
                const time = new Date().toISOString().slice(11, 16);
                await mm.saveEntry('global', {
                  key: `truncated-context-${date}-${time}`,
                  content: droppedSummary.slice(0, 2000),
                  category: 'session',
                });
              }
            }
          } catch { /* non-critical */ }
        }
      }

      const request: ChatCompletionRequest = {
        model: this.model.id,
        messages: finalMessages,
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
        tool_choice: toolSchemas.length > 0 ? 'auto' : undefined,
        stream: true,
      };

      let assistantMessage: AssistantMessage;
      let promptTokens: number;
      const estimatedInput = this.estimateTokenCount(messages);
      logger.debug(`[agent] Calling streamResponse (est. ${estimatedInput} input tokens, model context: ${this.model.contextWindow})`);
      try {
        ({ message: assistantMessage, promptTokens } = await this.streamResponse(request, onEvent, signal));
        logger.debug(`[agent] streamResponse returned: content=${assistantMessage.content?.length ?? 0} chars, tool_calls=${assistantMessage.tool_calls?.length ?? 0}, promptTokens=${promptTokens}`);
      } catch (error) {
        logger.error(`[agent] streamResponse THREW: ${error instanceof Error ? error.message : String(error)}`);
        // Surface the error through the event system so CLI/extension handle it consistently
        onEvent({ type: 'error', error: error instanceof Error ? error : new Error(String(error)) });
        // Always emit done so UI clears isStreaming/isThinking
        onEvent({ type: 'done', finalMessage: { role: 'assistant', content: '' } as any });
        return messages;
      }
      // Text-based tool parsing: extract <tool_call> blocks from the model's text
      if (!useNativeTools && assistantMessage.content) {
        const { toolCalls: parsedCalls, cleanText } = parseToolCalls(assistantMessage.content);
        if (parsedCalls.length > 0) {
          logger.debug(`[agent] Parsed ${parsedCalls.length} tool calls from text output`);
          assistantMessage = {
            ...assistantMessage,
            content: cleanText || null,
            tool_calls: parsedCalls,
          };
        }
      }

      messages = [...messages, assistantMessage];

      // NOTE: Do NOT truncate here — tool results haven't been appended yet.
      // Truncation between assistant tool_calls and tool results breaks the
      // message ordering that models require. Truncation happens after tool
      // results are appended, at the top of the next loop iteration.
      if (false && promptTokens > 0 && promptTokens > this.model.contextWindow * 0.65) {
        const targetTokens = Math.floor(this.model.contextWindow * 0.5);
        messages = this.truncateMessages(messages, targetTokens);
      }

      // If cancelled during streaming, stop immediately
      if (signal?.aborted) {
        onEvent({ type: 'done', finalMessage: assistantMessage });
        return messages;
      }

      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        logger.debug(`[agent] No tool_calls in response. content=${(assistantMessage.content ?? '').length} chars, reasoning=${(assistantMessage.reasoning_content ?? '').length} chars`);
        // Surface empty responses — model returned nothing visible to the user
        if (!assistantMessage.content && !assistantMessage.reasoning_content) {
          onEvent({
            type: 'error',
            error: new Error(t('error.msg.empty_response')),
          });
        }
        // Auto-extract memories from the conversation (fire-and-forget, errors logged)
        this.extractMemoriesFromRun(messages, runContext);

        // Dataset capture — silently record interaction as training data (fire-and-forget)
        captureInteraction(messages).catch(err => logger.debug(`[dataset] capture failed: ${err}`));

        onEvent({ type: 'done', finalMessage: assistantMessage });
        return messages;
      }
      logger.debug(`[agent] Got ${assistantMessage.tool_calls.length} tool_calls: ${assistantMessage.tool_calls.map((tc: ToolCall) => tc.function.name).join(', ')}`);

      // ── Repeated tool-call detection ───────────────────────────────────────
      // If the model calls the same tool with the same arguments 3+ times, break the loop.
      // Different arguments = different call = not a loop (e.g. list_directory on different paths).
      const currentToolSig = assistantMessage.tool_calls.map((tc: ToolCall) => `${tc.function.name}:${tc.function.arguments}`).sort().join(',');
      if (currentToolSig === lastToolName) {
        repeatCount++;
        if (repeatCount >= MAX_SAME_TOOL_REPEATS) {
          logger.warn(`[agent] HARD STOP: ${currentToolSig} called ${repeatCount + 1} times consecutively`);
          const stopMsg = `Stopped: ${currentToolSig} was called ${repeatCount + 1} times in a row and kept failing. Try a different approach or start a new chat.`;
          onEvent({
            type: 'error',
            error: Object.assign(new Error(stopMsg), { code: 'tool_loop_stopped' }),
          });
          onEvent({
            type: 'done',
            finalMessage: { role: 'assistant', content: stopMsg } as any,
          });
          return messages;
        }
      } else {
        lastToolName = currentToolSig;
        repeatCount = 0;
      }

      // ── Mode enforcement: block tools not allowed in the active mode ────
      if (modeAllowed) {
        const blocked = assistantMessage.tool_calls.filter((tc: ToolCall) => !modeAllowed.has(tc.function.name));
        if (blocked.length > 0) {
          const blockedNames = blocked.map((tc: ToolCall) => tc.function.name).join(', ');
          logger.warn(`[agent] Mode ${detectedMode} blocked tools: ${blockedNames}`);
          // Return error results for blocked tools so the model knows to stop
          for (const tc of blocked) {
            messages.push(assistantMessage);
            messages.push({
              role: 'tool' as const,
              content: `Tool "${tc.function.name}" is not available in ${detectedMode} mode. This mode is read-only — use work mode (>>) to make changes.`,
              tool_call_id: tc.id,
            } as any);
          }
          // Remove blocked calls, keep allowed ones
          assistantMessage.tool_calls = assistantMessage.tool_calls.filter((tc: ToolCall) => modeAllowed.has(tc.function.name));
          if (assistantMessage.tool_calls.length === 0) continue;
        }
      }

      // ── Parallel tool execution ──────────────────────────────────────────
      // Partition tool calls: confirmation-required run sequentially first,
      // auto-approved tools run in parallel after for speed.
      const confirmCalls: ToolCall[] = [];
      const autoCalls: ToolCall[] = [];

      for (const tc of assistantMessage.tool_calls) {
        const tool = this.toolRegistry.getTool(tc.function.name);
        if (tool && this.toolRegistry.needsConfirmation(tool)) {
          confirmCalls.push(tc);
        } else {
          autoCalls.push(tc);
        }
      }

      // Phase 1: Confirmation-required tools (sequential — user must approve each)
      for (const toolCall of confirmCalls) {
        if (signal?.aborted) {
          onEvent({ type: 'done', finalMessage: assistantMessage });
          return messages;
        }

        // Auto-checkpoint before write/dangerous tools
        const toolDef = this.toolRegistry.getTool(toolCall.function.name);
        if (toolDef && (toolDef.riskLevel === 'write' || toolDef.riskLevel === 'dangerous')) {
          const cp = runContext.sharedState?.checkpointManager as { hasActiveCheckpoint(): boolean; createCheckpoint(): Promise<unknown> } | undefined;
          if (cp && !cp.hasActiveCheckpoint()) {
            try { await cp.createCheckpoint(); } catch { /* best-effort */ }
          }
        }

        messages = await this.executeToolCall(toolCall, runContext, onEvent, messages, useNativeTools);
      }

      // Phase 2: Auto-approved tools (parallel via Promise.allSettled)
      if (autoCalls.length > 0) {
        if (signal?.aborted) {
          onEvent({ type: 'done', finalMessage: assistantMessage });
          return messages;
        }

        // Auto-checkpoint if any auto-approved tool is write/dangerous
        const hasRiskyAuto = autoCalls.some(tc => {
          const td = this.toolRegistry.getTool(tc.function.name);
          return td && (td.riskLevel === 'write' || td.riskLevel === 'dangerous');
        });
        if (hasRiskyAuto) {
          const cp = runContext.sharedState?.checkpointManager as { hasActiveCheckpoint(): boolean; createCheckpoint(): Promise<unknown> } | undefined;
          if (cp && !cp.hasActiveCheckpoint()) {
            try { await cp.createCheckpoint(); } catch { /* best-effort */ }
          }
        }

        // Fire all start events
        for (const tc of autoCalls) {
          onEvent({ type: 'tool_call_start', toolCall: tc });
        }

        // Execute all in parallel
        const results = await Promise.allSettled(
          autoCalls.map(async (tc) => {
            let parsedArgs: Record<string, unknown>;
            try { parsedArgs = JSON.parse(tc.function.arguments); } catch { parsedArgs = {}; }
            const ctx = {
              ...runContext,
              onOutput: (data: string) => {
                onEvent({ type: 'tool_call_partial', toolCallId: tc.id, data });
              },
            };
            return this.toolRegistry.execute(tc.function.name, parsedArgs, ctx);
          })
        );

        // Append results in order (API requires tool messages match tool_call order)
        for (let i = 0; i < autoCalls.length; i++) {
          const toolCall = autoCalls[i];
          const settled = results[i];
          const result = settled.status === 'fulfilled'
            ? settled.value
            : { success: false, output: `Tool failed: ${settled.reason}`, metadata: undefined };

          onEvent({
            type: 'tool_call_end',
            toolCall,
            result: result.output,
            success: result.success,
            metadata: result.metadata,
          });

          if (useNativeTools) {
            messages = [
              ...messages,
              {
                role: 'tool' as const,
                tool_call_id: toolCall.id,
                content: result.output,
              },
            ];
          } else {
            // Text-based mode: send tool results as user messages
            messages = [
              ...messages,
              {
                role: 'user' as const,
                content: formatToolResult(toolCall.function.name, result.output, result.success),
              },
            ];
          }

          // Vision pipeline
          if (result.metadata?.base64_image) {
            messages = [
              ...messages,
              {
                role: 'user' as const,
                content: [
                  { type: 'text' as const, text: `[Image captured by ${toolCall.function.name}]` },
                  { type: 'image_url' as const, image_url: {
                    url: `data:${(result.metadata.mime_type as string) || 'image/png'};base64,${result.metadata.base64_image}`,
                  }},
                ],
              },
            ];
          }
        }
      }
    }

    const iterError = new Error(
      t('error.msg.iteration_limit', { limit: String(MAX_TOOL_CALL_ITERATIONS) }),
    );
    (iterError as Error & { code?: string }).code = 'iterations_exceeded';
    onEvent({ type: 'error', error: iterError });
    // Always emit done so the UI clears isStreaming
    onEvent({ type: 'done', finalMessage: { role: 'assistant', content: 'Stopped: tool call iteration limit reached.' } as any });
    // Extract memories even on iteration limit — there's still valuable context to capture
    this.extractMemoriesFromRun(messages, runContext);
    captureInteraction(messages).catch(err => logger.debug(`[dataset] capture failed: ${err}`));
    return messages;
  }

  /**
   * Extract and save memories from a completed run.
   * Fire-and-forget — never blocks the response.
   * Errors are logged at debug level so they don't spam the UI but are visible for debugging.
   */
  private extractMemoriesFromRun(messages: Message[], runContext: ToolExecutionContext): void {
    const ma = runContext.sharedState?.memoryAgent as { extractAndSave: (msgs: Message[], cid?: string) => Promise<number> } | undefined;
    const mm = runContext.sharedState?.memoryManager as MemoryManager | undefined;

    if (ma) {
      // Memory Agent: single extraction call (regex + LLM reflection)
      logger.debug('[memory] Running Memory Agent extraction');
      ma.extractAndSave(messages)
        .then(saved => {
          if (saved > 0) logger.info(`[memory] Memory Agent saved ${saved} ${saved === 1 ? 'memory' : 'memories'}`);
          else logger.debug('[memory] Memory Agent: 0 memories extracted from this turn');
        })
        .catch(err => logger.warn(`[memory] Memory Agent extraction failed: ${err instanceof Error ? err.message : String(err)}`));
    } else if (mm) {
      // Legacy fallback: multi-layer extraction (when Memory Agent unavailable)
      logger.debug('[memory] Running legacy memory extraction (no Memory Agent)');
      autoExtractAndSave(messages, mm)
        .then(saved => {
          if (saved > 0) logger.info(`[memory] Auto-extract saved ${saved} ${saved === 1 ? 'memory' : 'memories'}`);
          else logger.debug('[memory] Auto-extract: 0 memories from regex patterns');
        })
        .catch(err => logger.warn(`[memory] Auto-extract failed: ${err instanceof Error ? err.message : String(err)}`));

      reflectAndSave(messages, mm, this.provider, this.model)
        .then(saved => {
          if (saved > 0) logger.info(`[memory] LLM reflection saved ${saved} ${saved === 1 ? 'memory' : 'memories'}`);
        })
        .catch(err => logger.warn(`[memory] LLM reflection failed: ${err instanceof Error ? err.message : String(err)}`));

      trackAndLearn(messages, mm)
        .catch(err => logger.debug(`[memory] Pattern tracking failed: ${err instanceof Error ? err.message : String(err)}`));

      const userTurns = messages.filter(m => m.role === 'user').length;
      if (userTurns >= 6) {
        analyseAndSave(mm, this.provider, this.model)
          .catch(err => logger.debug(`[memory] Insights analysis failed: ${err instanceof Error ? err.message : String(err)}`));
      }
    } else {
      logger.debug('[memory] No memoryManager in sharedState — skipping extraction. Is memory wired correctly?');
    }
  }

  private async streamResponse(
    request: ChatCompletionRequest,
    onEvent: AgentEventHandler,
    signal?: AbortSignal,
  ): Promise<{ message: AssistantMessage; promptTokens: number }> {
    onEvent({ type: 'stream_start' });

    let content = '';
    let reasoningContent = '';
    let usage: TokenUsage | undefined;
    const toolCallsAccumulator = new Map<
      number,
      {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }
    >();

    try {
      for await (const chunk of this.provider.createStreamingCompletion(request, signal)) {
        if (chunk.usage) {
          usage = chunk.usage;
        }

        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // Thinking/reasoning content (DeepSeek R1, GLM, Kimi, Mistral Magistral)
        const thinking = delta.reasoning_content ?? delta.reasoning;
        if (thinking) {
          reasoningContent += thinking;
          onEvent({ type: 'thinking_delta', content: thinking });
        }

        if (delta.content) {
          // Strip <think>...</think> tags — some models (MiniMax) embed thinking inline
          let visibleContent = delta.content;
          if (visibleContent.includes('<think>') || this._inThinkTag) {
            // Track if we're inside a think tag across chunks
            const parts = visibleContent.split(/(<\/?think>)/);
            let visible = '';
            for (const part of parts) {
              if (part === '<think>') { this._inThinkTag = true; continue; }
              if (part === '</think>') { this._inThinkTag = false; continue; }
              if (this._inThinkTag) {
                reasoningContent += part;
                onEvent({ type: 'thinking_delta', content: part });
              } else {
                visible += part;
              }
            }
            visibleContent = visible;
          }
          if (visibleContent) {
            content += visibleContent;
            onEvent({ type: 'stream_delta', content: visibleContent });
          }
        }

        if (delta.tool_calls) {
          if (toolCallsAccumulator.size === 0) {
            logger.debug('[agent] First tool_call delta received in stream');
          }
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
    } catch (error) {
      // Preserve partial content AND accumulated tool calls if we collected any before the error
      if (content || reasoningContent || toolCallsAccumulator.size > 0) {
        const partialToolCalls: ToolCall[] = toolCallsAccumulator.size > 0
          ? Array.from(toolCallsAccumulator.values()).filter(tc => tc.id && tc.function.name)
          : [];
        const partialMessage: AssistantMessage = {
          role: 'assistant',
          content: content || null,
          ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
          ...(partialToolCalls.length > 0 ? { tool_calls: partialToolCalls } : {}),
        };
        onEvent({ type: 'stream_end', message: partialMessage });
      }
      throw error;
    }

    const toolCalls: ToolCall[] =
      toolCallsAccumulator.size > 0 ? Array.from(toolCallsAccumulator.values()) : [];

    // DeepSeek Reasoner rule: "If reasoning_content is set, content must not be empty."
    // When the model returns reasoning + tool_calls but no text, content would be null —
    // which causes a 400 on the next request if reasoning_content is also present.
    const finalContent = (!content && reasoningContent) ? '' : (content || null);

    const message: AssistantMessage = {
      role: 'assistant',
      content: finalContent,
      ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
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

    return { message, promptTokens: usage?.prompt_tokens ?? 0 };
  }

  // ── Single tool call execution (used by sequential confirmation phase) ──

  private async executeToolCall(
    toolCall: ToolCall,
    runContext: ToolExecutionContext,
    onEvent: AgentEventHandler,
    messages: Message[],
    useNativeTools = true,
  ): Promise<Message[]> {
    onEvent({ type: 'tool_call_start', toolCall });

    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = JSON.parse(toolCall.function.arguments);
    } catch {
      parsedArgs = {};
    }

    const toolRunContext = {
      ...runContext,
      onOutput: (data: string) => {
        onEvent({ type: 'tool_call_partial', toolCallId: toolCall.id, data });
      },
    };

    let result: { output: string; success: boolean; metadata?: Record<string, unknown> };
    try {
      result = await this.toolRegistry.execute(
        toolCall.function.name,
        parsedArgs,
        toolRunContext,
      );
    } catch (err) {
      result = { output: `Tool error: ${err instanceof Error ? err.message : String(err)}`, success: false };
    }

    onEvent({
      type: 'tool_call_end',
      toolCall,
      result: result.output,
      success: result.success,
      metadata: result.metadata,
    });

    if (useNativeTools) {
      messages = [
        ...messages,
        {
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          content: result.output,
        },
      ];
    } else {
      // Text-based mode: send tool results as user messages
      messages = [
        ...messages,
        {
          role: 'user' as const,
          content: formatToolResult(toolCall.function.name, result.output, result.success),
        },
      ];
    }

    // Vision pipeline
    if (result.metadata?.base64_image) {
      messages = [
        ...messages,
        {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: `[Image captured by ${toolCall.function.name}]` },
            { type: 'image_url' as const, image_url: {
              url: `data:${(result.metadata.mime_type as string) || 'image/png'};base64,${result.metadata.base64_image}`,
            }},
          ],
        },
      ];
    }

    return messages;
  }

  // ── Context usage ────────────────────────────────────────────────────────

  /** Get current context usage for a set of messages. */
  getContextUsage(messages: Message[]): ContextUsage {
    const used = this.estimateTokenCount(messages);
    const limit = this.model.contextWindow;
    return { used, limit, percent: Math.round((used / limit) * 100) };
  }

  /** Manually compress context — triggered by user clicking the context bar. */
  async manualCompress(
    messages: Message[],
    onEvent: AgentEventHandler,
    signal?: AbortSignal,
  ): Promise<Message[]> {
    return this.compressContext(messages, onEvent, signal);
  }

  // ── Context compression ──────────────────────────────────────────────────

  /**
   * Compress conversation context by summarizing older messages.
   * Keeps the system prompt and last 8 messages (4 user-assistant exchanges)
   * verbatim, summarizes everything in between using the model.
   * Falls back silently if the compression API call fails.
   */
  async compressContext(
    messages: Message[],
    onEvent: AgentEventHandler,
    signal?: AbortSignal,
  ): Promise<Message[]> {
    onEvent({ type: 'context_compression_start' });

    const systemMsg = messages[0]?.role === 'system' ? messages[0] : null;
    const rest = systemMsg ? messages.slice(1) : [...messages];

    // Keep last 8 messages verbatim (4 exchange pairs) for better continuity
    const KEEP_RECENT = 8;
    if (rest.length <= KEEP_RECENT) {
      onEvent({ type: 'context_compression_end', originalTokens: 0, compressedTokens: 0 });
      return messages;
    }

    const toCompress = rest.slice(0, -KEEP_RECENT);
    const toKeep = rest.slice(-KEEP_RECENT);

    // Build the text to summarize (extract text content, skip raw tool JSON)
    const transcript = toCompress
      .map((m) => {
        const text = getTextContent(m.content);
        return `[${m.role}]: ${text || '(no text)'}`;
      })
      .join('\n');

    const compressionPrompt = `You are a conversation summarizer. Summarize this conversation transcript concisely while preserving:
- Key decisions and conclusions reached
- File paths, function names, and code identifiers mentioned
- Tool calls made and their results (especially file edits, searches, and command outputs)
- Current task state and what was accomplished vs. what remains
- Any errors encountered and how they were resolved
- Important technical context the assistant will need going forward

Be concise but thorough. Use bullet points. Do NOT include pleasantries or meta-commentary.

TRANSCRIPT:
${transcript}`;

    try {
      const response = await this.provider.createCompletion(
        {
          model: this.model.id,
          messages: [
            { role: 'system', content: 'You are a precise conversation summarizer.' },
            { role: 'user', content: compressionPrompt },
          ],
          max_tokens: 1500,
          temperature: 0.2,
        },
        signal,
      );

      const summary = response.choices?.[0]?.message?.content || '';
      if (!summary) throw new Error('Empty compression response');

      // ── Save compressed context to memory — nothing is lost ──────────
      // Layer 2 reflection: extract structured memories from the messages
      // being compressed (decisions, preferences, patterns, facts).
      // These survive as project-scoped or global memories for future recall.
      try {
        const mm = (this.toolContext.sharedState as Record<string, unknown> | undefined)?.memoryManager as MemoryManager | undefined;
        if (mm) {
          // Run Layer 2 reflection on the messages being compressed
          const saved = await reflectAndSave(toCompress, mm, this.provider, this.model);
          if (saved > 0) {
            logger.info(`[compression] Extracted ${saved} memories from compressed context`);
          }

          // Also save the raw summary as a session memory for continuity
          const date = new Date().toISOString().slice(0, 10);
          const time = new Date().toISOString().slice(11, 16);
          await mm.saveEntry({
            scope: 'project',
            content: `[Session summary ${date} ${time}]\n${summary}`,
            category: 'general',
            tags: ['compression', 'summary'],
            branch: null,
          });
          logger.debug('[compression] Saved session summary to project memory');
        }
      } catch {
        // Memory save is non-critical — don't block compression
      }

      const summaryMessage: Message = {
        role: 'user',
        content: `[Context Summary — earlier conversation compressed]\n\n${summary}`,
      };

      const fixedTail = this.fixToolPairing(toKeep);
      const result = systemMsg
        ? [systemMsg, summaryMessage, ...fixedTail]
        : [summaryMessage, ...fixedTail];

      const originalTokens = this.estimateTokenCount(messages);
      const compressedTokens = this.estimateTokenCount(result);
      onEvent({ type: 'context_compression_end', originalTokens, compressedTokens });

      // Emit updated context usage so UI bars refresh after compression
      const newPercent = Math.round((compressedTokens / this.model.contextWindow) * 100);
      onEvent({
        type: 'context_usage',
        context: { used: compressedTokens, limit: this.model.contextWindow, percent: newPercent },
      });

      return result;
    } catch {
      // Compression failed — fall back silently (caller will truncate if needed)
      onEvent({ type: 'context_compression_end', originalTokens: 0, compressedTokens: 0 });
      return messages;
    }
  }

  // ── Token estimation ──────────────────────────────────────────────────────

  private static estimateTextTokens(text: string): number {
    // Conservative: uses length/3 (not length/4) because code, JSON, and
    // tool results tokenize at ~2.5-3 chars per token.
    return Math.ceil(text.length / 3);
  }

  private estimateMessageTokens(msg: Message): number {
    let tokens = 4; // message overhead (role, separators)

    const { content } = msg;
    if (content === null) {
      // no content
    } else if (typeof content === 'string') {
      tokens += Agent.estimateTextTokens(content);
    } else {
      for (const part of content) {
        if (part.type === 'text') tokens += Agent.estimateTextTokens(part.text);
        else if (part.type === 'image_url') tokens += 85;
      }
    }

    // Count tool calls in assistant messages (function name + JSON arguments)
    const toolCalls = (msg as unknown as Record<string, unknown>).tool_calls as
      | Array<{ function: { name: string; arguments: string } }>
      | undefined;
    if (toolCalls) {
      for (const tc of toolCalls) {
        tokens += Agent.estimateTextTokens(tc.function.name) + Agent.estimateTextTokens(tc.function.arguments) + 8;
      }
    }

    return tokens;
  }

  /** Estimate total token count across an array of messages. */
  estimateTokenCount(messages: Message[]): number {
    return messages.reduce((sum, m) => sum + this.estimateMessageTokens(m), 0);
  }

  // ── Tool result trimming ────────────────────────────────────────────────

  /**
   * Collapse old tool results to save tokens. Tool outputs older than
   * KEEP_RECENT messages get trimmed to 200 chars + a note.
   * This prevents token bleed from accumulated file reads, grep results, etc.
   */
  private trimOldToolResults(messages: Message[]): Message[] {
    const KEEP_RECENT = 8; // Keep last 8 messages at full size
    const MAX_OLD_TOOL_CHARS = 200;

    if (messages.length <= KEEP_RECENT + 1) return messages; // +1 for system

    const cutoff = messages.length - KEEP_RECENT;
    return messages.map((m, i) => {
      // Skip system prompt and recent messages
      if (i === 0 || i >= cutoff) return m;
      // Only trim tool result messages
      if (m.role !== 'tool' || typeof m.content !== 'string') return m;
      // Already short enough
      if (m.content.length <= MAX_OLD_TOOL_CHARS) return m;
      // Trim
      return {
        ...m,
        content: m.content.slice(0, MAX_OLD_TOOL_CHARS) + `\n\n[Trimmed — original ${m.content.length} chars]`,
      };
    });
  }

  // ── Truncation ──────────────────────────────────────────────────────────

  private truncateMessages(messages: Message[], maxTokens: number): Message[] {
    const total = messages.reduce((sum, m) => sum + this.estimateMessageTokens(m), 0);
    if (total <= maxTokens) return messages;

    // Keep system prompt (first message) and trim from the beginning of the rest
    const systemMsg = messages[0]?.role === 'system' ? messages[0] : null;
    const rest = systemMsg ? messages.slice(1) : [...messages];
    const systemTokens = systemMsg ? this.estimateMessageTokens(systemMsg) : 0;
    const budget = maxTokens - systemTokens;

    const kept: Message[] = [];
    let used = 0;

    for (let i = rest.length - 1; i >= 0; i--) {
      const msgTokens = this.estimateMessageTokens(rest[i]);
      if (used + msgTokens > budget) break;
      kept.unshift(rest[i]);
      used += msgTokens;
    }

    // Fix orphaned tool messages — if truncation cut in the middle of a
    // tool call/result sequence, the kept list may start with `tool` messages
    // that reference a dropped assistant message. The API rejects these.
    // Also drop any assistant messages whose tool_calls lost their results.
    const fixed = this.fixToolPairing(kept);

    return systemMsg ? [systemMsg, ...fixed] : fixed;
  }

  /**
   * Ensure every `tool` message has a preceding `assistant` with a matching
   * `tool_calls` entry, and every `assistant` with `tool_calls` has all its
   * `tool` results following it. Drops orphans from the front.
   */
  private fixToolPairing(messages: Message[]): Message[] {
    // 1. Drop leading orphaned tool messages (their assistant parent was truncated)
    let start = 0;
    while (start < messages.length && messages[start].role === 'tool') {
      start++;
    }
    if (start === messages.length) return [];
    const trimmed = start > 0 ? messages.slice(start) : messages;

    // 2. Scan ALL messages — remove any tool message whose parent assistant
    //    (with matching tool_call_id) is not in the conversation
    const assistantToolCallIds = new Set<string>();
    for (const m of trimmed) {
      if (m.role === 'assistant') {
        const toolCalls = (m as AssistantMessage).tool_calls;
        if (toolCalls) {
          for (const tc of toolCalls) {
            assistantToolCallIds.add(tc.id);
          }
        }
      }
    }

    const fixed = trimmed.filter(m => {
      if (m.role === 'tool') {
        const toolMsg = m as { tool_call_id?: string };
        return assistantToolCallIds.has(toolMsg.tool_call_id ?? '');
      }
      return true;
    });

    // 3. Check for assistant messages with tool_calls but missing ALL tool results
    //    (incomplete pair) — remove them too
    const toolResultIds = new Set<string>();
    for (const m of fixed) {
      if (m.role === 'tool') {
        const toolMsg = m as { tool_call_id?: string };
        if (toolMsg.tool_call_id) toolResultIds.add(toolMsg.tool_call_id);
      }
    }

    return fixed.filter(m => {
      if (m.role === 'assistant') {
        const toolCalls = (m as AssistantMessage).tool_calls;
        if (toolCalls && toolCalls.length > 0) {
          // Keep only if at least one tool result exists
          return toolCalls.some(tc => toolResultIds.has(tc.id));
        }
      }
      return true;
    });
  }
}
