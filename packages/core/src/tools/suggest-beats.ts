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
    description: 'Propose the things worth posting about TODAY — FOUR TO SIX by default (more, up to twelve, only when the operator asks for more), split EQUALLY across three kinds: OUR WORK (what we built or shipped), NEWS (a real, named story from the last day or two) and CONVERSATION (an argument people are having in a named thread right now, where we take a position). Every kind at least once, and no kind more than a third of the day (rounded up). The studio\'s briefing. Call this when the operator asks "what should I post today" / "today\'s beats" / opens a planning request. First ground yourself: release_notes for anything just shipped, research_post or web_search for what\'s currently landing in our space, memory_recall to avoid repeating recent angles. Then return STORIES that fit the mission — each a concrete angle, one line on why it lands now, and what FORM it wants. Form is part of the idea, not a flag bolted onto it: some beats only exist as a film, some only work written down. Offer a mix rather than a list of text posts with the occasional video attached. Do NOT name platforms: a story goes to every crowd in the same slot, adapted to each, and where it goes is a planning decision the operator makes, not a property of the idea. Do NOT write the posts either: this is your PROPOSAL for the day, and nothing is written until the operator has agreed it. When the discussion changes the plan, call this again with the FULL set — untouched beats reproduced exactly — because the latest call replaces what is on the table.',
    parameters: {
      type: 'object',
      properties: {
        beats: {
          type: 'array',
          description: 'The post ideas the day actually has — FOUR TO SIX by default, with every `kind` present and none taking more than a third of the day rounded up (2/1/1, 2/2/1, 2/2/2). When he asks for more, add them — up to twelve — keeping the split. A thin day is not a reason to return two: it is a reason to go and FIND the fourth, which is what the news beat is for — the field always has something happening, and a day with nothing of our own still has something worth saying about today. What is forbidden is padding the list with the same evergreen angle in new words.',
          items: {
            type: 'object',
            properties: {
              angle: { type: 'string', description: 'The concrete thing to post about — specific, not a category (e.g. "the price gap vs $200/mo frontier tools", not "pricing").' },
              why: { type: 'string', description: 'One line on why this lands right now — a current beat, a fresh ship, a gap nobody else is filling.' },
              needs_video: { type: 'boolean', description: 'ONE VIDEO A DAY, AND IT PROMOTES US (the operator\'s rules, 1 Nov 2026). True on exactly ONE beat in the whole day — false on every other. Only a beat that promotes us can carry it: an our_work beat or an every-day beat (`daily`); never news or conversation. Review those candidates and give it to the one that gains most from being SHOWN, and say why in its `why` ("Video: …"). False on all of them if a video was already made today. It decides which story gets the video platforms ticked.' },
              daily: { type: 'string', description: 'EVERY-DAY beats ONLY: the id of the daily item this beat is (from the every-day list in your instructions, e.g. "discord", "star_repo"). Every item on that list MUST appear once, with a FRESH angle — never one used in recent posts. These sit outside the split and the four-to-six count, and the subject is never "spent". Leave `kind` as our_work.' },
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
    const parsedBeats: Beat[] = rawBeats
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
          ...(typeof o.daily === 'string' && o.daily.trim() ? { daily: o.daily.trim() } : {}),
        };
      })
      .filter(b => b.angle);
    // Twelve stories at most; the every-day posts ride on top of that.
    const beats: Beat[] = [
      ...parsedBeats.filter(b => !b.daily).slice(0, 12),
      ...parsedBeats.filter(b => b.daily).slice(0, 6),
    ];

    // The every-day list (step 5). Every item on it is on the plan — once,
    // with a fresh angle — and those beats are counted apart from the day.
    const day0 = context.sharedState?.planningDay as PlanningDay | undefined;
    const dailyList = day0?.daily ?? [];
    for (const b of beats) if (b.daily) b.kind = 'our_work';
    const missingDaily = dailyList.filter(d => !beats.some(b => b.daily === d.id));
    if (missingDaily.length) {
      return {
        success: false,
        output:
          `The every-day list is not on the plan: ${missingDaily.map(d => `"${d.title}" (daily: "${d.id}")`).join(', ')}. `
          + 'These go on EVERY day — the operator\'s standing request. Add one beat for each, with `daily` set to its id '
          + 'and a FRESH angle (not one from the recent posts), on top of the four to six, then call suggest_beats again with the full set.',
      };
    }

    // ONE VIDEO A DAY, AND IT PROMOTES US (1 Nov 2026). Checked, not asked:
    // the old wording here said a video "should not be rationed".
    const videos = beats.filter(b => b.needs_video);
    if (videos.length > 1) {
      return {
        success: false,
        output:
          `${videos.length} beats want a video — the day has ONE (the operator\'s rule). Review the beats that promote us `
          + '(our work and the every-day posts), give needs_video to the single best film, say why in its `why`, and false on the rest.',
      };
    }
    if (videos.length === 1 && videos[0].kind !== 'our_work') {
      return {
        success: false,
        output:
          `The video is on "${videos[0].angle}", a ${videos[0].kind} beat. The day\'s one video only ever promotes us — `
          + 'move needs_video to an our-work or every-day beat (the best film among them), or none.',
      };
    }

    if (beats.length === 0) {
      return { success: false, output: 'suggest_beats requires at least one beat.' };
    }

    // How big the day is: four to six by default, more (to twelve) when he
    // asks. The SAME for today at 18:00 as for tomorrow — social media runs
    // round the clock, so a late start spreads the day over fewer hours
    // rather than shrinking it (the operator's call, 20 Oct).
    const day = day0;
    // The every-day beats are on top of the day, never part of its count or
    // its split — otherwise two daily posts would crowd out real stories.
    const all = beats;
    const regular = beats.filter(b => !b.daily);
    if (regular.length < 4) {
      return {
        success: false,
        output:
          `Only ${regular.length} beat${regular.length === 1 ? '' : 's'} besides the every-day posts — a day needs FOUR TO SIX. `
          + 'A thin day is not a reason to return fewer, it is a reason to go and find the rest: search '
          + 'what is landing in the field today, check the news desk, look at what shipped. Do not pad '
          + 'with the same evergreen angle reworded — find a different one.',
      };
    }

    // An equal split across the three kinds (20 Oct 2026, operator's call).
    // With four or five beats that means every kind at least once and none
    // more than twice. The news beat was already required; this adds the
    // conversation beat and stops our own work taking three of five slots.
    const unkinded = regular.filter(b => !b.kind);
    if (unkinded.length) {
      return {
        success: false,
        output:
          'Every beat needs a `kind` — our_work, news or conversation. Missing on: '
          + unkinded.map(b => `"${b.angle}"`).join(', ') + '.',
      };
    }
    const count = (k: BeatKind) => regular.filter(b => b.kind === k).length;
    // No kind more than a third of the day, rounded up: 2 of 4-6, 3 of 7-9,
    // 4 of 10-12. "Equal" has to keep meaning equal when the day grows.
    const cap = Math.ceil(regular.length / 3);
    const heavy = KINDS.filter(k => count(k) > cap);
    const missing = KINDS.filter(k => count(k) === 0);
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
        needs.push(`Too many ${heavy.map(k => KIND_LABEL[k]).join(' and ')} — no kind more than ${cap} in a day of ${beats.length}. Swap one for a kind the day is short of.`);
      }
      return {
        success: false,
        output:
          `The day is an EQUAL SPLIT across our work, news and conversation — every kind at least once, none more than ${cap} of ${regular.length} (the every-day posts are not counted). `
          + `You have ${have}.\n\n${needs.join('\n\n')}\n\n`
          + 'Why: posts about ourselves only reach people already looking at us, and people want a break from look-at-me posts.',
      };
    }

    // A conversation beat without a side is worse than none: a neutral take in
    // a thread full of people who know the subject gets scrolled past at best.
    const sideless = regular.filter(b => b.kind === 'conversation' && (!b.venue || !b.position));
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
      await store.suggest(all);
      const dailyCount = all.length - regular.length;
      return {
        success: true,
        output: `Proposed ${regular.length} beat${regular.length === 1 ? '' : 's'} for ${day?.date ?? 'today'} (${KINDS.map(k => `${regular.filter(b => b.kind === k).length} ${KIND_LABEL[k]}`).join(', ')})${dailyCount ? ` plus ${dailyCount} every-day post${dailyCount === 1 ? '' : 's'}` : ''}. The operator questions and agrees the plan before anything is written.`,
        metadata: { count: all.length },
      };
    } catch (err) {
      return { success: false, output: `Failed to suggest beats: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
