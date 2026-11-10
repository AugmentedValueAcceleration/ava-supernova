import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { POST_HARD_LIMITS, REDDIT_TITLE_LIMIT, type PostStore, type SocialPostInput, MODERATION_GUIDANCE, UNTAGGED_PLATFORMS, tagsIn, tagProblems, DAILY_PARAM_DESCRIPTION, FEATURE_PARAM_DESCRIPTION, postMarker } from '../social/index.js';

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
      MODERATION_GUIDANCE + ' Emit a finalized social media post to the Social Studio canvas. Call this ONCE PER POST. When you generate 4 post variants, call write_post 4 times. Never write post content in your narration — only call this tool. Your text reply should be brief narration ("Wrote 3 Monday tweets — see canvas").',
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
        subject: { type: 'string', description: 'What this post is ABOUT, in 2-5 words — the STORY, not the platform and not the format. "0.97 silent tool withholding", "credits kept on downgrade", "Altman on the industry not doing enough". ALWAYS set it. It is how you find out later whether we have already covered something: the planning turn reads these back as SUBJECTS ALREADY COVERED, and a subject you did not record is a story you will offer again in a fortnight as though it were new. The SAME story going to four platforms takes the SAME subject — that is the point, it is one story.' },
        variant: { type: 'string', description: 'Optional variant label when writing multiple versions of the same post (e.g. "punchy", "deeper", "hopeful").' },
        hashtags: { type: 'array', items: { type: 'string' }, description: 'The hashtags you chose for this post (the same ones present in content), so the UI can show them as an editable chip row. Pulled from research_post and kept within the platform tag policy. Omit for platforms that take no tags (e.g. blog).' },
        tag_note: { type: 'string', description: 'One short line on why these tags — e.g. "#buildinpublic + #aitools for reach, #localfirst niche". Shown under the chips.' },
        daily: { type: 'string', description: DAILY_PARAM_DESCRIPTION },
        feature: { type: 'string', description: FEATURE_PARAM_DESCRIPTION },
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

    const platform = ((args.platform as string | undefined) || '').trim();
    // A call with no platform used to be filed as "post" and land as a stray
    // extra card (10 Nov 2026: Qwen Flash dropped the field on a set of three).
    if (!platform) {
      return { success: false, output: 'write_post needs `platform` (tweet, bluesky, linkedin, facebook, …). Nothing was written; call it again with the platform.' };
    }
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

    const declaredTags = Array.isArray(args.hashtags)
      ? (args.hashtags as unknown[]).map(h => String(h).trim().replace(/^#/, '')).filter(Boolean)
      : [];
    // Tags written into the text count too, and are carried into the array so
    // the Library keeps them as tags rather than only as words in the body.
    const hashtags = tagsIn(declaredTags, content);
    if (!UNTAGGED_PLATFORMS.has(platform) && hashtags.length === 0) {
      return {
        success: false,
        output:
          `This ${platform} post has no hashtags. Posts always carry tags (the operator's rule) — every platform ` +
          'except Reddit and Discord. Pick them from research for THIS post\'s subject (research_post gives ' +
          'measured Bluesky use), within the platform tag policy, put them in the content AND in `hashtags`, ' +
          'and call write_post again.',
      };
    }

    const problems = UNTAGGED_PLATFORMS.has(platform) ? [] : tagProblems(hashtags, content);
    if (problems.length) {
      return {
        success: false,
        output: `Fix these tags and call write_post again: ${problems.join(' ')}`,
      };
    }

    // The same post twice (10 Nov 2026: one LinkedIn post was written three
    // times on 4 Nov, and in testing a whole set was written twice with the
    // subject reworded). A second post for the same PLATFORM in this session
    // within ten minutes is refused unless it is a named other version. On the
    // website every turn starts a fresh session, so "write another one for X"
    // in his next message still works.
    const variantArg = ((args.variant as string | undefined)?.trim()) || '';
    const recent = (context.sharedState?.recentPostWrites as Map<string, number> | undefined) ?? new Map<string, number>();
    if (context.sharedState) context.sharedState.recentPostWrites = recent;
    const dupKey = `${platform}|${variantArg.toLowerCase()}`;
    const last = recent.get(dupKey);
    if (last && Date.now() - last < 10 * 60_000) {
      return {
        success: false,
        output: `You already wrote the ${platform} post a moment ago, and it is on his screen. ` +
          'Do not write it again. If he asked for another version, pass a `variant` name.',
      };
    }

    const post: SocialPostInput = {
      platform,
      content,
      title: ((args.title as string | undefined)?.trim()) || null,
      subject: ((args.subject as string | undefined)?.trim()) || null,
      variant: ((args.variant as string | undefined)?.trim()) || null,
      hashtags,
      tagNote: ((args.tag_note as string | undefined)?.trim()) || null,
      daily: postMarker(args.daily, 40) ?? null,
      feature: postMarker(args.feature) ?? null,
    };

    try {
      const written = await store.write(post);
      recent.set(dupKey, Date.now());
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
