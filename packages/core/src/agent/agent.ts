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
import { maybeBuildDesignReinjection, isUIFilePath as isUIFilePathLocal } from './design-reinjection.js';
import {
  findOriginalUserTaskIndex,
  formatSessionTasksBlock,
  buildCompressionContinuationHeader,
  extractStructuredFields,
  trimMessageBody,
  OLD_MESSAGE_BODY_MAX_CHARS,
  isMetaPrefix,
  type TaskEntrySnapshot,
} from './context-continuity.js';
import {
  classifyTaskComplexity,
  formatDirectnessHint,
  COMPLEXITY_BUDGETS,
  type TaskComplexity,
} from './task-classifier.js';

// ─── Mode-aware tool filtering ──────────────────────────────────────────────
// When a non-work mode is active, restrict the tool schema sent to the model
// so it can only call tools listed in that mode's system prompt.
// Without this, the model sees all tools in the schema and ignores text restrictions.

// ─── Continuation-stall detection ──────────────────────────────────────────
// Identifies assistant responses that narrate intent ("Let me rewrite the
// sidebar...") but terminate without making any tool calls. These are worse
// than empty responses because the user sees a promise that never gets
// fulfilled. Detected via prefix matching on common narration patterns.
//
// False positives (real closures that look like stalls) are preferable to
// false negatives (stalls that slip through) because the cost of a redundant
// "continue" nudge is small while the cost of invisible stalled work is
// catastrophic for UX.

const STALL_PREFIX_PATTERNS = [
  'let me ',
  "i'll ",
  'i will ',
  "i'm going to ",
  'i am going to ',
  'first, let me ',
  'first, i',
  'now let me ',
  "now i'll ",
  'okay, let me ',
  'ok, let me ',
  'right, let me ',
  'alright, let me ',
  'starting the ',
  'starting with ',
  'beginning the ',
  "let's ",
];

