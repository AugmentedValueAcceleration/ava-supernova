/**
 * Her verdict on her own post, once it is out (8 Nov 2026).
 *
 * The same rule as the day plan's review, moved to where the record now is.
 * The operator, 20 Oct: "i want ava to always have her say and judge her own
 * work — it is what will help her improve as she has her memory too." He marks
 * what landed on the post; she says what she thinks of what she made. Neither
 * replaces the other, and where the two disagree is the most useful thing in
 * the record.
 *
 * The Posts room stopped planning the day on 8 Nov — "we never plan out
 * anything, it's all done on demand" — so there is no plan row to hang a
 * verdict on. The post itself is the record.
 */

import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { PostStore } from '../social/index.js';

export class ReviewPostTool implements Tool {
  readonly name = 'review_post';
  readonly description =
    'Record your own honest verdict on a post that went out — what worked, what did not, what you would do differently.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'review_post',
    description:
      'Record YOUR verdict on YOUR OWN work for a post that went out: what worked, what did not, and what you would change. '
      + 'Always give one, honestly. A weak post called weak is worth more than a flattering record. '
      + 'Judge the work yourself; do not echo his Landed mark. Where you and he disagree, that is the thing to learn from. '
      + 'The ids come from check_posts. If a verdict should change how you work, save the lesson with memory_save as well.',
    parameters: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'The post ids from check_posts — one platform, or every platform the story went to.' },
        verdict: { type: 'string', description: 'One to three plain sentences. Specific: name the line that worked or the choice that did not.' },
      },
      required: ['ids', 'verdict'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.postStore as PostStore | undefined;
    if (!store) return { success: false, output: 'Post storage is not available in this context.' };
    if (typeof store.review !== 'function') {
      return { success: false, output: 'This surface cannot record a verdict on a post. Say it to him in the chat instead, and save the lesson with memory_save.' };
    }

    const ids = Array.isArray(args.ids) ? (args.ids as unknown[]).map(String).map(x => x.trim()).filter(Boolean) : [];
    const verdict = typeof args.verdict === 'string' ? args.verdict.trim() : '';
    if (!ids.length) return { success: false, output: 'Missing `ids`. Call check_posts first to get them.' };
    if (!verdict) return { success: false, output: 'An empty verdict is not a verdict. Say what you actually think of the work.' };

    try {
      const n = await store.review(ids, verdict.slice(0, 1000));
      if (n === 0) return { success: false, output: 'None of those ids are posts that exist. Call check_posts again for the right ones.' };
      return {
        success: true,
        output: `Verdict recorded on ${n} post${n === 1 ? '' : 's'}. If it changes how you will work, save the lesson with memory_save.`,
        metadata: { updated: n },
      };
    } catch (err) {
      return { success: false, output: `Could not record the verdict: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
