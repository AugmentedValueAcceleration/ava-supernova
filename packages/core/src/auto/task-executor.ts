import type { Provider } from '../providers/types.js';
import type { ModelDefinition, Message } from '../core/types.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { TaskManager } from '../tasks/task-manager.js';
import type { TaskEntry } from '../tasks/types.js';
import type { AgentEventHandler } from '../agent/agent.js';

import { Agent } from '../agent/agent.js';
import { Conversation } from '../agent/conversation.js';
import { BUILDER } from '../personas/definitions.js';
import { logger } from '../core/logger.js';

/**
 * TaskExecutor — the second leg of Auto Mode.
 *
 * After the conductor model has called present_plan and todo_write, this class
 * picks up the pending session tasks and dispatches a fresh Builder Agent for
 * each one. Each Builder gets its own clean context window containing only the
 * task description, the plan context, and the full task list — not the
 * conversation history. This is the JARVIS-style hand-off: Ava plans, Builder
 * executes.
 *
 * The executor is intentionally serial for v1 — tasks usually have implicit
 * dependencies even when not declared. Parallel execution comes later with a
 * proper dependency graph.
 *
 * On the first blocker the executor stops and surfaces a clear message via
 * events. The user decides whether to retry, give guidance, or abort.
 */
export interface TaskExecutorOptions {
  provider: Provider;
  model: ModelDefinition;
  toolRegistry: ToolRegistry;
  taskManager: TaskManager;
  cwd: string;
  sharedState: Record<string, unknown>;
  /**
   * Called whenever a Builder Agent starts (passed the agent) or ends
   * (passed null). AutoCoordinator uses this to forward user inject()
   * calls into the currently-running Builder.
   */
  onActiveAgentChange?: (agent: Agent | null) => void;
  /**
   * Project-scoped conventions the Builder needs to honour — currently the
   * Decisions folder state, but this is where any future project-level
   * convention flags should land. Routed through from AutoCoordinator's
   * systemPromptOpts so the Builder's custom prompt picks up the same
   * behavioural instructions the main agent's prompt carries.
   */
  decisionsContext?: string;
  decisionsFolderExists?: boolean;
  decisionsOptInStatus?: 'opted-in' | 'opted-out' | 'not-asked';
}

export interface TaskExecutionResult {
  totalTasks: number;
  completed: number;
  blocked: number;
  blockerMessage?: string;
  summary: string;
}

export class TaskExecutor {
  private readonly provider: Provider;
  private readonly model: ModelDefinition;
  private readonly toolRegistry: ToolRegistry;
  private readonly taskManager: TaskManager;
  private readonly cwd: string;
  private readonly sharedState: Record<string, unknown>;
  private readonly onActiveAgentChange?: (agent: Agent | null) => void;
  private readonly decisionsContext?: string;
  private readonly decisionsFolderExists?: boolean;
  private readonly decisionsOptInStatus?: 'opted-in' | 'opted-out' | 'not-asked';

  constructor(opts: TaskExecutorOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.toolRegistry = opts.toolRegistry;
    this.taskManager = opts.taskManager;
    this.cwd = opts.cwd;
    this.sharedState = opts.sharedState;
    this.onActiveAgentChange = opts.onActiveAgentChange;
    this.decisionsContext = opts.decisionsContext;
    this.decisionsFolderExists = opts.decisionsFolderExists;
    this.decisionsOptInStatus = opts.decisionsOptInStatus;
  }

