import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel, ToolOutputTrust } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { PLATFORM_TAG_POLICY, type WebSearchFn } from '../social/index.js';
import { blueskyTagsFor, measureTags, type TagFetch } from '../social/tag-volume.js';

/**
 * Ground a post in the present BEFORE drafting: how the subject is being framed
 * right now (Reddit / HN / open web) + hashtags actually in use, harvested from
 * results and ranked by frequency. We do NOT invent engagement numbers — the
 * search backend can't see live platform volume, and faking it is worse than
 * honest best-practice tags. Search is the surface-injected `webSearch` in
 * sharedState (Brave server-side). Output is untrusted third-party content.
 */
export class ResearchPostTool implements Tool {
  readonly name = 'research_post';
  readonly description =
    'Research what is CURRENTLY landing for a subject before drafting a post — how it is being framed right now + candidate hashtags in use + the platform tag policy. Call before write_post when given a subject.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly outputTrust: ToolOutputTrust = 'untrusted';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'research_post',
    description: 'Research what is CURRENTLY landing for a subject BEFORE you draft a post. Returns how the topic is being framed right now (Reddit / Hacker News / open web), candidate hashtags actually in use (split so you choose reach vs niche), and the target platform\'s tag policy. ALWAYS call this before write_post when the operator gives you a subject — it grounds your angle and tags in the present instead of guessing. It also returns MEASURED tags: how many posts a day really carry each candidate on Bluesky (the only platform with free tag data) — reach ≥50/day, niche 1-50, quiet <1. Pick from those within the platform tag policy: a mix of reach and niche, never a quiet tag. Filter everything through the brand voice.',
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'The subject/topic of the post (e.g. "local-first AI privacy", "our latest release", "build-in-public update on the IDE").' },
        platform: {
          type: 'string',
          enum: ['tweet', 'linkedin', 'thread', 'bluesky', 'eurosky', 'facebook', 'reddit', 'tiktok', 'youtube', 'instagram', 'blog'],
          description: 'Target platform — shapes the tag policy returned. Defaults to tweet.',
        },
      },
      required: ['subject'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const webSearch = context.sharedState?.webSearch as WebSearchFn | undefined;
    if (!webSearch) {
      return {
        success: false,
        output: 'Web search is not available in this context. The host must inject `webSearch` into shared state.',
      };
    }

    const subject = ((args.subject as string | undefined) || '').trim();
    const platform = ((args.platform as string | undefined) || 'tweet').trim();
    if (!subject) return { success: false, output: 'research_post requires a `subject`.' };

    try {
      const queries = [
        `${subject} reddit`,
        `${subject} hacker news OR github`,
        `${subject} hashtags ${platform}`,
      ];
      const batches = await Promise.all(queries.map(q => webSearch(q, 5, 'pm').catch(() => [])));
      const all = batches.flat();

      // Harvest real, currently-in-use hashtags, rank by frequency. Most-
      // mentioned skew broad/reach; the tail skews niche. Ava makes the final
      // reach-vs-niche call within the platform cap.
      const text = all.map(r => `${r.title} ${r.snippet}`).join(' ');
      const tagMatches = text.match(/#\w{2,30}/g) || [];
      const freq: Record<string, number> = {};
      for (const t of tagMatches) {
        const k = t.toLowerCase();
        if (/^#(fyp|foryou|foryoupage)$/.test(k)) continue; // oversaturated — skip
        freq[k] = (freq[k] || 0) + 1;
      }
      const ranked = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([t]) => t);

      // Measured use (1 Nov 2026). Candidates = what Bluesky users actually tag
      // this subject with, plus the web harvest; each measured by real recent
      // volume. Best effort: if Bluesky is unreachable the harvest still stands.
      const tagFetch = context.sharedState?.tagFetch as TagFetch | undefined;
      const fromBluesky = await blueskyTagsFor(subject, tagFetch).catch(() => [] as string[]);
      const measured = await measureTags([...fromBluesky.slice(0, 6), ...ranked.slice(0, 6)], tagFetch).catch(() => []);

      const discussion = all
        .filter(r => r.snippet)
        .slice(0, 6)
        .map(r => ({ title: r.title.slice(0, 120), snippet: r.snippet.slice(0, 200), url: r.url }));

      return {
        success: true,
        output: JSON.stringify({
          subject,
          platform,
          tag_policy: PLATFORM_TAG_POLICY[platform] || PLATFORM_TAG_POLICY.tweet,
          candidate_reach_tags: ranked.slice(0, 3),
          candidate_niche_tags: ranked.slice(3, 8),
          measured_tags: measured.map(m => ({ tag: `#${m.tag}`, bluesky_posts_per_day: m.perDay, band: m.band })),
          current_discussion: discussion,
          note: measured.length
            ? 'measured_tags are REAL Bluesky volume (posts/day). Prefer them: a mix of reach and niche within the tag policy, never a quiet one. Other platforms publish no tag data, so this is a guide to what people genuinely use, not a guarantee for X or TikTok. Say which tags you picked and why in tag_note.'
            : 'Bluesky could not be measured just now, so these tags are harvested from current discussion, not measured. Choose reach vs niche within the tag policy; filter everything through the brand voice.',
        }),
      };
    } catch (err) {
      return { success: false, output: `research_post failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
