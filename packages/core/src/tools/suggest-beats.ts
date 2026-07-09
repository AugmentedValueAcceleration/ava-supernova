import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { BeatStore, Beat } from '../social/index.js';

/**
 * Propose 3–5 things worth posting about TODAY — the studio's briefing. Side-
 * effect-free: validate + hand the beats to the surface-injected `beatStore`,
 * which the surface renders as the menu. Ava grounds herself first (release_notes
 * / research_post / memory_recall) then calls this; she does NOT write the posts.
 */
export class SuggestBeatsTool implements Tool {
  readonly name = 'suggest_beats';
  readonly description =
    'Propose 3-5 things worth posting about today — the studio briefing. Ground yourself first (release_notes / research_post / memory_recall), then offer concrete angles. Do NOT write the posts; this is the menu.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'suggest_beats',
    description: 'Propose 3-5 things worth posting about TODAY — the studio\'s briefing. Call this when the operator asks "what should I post today" / "today\'s beats" / opens a planning request. First ground yourself: release_notes for anything just shipped, research_post or web_search for what\'s currently landing in our space, memory_recall to avoid repeating recent angles. Then return beats that fit the mission — each a concrete angle, the platform that suits it, and one line on why it lands now. Do NOT write the posts; this is the menu, the operator picks one to draft.',
    parameters: {
      type: 'object',
      properties: {
        beats: {
          type: 'array',
          description: '3-5 post ideas for today.',
          items: {
            type: 'object',
            properties: {
              angle: { type: 'string', description: 'The concrete thing to post about — specific, not a category (e.g. "the price gap vs $200/mo frontier tools", not "pricing").' },
              platform: { type: 'string', description: 'Best platform for this beat (tweet, linkedin, bluesky, thread, tiktok, youtube, blog).' },
              why: { type: 'string', description: 'One line on why this lands right now — a current beat, a fresh ship, a gap nobody else is filling.' },
            },
            required: ['angle', 'platform', 'why'],
          },
        },
      },
      required: ['beats'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.beatStore as BeatStore | undefined;
    if (!store) {
      return {
        success: false,
        output: 'Beat suggestions are not available in this context. The host must inject `beatStore` into shared state.',
      };
    }

    const rawBeats = Array.isArray(args.beats) ? (args.beats as unknown[]) : [];
    const beats: Beat[] = rawBeats
      .map((b) => {
        const o = (b && typeof b === 'object') ? b as Record<string, unknown> : {};
        return {
          angle: String(o.angle || '').trim(),
          platform: String(o.platform || 'tweet').trim(),
          why: String(o.why || '').trim(),
        };
      })
      .filter(b => b.angle)
      .slice(0, 5);

    if (beats.length === 0) {
      return { success: false, output: 'suggest_beats requires at least one beat.' };
    }

    try {
      await store.suggest(beats);
      return {
        success: true,
        output: `Offered ${beats.length} beat${beats.length === 1 ? '' : 's'} for today — the operator picks one to take through to a draft.`,
        metadata: { count: beats.length },
      };
    } catch (err) {
      return { success: false, output: `Failed to suggest beats: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