  /**
   * Execute every pending session task using a fresh Builder agent per task.
   * Pauses on the first blocker and persists session tasks to disk so the work
   * survives a window close.
   */
  async executeAll(
    planContext: string,
    onEvent: AgentEventHandler,
    signal?: AbortSignal,
  ): Promise<TaskExecutionResult> {
    const allTasks = this.taskManager.getSessionTasks();
    const pending = allTasks.filter(t => t.status === 'todo');

    if (pending.length === 0) {
      return { totalTasks: 0, completed: 0, blocked: 0, summary: 'No pending tasks to execute.' };
    }

    logger.debug(`[task-executor] Starting execution of ${pending.length} tasks`);
    onEvent({ type: 'execution_start', total: pending.length });

    let completed = 0;
    let blocked = 0;
    let blockerMessage: string | undefined;
    const summaries: string[] = [];

    for (let i = 0; i < pending.length; i++) {
      if (signal?.aborted) {
        logger.debug('[task-executor] Aborted by signal');
        break;
      }

      const task = pending[i];
      logger.debug(`[task-executor] Task ${i + 1}/${pending.length}: ${task.title}`);

      // Mark in-progress before dispatching the Builder
      this.taskManager.updateSessionTask(task.id, 'in-progress');
      onEvent({
        type: 'task_start',
        taskId: task.id,
        title: task.title,
        index: i,
        total: pending.length,
      });

      try {
        const outcome = await this.executeTask(task, planContext, allTasks, i, onEvent, signal);
        if (outcome.success) {
          this.taskManager.updateSessionTask(task.id, 'done');
          completed++;
          summaries.push(`✓ ${task.title}${outcome.summary ? ` — ${outcome.summary}` : ''}`);
          onEvent({
            type: 'task_complete',
            taskId: task.id,
            title: task.title,
            summary: outcome.summary,
          });
        } else {
          this.taskManager.updateSessionTask(task.id, 'blocked');
          blocked++;
          blockerMessage = outcome.summary || `Task "${task.title}" was blocked.`;
          summaries.push(`⛔ ${task.title} — ${blockerMessage}`);
          onEvent({
            type: 'task_blocked',
            taskId: task.id,
            title: task.title,
            reason: blockerMessage,
          });
          // Pause on first blocker so we don't waste tokens or compound errors
          break;
        }
      } catch (err) {
        this.taskManager.updateSessionTask(task.id, 'blocked');
        blocked++;
        const errMsg = err instanceof Error ? err.message : String(err);
        blockerMessage = `Task "${task.title}" failed: ${errMsg}`;
        summaries.push(`⛔ ${task.title} — ${errMsg}`);
        onEvent({
          type: 'task_failed',
          taskId: task.id,
          title: task.title,
          error: errMsg,
        });
        break;
      }
    }

    onEvent({
      type: 'execution_complete',
      completed,
      blocked,
      total: pending.length,
    });

    // Flush session tasks to disk so progress survives a reload
    try {
      await this.taskManager.flushSessionTasks();
    } catch (err) {
      logger.debug(`[task-executor] flushSessionTasks failed: ${err}`);
    }

    const headline = blocked > 0
      ? `Executed ${completed}/${pending.length} tasks. ${blocked} blocked.`
      : `Executed all ${completed} tasks successfully.`;

    return {
      totalTasks: pending.length,
      completed,
      blocked,
      blockerMessage,
      summary: [headline, '', ...summaries].join('\n'),
    };
  }

  /**
   * Run a single task with a fresh Builder Agent.
   * The Agent gets a clean conversation containing only the task framing —
   * not the main chat history — so context stays focused and cheap.
   */
  private async executeTask(
    task: TaskEntry,
    planContext: string,
    allTasks: TaskEntry[],
    currentIndex: number,
    onEvent: AgentEventHandler,
    signal?: AbortSignal,
  ): Promise<{ success: boolean; summary?: string }> {
    const conversation = new Conversation();
    conversation.setSystemPrompt(this.buildBuilderSystemPrompt());

    const taskList = allTasks
      .map((t, idx) => {
        const marker = idx === currentIndex ? ' ← YOU ARE HERE' : '';
        return `${idx + 1}. [${t.status}] ${t.title}${marker}`;
      })
      .join('\n');

    const taskMessage = [
      planContext ? `## Plan context\n${planContext}\n` : '',
      `## Full task list`,
      taskList,
      ``,
      `## Your job`,
      `Execute task ${currentIndex + 1}: **${task.title}**`,
      ``,
      `Use the execution tools (file_write, file_edit, bash, git_commit, test_run, etc.) ` +
      `to complete THIS task. Do not work on other tasks — they will be dispatched separately.`,
      ``,
      `When the task is genuinely complete, write a one-paragraph summary of what you did and stop. ` +
      `Do not call any more tools after the summary.`,
      ``,
      `If you hit a real blocker that needs the user to decide something, start your final response ` +
      `with "BLOCKED:" followed by a clear explanation of what's stopping you and what you need.`,
    ].filter(Boolean).join('\n');

    conversation.addUserMessage(taskMessage);

    // Fresh Agent instance — fresh context window, focused on this task only
    const builderAgent = new Agent({
      provider: this.provider,
      model: this.model,
      toolRegistry: this.toolRegistry,
      cwd: this.cwd,
      sharedState: this.sharedState,
    });

    // Register the Builder as the active agent so AutoCoordinator's inject()
    // forwards user mid-run messages here instead of into the dead coordinator
    // queue.
    this.onActiveAgentChange?.(builderAgent);
    try {
      const result = await builderAgent.run(conversation.getMessages(), onEvent, signal);
      const lastAssistant = this.lastAssistantText(result);

      if (lastAssistant && /^\s*BLOCKED:/i.test(lastAssistant.trim())) {
        const reason = lastAssistant.replace(/^\s*BLOCKED:\s*/i, '').trim();
        return { success: false, summary: reason || 'Builder reported a blocker without details.' };
      }

      return {
        success: true,
        summary: lastAssistant ? this.shorten(lastAssistant, 240) : undefined,
      };
    } catch (err) {
      logger.debug(`[task-executor] Builder agent threw: ${err}`);
      throw err;
    } finally {
      this.onActiveAgentChange?.(null);
    }
  }

