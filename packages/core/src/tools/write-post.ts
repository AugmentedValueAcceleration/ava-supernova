import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { POST_HARD_LIMITS, REDDIT_TITLE_LIMIT, type PostStore, type SocialPostInput } from '../social/index.js';

/**
 * Emit a finished social post to the Social Studio canvas — one call per post.
 * The card render + Library auto-save happen in the surface-injected
 * `postStore` (sharedState); this tool does the surface-free work: validate the
 * body and enforce the platform's hard character cap deterministically (LLMs
 * can't count reliably), rejecting an over-limit post with the exact overage so
 * Ava trims and re-calls in the same turn instead of shipping something that
 * won't publish.
 */
export class WritePostTool implements Tool {
  readonly name = 'write_post';
  readonly description =
    'Emit a finalized social media post to the Social Studio canvas. Call this ONCE PER POST — for 4 variants, call it 4 times. Never write post content in your narration; only call this tool. Your reply stays brief narration ("Wrote 3 Monday tweets — see canvas").';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'write_post',
    description:
      'Emit a finalized social media post to the Social Studio canvas. Call this ONCE PER POST. When you generate 4 post variants, call write_post 4 times. Never write post content in your narration — only call this tool. Your text reply should be brief narration ("Wrote 3 Monday tweets — see canvas").',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['tweet', 'linkedin', 'thread', 'facebook', 'instagram', 'bluesky', 'eurosky', 'reddit', 'discord', 'youtube', 'tiktok', 'producthunt', 'blog', 'post'],
          description: 'Target platform. "tweet" for X, "bluesky" for Bluesky (300 char cap), "tiktok" for TikTok, "youtube" for YouTube Shorts. "post" only if none of the above fit.',
        },
        content: { type: 'string', description: 'The finalized post content, ready to publish. Include the hashtags and link inline per the platform tag policy — content must be copy-paste ready.' },
        title: { type: 'string', description: 'Short title for the library (e.g. "Monday Motivation v1"). Auto-generated if omitted — EXCEPT on Reddit, where the title is published content, is REQUIRED, caps at 300 characters, and does most of the work of the post.' },
        variant: { type: 'string', description: 'Optional variant label when writing multiple versions of the same post (e.g. "punchy", "deeper", "hopeful").' },
        hashtags: { type: 'array', items: { type: 'string' }, description: 'The hashtags you chose for this post (the same ones present in content), so the UI can show them as an editable chip row. Pulled from research_post and kept within the platform tag policy. Omit for platforms that take no tags (e.g. blog).' },
        tag_note: { type: 'string', description: 'One short line on why these tags — e.g. "#buildinpublic + #aitools for reach, #localfirst niche". Shown under the chips.' },
      },
      required: ['platform', 'content'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.postStore as PostStore | undefined;
    if (!store) {
      return {
        success: false,
        output: 'Post storage is not available in this context. The host must inject `postStore` into shared state.',
      };
    }

    const platform = ((args.platform as string | undefined) || 'post').trim();
    const content = ((args.content as string | undefined) || '').trim();
    if (!content || content.length < 2) {
      return { success: false, output: 'write_post requires non-empty content.' };
    }

    // Deterministic char-limit enforcement — count by code point (emoji = 1),
    // reject over-limit with the exact overage so Ava trims and re-calls.
    const hardLimit = POST_HARD_LIMITS[platform];
    if (hardLimit) {
      const len = Array.from(content).length;
      if (len > hardLimit) {
        const over = len - hardLimit;
        return {
          success: false,
          output:
            `This ${platform} post is ${len} characters — ${over} over the ${hardLimit} limit. ` +
            `Trim ${over}+ characters and call write_post again. Keep the hook and the point; cut ` +
            `filler, not substance. (Hashtags and any link count toward the limit.)`,
        };
      }
    }

    // Reddit's title is not a library label — it is the headline people vote on,
    // and a Reddit post without one is not a post. Enforced here rather than left
    // to the prompt, so the failure is a corrective message Ava can act on.
    if (platform === 'reddit') {
      const title = ((args.title as string | undefined) || '').trim();
      if (!title) {
        return {
          success: false,
          output:
            'A Reddit post needs a title — on Reddit the title is published content, not a library ' +
            'label. It is what people vote on and often all they read. Write a plain, specific title ' +
            '(max 300 characters, no hashtags) and call write_post again.',
        };
      }
      const titleLen = Array.from(title).length;
      if (titleLen > REDDIT_TITLE_LIMIT) {
        const over = titleLen - REDDIT_TITLE_LIMIT;
        return {
          success: false,
          output:
            `This Reddit title is ${titleLen} characters — ${over} over the ${REDDIT_TITLE_LIMIT} limit. ` +
            `Trim ${over}+ characters and call write_post again.`,
        };
      }
    }

    const hashtags = Array.isArray(args.hashtags)
      ? (args.hashtags as unknown[]).map(h => String(h).trim().replace(/^#/, '')).filter(Boolean)
      : [];

    const post: SocialPostInput = {
      platform,
      content,
      title: ((args.title as string | undefined)?.trim()) || null,
      variant: ((args.variant as string | undefined)?.trim()) || null,
      hashtags,
      tagNote: ((args.tag_note as string | undefined)?.trim()) || null,
    };

    try {
      const written = await store.write(post);
      const label = post.variant ? ` (${post.variant})` : '';
      return {
        success: true,
        output: `Posted a ${platform} card${label} to the canvas${written.assetId ? ' — saved to the Library' : ''}.`,
        metadata: { id: written.id, platform, assetId: written.assetId ?? null },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: `Failed to write the post: ${msg}` };
    }
  }
}
