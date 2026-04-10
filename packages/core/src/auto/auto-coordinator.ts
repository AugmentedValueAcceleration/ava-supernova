import type { Message, AssistantMessage, ContentPart } from '../core/types.js';
import type { Provider } from '../providers/types.js';
import type { ModelDefinition } from '../core/types.js';
import type { ProviderRegistry } from '../providers/provider-registry.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { AgentEvent, AgentEventHandler } from '../agent/agent.js';
import type { TaskCategory, RouteResult, UserRoutePreferences, AutoEvent } from './types.js';
import type { TaskManager } from '../tasks/task-manager.js';

import { Agent } from '../agent/agent.js';
import { Conductor } from '../personas/conductor.js';
import { Conversation } from '../agent/conversation.js';
import { classifyTask } from './task-classifier.js';
import { ModelRouter } from './model-router.js';
import { generateBrief, formatBriefAsSystem } from './brief-generator.js';
import { ContextTracker } from './context-tracker.js';
import { resolveCoordinatorModel } from './coordinator-model.js';
import { buildSystemPrompt } from '../agent/system-prompt.js';
import { TaskExecutor } from './task-executor.js';
import { logger } from '../core/logger.js';

// Categories where Conductor orchestration may trigger on the spawned agent
const ORCHESTRATED_CATEGORIES = new Set<TaskCategory>(['planning', 'security', 'brainstorm', 'teach']);

// Categories the coordinator handles directly (no agent spawn)
const DIRECT_CATEGORIES = new Set<TaskCategory>(['chat', 'image_gen', 'vision']);

// Map task categories to mode names for conductor/system prompt
const CATEGORY_TO_MODE: Record<string, string> = {
  coding: 'work',
  vision: 'work',
  image_gen: 'work',
  planning: 'plan',
  chat: 'chat',
  long_context: 'work',
  teach: 'teach',
  security: 'security',
  brainstorm: 'brainstorm',
};

/**
 * Auto Mode coordinator.
 *
 * Sits on a persistent model (M2.7 for platform users) and routes tasks
 * to the best available model by spawning fresh Agent instances.
 * Simple tasks (chat, image gen) are handled directly without spawning.
 */
export class AutoCoordinator {
  private coordinatorAgent: Agent;
  private coordinatorProvider: Provider;
  private coordinatorModel: ModelDefinition;
  private toolRegistry: ToolRegistry;
  private cwd: string;
  private sharedState: Record<string, unknown>;
  private router: ModelRouter;
  private projectInstructions: string;
  private systemPromptOpts: Record<string, unknown>;

  constructor(opts: {
    coordinatorProvider: Provider;
    coordinatorModel: ModelDefinition;
    providerRegistry: ProviderRegistry;
    toolRegistry: ToolRegistry;
    cwd: string;
    sharedState: Record<string, unknown>;
    availableProviders: Set<string>;
    platformKey?: string;
    userPreferences?: UserRoutePreferences;
    projectInstructions?: string;
    systemPromptOpts?: Record<string, unknown>;
  }) {
    this.coordinatorProvider = opts.coordinatorProvider;
    this.coordinatorModel = opts.coordinatorModel;
    this.toolRegistry = opts.toolRegistry;
    this.cwd = opts.cwd;
    this.sharedState = opts.sharedState;
    this.projectInstructions = opts.projectInstructions || '';
    this.systemPromptOpts = opts.systemPromptOpts || {};

    this.router = new ModelRouter(
      opts.providerRegistry,
      opts.availableProviders,
      opts.platformKey,
      opts.userPreferences,
    );

    // The coordinator's own agent — handles direct tasks (chat, simple questions)
    this.coordinatorAgent = new Agent({
      provider: opts.coordinatorProvider,
      model: opts.coordinatorModel,
      toolRegistry: opts.toolRegistry,
      cwd: opts.cwd,
      sharedState: opts.sharedState,
    });
  }

  /**
   * Create an AutoCoordinator with the correct coordinator model.
   * Platform users: Kimi K2.5. BYOK users: best available. Free: Qwen Flash.
   * Returns null if no model is available.
   */
  static create(opts: {
    providerRegistry: ProviderRegistry;
    toolRegistry: ToolRegistry;
    cwd: string;
    sharedState: Record<string, unknown>;
    availableProviders: Set<string>;
    platformKey?: string;
    userPreferences?: UserRoutePreferences;
    projectInstructions?: string;
    systemPromptOpts?: Record<string, unknown>;
  }): AutoCoordinator | null {
    const coordinator = resolveCoordinatorModel(
      opts.providerRegistry,
      opts.availableProviders,
      !!opts.platformKey || opts.availableProviders.has('platform'),
    );
    if (!coordinator) return null;

    return new AutoCoordinator({
      coordinatorProvider: coordinator.provider,
      coordinatorModel: coordinator.model,
      ...opts,
    });
  }

