/**
 * Intent Classifier — Qwen Flash gate between user input and tool use.
 *
 * Runs once per user message (at the top of agent.run) and returns one
 * of three labels. The result drives whether tool schemas are exposed
 * to the coordinator model for that turn.
 *
 * Why this exists:
 *   Without a gate, every user message triggers tool-use reasoning.
 *   Short conversational messages ("whats the issue", "really?",
 *   "what do you think") end up firing grep/bash/file_read when the
 *   user wanted an answer in words. The classifier puts a cheap
 *   permission check above the coordinator — *should this turn use
 *   tools at all* — so authority lives above the model, not inside
 *   the prompt.
 *
 * Labels:
 *   task          — user wants concrete action (code, commands, build)
 *   conversational — user is talking, asking, reacting, giving feedback
 *   ambiguous     — unclear, default to conversational (respond first)
 *
 * Cost: ~50 tokens in, 1 token out. ~$0.00005 per classification on
 * Qwen Flash. Far cheaper than a single mistaken file_read on the
 * coordinator (~$0.005).
 */

import type { Provider } from '../providers/types.js';
import type { ModelDefinition } from '../core/types.js';
import { logger } from '../core/logger.js';
import { chargeCredits, extractUsage } from '../billing/meter.js';

export type UserIntent = 'task' | 'conversational' | 'ambiguous';

export interface IntentClassifierOptions {
  provider: Provider;
  model: ModelDefinition;
  /** Classification timeout in ms. Defaults to 2000. */
  timeoutMs?: number;
}

const CLASSIFY_PROMPT = `You are classifying user messages sent to an AI coding agent. Output exactly one word, no punctuation, no explanation:

- task — user wants the agent to do something concrete in the codebase: write, fix, add, build, run, edit, launch, deploy, investigate, audit, review, analyse, check, scan, look at, take a look, assess, explore, find, debug, refactor, test, or any phrasing that implies agent action on files, commands, or the project
- conversational — user is having a dialogue with the agent that needs a worded reply: asking about the agent itself, reacting ("really?", "ok", "hmm"), expressing frustration, giving feedback on prior work, thanking, greeting, or asking meta-questions
- ambiguous — genuinely unclear, cannot tell from this message whether action is wanted

Examples:
- "take a look at the project and look for issues" → task (investigate/audit)
- "assess the design" → task (analyse)
- "can you review this code" → task
- "fix the bug in App.tsx" → task
- "whats the issue" → conversational (reaction/question about prior work)
- "really?" → conversational
- "no thanks" → conversational
- "what do you think" → conversational
- "ok go on" → conversational

When in doubt, classify task. A false "task" on a chatty message wastes one turn; a false "conversational" on a real task blocks tools and produces broken output. Conversational should require clear signals (questions about the agent, reactions, feedback, short replies).

Output just one word: task, conversational, or ambiguous.`;

export class IntentClassifier {
  private provider: Provider;
  private model: ModelDefinition;
  private timeoutMs: number;

  constructor(opts: IntentClassifierOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? 2000;
  }

  async classify(userMessage: string): Promise<UserIntent> {
    const trimmed = userMessage.trim();

    // Edge cases — skip the network call for trivially-classified messages.
    if (!trimmed) return 'ambiguous';

    // Very short messages are almost always conversational. Saves a call.
    // (Length 6 chosen to cover "ok", "yes", "no", "wait", "stop" etc.
    //  without catching one-word task requests like "test" or "build".)
    if (trimmed.length <= 6 && !/^(test|build|run|fix|ship|start|launch)$/i.test(trimmed)) {
      return 'conversational';
    }

    try {
      const result = await this.classifyViaModel(trimmed);
      return result;
    } catch (err) {
      // On any failure — timeout, provider error, parse error — default to
      // `task` to preserve existing behaviour. Classification is a
      // guard-rail enhancement, never a blocker.
      logger.debug(`[intent] Classification failed, defaulting to task: ${err instanceof Error ? err.message : String(err)}`);
      return 'task';
    }
  }

  private async classifyViaModel(message: string): Promise<UserIntent> {
    const promise = this.provider.createCompletion({
      model: this.model.id,
      messages: [
        { role: 'system' as const, content: CLASSIFY_PROMPT },
        { role: 'user' as const, content: message.slice(0, 1000) },
      ],
      temperature: 0,
      max_tokens: 8,
      stream: false,
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('intent classification timeout')), this.timeoutMs),
    );

    const response = await Promise.race([promise, timeout]);

    // Meter the Flash classification call — same bracket as other light
    // gates (routing, intent). Dual-write raw tokens for parity audit.
    chargeCredits('light_call', {
      model: this.model.id,
      rawTokens: extractUsage((response as { usage?: unknown }).usage as Parameters<typeof extractUsage>[0]),
    });

    // Extract the first message content. Shape varies by provider adapter.
    const resp = response as { choices?: Array<{ message?: { content?: string | unknown } }>; message?: { content?: string | unknown } };
    const content = resp.choices?.[0]?.message?.content ?? resp.message?.content ?? '';
    const raw = (typeof content === 'string' ? content : '').trim().toLowerCase();

    if (raw.startsWith('task')) return 'task';
    if (raw.startsWith('conv')) return 'conversational';
    if (raw.startsWith('amb')) return 'ambiguous';

    // Unrecognised output — default to 'task'. Blocking tools on a real
    // task produces broken output (model emits text-format tool calls);
    // running tools on a chatty message just wastes one turn.
    logger.info(`[intent] Unrecognised classification output: "${raw.slice(0, 40)}", defaulting to task`);
    return 'task';
  }
}
