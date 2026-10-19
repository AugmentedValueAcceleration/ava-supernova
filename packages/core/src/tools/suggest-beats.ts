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
    description: 'Propose the things worth posting about TODAY — FOUR OR FIVE, and AT LEAST ONE MUST BE ANCHORED TO A REAL NEWS STORY — the studio\'s briefing. Call this when the operator asks "what should I post today" / "today\'s beats" / opens a planning request. First ground yourself: release_notes for anything just shipped, research_post or web_search for what\'s currently landing in our space, memory_recall to avoid repeating recent angles. Then return STORIES that fit the mission — each a concrete angle, one line on why it lands now, and what FORM it wants. Form is part of the idea, not a flag bolted onto it: some beats only exist as a film, some only work written down. Offer a mix rather than a list of text posts with the occasional video attached. Do NOT name platforms: a story goes to every crowd in the same slot, adapted to each, and where it goes is a planning decision the operator makes, not a property of the idea. Do NOT write the posts either; this is the menu, the operator picks one to draft.',
    parameters: {
      type: 'object',
      properties: {
        beats: {
          type: 'array',
          description: 'The post ideas the day actually has — FOUR OR FIVE, no fewer. At least one must set `is_news`. A thin day is not a reason to return two: it is a reason to go and FIND the fourth, which is what the news beat is for — the field always has something happening, and a day with nothing of our own still has something worth saying about today. What is forbidden is padding the list with the same evergreen angle in new words.',
          items: {
            type: 'object',
            properties: {
              angle: { type: 'string', description: 'The concrete thing to post about — specific, not a category (e.g. "the price gap vs $200/mo frontier tools", not "pricing").' },
              why: { type: 'string', description: 'One line on why this lands right now — a current beat, a fresh ship, a gap nobody else is filling.' },
              needs_video: { type: 'boolean', description: 'True when this story would land HARDER as a film than as text. Not only demos and before/afters — a mood piece, a piece to camera, a scene that sets a feeling all count, and a clip carries its own soundtrack. Decides whether Reels and Shorts are on by default. Ask which form the idea wants rather than whether it earns the effort: a clip now renders first-time in a couple of minutes, so a video is no longer an hour of the operator\'s day and should not be rationed like one. Still say false when the idea is genuinely an argument that reads better — a dense comparison, a technical correction, anything whose value is in re-reading it.' },
              is_news: { type: 'boolean', description: 'True when this beat is anchored to a REAL story from today or the last day or two — a named model release, a named outage, a named policy change, something the field is actually discussing. AT LEAST ONE BEAT A DAY MUST HAVE IT. Ground it first with web_search or the news desk and name the thing specifically in `angle`; \'AI is moving fast\' is not news. NEVER invent one — a fabricated story is far worse than a day without a news beat, and it is the one mistake here that cannot be walked back.' },
              format: { type: 'string', description: 'Optional. The shape the idea wants, when the FORM is the idea rather than a wrapper on it — e.g. "30s piece to camera", "15s held shot of the dish", "silent 30s scene, caption carries it". Say it here when a beat only really exists in one form; leave it out when the angle would work as either.' },
            },
            required: ['angle', 'why'],
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
          why: String(o.why || '').trim(),
          needs_video: o.needs_video === true,
          is_news: o.is_news === true,
        };
      })
      .filter(b => b.angle)
      .slice(0, 5);

    if (beats.length === 0) {
      return { success: false, output: 'suggest_beats requires at least one beat.' };
    }

    // Four to five, with a news beat among them (19 Oct 2026, operator's call).
    // Both were guidance before and neither held: the briefing kept arriving as
    // two safe evergreen angles about ourselves, which reaches only the people
    // already looking at us.
    if (beats.length < 4) {
      return {
        success: false,
        output:
          `Only ${beats.length} beat${beats.length === 1 ? '' : 's'} — the day needs FOUR OR FIVE. `
          + 'A thin day is not a reason to return fewer, it is a reason to go and find the rest: search '
          + 'what is landing in the field today, check the news desk, look at what shipped. Do not pad '
          + 'with the same evergreen angle reworded — find a different one.',
      };
    }
    if (!beats.some(b => b.is_news)) {
      return {
        success: false,
        output:
          'No news beat. At least one of today\'s ideas has to be anchored to a REAL story from today '
          + 'or the last day or two — a named release, a named outage, a named policy change that the '
          + 'field is actually discussing.\n\nPosts about our own work only reach people already looking '
          + 'at us; a post about what everyone is discussing today reaches people who have never heard of '
          + 'us. Search for it, name it specifically, and set `is_news`. Never invent one.',
      };
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
