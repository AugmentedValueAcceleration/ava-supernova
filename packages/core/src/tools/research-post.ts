import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel, ToolOutputTrust } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { PLATFORM_TAG_POLICY } from '../social/index.js';
import { resolveWebSearch } from './web-search.js';
import { blueskyTagsFor, measureTags, mastodonTagVolume, type TagFetch } from '../social/tag-volume.js';

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
    'Research what is CURRENTLY landing for a subject before drafting a post — how it is being framed right now, MEASURED tag use on Bluesky and Mastodon, and the platform tag policy. Call before write_post when given a subject.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly outputTrust: ToolOutputTrust = 'untrusted';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'research_post',
    description: 'Research what is CURRENTLY landing for a subject BEFORE you draft a post. Returns how the topic is being framed right now (Reddit, Hacker News, open web), the platform’s tag policy, and MEASURED tags: posts a day on Bluesky and uses a day on Mastodon for the tags people really put on this subject, plus any tags you pass in `tags` to check (for example from the tag library in his template). Bands on Bluesky: reach 50+/day, niche 1-50, quiet under 1, which nobody reads. Pick tags for THIS post’s subject and audience from the measured ones, never a quiet one, never by habit.',
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'The subject/topic of the post (e.g. "local-first AI privacy", "our latest release", "build-in-public update on the IDE").' },
        platform: {
          type: 'string',
          enum: ['tweet', 'linkedin', 'thread', 'bluesky', 'eurosky', 'facebook', 'reddit', 'tiktok', 'youtube', 'instagram', 'blog'],
          description: 'Target platform — shapes the tag policy returned. Defaults to tweet.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags you are considering (up to 6), to be measured alongside the ones found for the subject.',
        },
      },
      required: ['subject'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    // Injected (the hub) → the user's own Brave key → DuckDuckGo. This failed
    // outright without the server's key, so it never worked outside the hub.
    const webSearch = resolveWebSearch(context).search;

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
      // Her own candidates first, then what Bluesky users actually tag this
      // subject with. The web harvest is NOT offered as tags any more: it is
      // mostly "best hashtags" spam pages (10 Nov 2026). It is only measured.
      const asked = Array.isArray(args.tags) ? (args.tags as unknown[]).map(t => String(t).replace(/^#/, '').trim()).filter(Boolean).slice(0, 6) : [];
      const measured = await measureTags([...asked, ...fromBluesky.slice(0, 5), ...ranked.slice(0, 3)], tagFetch).catch(() => []);
      const masto = await Promise.all(measured.map(m => mastodonTagVolume(m.tag).catch(() => null)));

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
          measured_tags: measured.map((m, i) => ({
            tag: `#${m.tag}`, bluesky_posts_per_day: m.perDay, band: m.band,
            ...(masto[i] !== null ? { mastodon_uses_per_day: masto[i] } : {}),
          })),
          current_discussion: discussion,
          note: measured.length
            ? 'These are REAL measurements (Bluesky posts a day, Mastodon uses a day). Pick tags for this post’s subject and audience, within the tag policy, never a quiet one. X, LinkedIn, TikTok, Instagram and Facebook publish no free tag data, so treat these as the best guide to what people really use. CamelCase, no hyphens. Say which tags you picked and why in tag_note.'
            : 'Tags could not be measured just now. Use the tag library in his template if it is in your context, and say in tag_note that the tags are unmeasured.',
        }),
      };
    } catch (err) {
      return { success: false, output: `research_post failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
