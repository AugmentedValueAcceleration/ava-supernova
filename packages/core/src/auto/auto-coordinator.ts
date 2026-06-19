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
import { VerifyChangeTool } from '../tools/verify-change.js';
import { Conversation } from '../agent/conversation.js';
import { classifyTask } from './task-classifier.js';
import { ModelRouter } from './model-router.js';
import { generateBrief, formatBriefAsSystem } from './brief-generator.js';
import { ContextTracker } from './context-tracker.js';
import { resolveCoordinatorModel } from './coordinator-model.js';
import { classifyIntent, classifyTeachDepth, resolveIntentGateModel } from './intent-gate.js';
import { SUPERNOVA_COORDINATOR_ID, SUPERNOVA_BUILDER_ID, SUPERNOVA_VISION_ID } from './supernova-router.js';
import { AURORA_COORDINATOR_ID, AURORA_BUILDER_ID, AURORA_VISION_ID } from './aurora-router.js';
import type { RoutingMode } from './model-router.js';
import { buildSystemPrompt } from '../agent/system-prompt.js';
import { TaskExecutor } from './task-executor.js';
import { extractChangesSummary } from './changes-summary.js';
import { logger } from '../core/logger.js';
import { avaEvents, withTrajectory, withChildTrajectory, getTrajectory } from '../dataset/emitter.js';
import type { AvaSurface, AvaMode } from '../dataset/events.js';
import { chargeCredits, extractUsage } from '../billing/meter.js';
import { randomUUID } from 'node:crypto';

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
  /**
   * Cheap fast model (Qwen 3.5 Flash preferred) for upstream intent
   * classification. If available, runs before the spawn decision to
   * decide whether the coordinator can handle the prompt directly or
   * whether to route to the specialist team. Null when no suitable
   * model is reachable — the caller then falls back to the regex-based
   * Conductor.needsOrchestration gate.
   */
  private intentGate: { provider: Provider; model: ModelDefinition } | null;
  /**
   * True when a platform key is present. On platform we split light-tier
   * personas onto a cheap fast model (a cost optimisation — the platform
   * holds every key). On BYOK (false) we DON'T: the whole persona team runs
   * on the user's one coordinator model, so the full Ava orchestration runs
   * on the model they actually chose, never silently handed to a model they
   * may not even have a key for.
   */
  private readonly hasPlatform: boolean;
  // The Agent currently executing inside run(). May be the planning task agent
  // or a Builder spawned by TaskExecutor. inject() forwards to whichever is
  // active so user mid-run messages reach the agent that's actually running.
  private activeAgent: Agent | null = null;
  /** Surface and session for dataset trajectory attribution. */
  private readonly surface: AvaSurface;
  private readonly sessionId: string;

  /** Routing mode — 'auto' (default) or 'supernova' (polyglot). Threaded
   *  into the model router and consulted when spawning Builder so the
   *  per-task model picks honor whichever mode the operator selected. */
  private readonly mode: RoutingMode;
  /** Provider+model the Builder agent (TaskExecutor spawn) runs on. In
   *  Auto mode this is the coordinator model — Builder inherits whatever
   *  the conductor brain runs on. In Supernova mode it's Qwen 3.6 Plus
   *  per the locked routing map (Terminal-Bench leader on real agent
   *  loops, vision-aware so screenshots don't need a re-route). */
  private readonly builderProvider: Provider;
  private readonly builderModel: ModelDefinition;
  /** Provider+model for image/vision input. The coordinators are blind to
   *  images (DeepSeek V4 Pro, Mistral Large 3 — no vision via API), so the
   *  coordinator/task agents carry this as a vision bridge: an attached image
   *  is DESCRIBED by a vision-capable model (Supernova / Auto → Qwen 3.5 Omni
   *  Plus, Aurora → Mistral Medium 3.5) and injected as text, so the coordinator
   *  still does the work. Null when none is reachable — then the coordinator
   *  runs and honestly says it can't see the image (rather than hallucinate one). */
  private readonly visionProvider: Provider | null;
  private readonly visionModel: ModelDefinition | null;

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
    /** Surface this coordinator runs in. Threaded into nested Agent's
     *  trajectory envelopes for dataset event attribution. */
    surface?: AvaSurface;
    /** Optional session UUID. Defaults to a fresh one. */
    sessionId?: string;
    /** 'auto' (default) or 'supernova'. Controls routing table + Builder model. */
    mode?: RoutingMode;
  }) {
    this.coordinatorProvider = opts.coordinatorProvider;
    this.coordinatorModel = opts.coordinatorModel;
    this.toolRegistry = opts.toolRegistry;
    this.cwd = opts.cwd;
    this.sharedState = opts.sharedState;
    this.projectInstructions = opts.projectInstructions || '';
    this.systemPromptOpts = opts.systemPromptOpts || {};
    this.surface = opts.surface ?? 'cli';
    this.sessionId = opts.sessionId ?? randomUUID();
    this.mode = opts.mode ?? 'auto';

    this.router = new ModelRouter(
      opts.providerRegistry,
      opts.availableProviders,
      opts.platformKey,
      opts.userPreferences,
      this.mode,
    );

    // Resolve the Builder model. Supernova spawns Qwen 3.6 Plus, Aurora
    // spawns Mistral Medium 3.5 (the merged flagship — 128B dense,
    // 256K context, vision encoder from scratch, 77.6% SWE-Bench Verified,
    // modified-MIT open weights). Auto reuses the coordinator model for
    // backward-compatibility with the existing tuning. If the override
    // can't resolve (platform not enabled, model not registered) fall
    // back to the coordinator model rather than block.
    if (this.mode === 'supernova') {
      const resolved = opts.providerRegistry.resolveModel(`platform:${SUPERNOVA_BUILDER_ID}`)
        ?? opts.providerRegistry.resolveModel(SUPERNOVA_BUILDER_ID);
      this.builderProvider = resolved?.provider ?? opts.coordinatorProvider;
      this.builderModel = resolved?.model ?? opts.coordinatorModel;
    } else if (this.mode === 'aurora') {
      // Aurora is Mistral-only — try platform-managed Mistral first
      // (Ava's Mistral key, includes Aurora as a managed option), then
      // BYOK Mistral, then fall back to coordinator if neither resolves.
      const resolved = opts.providerRegistry.resolveModel(`platform:${AURORA_BUILDER_ID}`)
        ?? opts.providerRegistry.resolveModel(`mistral:${AURORA_BUILDER_ID}`)
        ?? opts.providerRegistry.resolveModel(AURORA_BUILDER_ID);
      this.builderProvider = resolved?.provider ?? opts.coordinatorProvider;
      this.builderModel = resolved?.model ?? opts.coordinatorModel;
    } else {
      this.builderProvider = opts.coordinatorProvider;
      this.builderModel = opts.coordinatorModel;
    }

    // Resolve the vision model for image inputs (see field doc). Mirrors the
    // builder resolution: platform-managed first, then BYOK, then null.
    const visionId = this.mode === 'aurora' ? AURORA_VISION_ID : SUPERNOVA_VISION_ID;
    const visionResolved =
      opts.providerRegistry.resolveModel(`platform:${visionId}`)
      ?? opts.providerRegistry.resolveModel(visionId)
      ?? (this.mode === 'aurora' ? opts.providerRegistry.resolveModel(`mistral:${visionId}`) : null);
    this.visionProvider = visionResolved?.provider ?? null;
    this.visionModel = visionResolved?.model ?? null;

    // Resolve a cheap fast model for the upstream intent gate.
    // Prefers Qwen 3.5 Flash on platform; falls through to Haiku/DeepSeek
    // on BYOK. Null if nothing viable is reachable — in that case the
    // spawn decision falls back to the regex-based Conductor gate only.
    this.hasPlatform = !!opts.platformKey || opts.availableProviders.has('platform');
    this.intentGate = resolveIntentGateModel(
      opts.providerRegistry,
      opts.availableProviders,
      this.hasPlatform,
    );

    // The coordinator's own agent — handles direct tasks (chat, simple questions).
    // Wired with the vision bridge so a text-only coordinator (DeepSeek V4 /
    // Mistral) can still "see" attached images: the bridge runs the vision model
    // (Qwen Omni) to describe them and injects that as text. This is what lets
    // Supernova act on an image instead of handing the whole turn to Omni.
    this.coordinatorAgent = new Agent({
      provider: opts.coordinatorProvider,
      model: opts.coordinatorModel,
      visionProvider: this.visionProvider ?? undefined,
      visionModel: this.visionModel ?? undefined,
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
    // Operator's chosen coordinator model id (e.g. 'platform:deepseek-v4-pro-platform').
    // When set and resolvable, wins over the default priority ladder.
    preferredCoordinatorId?: string;
    /** 'auto' (default) or 'supernova'. */
    mode?: RoutingMode;
  }): AutoCoordinator | null {
    // Supernova / Aurora mode pin specific coordinators — that's part of
    // what makes each mode itself. Supernova → V4 Pro, Aurora → Mistral
    // Large 3. Falls through to the default priority ladder if the
    // operator already passed an explicit preference (rare; means they're
    // admin-overriding the override).
    const hasPlatform = !!opts.platformKey || opts.availableProviders.has('platform');
    let coordinator: ReturnType<typeof resolveCoordinatorModel> = null;

    if (opts.preferredCoordinatorId) {
      // Explicit operator override wins for any mode.
      coordinator = resolveCoordinatorModel(
        opts.providerRegistry, opts.availableProviders, hasPlatform, opts.preferredCoordinatorId,
      );
    } else if (opts.mode === 'aurora') {
      // Aurora is Mistral-only — never silently routes to a non-Mistral
      // coordinator. Try Medium 3.5 platform-managed → BYOK → Large 3 reserve.
      // Returns null if no Mistral model is reachable so the caller can surface
      // a clear error rather than breaking the EU-stack guarantee with a Qwen
      // fallback. The registry bridges the native/-platform id-suffix duality,
      // so the native AURORA_* ids resolve on both managed and BYOK surfaces.
      const tries = [
        `platform:${AURORA_COORDINATOR_ID}`,
        `mistral:${AURORA_COORDINATOR_ID}`,
        AURORA_COORDINATOR_ID,
        `platform:${AURORA_BUILDER_ID}`,
        `mistral:${AURORA_BUILDER_ID}`,
        AURORA_BUILDER_ID,
      ];
      for (const id of tries) {
        const resolved = opts.providerRegistry.resolveModel(id);
        if (resolved) {
          coordinator = {
            provider: resolved.provider,
            model: resolved.model,
            reason: `${resolved.model.name} — Aurora coordinator (Mistral-only routing)`,
          };
          break;
        }
      }
    } else if (opts.mode === 'supernova') {
      // Supernova pins DeepSeek V4 Pro as coordinator — try platform-managed →
      // BYOK deepseek → native. Unlike Aurora, Supernova is polyglot, so it
      // falls through to the generic priority ladder if DeepSeek isn't
      // reachable rather than erroring.
      for (const id of [
        `platform:${SUPERNOVA_COORDINATOR_ID}`,
        `deepseek:${SUPERNOVA_COORDINATOR_ID}`,
        SUPERNOVA_COORDINATOR_ID,
      ]) {
        const resolved = opts.providerRegistry.resolveModel(id);
        if (resolved) {
          coordinator = {
            provider: resolved.provider,
            model: resolved.model,
            reason: `${resolved.model.name} — Supernova coordinator`,
          };
          break;
        }
      }
      if (!coordinator) {
        coordinator = resolveCoordinatorModel(opts.providerRegistry, opts.availableProviders, hasPlatform);
      }
    } else {
      // Auto / Maestro — generic priority ladder.
      coordinator = resolveCoordinatorModel(opts.providerRegistry, opts.availableProviders, hasPlatform);
    }
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
    // Open a dataset trajectory for the entire coordinator run. Inner
    // Agent.run() calls (planning agent + Builder agents) inherit this
    // as their parent_trajectory_id so the orchestration tree can be
    // reconstructed at training time. Mode is detected from the
    // incoming messages so events get attributed correctly.
    const mode = (this.detectMode(messages) ?? 'work') as AvaMode;
    const openTrajectory = getTrajectory() ? withChildTrajectory : withTrajectory;
    return openTrajectory(
      {
        session_id: this.sessionId,
        surface: this.surface,
        mode,
        model_id: this.coordinatorModel.id,
      },
      () => this.runInner(messages, onEvent, signal),
    );
  }

  private async runInner(
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

      // ── Orchestration gate ─────────────────────────────────────────────
      // The planning agent may speculatively create session tasks in
      // response to any substantive request. Previously, any newly-created
      // task triggered the TaskExecutor dispatch. That's how "launch the
      // dev app" turned into a 5-task redesign + fix + document + launch
      // run — the planner created all five tasks speculatively, and the
      // executor dutifully executed them without asking.
      //
      // The gate asks Qwen Flash one question: given the user's actual
      // message and the tasks that were just proposed, does the user
      // want these executed as a plan, or did they ask for something
      // simpler? If the answer is "simpler", the speculative tasks are
      // marked deferred (still visible to the user in the task list so
      // they can kick them off manually if they wanted them) and the
      // executor does not run.
      let shouldDispatch = newlyPending.length > 0;
      if (shouldDispatch && !(await this.shouldOrchestrate(messages, newlyPending.map(t => t.title)))) {
        logger.info(`[auto-coordinator] Orchestration gate: ${newlyPending.length} tasks created speculatively — user intent does not match. Deferring them.`);
        for (const task of newlyPending) {
          try {
            taskMgr.updateTask(task.id, { status: 'deferred' } as any);
          } catch { /* best-effort */ }
        }
        onEvent({
          type: 'auto_routing',
          category: 'coding',
          model: this.coordinatorModel.id,
          reason: `Speculative task breakdown skipped — user request did not warrant orchestration. ${newlyPending.length} tasks saved as deferred for manual dispatch.`,
        } as AutoEvent);
        shouldDispatch = false;
      }

      if (shouldDispatch) {
        logger.debug(`[auto-coordinator] Dispatching TaskExecutor for ${newlyPending.length} new tasks (mode=${this.mode}, builder=${this.builderModel.name})`);

        const executor = new TaskExecutor({
          // Builder model — Auto reuses the coordinator, Supernova pins to
          // Qwen 3.6 Plus per the polyglot routing map. See constructor.
          provider: this.builderProvider,
          model: this.builderModel,
          toolRegistry: this.toolRegistry,
          taskManager: taskMgr,
          cwd: this.cwd,
          sharedState: this.sharedState,
          // Forward Builder lifecycle into our activeAgent slot so user
          // injections during execution land in the running Builder, not
          // the dead coordinator queue.
          onActiveAgentChange: (agent) => this.setActiveAgent(agent),
          // Full base-prompt opts so the Builder sub-agent inherits the same
          // rules, trust boundary, code craft, verified-done discipline and
          // completion contract the main agent runs on — instead of the thin
          // standalone Builder prompt it used before. The Decisions-folder
          // state rides along inside these opts and is rendered by
          // buildSystemPrompt, so Builders pick up the convention too.
          systemPromptOpts: this.systemPromptOpts,
        });

        const planContext = this.extractPlanContext(planResult);

        try {
          const execResult = await executor.executeAll(planContext, interceptedOnEvent, signal);

          // ── Cross-task integration verification ──────────────────────────
          // Each Builder verifies its OWN changes in isolation, but a clean
          // run of N independent tasks can still leave the project broken at
          // the seams — task 3 renames an export task 1 still imports, a
          // migration lands without the route that reads it. Once execution
          // finishes with nothing blocked, run a single verify pass over the
          // UNION of every file the completed Builders touched, so typechecks
          // and route/migration checks see the assembled whole. Reuses the
          // existing runPostBuildVerification (with its built-in single retry
          // semantics) — here we surface a failure rather than auto-fixing,
          // since the fix could span multiple tasks and is the user's call.
          let integrationBlock: string | null = null;
          if (execResult.blocked === 0 && execResult.changedFiles.length > 0 && !signal?.aborted) {
            try {
              const integrationResult = await this.runPostBuildVerification(
                execResult.changedFiles,
                interceptedOnEvent,
                signal,
              );
              if (integrationResult) {
                integrationBlock = integrationResult.block;
              }
            } catch (err) {
              logger.debug(
                `[auto-coordinator] Integration verification failed to run: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
            }
          }

          // Append the execution summary as the final assistant message so
          // the user sees a clear "what got built" recap in the chat — with
          // the integration verification block composed in when present.
          const composedSummary = execResult.summary
            ? (integrationBlock ? `${execResult.summary}\n\n${integrationBlock}` : execResult.summary)
            : integrationBlock;
          if (composedSummary) {
            const summaryMessage: AssistantMessage = { role: 'assistant', content: composedSummary };
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
      return this.runWithActiveAgent(this.coordinatorAgent, messages, onEvent, signal);
    }

    // First feedback the moment the coordinator starts. The classification and
    // the intent-gate model call below run silently — without this, the UI
    // shows nothing for several seconds (worst in the orchestration modes).
    onEvent({ type: 'progress', labelKey: 'thinking.reading' });

    const mode = this.detectMode(messages);
    const tokenCount = this.estimateTokenCount(messages);

    // Classify the task
    const classification = classifyTask(userMsg.content, mode, tokenCount);

    // ── Dataset event: classification decision ─────────────────────────
    // Captures input shape (length category) and the classifier's pick.
    // input_signature is intent category not raw text.
    const userText = typeof userMsg.content === 'string'
      ? userMsg.content
      : userMsg.content.map(p => (p.type === 'text' ? p.text : '')).join(' ');
    const userWordCount = userText.trim().split(/\s+/).filter(Boolean).length;
    const inputSignature =
      userWordCount <= 5 ? 'short'
      : userWordCount <= 30 ? 'medium'
      : 'long';
    avaEvents.emit('task_classification', {
      input_signature: inputSignature,
      classified_as: classification.category,
      classifier_model: 'task-classifier',
    });

    // Direct handling — no spawn needed
    if (DIRECT_CATEGORIES.has(classification.category) && !classification.modelOverride) {
      // Image inputs: the coordinators (DeepSeek V4, Mistral Large 3) are blind
      // to images. Rather than hand the whole turn to the vision model (which
      // loses the coordinator's agentic depth), the coordinatorAgent carries the
      // vision bridge — it runs the vision model (Qwen Omni) to DESCRIBE the
      // image, then acts on that description itself. So Supernova "sees" the
      // image and still does the work. No-op when the coordinator already
      // supports vision (a BYOK Claude/Qwen that can see images directly).
      onEvent({ type: 'progress', labelKey: 'thinking.working', model: this.coordinatorModel.name });
      return this.runWithActiveAgent(this.coordinatorAgent, messages, onEvent, signal);
    }

    // ── Upstream Flash intent gate ────────────────────────────────────
    // Before we route + spawn, ask a cheap fast model (Qwen 3.5 Flash)
    // whether the coordinator can handle this directly or whether the
    // specialist team is genuinely warranted. Most prompts do NOT need
    // the team — a ~200-token Flash call saves 10K–20K tokens of
    // persona orchestration on those. Explicit model override bypasses
    // the gate (the user asked for a specific model, respect it).
    if (this.intentGate && !classification.modelOverride) {
      const intent = await classifyIntent({
        userMessage: userText,
        mode,
        provider: this.intentGate.provider,
        model: this.intentGate.model,
        signal,
      });
      if (intent && !intent.needsTeam) {
        logger.info(`[auto-coordinator] Intent gate: direct (${intent.reasoning})`);
        // An upstream Flash gate has already ruled that no specialist team
        // is needed. If the coordinator speculatively creates session tasks
        // during its run, the downstream orchestration gate (which asks the
        // same Flash model the same question) would be pure redundancy.
        // Flip the flag so shouldOrchestrate() short-circuits. Saves ~300
        // tokens + ~2.5s on every direct route that happens to spawn tasks.
        if (this.sharedState) this.sharedState.conductorSynthesizedThisTurn = true;
        onEvent({ type: 'progress', labelKey: 'thinking.working', model: this.coordinatorModel.name });
        return this.runWithActiveAgent(this.coordinatorAgent, messages, onEvent, signal);
      }
    }

    // For Teach mode, classify creation-vs-delivery depth upfront so the
    // same Flash decision can influence both routing (creation gets the
    // coordinator-tier model, delivery stays on the cheaper teach-tier)
    // and the Conductor (full team vs Tutor-only). Falls back to undefined
    // if Flash is unavailable — router and orchestrate both handle that.
    let teachDepth: 'light' | 'full' | undefined;
    if (mode === 'teach' && this.intentGate) {
      const decision = await classifyTeachDepth({
        userMessage: userText,
        provider: this.intentGate.provider,
        model: this.intentGate.model,
        signal,
      });
      if (decision) {
        teachDepth = decision.depth;
        logger.info(`[auto-coordinator] Teach depth gate: ${decision.depth} (${decision.reasoning})`);
      }
    }

    // Route to best model — depth-aware for Teach mode
    const route = this.router.route(classification.category, classification.modelOverride, teachDepth);
    if (!route) {
      // No model available — fallback to coordinator
      return this.runWithActiveAgent(this.coordinatorAgent, messages, onEvent, signal);
    }

    // Routing resolved — name the model taking it before the still-silent
    // agent spin-up + first-token latency.
    onEvent({ type: 'progress', labelKey: 'thinking.working', model: route.model.name });

    // ── Dataset event: routing decision ────────────────────────────────
    avaEvents.emit('routing_decision', {
      classification: classification.category,
      chosen_model: route.model.id,
      reason: route.reason,
    });

    // If routed to the same model as coordinator, just run directly
    if (route.model.id === this.coordinatorModel.id && route.provider.name === this.coordinatorProvider.name) {
      return this.runWithActiveAgent(this.coordinatorAgent, messages, onEvent, signal);
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
        teachDepth,
      );
      return result;
    } catch (err) {
      // Fallback to coordinator on spawn failure
      onEvent({ type: 'error', error: err instanceof Error ? err : new Error(String(err)) });
      return this.runWithActiveAgent(this.coordinatorAgent, messages, onEvent, signal);
    }
  }

  /**
   * Run an agent and register it as the active agent for the duration so
   * inject() can route mid-run user messages to whichever agent is actually
   * executing right now.
   */
  private async runWithActiveAgent(
    agent: Agent,
    messages: Message[],
    onEvent: AgentEventHandler,
    signal?: AbortSignal,
  ): Promise<Message[]> {
    this.activeAgent = agent;
    try {
      return await agent.run(messages, onEvent, signal);
    } finally {
      this.activeAgent = null;
    }
  }

  /**
   * Public hook so TaskExecutor can register/unregister the Builder agent
   * it's currently driving. Without this, mid-run injections during the
   * execution leg would land in the wrong queue and never reach the model.
   */
  setActiveAgent(agent: Agent | null): void {
    this.activeAgent = agent;
  }

  /** Pull the TaskManager out of sharedState if the host wired it in. */
  private getTaskManager(): TaskManager | undefined {
    const tm = this.sharedState.taskManager as TaskManager | undefined;
    return tm && typeof tm.getSessionTasks === 'function' ? tm : undefined;
  }

  /**
   * Orchestration gate — decides whether to dispatch the TaskExecutor
   * for speculatively-created session tasks.
   *
   * Uses Qwen Flash (via sharedState.intentClassifier's provider/model)
   * to judge whether the user's actual message requested the kind of
   * multi-step plan the coordinator speculatively created. Returns true
   * if the executor should run, false if the tasks should be deferred.
   *
   * Falls open (returns true) on any failure so we preserve existing
   * behaviour when classification is unavailable — the gate is a
   * guard-rail enhancement, not a hard block.
   */
  private async shouldOrchestrate(messages: Message[], taskTitles: string[]): Promise<boolean> {
    // Single task is always fine — it's not "speculative expansion" of
    // a single request, it's just the one thing being tracked as a task.
    if (taskTitles.length <= 1) return true;

    // Short-circuit: if the Conductor already ran this turn and produced
    // a synthesis, the 5-persona team has already validated the user's
    // intent — asking Flash "should we orchestrate?" on top of that is
    // pure redundancy. Saves the Flash call (~300 tokens, ~2.5s).
    if (this.sharedState?.conductorSynthesizedThisTurn) {
      return true;
    }

    // Find the latest user message text.
    let userMessage = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== 'user') continue;
      const content = m.content;
      const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? (content as ContentPart[]).filter(p => p.type === 'text').map(p => ('text' in p ? p.text : '')).join(' ')
          : '';
      if (text.trim() && !text.trimStart().startsWith('[')) {
        userMessage = text.trim();
        break;
      }
    }
    if (!userMessage) return true;

    // Pull the Qwen Flash provider/model via the intentClassifier already
    // wired into sharedState. Reusing it here avoids a second resolution.
    const classifier = this.sharedState?.intentClassifier as { provider?: Provider; model?: ModelDefinition } | undefined;
    const provider = classifier?.provider;
    const model = classifier?.model;
    if (!provider || !model) {
      // No Flash available — preserve existing behaviour (orchestrate).
      return true;
    }

    const systemPrompt = `You are a gate for an AI coding agent. A user sent a message, and the agent speculatively created a multi-task plan. Your job: decide if the user actually wants all those tasks executed, or if they asked for something simpler.

Output exactly one word:
- yes — the user's message genuinely asked for a multi-step project or explicitly requested a plan/breakdown
- no — the user asked for one thing (a single action like "launch the dev", "run tests", "show me X", "explain Y"), and the agent over-expanded the scope

When in doubt, output "no". It's better to do the one thing the user asked and wait for follow-up than to execute a 5-task speculative plan they didn't request.`;

    const userPrompt = `User's message:
"""
${userMessage.slice(0, 500)}
"""

Tasks the agent speculatively created:
${taskTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Should these tasks be executed as a plan? Output yes or no.`;

    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('orchestration gate timeout')), 2500),
      );
      const callPromise = provider.createCompletion({
        model: model.id,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        max_tokens: 8,
        stream: false,
      });
      const response = await Promise.race([callPromise, timeout]);
      // Meter the call — Flash-based gate, same cost bracket as intent gate.
      chargeCredits('light_call', {
        model: model.id,
        rawTokens: extractUsage((response as { usage?: unknown }).usage as Parameters<typeof extractUsage>[0]),
      });
      const resp = response as { choices?: Array<{ message?: { content?: string | unknown } }>; message?: { content?: string | unknown } };
      const content = resp.choices?.[0]?.message?.content ?? resp.message?.content ?? '';
      const raw = (typeof content === 'string' ? content : '').trim().toLowerCase();
      if (raw.startsWith('yes')) return true;
      if (raw.startsWith('no')) return false;
      logger.debug(`[auto-coordinator] Orchestration gate returned unrecognised output: "${raw.slice(0, 40)}", defaulting to orchestrate`);
      return true;
    } catch (err) {
      logger.debug(`[auto-coordinator] Orchestration gate failed, defaulting to orchestrate: ${err instanceof Error ? err.message : String(err)}`);
      return true;
    }
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

  /**
   * Inject a mid-run message. Forwards to whichever agent is currently
   * executing — the planning task agent during the planning leg, the
   * active Builder during execution, or the coordinator agent for direct
   * categories. Falling back to the coordinator agent ensures injections
   * still queue when no run is in flight.
   */
  inject(message: string): void {
    if (this.activeAgent) {
      this.activeAgent.inject(message);
      return;
    }
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
    teachDepth?: 'light' | 'full',
  ): Promise<Message[]> {
    // Emit agent start
    this.emitAutoEvent(onEvent, { type: 'auto_agent_start', model: route.model.name, category });

    // Build system prompt for the task agent. The brief (regex-generated
    // conversation digest + file pointers) is appended *only* if Conductor
    // doesn't end up producing a synthesis — synthesis and brief overlap
    // in purpose, and stacking both costs ~500–800 tokens of redundancy
    // per spawned task.
    const mode = CATEGORY_TO_MODE[category] || 'work';
    const systemPrompt = buildSystemPrompt({
      ...this.systemPromptOpts,
      mode,
    } as any);

    // Extract the user's task text — same content brief.task would hold,
    // but without paying for brief generation up-front.
    const taskText = typeof userMsg.content === 'string'
      ? userMsg.content
      : userMsg.content.filter(p => p.type === 'text').map(p => (p as { text: string }).text).join('\n');

    // Create task conversation with L0 system prompt + user message.
    // The system prompt is re-set with brief appended later if Conductor
    // doesn't orchestrate.
    const taskConversation = new Conversation();
    taskConversation.setSystemPrompt(systemPrompt);

    // Add the user's actual message
    taskConversation.addUserMessage(userMsg.content);

    // Set activeModelId to spawned agent's model for tool routing
    const originalActiveModel = this.sharedState.activeModelId;
    this.sharedState.activeModelId = route.model.id;

    // Create the task agent. Wired with the vision bridge so a text-only
    // routed model (e.g. a coding task that arrives with a screenshot) can
    // still see the image via the vision model. No-op when route.model sees
    // images itself.
    const taskAgent = new Agent({
      provider: route.provider,
      model: route.model,
      visionProvider: this.visionProvider ?? undefined,
      visionModel: this.visionModel ?? undefined,
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

    // Run Conductor orchestration if this category needs it. When Conductor
    // produces a synthesis, it stands in for the regex brief — stacking
    // both is ~500–800 tokens of duplicated context per spawned task.
    let orchestrated = false;
    if (ORCHESTRATED_CATEGORIES.has(category)) {
      const taskConductor = new Conductor({
        provider: route.provider,
        model: route.model,
        // PLATFORM: thread the intent-gate's cheap fast pair through so
        // personas tagged modelTier:'light' (critics, summarisers, readers)
        // run on it instead of the heavy route model — a cost optimisation
        // the platform can afford because it holds every key.
        // BYOK: pass nothing, so the Conductor runs EVERY persona on the
        // user's coordinator model. The full persona team — the real Ava
        // magic — runs on the exact model they chose, never split off to a
        // cheaper model they might not have a key for.
        lightProvider: this.hasPlatform ? this.intentGate?.provider : undefined,
        lightModel: this.hasPlatform ? this.intentGate?.model : undefined,
        // Vision bridge so text-only personas can see attached images.
        visionProvider: this.visionProvider ?? undefined,
        visionModel: this.visionModel ?? undefined,
        toolRegistry: this.toolRegistry,
        cwd: this.cwd,
        sharedState: this.sharedState,
      });

      if (taskConductor.needsOrchestration(taskText, mode)) {
        try {
          const { synthesisPrompt } = await taskConductor.orchestrate(
            taskText,
            mode,
            taskConversation.getMessages(),
            (conductorEvent) => {
              // Forward conductor events
              onEvent(conductorEvent as unknown as AgentEvent);
            },
            signal,
            {
              // Break orchestration early if the user injects a message
              // while the persona team is running — without this, a full
              // team on planning/security/brainstorm blocks for 10–60s
              // and silently drops anything the user sends during that
              // window. The task agent's main loop picks up the
              // interjection on its next iteration.
              hasPendingInjection: () => taskAgent.hasPendingInterjections(),
              // Flash-classified Teach depth wins over the conductor's
              // regex fallback. Undefined leaves orchestrate to use its
              // own detection (works for non-Teach modes and as the
              // safety net when Flash is unavailable).
              depth: teachDepth,
            },
          );

          if (synthesisPrompt) {
            const msgs = taskConversation.getMessages();
            msgs.push({ role: 'user', content: `[Internal Planning]\n\n${synthesisPrompt}` });
            taskConversation.setMessages(msgs);
            orchestrated = true;
          }
        } catch {
          // Conductor failure is non-fatal — agent proceeds without orchestration
        }
      }
    }

    // Fallback: if Conductor didn't orchestrate (either category wasn't in
    // ORCHESTRATED_CATEGORIES, needsOrchestration returned false, or it
    // threw), append the regex brief so the agent still has conversation
    // context + file pointers. Brief generation is regex-only — no LLM
    // call — but ~500–800 tokens in the prompt, so we skip it when
    // synthesis already grounds the agent.
    if (!orchestrated) {
      const memories = await this.recallMemories(userMsg.content);
      const brief = generateBrief(
        userMsg.content,
        originalMessages,
        memories,
        this.projectInstructions,
        route.model,
      );
      taskConversation.setSystemPrompt(systemPrompt + '\n\n---\n\n' + formatBriefAsSystem(brief));
    }

    // Run the task agent — register it as the active agent so user
    // injections are routed here while it's running.
    this.activeAgent = taskAgent;
    let updatedTaskMessages: Message[];
    try {
      updatedTaskMessages = await taskAgent.run(
        taskConversation.getMessages(),
        wrappedOnEvent,
        signal,
      );
    } finally {
      this.activeAgent = null;
    }

    // Restore activeModelId
    this.sharedState.activeModelId = originalActiveModel;

    // Extract the agent's final assistant message
    let agentResult = this.extractLastAssistantMessage(updatedTaskMessages);

    // ── Post-build verification (M2 — with one auto-retry on failure) ────
    // If the agent emitted a <changes-summary> block, run verify_change on
    // the declared files so typechecks / route curls / migration dry-runs
    // get automatically run on real state.
    //
    // On failure, AutoCoordinator injects the failure report as a user-role
    // context message and re-dispatches the task agent ONCE. The retry sees
    // exactly which checks broke and gets a chance to fix them without the
    // user having to intervene. Second failure surfaces to the user with
    // both attempts visible — no third retry (spiralling is worse than
    // surfacing).
    if (agentResult) {
      const declared = extractChangesSummary(agentResult);
      if (declared && declared.files.length > 0) {
        try {
          let verifyResult = await this.runPostBuildVerification(
            declared.files,
            onEvent,
            signal,
          );

          // Auto-retry path — verification failed, attempt not aborted.
          if (verifyResult && !verifyResult.passed && !signal?.aborted) {
            onEvent({
              type: 'verification_retry_start',
              reason: verifyResult.report.slice(0, 400),
            });

            // Preserve the first attempt's output + failure block so the
            // user sees both attempts in the final transcript. Builder's
            // retry will be appended below a separator.
            const firstAttemptComposed = agentResult + '\n\n' + verifyResult.block;

            const retryContext =
              `[verification failed]\n\n${verifyResult.report}\n\n` +
              `The previous attempt did not pass verification. Fix the issue(s) above and re-emit an updated <changes-summary> block at the end of your response.`;

            // Build the retry input: the full history the task agent
            // saw on its first pass + the new messages it produced +
            // the failure-context user message. Post-Option-2 refactor,
            // `updatedTaskMessages` is only the NEW messages from the
            // first pass, so we prepend taskConversation's pre-run
            // messages to get the full history the retry agent needs.
            const retryInputMessages: Message[] = [
              ...taskConversation.getMessages(),
              ...updatedTaskMessages,
              { role: 'user', content: retryContext },
            ];

            this.activeAgent = taskAgent;
            let retryMessages: Message[];
            try {
              retryMessages = await taskAgent.run(retryInputMessages, wrappedOnEvent, signal);
            } finally {
              this.activeAgent = null;
            }

            const retryResult = this.extractLastAssistantMessage(retryMessages);

            if (retryResult) {
              // Try to re-verify the retry attempt.
              const retryDeclared = extractChangesSummary(retryResult);
              let secondVerify: { passed: boolean; block: string; report: string } | null = null;
              if (retryDeclared && retryDeclared.files.length > 0 && !signal?.aborted) {
                try {
                  secondVerify = await this.runPostBuildVerification(
                    retryDeclared.files,
                    onEvent,
                    signal,
                  );
                } catch (err) {
                  logger.debug(
                    `[auto-coordinator] Retry verification failed to run: ${
                      err instanceof Error ? err.message : String(err)
                    }`,
                  );
                }
              }

              // Compose: first attempt (with its fail block) → separator →
              // retry attempt → retry's verification block (or note that
              // the retry didn't emit a new summary).
              const parts: string[] = [
                firstAttemptComposed,
                '\n---\n\n[auto-retry]\n\n',
                retryResult,
              ];
              if (secondVerify) {
                parts.push('\n\n' + secondVerify.block);
              } else if (!retryDeclared || retryDeclared.files.length === 0) {
                parts.push('\n\n[verification · no changes-summary emitted on retry — re-verify skipped]');
              }
              agentResult = parts.join('');
              updatedTaskMessages = retryMessages;
            } else {
              // Retry produced no assistant output at all — keep first
              // attempt with its failure block so the user at least sees
              // what failed.
              agentResult = firstAttemptComposed;
            }
          } else if (verifyResult) {
            // Happy path: passed (or aborted — either way, just surface the block).
            agentResult = agentResult + '\n\n' + verifyResult.block;
          }

          // agentResult (the composed output string) is the single
          // source of truth for what the main conversation sees. The
          // return at the bottom of this method wraps it in a synthetic
          // assistant message — no need to patch updatedTaskMessages,
          // that array is internal-only and not passed to the caller.
        } catch (err) {
          logger.debug(
            `[auto-coordinator] Post-build verification failed to run: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          // Verification failing to RUN is different from a check failing;
          // it shouldn't block the task, just stay silent.
        }
      }
    }

    // Build summary for coordinator's context (keeps it lean)
    const summary = agentResult
      ? (agentResult.length > 3000 ? agentResult.slice(0, 500) + '...' : agentResult)
      : 'Task completed.';

    // Emit agent end
    this.emitAutoEvent(onEvent, { type: 'auto_agent_end', model: route.model.name, summary });

    // Return ONLY the new messages from this turn — the caller appends
    // to its conversation. AutoCoordinator produces a single synthesised
    // assistant message per turn representing the spawned task agent's
    // final output (with any verification blocks composed in). The
    // sub-agent's intermediate tool calls are NOT surfaced to the main
    // conversation — by design, they're execution detail the user sees
    // live in the stream but doesn't need persisted against the
    // coordinator's transcript.
    if (!agentResult) return [];
    return [{ role: 'assistant', content: agentResult }];
  }

  /**
   * Post-build verification hook. Invoked after the task agent returns when
   * the agent emitted a <changes-summary> block. Runs verify_change against
   * the declared files, emits verification_start / verification_end events,
   * and returns a structured result the caller uses to decide whether to
   * auto-retry. Returns null when there was nothing to verify.
   */
  private async runPostBuildVerification(
    files: string[],
    onEvent: AgentEventHandler,
    signal?: AbortSignal,
  ): Promise<{ passed: boolean; block: string; report: string } | null> {
    onEvent({ type: 'verification_start', files });

    const tool = new VerifyChangeTool();
    const result = await tool.execute(
      { files },
      { cwd: this.cwd, signal, sharedState: this.sharedState },
    );

    const stats = (result.metadata ?? {}) as {
      total?: number;
      passed?: number;
      failed?: number;
      skipped?: number;
    };
    const passed = result.success;

    onEvent({
      type: 'verification_end',
      passed,
      report: result.output,
      stats: {
        total: stats.total ?? 0,
        passed: stats.passed ?? 0,
        failed: stats.failed ?? 0,
        skipped: stats.skipped ?? 0,
      },
    });

    // Only surface a block if there was something to verify.
    if ((stats.total ?? 0) === 0) return null;

    const header = passed
      ? `[verification ✓] ${stats.passed ?? 0} check(s) passed, ${stats.skipped ?? 0} skipped.`
      : `[verification ✗] ${stats.failed ?? 0} of ${stats.total ?? 0} check(s) failed — see details below.`;

    return {
      passed,
      block: `${header}\n\n${result.output}`,
      report: result.output,
    };
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
