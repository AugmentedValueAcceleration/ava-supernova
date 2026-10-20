import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { BeatStore, Beat, BeatKind, PlanningDay } from '../social/index.js';

const KINDS: BeatKind[] = ['our_work', 'news', 'conversation'];
const KIND_LABEL: Record<BeatKind, string> = { our_work: 'our work', news: 'news', conversation: 'conversation' };

/**
 * Propose four or five things worth posting about TODAY — her PROPOSAL for the
 * day, which the operator then argues with until they agree it. Side-effect-
 * free: validate + hand the beats to the surface-injected `beatStore`. Ava
 * grounds herself first, then calls this; she does NOT write the posts.
 *
 * Called again, with the FULL set, whenever the discussion changes the plan —
 * the surface replaces what is on the table with the latest call.
 */
export class SuggestBeatsTool implements Tool {
  readonly name = 'suggest_beats';
  readonly description =
    'Propose four or five things worth posting about today — your proposal for the day, which the operator argues with before anything is written. Ground yourself first, then offer concrete angles. Do NOT write the posts.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'suggest_beats',
    description: 'Propose the things worth posting about TODAY — FOUR TO SIX for a full day (fewer when planning what is left of today), split EQUALLY across three kinds: OUR WORK (what we built or shipped), NEWS (a real, named story from the last day or two) and CONVERSATION (an argument people are having in a named thread right now, where we take a position). Every kind at least once, none more than twice. The studio\'s briefing. Call this when the operator asks "what should I post today" / "today\'s beats" / opens a planning request. First ground yourself: release_notes for anything just shipped, research_post or web_search for what\'s currently landing in our space, memory_recall to avoid repeating recent angles. Then return STORIES that fit the mission — each a concrete angle, one line on why it lands now, and what FORM it wants. Form is part of the idea, not a flag bolted onto it: some beats only exist as a film, some only work written down. Offer a mix rather than a list of text posts with the occasional video attached. Do NOT name platforms: a story goes to every crowd in the same slot, adapted to each, and where it goes is a planning decision the operator makes, not a property of the idea. Do NOT write the posts either: this is your PROPOSAL for the day, and nothing is written until the operator has agreed it. When the discussion changes the plan, call this again with the FULL set — untouched beats reproduced exactly — because the latest call replaces what is on the table.',
    parameters: {
      type: 'object',
      properties: {
        beats: {
          type: 'array',
          description: 'The post ideas the day actually has — FOUR TO SIX for a full day, with every `kind` present and none more than twice (2/1/1, 2/2/1 or 2/2/2). When planning what is left of today, one per posting slot still ahead, as evenly spread across the kinds as that allows. A thin day is not a reason to return two: it is a reason to go and FIND the fourth, which is what the news beat is for — the field always has something happening, and a day with nothing of our own still has something worth saying about today. What is forbidden is padding the list with the same evergreen angle in new words.',
          items: {
            type: 'object',
            properties: {
              angle: { type: 'string', description: 'The concrete thing to post about — specific, not a category (e.g. "the price gap vs $200/mo frontier tools", not "pricing").' },
              why: { type: 'string', description: 'One line on why this lands right now — a current beat, a fresh ship, a gap nobody else is filling.' },
              needs_video: { type: 'boolean', description: 'True when this story would land HARDER as a film than as text. Not only demos and before/afters — a mood piece, a piece to camera, a scene that sets a feeling all count, and a clip carries its own soundtrack. Decides whether Reels and Shorts are on by default. Ask which form the idea wants rather than whether it earns the effort: a clip now renders first-time in a couple of minutes, so a video is no longer an hour of the operator\'s day and should not be rationed like one. Still say false when the idea is genuinely an argument that reads better — a dense comparison, a technical correction, anything whose value is in re-reading it.' },
              is_news: { type: 'boolean', description: 'True when this beat is anchored to a REAL story from today or the last day or two — a named model release, a named outage, a named policy change, something the field is actually discussing. AT LEAST ONE BEAT A DAY MUST HAVE IT. Ground it first with web_search or the news desk and name the thing specifically in `angle`; \'AI is moving fast\' is not news. NEVER invent one — a fabricated story is far worse than a day without a news beat, and it is the one mistake here that cannot be walked back.' },
              kind: {
                type: 'string',
                enum: ['our_work', 'news', 'conversation'],
                description: 'Which move this is. our_work: something we built or shipped — show the thing; ground it in the commit log, docs_lookup or release_notes. news: something HAPPENED — a named release, outage, policy change from the last day or two; find it with web_search and name it in `angle`; never invent one. conversation: people are ARGUING about something right now — find the thread with web_search (search Reddit and Hacker News directly; a debate does not show up in news results) and take a side. The day is an equal split because posts about ourselves only reach people already looking at us, and people want a break from look-at-me posts.',
              },
              venue: { type: 'string', description: 'conversation beats ONLY, and REQUIRED for them: where the argument is, named specifically — e.g. an r/ExperiencedDevs thread on whether agents are useful yet, or an HN thread on a model\'s pricing. Not just "Reddit".' },
              position: { type: 'string', description: 'conversation beats ONLY, and REQUIRED for them: the side we take, in one sentence. Our standing is that we SHIP a local-first agent while most of the thread is speculating — "we did this, here is what happened" is the move nobody can copy. A neutral observation is refused.' },
              format: { type: 'string', description: 'Optional. The shape the idea wants, when the FORM is the idea rather than a wrapper on it — e.g. "30s piece to camera", "15s held shot of the dish", "silent 30s scene, caption carries it". Say it here when a beat only really exists in one form; leave it out when the angle would work as either.' },
            },
            required: ['angle', 'why', 'kind'],
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
        // `kind` is what counts. An older caller that only set is_news is
        // still read as news rather than refused for a field it never knew.
        const kind: BeatKind | undefined = KINDS.includes(o.kind as BeatKind)
          ? o.kind as BeatKind
          : o.is_news === true ? 'news' : undefined;
        const venue = typeof o.venue === 'string' ? o.venue.trim() : '';
        const position = typeof o.position === 'string' ? o.position.trim() : '';
        return {
          angle: String(o.angle || '').trim(),
          why: String(o.why || '').trim(),
          needs_video: o.needs_video === true,
          is_news: kind === 'news',
          ...(kind ? { kind } : {}),
          ...(kind === 'conversation' && venue ? { venue } : {}),
          ...(kind === 'conversation' && position ? { position } : {}),
          // The schema asks for it, so it has to survive the trip. It was
          // dropped here, which meant "the form IS the idea" never reached
          // the operator however clearly she had said it.
          ...(typeof o.format === 'string' && o.format.trim() ? { format: o.format.trim() } : {}),
        };
      })
      .filter(b => b.angle)
      .slice(0, 6);

    if (beats.length === 0) {
      return { success: false, output: 'suggest_beats requires at least one beat.' };
    }

    // How big the day is. A full day is four to six (the operator's call, 20
    // Oct). What is left of TODAY is smaller: one per posting slot still
    // ahead, because a day that is mostly gone does not need six posts, and
    // asking for them is how a 17:50 plan ends up stacking four on one hour.
    const day = context.sharedState?.planningDay as PlanningDay | undefined;
    const partial = !!day?.isToday && typeof day.slotsLeft === 'number' && day.slotsLeft < 4;
    if (day?.isToday && day.slotsLeft === 0) {
      return {
        success: false,
        output: 'There are no posting slots left today. Say so plainly and suggest planning tomorrow instead — he can move the day plan to tomorrow with the arrow.',
      };
    }
    const most = partial ? Math.max(1, day!.slotsLeft as number) : 6;
    const least = partial ? 1 : 4;
    if (beats.length < least) {
      return {
        success: false,
        output:
          `Only ${beats.length} beat${beats.length === 1 ? '' : 's'} — a full day needs FOUR TO SIX. `
          + 'A thin day is not a reason to return fewer, it is a reason to go and find the rest: search '
          + 'what is landing in the field today, check the news desk, look at what shipped. Do not pad '
          + 'with the same evergreen angle reworded — find a different one.',
      };
    }
    if (beats.length > most) {
      return {
        success: false,
        output: partial
          ? `There ${most === 1 ? 'is one posting slot' : `are ${most} posting slots`} left today, so plan ${most === 1 ? 'one topic' : `at most ${most}`} — not ${beats.length}. Keep the strongest, spread across the kinds.`
          : `${beats.length} is too many — a full day is four to six.`,
      };
    }

    // An equal split across the three kinds (20 Oct 2026, operator's call).
    // With four or five beats that means every kind at least once and none
    // more than twice. The news beat was already required; this adds the
    // conversation beat and stops our own work taking three of five slots.
    const unkinded = beats.filter(b => !b.kind);
    if (unkinded.length) {
      return {
        success: false,
        output:
          'Every beat needs a `kind` — our_work, news or conversation. Missing on: '
          + unkinded.map(b => `"${b.angle}"`).join(', ') + '.',
      };
    }
    const count = (k: BeatKind) => beats.filter(b => b.kind === k).length;
    const heavy = KINDS.filter(k => count(k) > 2);
    // A partial day cannot hold all three kinds once it has fewer than three
    // slots; it still may not spend two slots on the same kind.
    const distinctNeeded = Math.min(beats.length, KINDS.length);
    const distinctHave = KINDS.filter(k => count(k) > 0).length;
    const missing = partial
      ? (distinctHave < distinctNeeded ? KINDS.filter(k => count(k) === 0) : [])
      : KINDS.filter(k => count(k) === 0);
    if (missing.length || heavy.length) {
      const have = KINDS.map(k => `${count(k)} ${KIND_LABEL[k]}`).join(', ');
      const needs: string[] = [];
      if (missing.includes('news')) {
        needs.push('No news beat. One has to be anchored to a REAL story from the last day or two — a named release, outage or policy change the field is discussing. Search for it and name it. Never invent one.');
      }
      if (missing.includes('conversation')) {
        needs.push('No conversation beat. Find an argument people are having RIGHT NOW — search Reddit and Hacker News directly (a debate does not show up in news results) — name the thread in `venue` and take a side in `position`.');
      }
      if (missing.includes('our_work')) {
        needs.push('No beat about our own work. One should show something we built or shipped — the commit log is in your context.');
      }
      if (heavy.length) {
        needs.push(`Too many ${heavy.map(k => KIND_LABEL[k]).join(' and ')} — no kind more than twice. Swap one for a kind the day is short of.`);
      }
      return {
        success: false,
        output:
          (partial
            ? `What is left of today has room for ${beats.length}, so spread them across different kinds — no two of the same. `
            : 'The day is an EQUAL SPLIT across our work, news and conversation — every kind at least once, none more than twice. ')
          + `You have ${have}.\n\n${needs.join('\n\n')}\n\n`
          + 'Why: posts about ourselves only reach people already looking at us, and people want a break from look-at-me posts.',
      };
    }

    // A conversation beat without a side is worse than none: a neutral take in
    // a thread full of people who know the subject gets scrolled past at best.
    const sideless = beats.filter(b => b.kind === 'conversation' && (!b.venue || !b.position));
    if (sideless.length) {
      return {
        success: false,
        output:
          'A conversation beat needs BOTH where the argument is (`venue` — the named thread, not just "Reddit") '
          + 'and the side we take in it (`position` — one sentence). Missing on: '
          + sideless.map(b => `"${b.angle}"`).join(', ') + '. '
          + 'Our standing: we ship a local-first agent while most of the thread is speculating. "We did this, '
          + 'here is what happened" is the move nobody else can make.',
      };
    }

    try {
      await store.suggest(beats);
      return {
        success: true,
        output: `Proposed ${beats.length} beat${beats.length === 1 ? '' : 's'} for ${day?.date ?? 'today'}${partial ? ' (what is left of today)' : ''} (${KINDS.map(k => `${beats.filter(b => b.kind === k).length} ${KIND_LABEL[k]}`).join(', ')}). The operator questions and agrees the plan before anything is written.`,
        metadata: { count: beats.length },
      };
    } catch (err) {
      return { success: false, output: `Failed to suggest beats: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