  /**
   * Process a user message. Classifies the task, routes to the best model,
   * spawns an agent if needed, and returns updated messages.
   *
   * After the planning agent returns, checks for newly created session tasks
   * (added by present_plan + todo_write) and dispatches the TaskExecutor to
   * run a fresh Builder for each one. This is the JARVIS hand-off — the
   * conductor model plans, Builder agents execute.
   *
   * Drop-in replacement for Agent.run() — same signature.
   */
  async run(
    messages: Message[],
    onEvent: AgentEventHandler,
    signal?: AbortSignal,
  ): Promise<Message[]> {
    // Snapshot pending session task IDs BEFORE the run so we can detect tasks
    // newly created during this turn (vs leftovers from a previous run).
    const taskMgr = this.getTaskManager();
    const pendingBefore = taskMgr
      ? new Set(taskMgr.getSessionTasks().filter(t => t.status === 'todo').map(t => t.id))
      : new Set<string>();

    // ── Event interception ──────────────────────────────────────────────────
    // Sub-agents (planning leg + each Builder task) each fire `done` and
    // `stream_end` events when their own loops finish. If we forward those
    // straight through, the webview thinks the whole run is over and flips
    // the STOP button back to SEND mid-orchestration — even though the
    // executor is about to spawn the next Builder. Suppress those terminal
    // events from sub-agents and emit a single coordinated `done` at the
    // very end of run() instead.
    let lastFinalMessage: AssistantMessage | null = null;
    const interceptedOnEvent: AgentEventHandler = (event) => {
      if (event.type === 'done') {
        // Remember the last final message but don't forward it — we'll fire
        // a single done at the end of the orchestrated run.
        lastFinalMessage = event.finalMessage;
        return;
      }
      onEvent(event);
    };

    // Run the planning leg — existing logic, just with the intercepted handler.
    const planResult = await this.runPlanningLeg(messages, interceptedOnEvent, signal);

    // Execution leg: if the planning agent created new session tasks via
    // present_plan + todo_write, dispatch the Builder executor to run them.
    if (taskMgr && !signal?.aborted) {
      const newlyPending = taskMgr.getSessionTasks().filter(
        t => t.status === 'todo' && !pendingBefore.has(t.id),
      );

      if (newlyPending.length > 0) {
        logger.debug(`[auto-coordinator] Dispatching TaskExecutor for ${newlyPending.length} new tasks`);

        const executor = new TaskExecutor({
          provider: this.coordinatorProvider,
          model: this.coordinatorModel,
          toolRegistry: this.toolRegistry,
          taskManager: taskMgr,
          cwd: this.cwd,
          sharedState: this.sharedState,
        });

        const planContext = this.extractPlanContext(planResult);

        try {
          const execResult = await executor.executeAll(planContext, interceptedOnEvent, signal);

          // Append the execution summary as the final assistant message so
          // the user sees a clear "what got built" recap in the chat.
          if (execResult.summary) {
            const summaryMessage: AssistantMessage = { role: 'assistant', content: execResult.summary };
            planResult.push(summaryMessage);
            lastFinalMessage = summaryMessage;
          }
        } catch (err) {
          logger.debug(`[auto-coordinator] TaskExecutor threw: ${err}`);
          onEvent({
            type: 'error',
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    }

    // Now that the entire orchestration is complete, fire a single `done`
    // event so the webview can transition the STOP button back to SEND.
    onEvent({
      type: 'done',
      finalMessage: lastFinalMessage ?? { role: 'assistant', content: '' },
    });

    return planResult;
  }

  /**
   * The original planning logic — classify, route, spawn task agent.
   * Extracted so the execution dispatch wrapper in run() can stay readable.
   */
  private async runPlanningLeg(
    messages: Message[],
    onEvent: AgentEventHandler,
    signal?: AbortSignal,
  ): Promise<Message[]> {
    // Extract user message text for classification
    const userMsg = this.getLastUserMessage(messages);
    if (!userMsg) {
      // No user message — just forward to coordinator
      return this.coordinatorAgent.run(messages, onEvent, signal);
    }

    const mode = this.detectMode(messages);
    const tokenCount = this.estimateTokenCount(messages);

    // Classify the task
    const classification = classifyTask(userMsg.content, mode, tokenCount);

    // Direct handling — no spawn needed
    if (DIRECT_CATEGORIES.has(classification.category) && !classification.modelOverride) {
      return this.coordinatorAgent.run(messages, onEvent, signal);
    }

    // Route to best model
    const route = this.router.route(classification.category, classification.modelOverride);
    if (!route) {
      // No model available — fallback to coordinator
      return this.coordinatorAgent.run(messages, onEvent, signal);
    }

    // If routed to the same model as coordinator, just run directly
    if (route.model.id === this.coordinatorModel.id && route.provider.name === this.coordinatorProvider.name) {
      return this.coordinatorAgent.run(messages, onEvent, signal);
    }

    // Emit routing event
    this.emitAutoEvent(onEvent, {
      type: 'auto_routing',
      category: classification.category,
      model: route.model.name,
      reason: classification.reason + ' → ' + route.reason,
    });

    // Spawn task agent
    try {
      const result = await this.spawnTaskAgent(
        classification.category,
        route,
        messages,
        userMsg,
        onEvent,
        signal,
      );
      return result;
    } catch (err) {
      // Fallback to coordinator on spawn failure
      onEvent({ type: 'error', error: err instanceof Error ? err : new Error(String(err)) });
      return this.coordinatorAgent.run(messages, onEvent, signal);
    }
  }

  /** Pull the TaskManager out of sharedState if the host wired it in. */
  private getTaskManager(): TaskManager | undefined {
    const tm = this.sharedState.taskManager as TaskManager | undefined;
    return tm && typeof tm.getSessionTasks === 'function' ? tm : undefined;
  }

  /**
   * Pull a concise plan context from the conversation so the Builder sub-agents
   * have something more grounded than just task titles. Looks for the most
   * recent present_plan tool call and extracts title/goal/verification.
   */
  private extractPlanContext(messages: Message[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== 'assistant') continue;
      const tcs = (m as AssistantMessage).tool_calls;
      if (!tcs) continue;
      for (const tc of tcs) {
        if (tc.function?.name !== 'present_plan') continue;
        try {
          const args = JSON.parse(tc.function.arguments || '{}') as {
            title?: string;
            goal?: string;
            verification?: string;
          };
          const parts: string[] = [];
          if (args.title) parts.push(`**${args.title}**`);
          if (args.goal) parts.push(args.goal);
          if (args.verification) parts.push(`Verification: ${args.verification}`);
          if (parts.length > 0) return parts.join('\n');
        } catch {
          /* fall through to next */
        }
      }
    }
    // Fallback: the user's most recent message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const c = messages[i].content;
        return typeof c === 'string' ? c : '';
      }
    }
    return '';
  }

  /** Inject a mid-run message (delegates to coordinator agent) */
  inject(message: string): void {
    this.coordinatorAgent.inject(message);
  }

  /** Manual context compression (delegates to coordinator agent) */
  async manualCompress(messages: Message[], onEvent: AgentEventHandler, signal?: AbortSignal): Promise<Message[]> {
    return this.coordinatorAgent.manualCompress(messages, onEvent, signal);
  }

  /** Compress context (delegates to coordinator agent) */
  async compressContext(messages: Message[], onEvent: AgentEventHandler, signal?: AbortSignal): Promise<Message[]> {
    return this.coordinatorAgent.compressContext(messages, onEvent, signal);
  }

  /** Update route preferences */
  setPreferences(prefs: UserRoutePreferences): void {
    this.router.setPreferences(prefs);
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async spawnTaskAgent(
    category: TaskCategory,
    route: RouteResult,
    originalMessages: Message[],
    userMsg: { content: string | ContentPart[]; index: number },
    onEvent: AgentEventHandler,
    signal?: AbortSignal,
  ): Promise<Message[]> {
    // Emit agent start
    this.emitAutoEvent(onEvent, { type: 'auto_agent_start', model: route.model.name, category });

    // Generate focused brief
    const memories = await this.recallMemories(userMsg.content);
    const brief = generateBrief(
      userMsg.content,
      originalMessages,
      memories,
      this.projectInstructions,
      route.model,
    );

    // Build system prompt for the task agent
    const mode = CATEGORY_TO_MODE[category] || 'work';
    const systemPrompt = buildSystemPrompt({
      ...this.systemPromptOpts,
      mode,
    } as any);

    // Create task conversation with system prompt + brief + user message
    const taskConversation = new Conversation();
    taskConversation.setSystemPrompt(systemPrompt + '\n\n---\n\n' + formatBriefAsSystem(brief));

    // Add the user's actual message
    taskConversation.addUserMessage(userMsg.content);

    // Set activeModelId to spawned agent's model for tool routing
    const originalActiveModel = this.sharedState.activeModelId;
    this.sharedState.activeModelId = route.model.id;

    // Create the task agent
    const taskAgent = new Agent({
      provider: route.provider,
      model: route.model,
      toolRegistry: this.toolRegistry,
      cwd: this.cwd,
      sharedState: this.sharedState,
    });

    // Context tracker — safe pause before hitting limits
    const tracker = new ContextTracker(route.model.contextWindow);
    tracker.onCritical = () => {
      taskAgent.inject(
        '[CONTEXT LIMIT] You are approaching your context limit. ' +
        'Wrap up your current work, save progress, and summarise what you have done so far.',
      );
    };

    // Wrap onEvent to track context and proxy events
    const wrappedOnEvent: AgentEventHandler = (event) => {
      // Track context usage
      if (event.type === 'context_usage') {
        tracker.update((event as any).context?.usedTokens || 0);
      }
      // Forward all events to the user
      onEvent(event);
    };

    // Run Conductor orchestration if this category needs it
    if (ORCHESTRATED_CATEGORIES.has(category)) {
      const taskConductor = new Conductor({
        provider: route.provider,
        model: route.model,
        toolRegistry: this.toolRegistry,
        cwd: this.cwd,
        sharedState: this.sharedState,
      });

      if (taskConductor.needsOrchestration(brief.task, mode)) {
        try {
          const { synthesisPrompt } = await taskConductor.orchestrate(
            brief.task,
            mode,
            taskConversation.getMessages(),
            (conductorEvent) => {
              // Forward conductor events
              onEvent(conductorEvent as unknown as AgentEvent);
            },
            signal,
          );

          if (synthesisPrompt) {
            const msgs = taskConversation.getMessages();
            msgs.push({ role: 'user', content: `[Internal Planning]\n\n${synthesisPrompt}` });
            taskConversation.setMessages(msgs);
          }
        } catch {
          // Conductor failure is non-fatal — agent proceeds without orchestration
        }
      }
    }

    // Run the task agent
    const updatedTaskMessages = await taskAgent.run(
      taskConversation.getMessages(),
      wrappedOnEvent,
      signal,
    );

    // Restore activeModelId
    this.sharedState.activeModelId = originalActiveModel;

    // Extract the agent's final assistant message
    const agentResult = this.extractLastAssistantMessage(updatedTaskMessages);

    // Build summary for coordinator's context (keeps it lean)
    const summary = agentResult
      ? (agentResult.length > 3000 ? agentResult.slice(0, 500) + '...' : agentResult)
      : 'Task completed.';

    // Emit agent end
    this.emitAutoEvent(onEvent, { type: 'auto_agent_end', model: route.model.name, summary });

    // Append the agent's result to the original conversation
    const result = [...originalMessages];
    if (agentResult) {
      result.push({ role: 'assistant', content: agentResult });
    }

    return result;
  }

  private getLastUserMessage(messages: Message[]): { content: string | ContentPart[]; index: number } | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return { content: messages[i].content as string | ContentPart[], index: i };
      }
    }
    return null;
  }

  private extractLastAssistantMessage(messages: Message[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        const msg = messages[i] as AssistantMessage;
        return typeof msg.content === 'string' ? msg.content : null;
      }
    }
    return null;
  }

  private detectMode(messages: Message[]): string {
    // Check the system prompt for mode hints
    const systemMsg = messages.find(m => m.role === 'system');
    if (!systemMsg) return 'work';
    const content = typeof systemMsg.content === 'string' ? systemMsg.content : '';
    if (content.includes('Chat mode') || content.includes('friend mindset')) return 'chat';
    if (content.includes('Plan mode') || content.includes('architect mindset')) return 'plan';
    if (content.includes('Teach mode') || content.includes('tutor mindset')) return 'teach';
    if (content.includes('Security mode') || content.includes('auditor mindset')) return 'security';
    if (content.includes('Brainstorm mode') || content.includes('ideation mindset')) return 'brainstorm';
    return 'work';
  }

  private estimateTokenCount(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += Math.ceil(msg.content.length / 4);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') total += Math.ceil(part.text.length / 4);
          else total += 85; // image
        }
      }
    }
    return total;
  }

  private async recallMemories(content: string | ContentPart[]): Promise<string> {
    const text = typeof content === 'string'
      ? content
      : content.filter(p => p.type === 'text').map(p => (p as { text: string }).text).join(' ');

    // Try Memory Agent first (curated brief)
    const ma = this.sharedState.memoryAgent as {
      generateBrief?: (msg: string) => Promise<{ summary: string }>;
    } | undefined;

    if (ma?.generateBrief) {
      try {
        const brief = await ma.generateBrief(text);
        if (brief.summary) return brief.summary;
      } catch { /* fall through */ }
    }

    // Fallback: direct recall
    const mm = this.sharedState.memoryManager as {
      recall?: (opts: { query: string; limit: number; scope: string }) => Promise<Array<{ content: string; category: string }>>;
    } | undefined;

    if (!mm?.recall) return '';

    try {
      const entries = await mm.recall({ query: text, limit: 5, scope: 'all' });
      if (!entries || entries.length === 0) return '';
      return entries.map(e => `[${e.category}] ${e.content}`).join('\n');
    } catch {
      return '';
    }
  }

  private emitAutoEvent(onEvent: AgentEventHandler, event: AutoEvent): void {
    // Auto events are forwarded as AgentEvents with the same shape
    onEvent(event as unknown as AgentEvent);
  }
}