  private buildBuilderSystemPrompt(): string {
    // Decisions folder convention — same rules the main agent follows, reproduced
    // here because the Builder has its own prompt path independent of the main
    // system-prompt. Silent when opted-out or irrelevant.
    let decisionsBlock = '';
    const optIn = this.decisionsOptInStatus ?? 'not-asked';
    if (this.decisionsFolderExists) {
      decisionsBlock = `

## Decisions folder (active for this project)
This project has a \`Decisions/\` folder — it's the project's declared direction
(palette, voice, architecture, conventions). Treat its contents as law. When
your task involves a design or architectural decision — choosing a palette,
picking typography, generating an asset, committing to a pattern — record it to
the appropriate file (\`Decisions/design/palette.md\`, \`Decisions/design/typography.md\`,
\`Decisions/design/assets.md\` with the prompt used, or \`Decisions/records/NNNN-<topic>.md\`
for ADR-style records). Write these updates as you work. Never write secrets —
the folder is committed to git.${this.decisionsContext ? `\n\n### Project direction (from Decisions folder)\n${this.decisionsContext}` : ''}`;
    } else if (optIn === 'not-asked') {
      decisionsBlock = `

## Decisions folder (not yet set up for this project)
**BEFORE your first file_write or file_edit in this task**, call \`ask_user\` with
exactly this question: "Want me to set up a Decisions folder for this project?
It's where I'll track design choices, architecture decisions, and generated
assets as we go — committed to git so the context travels with the code."
Wait for the answer. If yes, create \`Decisions/\` at the project root with the
canonical structure (overview.md, context.md, design/palette.md, design/typography.md,
design/voice.md, design/assets.md, ideas.md, progress.md, records/) and then
proceed with the original task, recording decisions as you make them. If no,
proceed with the task without mentioning it again.

**This is non-negotiable.** Even if your task is urgent, even if the plan says
to start coding immediately — ask_user first, then proceed. The one question
takes two seconds and saves project context for the life of the codebase.`;
    }
    // optIn === 'opted-out' → silent, don't mention it.

    return `${BUILDER.prompt}

## You are running as a focused sub-agent
You have been spawned for a single task. You do NOT have the full chat history —
the task description below contains everything you need to know. Stay focused on
your one task.

## Tools
You have access to the full execution toolset: file_read, file_write, file_edit,
glob, grep, list_directory, bash, git_status, git_diff, git_commit, test_run,
todo_write, and the rest. Use them.

## Curator — the on-demand taste specialist
You have a \`curator\` tool for design and taste decisions. **Before calling it,
first check Decisions/design/*.md** — the project's declared direction lives
in those files. If \`palette.md\` already says the primary accent is a specific
colour and you need a primary colour, just use it — no curator call needed.
If \`voice.md\` already defines the tone and you need a button label, follow
it directly. The Decisions folder is the first source of truth; curator is a
specialist called when the answer genuinely isn't there.

**Call curator when:**
- You face a taste decision the Decisions folder doesn't cover (new component
  type not mentioned in existing design docs, novel visual element, new asset
  generation, a decision that requires reconciling conflicting precedents).
- You're about to default to a generic pattern (\`bg-blue-500\`, \`text-gray-500\`,
  system-default font) because nothing better comes to mind. That's the signal
  that you need taste input you don't have — call curator.

**Do NOT call curator when:**
- The Decisions folder already answers the question directly.
- The decision is logic, data shape, auth, state management, or performance.
- The question is correctness rather than subjective judgement.
- You can apply an existing project pattern with confidence.

Curator runs in a fresh context isolated from error-fix churn, so her attention
is fully on the decision. She's expensive to spawn — one decision per call,
only when genuinely needed. A Builder that calls curator 10 times in a task is
usually a Builder that didn't read the Decisions folder first.

## Output discipline
- The plan is already approved. Do not redesign. Do not propose alternatives.
- When done: end your response with a one-paragraph summary of what you built. Stop.
- When blocked: start your final response with "BLOCKED:" then explain clearly.
- Do not narrate every tool call. Tools speak for themselves.${decisionsBlock}`;
  }

  private lastAssistantText(messages: Message[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant') {
        return typeof m.content === 'string' ? m.content : null;
      }
    }
    return null;
  }

  private shorten(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max - 1).trimEnd() + '…';
  }
}
