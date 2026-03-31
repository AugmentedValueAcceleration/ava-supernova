// ─── Conductor ─────────────────────────────────────────────────────────────
// Orchestrates Ava's internal persona team for complex tasks.
// One intelligence, multiple focused mindsets, shared context.

import type { Provider, ChatCompletionRequest } from '../providers/types.js';
import type { ModelDefinition, Message } from '../core/types.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ToolExecutionContext } from '../tools/types.js';
import type {
  PersonaDefinition,
  PersonaState,
  ContextPool,
  ConductorConfig,
  ConductorEventHandler,
  PersonaId,
} from './types.js';
import { MODE_PERSONAS } from './definitions.js';
import { logger } from '../core/logger.js';

const DEFAULT_CONFIG: Required<ConductorConfig> = {
  maxPersonas: 6,
  personaTimeout: 30000,
  parallel: false,
  maxParallel: 3,
  challengerCanVeto: true,
};

export class Conductor {
  private readonly provider: Provider;
  private readonly model: ModelDefinition;
  private readonly toolRegistry: ToolRegistry;
  private readonly toolContext: ToolExecutionContext;
  private readonly config: Required<ConductorConfig>;

  constructor(opts: {
    provider: Provider;
    model: ModelDefinition;
    toolRegistry: ToolRegistry;
    cwd: string;
    sharedState?: Record<string, unknown>;
    config?: ConductorConfig;
  }) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.toolRegistry = opts.toolRegistry;
    this.toolContext = {
      cwd: opts.cwd,
      sharedState: opts.sharedState,
    };
    this.config = { ...DEFAULT_CONFIG, ...opts.config };
  }

  /**
   * Determine if a task needs the full persona team or can be handled directly.
   *
   * Plan, brainstorm, teach, security ALWAYS use personas.
   * Work mode uses personas for complex tasks (multi-file, architecture, systems).
   * Chat mode never uses personas.
   * Simple work tasks (one-line fixes, quick questions) skip orchestration.
   */
  needsOrchestration(userMessage: string, mode: string): boolean {
    // Chat never orchestrates
    if (mode === 'chat') return false;

    // Work mode: almost never orchestrate. Ava should just do the work.
    // Only orchestrate when the user explicitly asks for planning or it's a massive task.
    if (mode === 'work') {
      const msg = userMessage.toLowerCase();

      // Only orchestrate if the user explicitly asks for a plan or review
      const explicitPlanSignals = [
        /\b(plan this|let'?s plan|create a plan|design the architecture|review the codebase)\b/,
        /\b(full audit|security audit|comprehensive review)\b/,
      ];

      return explicitPlanSignals.some(re => re.test(msg));
    }

    // Plan, brainstorm, security always orchestrate — that's their purpose
    if (['plan', 'brainstorm', 'security'].includes(mode)) return true;

    // Teach mode orchestrates for curriculum building
    if (mode === 'teach') return true;

    return false;
  }

  /**
   * Get the persona team for a given mode.
   */
  getTeam(mode: string): PersonaDefinition[] {
    return MODE_PERSONAS[mode] || [];
  }

  /**
   * Run the persona team on a task. Returns enriched context for the main agent.
   *
   * The Conductor does NOT replace the Agent. It runs *before* the Agent's
   * main response to gather context, design the approach, and verify it.
   * The final Agent response uses the Conductor's output as additional context.
   */
  async orchestrate(
    userMessage: string,
    mode: string,
    conversationHistory: Message[],
    onEvent: ConductorEventHandler,
    signal?: AbortSignal,
  ): Promise<{ contextPool: ContextPool; personaStates: PersonaState[]; synthesisPrompt: string }> {
    const team = this.getTeam(mode);
    if (team.length === 0) {
      return {
        contextPool: this.createEmptyPool(userMessage),
        personaStates: [],
        synthesisPrompt: '',
      };
    }

    const startTime = Date.now();
    const contextPool = this.createEmptyPool(userMessage);
    const personaStates: PersonaState[] = [];

    // Sort by priority (lower = first)
    const sortedTeam = [...team].sort((a, b) => a.priority - b.priority);

    // Skip the Builder persona — that's the main Agent's job
    const planningTeam = sortedTeam.filter(p => p.id !== 'builder');

    if (this.config.parallel) {
      // ── Wave-based parallel execution ─────────────────────────────────
      // Group personas into waves based on dependency graph.
      // Within each wave, personas run in parallel (up to maxParallel).
      const completed = new Set<PersonaId>();
      let vetoed = false;

      while (!vetoed && personaStates.length < (this.config.maxPersonas ?? 6)) {
        if (signal?.aborted) break;

        // Find personas whose dependencies are all complete
        const wave = planningTeam.filter(p =>
          !completed.has(p.id) &&
          (p.dependsOn ?? []).every(dep => completed.has(dep))
        );

        if (wave.length === 0) break; // No more runnable personas

        // Run wave with concurrency limit
        const maxP = this.config.maxParallel ?? 3;
        for (let i = 0; i < wave.length; i += maxP) {
          if (signal?.aborted || vetoed) break;
          const batch = wave.slice(i, i + maxP);

          const results = await Promise.allSettled(
            batch.map(persona =>
              this.runPersona(persona, contextPool, conversationHistory, onEvent, signal)
            )
          );

          for (let j = 0; j < results.length; j++) {
            const result = results[j];
            const persona = batch[j];

            if (result.status === 'fulfilled') {
              const state = result.value;
              personaStates.push(state);
              completed.add(persona.id);

              if (state.output) {
                this.updatePool(contextPool, persona.id, state.output);
              }

              // Check for Challenger veto
              if (persona.id === 'challenger' && this.config.challengerCanVeto && state.output) {
                if (/\b(veto|stop|don'?t proceed|abort|reject)\b/i.test(state.output)) {
                  logger.debug('[conductor] Challenger vetoed the plan');
                  vetoed = true;
                }
              }
            } else {
              // Failed — mark as complete to unblock dependents, but log error
              completed.add(persona.id);
              logger.debug(`[conductor] Persona ${persona.id} failed in parallel: ${result.reason}`);
            }
          }
        }
      }
    } else {
      // ── Sequential execution (original behaviour) ─────────────────────
      for (const persona of planningTeam) {
        if (signal?.aborted) break;
        if (personaStates.length >= (this.config.maxPersonas ?? 6)) break;

        const state = await this.runPersona(persona, contextPool, conversationHistory, onEvent, signal);
        personaStates.push(state);

        // Update context pool based on persona output
        if (state.output) {
          this.updatePool(contextPool, persona.id, state.output);
        }

        // If Challenger vetoes and config allows it, stop here
        if (persona.id === 'challenger' && this.config.challengerCanVeto && state.output) {
          const isVeto = /\b(veto|stop|don'?t proceed|abort|reject)\b/i.test(state.output);
          if (isVeto) {
            logger.debug('[conductor] Challenger vetoed the plan');
            break;
          }
        }
      }
    }

    // Build synthesis prompt — a summary of what all personas found/decided
    const synthesisPrompt = this.buildSynthesis(contextPool, personaStates);

    onEvent({
      type: 'conductor_done',
      totalPersonas: personaStates.length,
      totalTime: Date.now() - startTime,
    });

    return { contextPool, personaStates, synthesisPrompt };
  }

  /**
   * Run a single persona. Sends a focused prompt to the model with the persona's
   * system instructions, current context pool, and scoped tool access.
   */
  private async runPersona(
    persona: PersonaDefinition,
    pool: ContextPool,
    history: Message[],
    onEvent: ConductorEventHandler,
    signal?: AbortSignal,
  ): Promise<PersonaState> {
    const state: PersonaState = {
      id: persona.id,
      phase: 'active',
      output: null,
      toolCalls: [],
      startedAt: Date.now(),
      completedAt: null,
    };

    onEvent({ type: 'persona_start', persona: persona.id, description: persona.description });

    try {
      // Build persona-specific messages
      const systemPrompt = this.buildPersonaPrompt(persona, pool);

      // Get scoped tool schemas (only tools this persona is allowed to use)
      const allSchemas = this.toolRegistry.getSchemas();
      const allowedSet = new Set(persona.allowedTools);
      const deniedSet = new Set(persona.deniedTools || []);
      const scopedSchemas = allSchemas.filter(s =>
        allowedSet.has(s.function.name) && !deniedSet.has(s.function.name)
      );

      const messages: Message[] = [
        { role: 'system', content: systemPrompt },
        // Include recent conversation for context (last 6 messages)
        ...history.slice(-6),
        { role: 'user', content: `[Task]: ${pool.userRequest}` },
      ];

      // Add context pool findings from previous personas
      const poolContext = this.poolToString(pool);
      if (poolContext) {
        messages.push({ role: 'user', content: `[Context from team]:\n${poolContext}` });
      }

      // Run the model with tool support
      let iterations = 0;
      const maxIterations = 8; // Personas get up to 8 tool calls (brainstorm needs more for research)
      let lastPersonaToolName: string | null = null;
      let personaRepeatCount = 0;

      while (iterations < maxIterations) {
        if (signal?.aborted) break;
        // Enforce persona timeout
        if (Date.now() - state.startedAt! > this.config.personaTimeout) {
          logger.debug(`[conductor] Persona ${persona.id} timed out after ${this.config.personaTimeout}ms`);
          break;
        }
        iterations++;

        const request: ChatCompletionRequest = {
          model: this.model.id,
          messages,
          tools: scopedSchemas.length > 0 ? scopedSchemas : undefined,
          tool_choice: scopedSchemas.length > 0 ? 'auto' : undefined,
        };

        const response = await this.provider.createCompletion(request, signal);
        const choice = response.choices?.[0];
        if (!choice) break;

        const msg = choice.message;

        // Handle tool calls
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          // Repeated tool-call detection for personas
          const personaToolNames = msg.tool_calls.map((tc: any) => tc.function.name).sort().join(',');
          if (personaToolNames === lastPersonaToolName) {
            personaRepeatCount++;
            if (personaRepeatCount >= 2) {
              logger.debug(`[conductor] Persona ${persona.id} looping on ${personaToolNames} — breaking`);
              state.output = msg.content || `[${persona.name} completed analysis]`;
              break;
            }
          } else {
            lastPersonaToolName = personaToolNames;
            personaRepeatCount = 0;
          }

          messages.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: msg.tool_calls,
          } as Message);

          for (const tc of msg.tool_calls) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* */ }

            onEvent({ type: 'persona_tool_call', persona: persona.id, tool: tc.function.name, args });

            // Execute with scoped context
            const result = await this.toolRegistry.execute(tc.function.name, args, {
              ...this.toolContext,
              signal,
            });

            state.toolCalls.push({ tool: tc.function.name, args, result: result.output });

            onEvent({
              type: 'persona_tool_result',
              persona: persona.id,
              tool: tc.function.name,
              result: result.output,
              success: result.success,
            });

            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: result.output,
            } as Message);
          }
          // Loop — model will process tool results
        } else {
          // Final text response from this persona
          state.output = msg.content || '';
          break;
        }
      }

      state.phase = 'complete';
      state.completedAt = Date.now();

      if (state.output) {
        onEvent({ type: 'persona_complete', persona: persona.id, output: state.output });
      }
    } catch (err) {
      state.phase = 'error';
      state.completedAt = Date.now();
      const errorMsg = err instanceof Error ? err.message : String(err);
      onEvent({ type: 'persona_error', persona: persona.id, error: errorMsg });
      logger.debug(`[conductor] Persona ${persona.id} error: ${errorMsg}`);
    }

    return state;
  }

  private buildPersonaPrompt(persona: PersonaDefinition, pool: ContextPool): string {
    return `${persona.prompt}

## Current Task
${pool.userRequest}

## Your Role in the Team
You are one of Ava's internal personas. You share context and memory with the rest of the team.
Your findings will be passed to the next persona in the sequence.
Be concise and specific. Focus only on YOUR responsibility.`;
  }

  private poolToString(pool: ContextPool): string {
    const sections: string[] = [];
    if (pool.findings.length > 0) sections.push(`**Scout findings:**\n${pool.findings.join('\n')}`);
    if (pool.decisions.length > 0) sections.push(`**Architecture decisions:**\n${pool.decisions.join('\n')}`);
    if (pool.verifications.length > 0) sections.push(`**Verification results:**\n${pool.verifications.join('\n')}`);
    if (pool.taskSequence.length > 0) sections.push(`**Task sequence:**\n${pool.taskSequence.join('\n')}`);
    if (pool.challenges.length > 0) sections.push(`**Challenges raised:**\n${pool.challenges.join('\n')}`);
    if (pool.memories.length > 0) sections.push(`**Relevant memories:**\n${pool.memories.join('\n')}`);
    return sections.join('\n\n');
  }

  private updatePool(pool: ContextPool, personaId: PersonaId, output: string): void {
    switch (personaId) {
      case 'scout':
        pool.findings.push(output);
        break;
      case 'recon':
        pool.findings.push(output);
        break;
      case 'researcher':
        pool.findings.push(output);
        break;
      case 'architect':
        pool.decisions.push(output);
        break;
      case 'verifier':
        pool.verifications.push(output);
        break;
      case 'sequencer':
        pool.taskSequence.push(output);
        break;
      case 'challenger':
        pool.challenges.push(output);
        break;
      default:
        pool.shared[personaId] = output;
    }
  }

  private buildSynthesis(pool: ContextPool, states: PersonaState[]): string {
    if (states.length === 0) return '';

    const parts: string[] = [
      '## Internal Planning Summary',
      `Ava's internal team (${states.map(s => s.id).join(', ')}) analysed this task.`,
      '',
    ];

    if (pool.findings.length > 0) {
      parts.push('### Codebase Analysis');
      parts.push(...pool.findings);
      parts.push('');
    }

    if (pool.decisions.length > 0) {
      parts.push('### Recommended Approach');
      parts.push(...pool.decisions);
      parts.push('');
    }

    if (pool.verifications.length > 0) {
      parts.push('### Verification');
      parts.push(...pool.verifications);
      parts.push('');
    }

    if (pool.taskSequence.length > 0) {
      parts.push('### Implementation Steps');
      parts.push(...pool.taskSequence);
      parts.push('');
    }

    if (pool.challenges.length > 0) {
      parts.push('### Challenges & Considerations');
      parts.push(...pool.challenges);
      parts.push('');
    }

    parts.push('---');
    parts.push('Use this analysis to inform your response. Follow the recommended approach and implementation steps.');

    return parts.join('\n');
  }

  private createEmptyPool(userRequest: string): ContextPool {
    return {
      userRequest,
      findings: [],
      decisions: [],
      verifications: [],
      taskSequence: [],
      challenges: [],
      memories: [],
      shared: {},
    };
  }
}
