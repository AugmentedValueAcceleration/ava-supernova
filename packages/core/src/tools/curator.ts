import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema, Provider } from '../providers/types.js';
import type { ModelDefinition } from '../core/types.js';
import { getTextContent } from '../core/types.js';
import type { AgentEventHandler } from '../agent/agent.js';
import type { ToolRegistry } from './tool-registry.js';
import { CURATOR } from '../personas/definitions.js';
import { Agent } from '../agent/agent.js';
import { Conversation } from '../agent/conversation.js';
import { logger } from '../core/logger.js';

/**
 * Curator Tool — on-demand taste specialist.
 *
 * When the calling agent hits a subjective design decision it doesn't have
 * clear guidance on (palette choice, typography selection, voice tone, visual
 * hierarchy, etc.), it calls this tool with the question. The tool spawns a
 * **fresh Curator agent** in an isolated context containing only:
 *
 *   - The Curator persona prompt
 *   - The project's Decisions/design/ folder contents (if present)
 *   - The user's relevant taste memory (pulled via memory_recall)
 *   - The specific design question being asked
 *
 * Critically, the Curator does NOT see the calling agent's conversation,
 * stack traces, build errors, or task churn. Her attention budget is fully
 * available for the one taste decision. This is the architectural fix for
 * "flustered design degradation" — the observation that design quality drops
 * under cognitive load because the agent's attention is saturated with
 * firefighting. A fresh-context specialist never sees the fire.
 *
 * The Curator runs one-shot and returns her decision + reasoning. The
 * calling agent applies the decision and continues its task.
 */
export class CuratorTool implements Tool {
  readonly name = 'curator';
  readonly description = 'Consult the Curator specialist for a design or taste decision';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'curator',
    description:
      'Consult the Curator specialist for a design or taste decision. Use this when ' +
      'you need to choose a colour, font, spacing, visual hierarchy, voice tone, layout ' +
      'pattern, component shape, motion character, empty-state treatment, or anything ' +
      'where the right answer is subjective and taste-driven rather than a technical ' +
      'correctness question. The Curator runs in a fresh context isolated from the ' +
      'current conversation — her attention is fully focused on the taste decision. ' +
      'She reads the project\'s Decisions/design/ folder, recalls the user\'s taste ' +
      'patterns from memory, and returns a decision with reasoning. Do NOT use for ' +
      'logic, data, auth, or performance questions — those are not taste decisions.',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description:
            'The specific design question you need answered. Be precise. ' +
            'Example: "What accent colour should I use for the primary CTA button on the hero section of a portfolio site for a full-stack developer? The base palette is already dark with a cool undertone."',
        },
        context: {
          type: 'string',
          description:
            'Optional context about where this decision lives in the UI, which file you\'re working on, and what constraints exist. Keep it tight — the Curator wants the decision question, not the whole task history.',
        },
      },
      required: ['question'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const question = args.question as string;
    if (!question || typeof question !== 'string') {
      return {
        success: false,
        output: 'curator tool requires a "question" parameter — the specific design question you need answered.',
      };
    }
    const extraContext = (args.context as string | undefined) ?? '';

    // ── Resolve provider + model from sharedState ─────────────────────────
    const sharedState = context.sharedState as Record<string, unknown> | undefined;
    const provider = sharedState?.activeProvider as Provider | undefined;
    const model = sharedState?.activeModel as ModelDefinition | undefined;
    const toolRegistry = sharedState?.toolRegistry as ToolRegistry | undefined;

    if (!provider || !model || !toolRegistry) {
      return {
        success: false,
        output:
          'Curator unavailable: missing activeProvider/activeModel/toolRegistry in shared state. ' +
          'Fallback: answer the design question yourself, consulting Decisions/design/*.md directly.',
      };
    }

    // ── Load Decisions/design/ folder contents ────────────────────────────
    const designContext = await loadDesignContext(context.cwd);

    // ── Build the Curator's fresh context prompt ──────────────────────────
    // The prompt is intentionally isolated — no chat history, no task brief,
    // no stack traces. Just persona + design context + the question.
    const systemPrompt = [
      CURATOR.prompt,
      '',
      '## Project design direction',
      designContext.length > 0
        ? designContext
        : '_No Decisions/design folder found for this project. Use your judgement, grounded in the user\'s taste memory if available._',
    ].join('\n');

    const userMessage = extraContext
      ? `**Context:** ${extraContext}\n\n**Question:** ${question}`
      : question;

    logger.debug(`[curator] Spawning fresh specialist for question: ${question.slice(0, 80)}...`);

    // ── Spawn a fresh Agent with the Curator's prompt ─────────────────────
    // The Curator shares the same tool registry and sharedState as the caller
    // — she needs file_read, memory_recall, and (optionally) file_write to
    // record decisions in Decisions/. The prompt enforces her scope: she
    // MUST NOT call the curator tool recursively or write outside Decisions/.
    const curatorAgent = new Agent({
      provider,
      model,
      toolRegistry,
      cwd: context.cwd,
      sharedState: context.sharedState,
    });

    const conversation = new Conversation();
    conversation.setSystemPrompt(systemPrompt);
    conversation.addUserMessage(userMessage);

    // ── Run one-shot (silent event handler — the caller doesn't need to see
    // every internal tool call the Curator makes; those would clutter the
    // main timeline. We just want the final decision text.) ───────────────
    const silentHandler: AgentEventHandler = () => { /* suppress */ };

    try {
      const signal = context.signal;
      const messages = await curatorAgent.run(
        conversation.getMessages(),
        silentHandler,
        signal,
      );

      // Extract the last assistant message — that's the decision.
      const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
      if (!lastAssistant) {
        return {
          success: false,
          output: 'Curator returned no response. Fallback: answer the design question yourself, consulting Decisions/design/*.md directly.',
        };
      }

      const decision = getTextContent(lastAssistant.content);

      if (!decision.trim()) {
        return {
          success: false,
          output: 'Curator returned an empty response. Fallback: answer the design question yourself.',
        };
      }

      logger.debug(`[curator] Decision returned (${decision.length} chars)`);

      return {
        success: true,
        output: `**Curator's decision:**\n\n${decision}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.debug(`[curator] Specialist run failed: ${message}`);
      return {
        success: false,
        output: `Curator specialist failed: ${message}. Fallback: answer the design question yourself, consulting Decisions/design/*.md directly.`,
      };
    }
  }
}

/**
 * Load the contents of `Decisions/design/*.md` for the given project.
 * Returns a concatenated string suitable for injection into a system prompt.
 * Returns empty string if no Decisions folder or no design files exist.
 */
async function loadDesignContext(projectRoot: string): Promise<string> {
  const designDir = join(projectRoot, 'Decisions', 'design');
  const files = ['palette.md', 'typography.md', 'voice.md', 'assets.md'];
  const parts: string[] = [];

  for (const file of files) {
    try {
      const content = await readFile(join(designDir, file), 'utf-8');
      const trimmed = content.trim();
      if (trimmed) {
        parts.push(`### Decisions/design/${file}\n${trimmed}`);
      }
    } catch {
      /* file doesn't exist — skip */
    }
  }

  // Also include overview/context for project-level framing
  const overviewFiles = ['overview.md', 'context.md'];
  for (const file of overviewFiles) {
    try {
      const content = await readFile(join(projectRoot, 'Decisions', file), 'utf-8');
      const trimmed = content.trim();
      if (trimmed) {
        parts.unshift(`### Decisions/${file}\n${trimmed}`);
      }
    } catch {
      /* skip */
    }
  }

  return parts.join('\n\n');
}