function looksLikeContinuationStall(content: string): boolean {
  const trimmed = content.trim().toLowerCase();
  if (trimmed.length === 0) return false;
  // Long responses are probably genuine explanations, not stalls
  if (trimmed.length > 500) return false;
  // Check known continuation-narration prefixes
  for (const prefix of STALL_PREFIX_PATTERNS) {
    if (trimmed.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Detect context drift: the model produced a greeting or social response
 * after a turn with tool usage. This happens when attention on the original
 * task fades under the weight of many file reads / tool results and the
 * model defaults to a safe social response instead of summarising findings.
 *
 * Only fires when the turn had 3+ tool calls AND the response is short
 * and contains greeting patterns. A greeting in a zero-tool turn is fine
 * (that's just a Chat-mode response).
 */
const GREETING_PATTERNS = [
  /\bhey\b/i, /\bhello\b/i, /\bhi\b/i, /\bgood\s+(?:morning|afternoon|evening)\b/i,
  /\bhow(?:'s| is) your (?:day|morning|evening|afternoon)\b/i,
  /\bhow are you\b/i, /\bwhat(?:'s| is) up\b/i, /\bnice to (?:see|hear|meet)\b/i,
];

function looksLikePostToolDrift(content: string, toolCallCount: number): boolean {
  if (toolCallCount < 3) return false; // Only relevant after real tool usage
  const trimmed = content.trim();
  if (trimmed.length > 200) return false; // Short response after many tools = suspicious
  const lower = trimmed.toLowerCase();
  return GREETING_PATTERNS.some(p => p.test(lower));
}

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
  | { type: 'auto_agent_end'; model: string; summary?: string }
  // Execution dispatch events — emitted by TaskExecutor when Builder runs
  // a task list created by present_plan + todo_write.
  | { type: 'execution_start'; total: number }
  | { type: 'task_start'; taskId: string; title: string; index: number; total: number }
  | { type: 'task_complete'; taskId: string; title: string; summary?: string }
  | { type: 'task_blocked'; taskId: string; title: string; reason: string }
  | { type: 'task_failed'; taskId: string; title: string; error: string }
  | { type: 'execution_complete'; completed: number; blocked: number; total: number };

export type AgentEventHandler = (event: AgentEvent) => void;

// ─── Agent ───────────────────────────────────────────────────────────────────

export class Agent {
  private readonly provider: Provider;
  private readonly model: ModelDefinition;
  private readonly toolRegistry: ToolRegistry;
  private readonly toolContext: ToolExecutionContext;
  private readonly pendingInterjections: string[] = [];
  private _inThinkTag = false;

  // ─── Exploration budget tracking (token-cost discipline) ────────────────
  // Per-run state: the task classification and how many read-only tool calls
  // the agent has made before its first write-capable call. When the count
  // exceeds the budget for the current task complexity, a soft nudge is
  // injected into the next LLM call ("you're stalling — commit to a
  // direction"). Reset on each Agent.run() call.
  private currentTaskComplexity: TaskComplexity = 'moderate';
  private readCountBeforeFirstWrite = 0;
  private hasWrittenInThisRun = false;
  private explorationNudgeFired = false;

  // Design re-injection state — tracks last re-injection turn and file mtimes
  // so we don't re-read the same design files 20 times in a single session.
  private designReinjectionTurn = 0;
  private designReinjectionLastTurn = -Infinity;
  private designReinjectionLastMtimes = new Map<string, number>();

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
    // Guard against empty or whitespace-only injections.
    //
    // Without this, any caller that accidentally passes an empty string
    // (missing translation key, race condition on a programmatic send,
    // stale callback, IPC edge case) ends up appending an empty user
    // message into the conversation mid-run — and the model reasonably
    // responds "did you send something?" to a blank turn. That's the
    // "blonde moment" failure mode: not attention drift, just an empty
    // turn being treated as a real one.
    //
    // Drop silently with a debug log so bugs upstream stay visible in
    // logs but don't manifest as weird agent behaviour to the user.
    if (typeof message !== 'string' || message.trim().length === 0) {
      logger.debug('[agent] inject() called with empty/invalid message — dropped');
      return;
    }
    this.pendingInterjections.push(message);
  }

  async run(messages: Message[], onEvent: AgentEventHandler, signal?: AbortSignal): Promise<Message[]> {
    // ─── Classify this task for directness discipline ─────────────────────
    // Find the latest non-meta user message and run the lightweight
    // classifier. The result sets the exploration budget for this run and
    // is injected into the system prompt as a directness hint so Ava knows
    // up front how aggressively to scope her work.
    //
    // Reset exploration budget state on each run — it's per-task, not
    // per-session.
    this.readCountBeforeFirstWrite = 0;
    this.hasWrittenInThisRun = false;
    this.explorationNudgeFired = false;

    // Closure fallback state — if the agent exits the main loop with an
    // empty final assistant message, we try once more with a forcing
    // "one-sentence summary" nudge. Prevents the "she didn't say anything
    // to close out" failure where the model terminates cleanly but leaves
    // the user staring at a wall of tool calls with no visible confirmation.
    let closureFallbackAttempted = false;

    const latestUserMessage = this.findLatestNonMetaUserMessage(messages);
    if (latestUserMessage) {
      const classification = classifyTaskComplexity(latestUserMessage);
      this.currentTaskComplexity = classification.complexity;
      logger.debug(`[agent] Task classified as ${classification.complexity} (${classification.confidence} confidence) — ${classification.reasoning}`);

      // Merge directness hint into the first system message. This keeps the
      // hint anchored to the session identity rather than floating as a
      // separate message that could be compressed away.
      const hint = formatDirectnessHint(classification);
      messages = this.appendToSystemMessage(messages, `\n\n${hint}`);
    } else {
      // No user task — default to moderate budget just in case.
      this.currentTaskComplexity = 'moderate';
    }

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
      //
      // The pinned original user task is preserved through this path too —
      // if it's in the window being compressed, we prepend it back after
      // the slide so the root intent always survives.
      const WINDOW_MAX = 30; // Max non-system messages before compression
      const WINDOW_KEEP = 16; // Messages to keep after compression
      const nonSystem = messages.filter(m => m.role !== 'system');
      if (nonSystem.length > WINDOW_MAX) {
        const systemMsgs = messages.filter(m => m.role === 'system');
        const pinnedIdxFull = findOriginalUserTaskIndex(messages);
        const pinnedMsg = pinnedIdxFull !== -1 ? messages[pinnedIdxFull] : null;
        const toCompress = nonSystem.slice(0, nonSystem.length - WINDOW_KEEP);
        const toKeep = nonSystem.slice(nonSystem.length - WINDOW_KEEP);
        // Reference-equality check — cast to Message[] because toKeep's type
        // is narrowed by the system filter and doesn't accept Message directly.
        const pinnedInKeep = pinnedMsg ? (toKeep as Message[]).indexOf(pinnedMsg) !== -1 : false;

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

        // Rebuild messages: system (with compression note merged in) + pinned
        // original task (if not already in the kept window) + recent messages.
        // Merging the compression note into the first system message avoids
        // Qwen's "system must be at beginning" error.
        const fixedKeep = this.fixToolPairing(toKeep);
        const compressionNote = [
          `[${toCompress.length} earlier messages compressed to memory. Your active task is still in flight — continue from where you left off. Do NOT treat this as a new conversation.]`,
          'Your memory system has saved the important context from those messages.',
          'If the user references something from earlier in the conversation, use memory_recall to retrieve it.',
          'Do NOT say you don\'t have context — check memory first. Do NOT greet the user.',
        ].join(' ');

        // Session tasks re-injection — same pattern as compressContext()
        let slidingTaskBlock: Message | null = null;
        try {
          const tm = (this.toolContext.sharedState as Record<string, unknown> | undefined)?.taskManager as
            | { getSessionTasks: () => TaskEntrySnapshot[] }
            | undefined;
          if (tm && typeof tm.getSessionTasks === 'function') {
            const block = formatSessionTasksBlock(tm.getSessionTasks());
            if (block) slidingTaskBlock = { role: 'user', content: block };
          }
        } catch { /* non-critical */ }

        const pinnedPrefix: Message[] = (pinnedMsg && !pinnedInKeep) ? [pinnedMsg] : [];
        const tail: Message[] = slidingTaskBlock ? [slidingTaskBlock, ...fixedKeep] : fixedKeep;

        if (systemMsgs.length > 0) {
          const primary = systemMsgs[0];
          const mergedSystem = { ...primary, content: (typeof primary.content === 'string' ? primary.content : '') + '\n\n' + compressionNote };
          messages = [mergedSystem, ...pinnedPrefix, ...tail];
        } else {
          messages = [
            { role: 'system' as const, content: compressionNote },
            ...pinnedPrefix,
            ...tail,
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

      // Check for user interjections — messages injected mid-run.
      // Append as plain user messages with no wrapper. The previous
      // "[User interjection]:" prefix framed every mid-run message as a
      // corrective interruption, priming the model to read questions as
      // criticism and respond with apology instead of answer.
      while (this.pendingInterjections.length > 0) {
        const interjection = this.pendingInterjections.shift()!;
        messages = [
          ...messages,
          { role: 'user' as const, content: interjection },
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

      // Auto-compress at 40% of the model's context window.
      //
      // Previously we waited until 70% before compressing, which for a 1M
      // context model meant every single turn could send up to 700,000
      // tokens before anything got summarised. That's both expensive (real
      // money per turn at managed-model pricing) and harmful to response
      // quality — large contexts increase latency, hurt attention, and make
      // it harder for the model to stay focused on the active task.
      //
      // 40% gives us a healthy active window (400k on a 1M model, 50k on a
      // 128k model, proportional to whatever the model supports) while
      // compressing aggressively enough to keep per-turn cost sane. Long
      // sessions now compress multiple times with smaller summary passes
      // instead of one giant last-minute compression right before overflow.
      const maxInputTokens = Math.floor(this.model.contextWindow * 0.4);
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

      // Still over budget? Fall back to truncation.
      //
      // Previously this emitted a user-facing error telling them to
      // "Consider starting a new chat for best results" — which was both
      // misleading (compression is routine, not an error) and risky (if
      // the agent ever saw that wording in its own context, it could
      // interpret "start a new chat" as instruction and reset its
      // behaviour, which is exactly the "she acted like it was a new
      // chat" failure mode we're fixing).
      //
      // Now it emits a neutral info message that doesn't prompt the user
      // or the agent to abandon the session. The agent's active task
      // state is preserved via the pinned original user task, the
      // re-injected session tasks block, and the continuation-first
      // compression header elsewhere in this file.
      const preCount = messages.length;
      messages = this.truncateMessages(messages, maxInputTokens);
      const dropped = preCount - messages.length;
      if (dropped > 0) {
        onEvent({
          type: 'error',
          error: Object.assign(
            new Error(`Context compressed: ${dropped} older messages summarised to memory. Continuing your current task.`),
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

        // ─── Closure fallback ─────────────────────────────────────────
        // Detect two failure modes where the turn terminates without
        // actually doing visible work:
        //
        // 1. Empty close — the model finished cleanly but produced zero
        //    visible content. User sees silence after tool calls.
        //
        // 2. Continuation stall — the model produced text like "Let me
        //    rewrite the sidebar" but terminated with no tool_calls.
        //    It narrated intent but never acted. This is arguably worse
        //    than an empty close because the user sees a promise that
        //    never gets fulfilled.
        //
        // Both cases share the same fix: drop the stalled message, inject
        // a forcing nudge, re-enter the loop for one more iteration.
        // Guarded by closureFallbackAttempted so we never loop more than
        // once per run. If the nudged response is ALSO stalled, fall
        // through to the hardcoded "Done" substitution.
        const contentText = typeof assistantMessage.content === 'string'
          ? assistantMessage.content.trim()
          : '';
        const isEmptyClose = contentText.length === 0;
        const isContinuationStall = !isEmptyClose && looksLikeContinuationStall(contentText);
        // Count tool calls in this run so far (for drift detection)
        const runToolCallCount = messages.filter(m => m.role === 'assistant' && (m as any).tool_calls?.length > 0)
          .reduce((sum, m) => sum + ((m as any).tool_calls?.length ?? 0), 0);
        const isPostToolDrift = !isEmptyClose && !isContinuationStall && looksLikePostToolDrift(contentText, runToolCallCount);

        if ((isEmptyClose || isContinuationStall || isPostToolDrift) && !closureFallbackAttempted) {
          closureFallbackAttempted = true;
          const reason = isEmptyClose ? 'empty final message'
            : isContinuationStall ? 'continuation stall (narrated intent without acting)'
            : 'post-tool drift (greeting/social response after tool usage)';
          logger.debug(`[agent] Closure fallback: ${reason}, re-prompting`);

          // Drop the stalled assistant message from history
          messages = messages.slice(0, -1);

          // Inject the appropriate forcing nudge
          const nudgeContent = isEmptyClose
            ? '[Closure check — your previous response was empty. The user needs visible confirmation that you finished. Write ONE short sentence summarising what you just did in this turn. Example: "Done — sidebar.tsx updated with the new palette." or "Fixed the missing habitId arg on line 71 of App.tsx." No tool calls. Just one sentence of text. This is the minimum required to close out a turn.]'
            : isPostToolDrift
            ? `[Context drift detected — you just used ${runToolCallCount} tools (reading files, searching, etc.) but then produced a greeting/social response instead of summarising your findings. You were in the middle of a task. The user did NOT change the subject — your attention drifted under the weight of all those tool results. Go back to the ORIGINAL task. Summarise what you found in the files you just read, present your plan, or continue working. Never produce a greeting after research.]`
            : `[Continuation check — you said "${contentText.slice(0, 120)}${contentText.length > 120 ? '…' : ''}" but then stopped without making any tool calls. You NARRATED intent but never acted on it. The user sees a promise that never got fulfilled — the worst possible UX. Do the work NOW in this response: make the actual tool calls to accomplish what you said you would. If the work genuinely can't be done, explain clearly why ("I can't X because Y"). Silence or another narration loop is not acceptable — either act or explain, no middle ground.]`;

          messages = [
            ...messages,
            { role: 'user' as const, content: nudgeContent },
          ];
          // Loop back for one more streaming call — the nudge will force
          // either tool calls or a clear explanation. Normal flow resumes
          // from there.
          continue;
        }

        // If we already tried the closure fallback and STILL got a stall,
        // substitute a hardcoded "Done." so the user sees something rather
        // than a blank turn or a broken promise. This is belt-and-braces —
        // the prompt rule should catch most cases, the fallback nudge
        // catches more, and this final substitution catches the remaining
        // edge cases where the model is genuinely broken on closure.
        if ((isEmptyClose || isContinuationStall) && closureFallbackAttempted) {
          logger.warn('[agent] Closure fallback exhausted — substituting hardcoded "Done."');
          const substitute = isContinuationStall
            ? contentText + ' [Agent stalled — closure fallback substituted this message.]'
            : 'Done.';
          assistantMessage = {
            ...assistantMessage,
            content: substitute,
          };
          messages = [...messages.slice(0, -1), assistantMessage];
        }

        // Surface empty responses — model returned nothing visible to the user
        // (kept for the edge case where both content AND reasoning are empty
        // even after the closure fallback — genuinely broken model output)
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

        // v3: Feed procedural observer with the tool-call sequence from this run
        // + save graphs at end of session
        this.feedProceduralObserver(messages, runContext);
        this.saveGraphState(runContext);

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
              // Thread the model's tool_call ID so any confirmation handler
              // (auto tools should never trigger one, but this is defensive)
              // can match cards to the exact tool call.
              toolCallId: tc.id,
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

        // ─── Dynamic design context re-injection ─────────────────────────
        // If any tool call in this batch wrote or edited a UI file, refresh
        // the Decisions/design context into the message history so it's in
        // attention for the NEXT turn — not buried behind whatever error
        // recovery or other noise has accumulated. One injection per batch,
        // even if multiple UI files were touched. Throttled by turn count
        // and file mtime cache so we don't re-read the same files 20 times.
        const uiBatchPath = this.findUIFilePathInBatch(autoCalls);
        if (uiBatchPath) {
          this.designReinjectionTurn++;
          const reinject = await maybeBuildDesignReinjection(
            runContext.cwd,
            uiBatchPath,
            {
              currentTurn: this.designReinjectionTurn,
              lastInjectedTurn: this.designReinjectionLastTurn,
              lastMtimes: this.designReinjectionLastMtimes,
            },
          );
          if (reinject) {
            messages = [
              ...messages,
              { role: 'user' as const, content: reinject.content },
            ];
            this.designReinjectionLastTurn = this.designReinjectionTurn;
            this.designReinjectionLastMtimes = reinject.updatedMtimes;
          }
        }

        // ─── Exploration budget nudge ──────────────────────────────────
        // Count read-only tool calls in this batch. If the agent has done
        // too much exploration without committing to a write, inject a
        // soft nudge telling her to commit or justify. Never hard-stops.
        const nudge = this.maybeExplorationBudgetNudge(autoCalls);
        if (nudge) {
          messages = [
            ...messages,
            { role: 'user' as const, content: nudge },
          ];
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
    this.feedProceduralObserver(messages, runContext);
    this.saveGraphState(runContext);
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
      // Thread the model's tool_call ID through so the confirmation handler
      // can forward it to the UI for exact-match card attachment.
      toolCallId: toolCall.id,
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

    // Dynamic design context re-injection — same treatment as the parallel
    // batch path. Throttled by turn count and mtime cache.
    const uiPath = this.findUIFilePathInBatch([toolCall]);
    if (uiPath) {
      this.designReinjectionTurn++;
      const reinject = await maybeBuildDesignReinjection(
        runContext.cwd,
        uiPath,
        {
          currentTurn: this.designReinjectionTurn,
          lastInjectedTurn: this.designReinjectionLastTurn,
          lastMtimes: this.designReinjectionLastMtimes,
        },
      );
      if (reinject) {
        messages = [
          ...messages,
          { role: 'user' as const, content: reinject.content },
        ];
        this.designReinjectionLastTurn = this.designReinjectionTurn;
        this.designReinjectionLastMtimes = reinject.updatedMtimes;
      }
    }

    // Exploration budget nudge — same as parallel path
    const seqNudge = this.maybeExplorationBudgetNudge([toolCall]);
    if (seqNudge) {
      messages = [
        ...messages,
        { role: 'user' as const, content: seqNudge },
      ];
    }

    return messages;
  }

  /**
   * Scan a batch of tool calls for a UI file write/edit and return the first
   * matching file path. Returns undefined if no UI file was touched.
   * Used by the design context re-injection hook to decide whether to refresh
   * the Decisions/design/* content into the next LLM turn.
   */
  private findUIFilePathInBatch(toolCalls: ToolCall[]): string | undefined {
    for (const tc of toolCalls) {
      if (tc.function.name !== 'file_write' && tc.function.name !== 'file_edit') continue;
      try {
        const args = JSON.parse(tc.function.arguments);
        const filePath = (args.file_path ?? args.path) as string | undefined;
        if (filePath && isUIFilePathLocal(filePath)) return filePath;
      } catch { /* malformed args — skip */ }
    }
    return undefined;
  }

  // ─── Task classification + exploration budget helpers ──────────────────

  /**
   * Walk the message array backwards to find the most recent user-role
   * message that represents a real user request (not a meta injection like
   * a memory brief or compression summary). Returns the text content, or
   * null if nothing qualifies.
   */
  private findLatestNonMetaUserMessage(messages: Message[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== 'user') continue;
      const text = getTextContent(m.content);
      if (!text.trim()) continue;
      if (isMetaPrefix(text)) continue;
      return text;
    }
    return null;
  }

  /**
   * Append text to the first system-role message's content, or prepend a
   * new system message if none exists. Used to merge the directness hint
   * into the session prompt without creating a separate system message
   * (which would break Qwen's "system must be at beginning" rule).
   */
  private appendToSystemMessage(messages: Message[], text: string): Message[] {
    if (messages.length > 0 && messages[0].role === 'system') {
      const existing = typeof messages[0].content === 'string' ? messages[0].content : '';
      return [
        { ...messages[0], content: existing + text },
        ...messages.slice(1),
      ];
    }
    // No system message — prepend one
    return [
      { role: 'system' as const, content: text.trimStart() },
      ...messages,
    ];
  }

  /**
   * Classify a tool call as a read-only exploration call (file_read, glob,
   * grep, list_directory, find_symbol, project_index) vs a write/action
   * call (file_write, file_edit, bash, git_*, etc). Used by the exploration
   * budget tracker to count "reads before first write" for each run.
   */
  private isReadOnlyToolCall(name: string): boolean {
    return (
      name === 'file_read' ||
      name === 'glob' ||
      name === 'grep' ||
      name === 'list_directory' ||
      name === 'find_symbol' ||
      name === 'project_index' ||
      name === 'git_status' ||
      name === 'git_diff' ||
      name === 'docs_lookup'
    );
  }

  private isWriteCapableToolCall(name: string): boolean {
    return (
      name === 'file_write' ||
      name === 'file_edit' ||
      name === 'bash' ||
      name === 'git_commit' ||
      name === 'git_create_pr'
    );
  }

  /**
   * After each batch of tool calls, update the exploration budget state
   * and return a nudge message if the budget has been exceeded. The nudge
   * is a soft signal — it's injected into the next LLM call's context
   * telling the agent "you're stalling, commit to a direction." It never
   * hard-stops the run; graceful escalation is the design intent.
   *
   * Returns null if no nudge is needed, or the nudge message body if the
   * caller should inject it before the next turn.
   */
  private maybeExplorationBudgetNudge(toolCalls: ToolCall[]): string | null {
    // Count this batch's reads + detect any writes
    let batchReads = 0;
    let batchHadWrite = false;
    for (const tc of toolCalls) {
      if (this.isReadOnlyToolCall(tc.function.name)) batchReads++;
      if (this.isWriteCapableToolCall(tc.function.name)) batchHadWrite = true;
    }

    // If she wrote at all, mark the run as "past the exploration phase"
    // and stop counting. The budget is specifically about read-before-write.
    if (batchHadWrite || this.hasWrittenInThisRun) {
      this.hasWrittenInThisRun = true;
      return null;
    }

    this.readCountBeforeFirstWrite += batchReads;

    // Don't re-fire the nudge once it's fired — one soft signal per run
    if (this.explorationNudgeFired) return null;

    const budget = COMPLEXITY_BUDGETS[this.currentTaskComplexity];
    if (this.readCountBeforeFirstWrite < budget.readCapBeforeFirstWrite) return null;

    this.explorationNudgeFired = true;
    logger.debug(`[agent] Exploration budget nudge: ${this.readCountBeforeFirstWrite} reads before first write (cap ${budget.readCapBeforeFirstWrite}) for ${this.currentTaskComplexity} task`);

    return [
      `[Exploration budget check — ${this.readCountBeforeFirstWrite} read-only tool calls and zero writes so far on a ${this.currentTaskComplexity} task.]`,
      '',
      `You're past the comfortable exploration window for this task size. Two honest options:`,
      `  1. You have enough context now — commit to a direction and make the change. Pick the most likely correct path and execute. You can always iterate.`,
      `  2. The task is actually bigger than it looked at first — say so clearly in your next response ("this looked focused but it needs broader changes because..."), then continue exploring with justification.`,
      '',
      `What you MUST NOT do: keep reading files silently. Either commit, or explain why you need more context. Stalling is the one unacceptable outcome.`,
    ].join('\n');
  }

  // ── v3 Memory graph integration ──────────────────────────────────────────

  /**
   * Feed the procedural observer with the tool-call sequence from this run.
   * Fire-and-forget — never blocks the response.
   */
  private feedProceduralObserver(messages: Message[], runContext: ToolExecutionContext): void {
    try {
      const mm = runContext.sharedState?.memoryManager as
        | { getProceduralObserver?: (scope: string) => { observe: (opts: any) => any } | null }
        | undefined;
      const observer = mm?.getProceduralObserver?.('project');
      if (!observer) return;

      // Extract tool-call sequence from the run's messages
      const toolSequence: string[] = [];
      for (const msg of messages) {
        if (msg.role === 'assistant' && 'tool_calls' in msg && (msg as any).tool_calls) {
          for (const tc of (msg as any).tool_calls) {
            toolSequence.push(tc.function?.name ?? 'unknown');
          }
        }
      }

      if (toolSequence.length < 3) return; // Too short to be a meaningful pattern

      observer.observe({
        toolSequence,
        taskType: undefined, // Auto-inferred from sequence
        project: runContext.cwd,
      });
    } catch {
      // Non-critical — never block the response
    }
  }

  /**
   * Save graph + procedural state at end of session.
   * Fire-and-forget — never blocks the response.
   */
  private saveGraphState(runContext: ToolExecutionContext): void {
    try {
      const mm = runContext.sharedState?.memoryManager as
        | { saveGraphs?: () => Promise<void>; runMaintenance?: () => Promise<void> }
        | undefined;
      if (mm?.saveGraphs) {
        mm.saveGraphs().catch(err =>
          logger.debug(`[agent] Graph save failed: ${err instanceof Error ? err.message : String(err)}`),
        );
      }
    } catch {
      // Non-critical
    }
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

    // ── Preserve the pinned original user task ─────────────────────────
    // The first real user message (not a meta injection like a memory brief
    // or compression summary) is the root intent of the whole session. It
    // must survive every compression pass or the post-compression agent
    // loses its sense of "what am I doing here" and fresh-greets the user.
    //
    // We find it by walking the pre-slice messages, and if it falls in the
    // compress zone (not already in the recent window), we pin it to be
    // re-added after the summary.
    const pinnedIdxInMessages = findOriginalUserTaskIndex(messages);
    const pinnedMessage = pinnedIdxInMessages !== -1 ? messages[pinnedIdxInMessages] : null;
    const pinnedIsInRecentWindow = pinnedIdxInMessages !== -1
      && pinnedIdxInMessages >= messages.length - KEEP_RECENT;

    const toCompress = rest.slice(0, -KEEP_RECENT);
    const toKeep = rest.slice(-KEEP_RECENT);

    // Build the text to summarize (extract text content, skip raw tool JSON)
    const transcript = toCompress
      .map((m) => {
        const text = getTextContent(m.content);
        return `[${m.role}]: ${text || '(no text)'}`;
      })
      .join('\n');

    const compressionPrompt = `You are a conversation summarizer preparing a handoff for an AI agent that will continue the work. The agent will have zero memory of this transcript except for what you produce, so your summary must be structured and decision-focused, not narrative.

Produce your output in EXACTLY this format:

CURRENT_TASK: <one sentence describing what the agent was actively working on at the end of the transcript. This is the single most important field — the agent uses it to decide what to do next. If multiple tasks were interleaved, pick the one that was most recently in flight.>

LAST_STEP: <one sentence describing the most recent concrete action the agent completed. Example: "Wrote src/components/HabitTracker.tsx with Tauri invoke calls for get_habit_logs."</  >

NEXT_STEP: <one sentence describing what the agent should do next to continue the task. Example: "Fix the missing habitId argument being passed to get_habit_logs in App.tsx."  >

BLOCKERS: <any active blockers the agent needs to know about. Write "none" if there are none.>

SUMMARY:
<Free-form bullet-point summary of everything else worth preserving: key decisions, file paths, function names, tool results, errors and how they were resolved, technical context. Be thorough but concise. Do NOT repeat what you put in the structured fields above.>

Rules:
- Every field above is MANDATORY. If you can't extract a value for one, write "unclear" but never omit the field.
- No pleasantries, no meta-commentary, no "Here's the summary" preamble.
- Use plain text in the structured fields — no markdown, no bullet points, no multi-line values.
- Keep the CURRENT_TASK, LAST_STEP, NEXT_STEP fields to a single sentence each.

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

      // ── Build the continuation-first summary message ────────────────
      // Extract structured CURRENT_TASK / LAST_STEP / NEXT_STEP / BLOCKERS
      // fields from the summariser's output. The summariser prompt asks
      // for these explicitly but LLMs paraphrase — the parser is lenient.
      const structured = extractStructuredFields(summary);
      const continuationHeader = buildCompressionContinuationHeader(summary, structured);
      const summaryMessage: Message = {
        role: 'user',
        content: continuationHeader,
      };

      // ── Build the session-tasks re-injection block ──────────────────
      // If the TaskManager has active session tasks, format them as a
      // continuation-focused block for direct injection into the
      // post-compression context. This is the single biggest signal that
      // stops the agent from treating compression as a fresh chat.
      let sessionTasksMessage: Message | null = null;
      try {
        const tm = (this.toolContext.sharedState as Record<string, unknown> | undefined)?.taskManager as
          | { getSessionTasks: () => TaskEntrySnapshot[] }
          | undefined;
        if (tm && typeof tm.getSessionTasks === 'function') {
          const tasks = tm.getSessionTasks();
          const block = formatSessionTasksBlock(tasks);
          if (block) {
            sessionTasksMessage = { role: 'user', content: block };
          }
        }
      } catch {
        /* non-critical — proceed without the task block */
      }

      // ── Re-pin the original user task if compression would remove it ─
      // The pinned message must be the first non-system message in the
      // result so the post-compression agent sees the original intent
      // before anything else. If the original task was already in the
      // recent window (short session), toKeep will contain it and we
      // don't need to re-pin. Otherwise, prepend it.
      let pinnedPrefix: Message[] = [];
      if (pinnedMessage && !pinnedIsInRecentWindow) {
        pinnedPrefix = [pinnedMessage];
      }

      const fixedTail = this.fixToolPairing(toKeep);

      // Assembly order matters for attention physics:
      //   1. system prompt (identity, rules, tools)
      //   2. pinned original user task (root intent — never loses)
      //   3. continuation header + summary (what happened, what's next)
      //   4. active session tasks block (source of truth for current work)
      //   5. recent 8 messages verbatim (most granular recent state)
      //
      // The post-compression model reads top to bottom and by the time it
      // reaches the recent messages it's already seen (a) what the session
      // is about, (b) a structured "continue from here" directive, and
      // (c) the concrete task list. Greeting-fresh becomes structurally
      // implausible.
      const middle: Message[] = [summaryMessage];
      if (sessionTasksMessage) middle.push(sessionTasksMessage);

      const result = systemMsg
        ? [systemMsg, ...pinnedPrefix, ...middle, ...fixedTail]
        : [...pinnedPrefix, ...middle, ...fixedTail];

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
  /**
   * Trim older messages for token-cost control, preserving everything that
   * matters for continuity:
   *   - The system prompt is never touched.
   *   - The pinned original user task is preserved verbatim (it's the root
   *     intent of the whole session and must survive every trim pass).
   *   - The last 8 messages are kept verbatim for recent context.
   *   - `tool`-role messages older than the recent window are trimmed to
   *     MAX_OLD_TOOL_CHARS (very aggressive — 200 chars — because tool
   *     outputs rarely matter in full once the next turn has consumed them).
   *   - `user` and `assistant` message bodies older than the recent window
   *     get trimmed if they exceed OLD_MESSAGE_BODY_MAX_CHARS. The structural
   *     "who said what" stays intact but verbose inlined content gets cut.
   *   - `reasoning_content` on old assistant messages is stripped entirely.
   *     Reasoning is working memory for the turn that produced it and has
   *     zero value once the next turn has landed — but it can be 10x larger
   *     than the actual response and was previously kept forever.
   *
   * This is the primary lever for keeping per-turn token cost in check on
   * long sessions. Combined with the earlier compression trigger (40%
   * instead of 70%), it dramatically reduces the cost of running an agent
   * for 60+ minutes on a single conversation.
   */
  private trimOldToolResults(messages: Message[]): Message[] {
    const KEEP_RECENT = 8; // Keep last 8 messages at full size
    const MAX_OLD_TOOL_CHARS = 200;

    if (messages.length <= KEEP_RECENT + 1) return messages; // +1 for system

    const cutoff = messages.length - KEEP_RECENT;
    const pinnedIdx = findOriginalUserTaskIndex(messages);

    return messages.map((m, i) => {
      // Never touch the system prompt or messages in the recent window
      if (i === 0 || i >= cutoff) return m;
      // Never touch the pinned original user task — it's the root of the
      // whole session and must survive every trim pass
      if (i === pinnedIdx) return m;

      // ── Tool-role trimming (most aggressive) ─────────────────────────
      if (m.role === 'tool' && typeof m.content === 'string') {
        if (m.content.length <= MAX_OLD_TOOL_CHARS) return m;
        return {
          ...m,
          content: m.content.slice(0, MAX_OLD_TOOL_CHARS) + `\n\n[Trimmed — original ${m.content.length} chars]`,
        };
      }

      // ── Assistant-role: strip reasoning_content + trim body ───────────
      if (m.role === 'assistant') {
        const assistantMsg = m as AssistantMessage;
        const hasReasoning = assistantMsg.reasoning_content !== undefined && assistantMsg.reasoning_content !== null;
        const textContent = typeof assistantMsg.content === 'string' ? assistantMsg.content : null;
        const needsBodyTrim = textContent !== null && textContent.length > OLD_MESSAGE_BODY_MAX_CHARS;

        if (!hasReasoning && !needsBodyTrim) return m;

        const trimmed: AssistantMessage = {
          ...assistantMsg,
          // Reasoning is always stripped from old messages — zero value once
          // the next turn is live, and it's often the biggest single allocation
          // in a long conversation's token budget.
          reasoning_content: null,
          // Body is trimmed only if it's over threshold
          content: needsBodyTrim && textContent !== null
            ? trimMessageBody(textContent)
            : assistantMsg.content,
        };
        return trimmed;
      }

      // ── User-role: trim long bodies (skip meta-prefixed messages) ─────
      if (m.role === 'user' && typeof m.content === 'string') {
        // Don't trim meta-prefixed messages (compression summaries, memory
        // briefs, system notices, task blocks) — their headers matter and
        // they're usually already short enough anyway.
        if (isMetaPrefix(m.content)) return m;
        if (m.content.length <= OLD_MESSAGE_BODY_MAX_CHARS) return m;
        return { ...m, content: trimMessageBody(m.content) };
      }

      return m;
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

    // ── Preserve the pinned original user task ──────────────────────
    // Same reasoning as compression paths: the root intent of the session
    // must survive even emergency truncation. We reserve tokens for it
    // upfront and then fill the rest of the budget from the most recent
    // messages backwards.
    const pinnedIdx = findOriginalUserTaskIndex(messages);
    const pinnedMsg = pinnedIdx !== -1 ? messages[pinnedIdx] : null;
    const pinnedTokens = pinnedMsg ? this.estimateMessageTokens(pinnedMsg) : 0;

    const budget = maxTokens - systemTokens - pinnedTokens;

    const kept: Message[] = [];
    let used = 0;

    for (let i = rest.length - 1; i >= 0; i--) {
      // Skip the pinned message during the backward walk — it will be
      // re-inserted at the pinned slot at the end. Including it twice
      // would double-charge its tokens and confuse the final order.
      if (pinnedMsg && rest[i] === pinnedMsg) continue;
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

    // Re-insert the pinned task at the very start of the rest (right after
    // system prompt). This guarantees the post-truncation agent sees the
    // original task as the first non-system message — the root intent
    // literally cannot be missed.
    const withPinned = pinnedMsg ? [pinnedMsg, ...fixed] : fixed;

    return systemMsg ? [systemMsg, ...withPinned] : withPinned;
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
