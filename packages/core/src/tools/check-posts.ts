/**
 * What has actually been written — the read she went without.
 *
 * 20 Oct 2026, in the hub: the operator asked for a set of posts. The videos
 * were created, the text post was not. He asked what happened and she said
 * they had been made.
 *
 * That read as lying and it was not. `PostStore` had exactly one method,
 * `write()`. With no way to look at what exists, "did you make it?" could only
 * be answered from her own intent — and her intent had been to make it. **You
 * cannot ask something to be honest about what it cannot observe.** Every
 * instruction telling her to be accurate was asking her to report on a room
 * she was standing outside of, which is why months of them changed nothing.
 *
 * This is the window into that room. It is deliberately boring: it reports
 * what is there, says plainly when the answer is nothing, and never infers.
 *
 * It matters more here than in most rooms because the operator is LEARNING
 * marketing through these conversations. A confident wrong answer does not
 * waste a turn — it teaches him something false that he will act on for
 * months, and he cannot easily re-derive where the belief came from.
 */

import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { PostStore, ExistingPost } from '../social/index.js';

export class CheckPostsTool implements Tool {
  name = 'check_posts';
  description = 'Look at the posts that actually exist, rather than the ones you meant to write.';
  riskLevel: ToolRiskLevel = 'safe';
  requiresConfirmation = false;

  get schema(): FunctionSchema {
    return {
      name: this.name,
      description:
        'Look at the posts that ACTUALLY EXIST, rather than the ones you meant to write. '
        + 'Call it whenever the answer depends on what was really created: when the operator asks '
        + 'whether something went out, when he says a post is missing, before telling him a piece '
        + 'of work is done, and before planning a day so you know what has already been said. '
        + 'If a post you tried to write is not in the list, it was NOT written — say so plainly and '
        + 'do not explain it away. Being wrong about this is worse than being slow: he is learning '
        + 'marketing from you, so a confident wrong answer becomes something he believes for months.',
      parameters: {
        type: 'object',
        properties: {
          since_days: {
            type: 'number',
            description:
              'How far back to look, in days. 1 is today, 7 a week. Defaults to 1 — "did that go '
              + 'out?" almost always means today.',
          },
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.postStore as PostStore | undefined;

    if (!store) {
      return {
        success: false,
        output: 'Post storage is not available in this context, so there is nothing to check against.',
      };
    }
    // A host without the read must SAY so. Falling back to "nothing found"
    // would be the original bug wearing a tool's clothes: an unknowable
    // answered as a known one.
    if (typeof store.list !== 'function') {
      return {
        success: false,
        output:
          'This surface cannot read back what was written — only write. So I cannot tell you what '
          + 'exists, and I should not guess. Check the Posts tab directly.',
      };
    }

    const raw = args.since_days;
    const sinceDays = Math.min(90, Math.max(1, typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 1));

    let posts: ExistingPost[];
    try {
      posts = await store.list({ sinceDays });
    } catch (err) {
      return {
        success: false,
        output: `Could not read what exists: ${err instanceof Error ? err.message : String(err)}. I do not know what was written.`,
      };
    }

    const window = sinceDays === 1 ? 'today' : `the last ${sinceDays} days`;

    if (posts.length === 0) {
      return {
        success: true,
        output:
          `Nothing has been written ${window}. Not "nothing I can find" — the store is empty for `
          + `that window. If you expected something here, it was not created.`,
        metadata: { count: 0, sinceDays },
      };
    }

    const text = posts.filter(p => p.kind === 'text');
    const video = posts.filter(p => p.kind === 'video');
    const line = (p: ExistingPost) =>
      `  • ${p.platform}${p.title ? ` — ${p.title}` : ''}${p.subject ? ` (about: ${p.subject})` : ''}`
      + `${p.status && p.status !== 'draft' ? ` [${p.status}]` : ''}`;

    const parts = [`${posts.length} post${posts.length === 1 ? '' : 's'} exist ${window}:`];
    if (text.length) parts.push(`\nText (${text.length}):\n${text.map(line).join('\n')}`);
    if (video.length) parts.push(`\nVideo (${video.length}):\n${video.map(line).join('\n')}`);
    parts.push(
      '\nThis is the whole list. Anything you expected that is not here was not written — '
      + 'say that plainly rather than accounting for it.',
    );

    return {
      success: true,
      output: parts.join('\n'),
      metadata: { count: posts.length, text: text.length, video: video.length, sinceDays },
    };
  }
}
