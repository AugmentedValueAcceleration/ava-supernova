import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { VIDEO_CAPTION_LIMITS, type VideoPostStore, type VideoPostInput } from '../social/index.js';

/** Every video carries the link. Lower-case for the idempotency check; the
 *  appended form is the same string, so it reads as written. */
const AVA_URL = 'avasupernova.com';

/**
 * How long one still holds on screen.
 *
 * Operator's number, and the reason the storyboard has a fixed cadence at all:
 * a person cutting this in Canva wants a rhythm they can lay down without
 * thinking, not a per-shot timing decision on every frame.
 */
const SECONDS_PER_SHOT = 5;

/**
 * Emit a finished SHORT-FORM VIDEO POST as the PARTS a person assembles — the
 * storyboard, the voiceover, and the caption.
 *
 * WE DO NOT GENERATE VIDEO. Operator, 2026-09-05: it is not good enough for
 * what these posts are for. So this produces a voiceover and one still per
 * five seconds, and the operator cuts them together in Canva — where a human
 * can see what they are making, which is the whole point of the change.
 *
 * That is why `shots` is a SEQUENCE. Three takes on the same moment is not a
 * storyboard, it is one shot photographed three times, and laid end to end it
 * makes a video that does not move.
 *
 * The split mirrors write_post: this tool does the surface-free work (validate
 * the parts, enforce the caption cap and the shot count deterministically) and
 * the injected `videoPostStore` does everything that needs a provider key —
 * rendering her voice and the stills.
 *
 * Nothing is pending any more. Stills and speech are both synchronous, so the
 * card is complete when it lands and there is no job to poll. She still has
 * not SEEN the pictures, and must not describe them.
 */
export class WriteVideoPostTool implements Tool {
  readonly name = 'write_video_post';
  readonly description =
    'Emit a short-form video post as its parts — a storyboard of stills, your voiceover, and the caption. One call per video.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'write_video_post',
    description:
      'Emit a finished SHORT-FORM VIDEO POST as the PARTS a person assembles: the voiceover in your own voice, a storyboard of stills (one per five seconds), and the caption. We do not generate video — the operator cuts these together in Canva, which is why the shots must work as a SEQUENCE laid end to end rather than as alternatives. Use when the idea wants to be a video rather than text (Shorts, Reels, TikTok). Call it ONCE PER VIDEO. Do not write the script or caption in your narration — only call this tool. The stills and the voice are generated after your turn, so say what you made and why that angle; never claim you have seen them.',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['tiktok', 'instagram', 'youtube', 'facebook'],
          description: 'Where this is going. All four are vertical short-form (9:16); "youtube" means Shorts, "instagram" means Reels, "facebook" means Reels on our Page.',
        },
        shots: {
          type: 'array',
          items: { type: 'string' },
          description: 'The STORYBOARD — one still per five seconds of the finished piece, in order. A 15-second post takes exactly 3, a 30-second one takes 6; the count must match duration ÷ 5 and is refused with the arithmetic if it does not. Each entry describes ONE FRAME: subject, setting, framing, light, mood. Not camera movement — these are photographs, and asking for a slow push in describes something a still cannot do. They run END TO END, so they must carry the script forward rather than restate it: the hand reaching, the pan at heat, the plate finished. Three angles on the same moment is not a storyboard, it is one shot photographed three times, and it makes a video that does not move. Be concrete — a model cannot render "the feeling of trust", but it can render a hand stopping halfway to a pan.',
        },
        script: {
          type: 'string',
          description: 'What YOU SAY over the clip, spoken in your own voice. Written to be heard, not read — short sentences, no hashtags, no emoji, no "link in bio". THE LENGTH IS DECIDED FIRST and you write to fill it. A video is 15 SECONDS — write 25-32 words. Both bounds are enforced, so a one-line hook is REFUSED rather than quietly becoming a shorter clip, and an essay is refused rather than overrunning the picture. Fifteen seconds is one clear thought said properly: a claim and its turn, not a list. If an idea genuinely needs longer, set `duration` yourself and write to THAT length — the band moves with it (30s is 52-68 words). Reach for it because the idea earns the room, not out of habit. There is air at each end so your voice does not start on the first frame or stop on the last. Timed against the real voice at about 2.4 words a second. The ceiling keeps the voice inside the picture: a voice still talking after the clip stops is the most obviously broken thing a short can do. The floor keeps the picture from running on alone, and under 3 seconds Wan refuses the audio outright so nothing renders. A voiced clip is never 5 seconds — ask for 10 or more. Thirty seconds is a different KIND of writing, not a longer version of the same one: it is a walkthrough or a demonstration, and padding fifteen seconds of idea to fill it is worse than keeping it short. Omit the script entirely for a silent clip — the model scores its own audio, and a picture carried by that soundtrack is a real choice rather than a fallback.',
        },
        caption: {
          type: 'string',
          description: 'The post copy that goes in the caption box, ready to paste. The first line is the hook that decides whether anyone watches. It must NOT restate the voiceover — the script is heard and the caption is read, so saying the same thing twice wastes one of them; the caption carries what the voice cannot (the dish or movement by NAME, the concrete detail, why it exists). Write it to be SEARCHED: caption keywords now do more for discovery than hashtags, so the subject belongs in the words and not only in the tags. A one-liner plus two tags is not a caption. Hashtags inline per the platform tag policy. The link to avasupernova.com is appended automatically — do not write it yourself, and never write "link in bio".',
        },
        duration: {
          type: 'number',
          description: 'Finished length in seconds, 2-30. LEAVE IT OUT and you get 15s, whatever the subject — that is the format, and it holds one clear thought. It decides TWO things: how many words the voiceover can carry, and HOW MANY SHOTS you must write (one per five seconds — 15s takes 3, 30s takes 6). Set it ONLY when the material genuinely needs otherwise. 10 is a hook. 15 is the default: a full coaching line, a dish, a single point made properly. 30 is for something that truly needs showing — a walkthrough, a before-and-after, a process — and it is six separate frames to think of, so it should earn them. A padded piece loses the viewer, and padding gets easier the more room you have.',
        },
        title: { type: 'string', description: 'Optional short title for the library.' },
        hashtags: {
          type: 'array',
          items: { type: 'string' },
          description: 'The hashtags you chose, so the UI can show them as an editable chip row. Within the platform tag policy.',
        },
        tag_note: { type: 'string', description: 'One short line on why these tags.' },
        recipe: {
          type: 'string',
          description: 'For a FOOD video: the name of a dish we already have a photograph of. CHECK FIRST with find_recipe — naming a dish we do not have is REFUSED, not generated, because a plausible stranger plate filed among our own photographs is one careless caption away from being posted as ours. Naming a real one puts OUR hero photograph in as the OPENING SHOT, so the first frame is genuinely the food and cannot misrepresent it. Use this for anything about a recipe. Your first entry in `shots` is then a description of that photograph rather than a request — it is not generated, so write the rest of the storyboard to follow on from it.',
        },
      },
      required: ['platform', 'shots', 'caption'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.videoPostStore as VideoPostStore | undefined;
    if (!store) {
      return {
        success: false,
        output: 'Video posts are not available in this context. The host must inject `videoPostStore` into shared state.',
      };
    }

    // NO silent default. This used to fall back to 'tiktok', so a video the
    // operator never chose a home for quietly became a TikTok post — and the
    // platform decides the aspect, the tag policy and the whole register of the
    // caption. Guessing it is not a small convenience, it is picking the
    // audience on their behalf. Missing means ASK, not assume.
    const platform = ((args.platform as string | undefined) || '').trim();
    if (!platform) {
      return {
        success: false,
        output:
          'write_video_post needs a platform and there is no default — the platform decides the tag policy, '
          + 'the caption register and where this lands. If the operator has not said, ASK which one (or which '
          + 'ones) before calling this again: tiktok, instagram, youtube or facebook.',
      };
    }
    const shots = Array.isArray(args.shots)
      ? (args.shots as unknown[]).map(x => String(x ?? '').trim()).filter(Boolean)
      : [];
    const caption = ((args.caption as string | undefined) || '').trim();
    const script = ((args.script as string | undefined) || '').trim();

    if (shots.length === 0) {
      return {
        success: false,
        output:
          'write_video_post requires `shots` — the storyboard, one still per five seconds, in order. '
          + 'A 15-second post takes 3.',
      };
    }
    if (!caption) {
      return { success: false, output: 'write_video_post requires a caption — the clip is only half the post.' };
    }

    // Same deterministic enforcement as write_post: count by code point and
    // hand back the exact overage, so she trims and re-calls in the same turn.
    // THE LINK GOES ON EVERY VIDEO, and it is appended here rather than asked
    // for. A rule the model has to remember is a rule that is missing from the
    // one post that mattered — and a video nobody can act on is a video that
    // did nothing. Idempotent: if she already wrote it, it is not doubled.
    const withLink = caption.toLowerCase().includes(AVA_URL)
      ? caption
      : `${caption}\n\n${AVA_URL}`;

    // Enforced AFTER the link, because the link is not optional — if adding it
    // breaks the cap then the caption is what gives, not the link.
    const hardLimit = VIDEO_CAPTION_LIMITS[platform];
    if (hardLimit) {
      const len = Array.from(withLink).length;
      if (len > hardLimit) {
        const over = len - hardLimit;
        return {
          success: false,
          output:
            `This ${platform} caption is ${len} characters with the ${AVA_URL} link appended — ` +
            `${over} over the ${hardLimit} limit. Trim ${over}+ characters from the caption and ` +
            `call write_video_post again. The link is not optional; the words are what give.`,
        };
      }
    }

    // ── The voiceover has to FIT ─────────────────────────────────────────
    // The read is laid against a fixed run of stills, so the only lever is
    // making the speech short enough to sit inside it. This mattered when Wan
    // took the audio as input and it matters just as much now that a person
    // does the cutting: a voice still talking after the last still is the same
    // broken short either way, and now there is nobody to notice but them.
    // Budget: the duration minus a second of air at each end, at roughly two
    // words a second. A 10s clip is therefore about 16 words, NOT the 20-25 the
    // guidance used to claim — that was 10-12 seconds of speech over a 10 second
    // clip, which is why the voice ran past the end.
    //
    // And a FLOOR, which the ceiling alone hid. Three seconds was Wan's own
    // refusal threshold for supplied audio; it stays as the shortest read worth
    // making, because at 5 seconds the arithmetic still closes the window on
    // its own — the floor lands above the ceiling, so every script short enough
    // to fit is too short to be worth hearing. A voiced piece is therefore
    // always 10s or more. Found the hard way, when a six-word line killed every
    // food video with a generic "generation failed".
    // MEASURED through the real voice — qwen3-tts-instruct-flash, the 'Maia'
    // brand voice, the shipped voice direction, timed off the returned WAV
    // headers rather than derived from an assumed rate:
    //
    //     6w -> 2.16s   10w -> 3.76s   14w -> 5.52s   17w -> 7.04s   25w -> 10.00s
    //
    // She runs 2.41-2.78 words a second, slowest on the longer lines. So a 10s
    // clip holds about 22 words.
    //
    // The floor used to be 12, set to clear Wan's 3s minimum and nothing else.
    // Twelve words is under five seconds — half a ten second clip — and a floor
    // is exactly where a model writes to when the tool keeps rejecting it, so
    // every voiced clip came back half silent. The floor now exists to FILL the
    // clip rather than merely to be accepted.
    //
    // NOTE: this rate belongs to Maia. The brand voice is not yet ratified, and
    // the roster varies a lot — the same lines through 'Cherry' run 1.92-2.42
    // w/s, which would put the ceiling at 18 rather than 22. If AVA_BRAND_VOICE
    // changes, re-measure; do not carry these numbers over.
    const MIN_SPEECH_SECONDS = 3.0;
    const SLOWEST_WORDS_PER_SECOND = 2.41;
    /**
     * Air at BOTH ends, so the voice does not start on frame one and does not
     * stop on the last frame.
     *
     * The comment above always said "a second of air at each end" — the code
     * only ever subtracted 0.5 once, and nothing at the start, so the voice
     * began the instant the picture did. Operator, 2026-08-26: *"i feel thats
     * what would feel unnatraul"*. It is: a clip filled hard from first frame
     * to last reads as rushed, and it gets worse the longer the clip runs.
     *
     * 0.75 each end rather than a full second, which would take a 10s clip down
     * to 14-19 words — tight for a hook. This costs a couple of words and buys
     * a beat of picture before she speaks and a beat after she stops.
     */
    const LEAD_IN_SECONDS = 0.75;
    const TRAILING_AIR_SECONDS = 0.75;
    /**
     * How much of the clip the script should FILL, as a fraction of the
     * ceiling.
     *
     * 0.77 is not arbitrary: at 10 seconds it reproduces the floor of 17 that
     * was arrived at the hard way, so the rule that was measured is preserved
     * rather than replaced. It now scales instead of being a single number
     * that only made sense for one length.
     */
    const FILL_RATIO = 0.77;
    const wantsVoice = !!script;

    /**
     * How long the clip may run: 30 seconds, whatever the subject is.
     *
     * Food used to stop at 15, because a recipe animated OUR photograph through
     * wan2.7-i2v and that model stopped at 15. Nothing is animated any more, so
     * that cap had nothing left to enforce even before this.
     *
     * 30 is now an EDITORIAL ceiling rather than a provider one: six separate
     * frames is already a lot to hold one idea together, and a seventh is
     * almost always padding. Kept because the script band is derived from it —
     * the read has to be written for the length it will actually be laid
     * against, which is the failure everything below exists to prevent.
     */
    const maxDuration = 30;

    /** How many words a clip of this length can carry, with air at both ends. */
    const wordBudget = (seconds: number): number =>
      Math.floor(Math.max(1, seconds - LEAD_IN_SECONDS - TRAILING_AIR_SECONDS) * SLOWEST_WORDS_PER_SECOND);

    /**
     * A voiced piece is never shorter than 10 seconds. The window below that is
     * empty: at 5 seconds the floor computes above the ceiling, so every script
     * short enough to fit is shorter than the minimum read (see the 3.0s
     * minimum above). Learned when a six-word line killed every food video with
     * a generic "generation failed".
     */
    const MIN_VOICED_SECONDS = 10;

    const scriptWords = script ? script.split(/\s+/).filter(Boolean).length : 0;

    /**
     * Length is a FORMAT decision, and the format is 15 seconds.
     *
     * Thirty was the default for exactly one evening, set the moment wan3.0
     * made it possible for every subject. Possible turned out not to be the
     * same as right, and none of the reasons for fifteen are about the model:
     *
     *   - half the frames, so it comes back sooner. A 30s render measured
     *     anywhere from 8 to 25 minutes; an evening of posts should not be a
     *     queue.
     *   - half the compute, all of which we pay for.
     *   - completion rate is what ranks a Reel or a Short, and a tight fifteen
     *     watched through beats a thirty abandoned halfway.
     *   - fifteen seconds cannot be padded. Thirty invites it.
     *
     * Thirty is still reachable, and the word band moves with it, so nothing is
     * ever squeezed — a shorter clip gets a shorter script, not a compressed
     * one. It just has to be ASKED for now.
     *
     * What has not changed: the length is decided BEFORE the writing. Deriving
     * it from the script was tried and it collapsed to hook-length everything,
     * because that is how she writes when nothing sets the shape.
     */
    const DEFAULT_SECONDS = 15;
    const requested = typeof args.duration === 'number' ? args.duration : undefined;
    const plannedDuration = requested === undefined
      ? DEFAULT_SECONDS
      : (wantsVoice
          ? Math.max(MIN_VOICED_SECONDS, Math.min(maxDuration, Math.round(requested)))
          : Math.max(2, Math.min(maxDuration, Math.round(requested))));

    /**
     * ONE STILL PER FIVE SECONDS, and the count is checked rather than trusted.
     *
     * Derived from `duration` instead of asked for separately, because two
     * numbers that must agree are two numbers that can disagree — and the one
     * that would have lost is the picture, silently, leaving a 30-second piece
     * with three frames and ten seconds of nothing to cut to.
     *
     * Checked HERE, after the duration is settled, because a duration she did
     * not set was decided by this code: measuring against the raw request would
     * refuse a perfectly good three-shot storyboard for a default she never saw.
     *
     * Ceiling, not exact division, so a length that is not a multiple of five
     * still works — the last still simply holds a beat longer. Refused with the
     * arithmetic shown, the same way the caption cap and the script band are,
     * so she fixes it and re-calls in the same turn instead of guessing.
     */
    const expectedShots = Math.max(1, Math.ceil(plannedDuration / SECONDS_PER_SHOT));
    if (shots.length !== expectedShots) {
      return {
        success: false,
        output:
          `A ${plannedDuration}s post needs ${expectedShots} shot${expectedShots === 1 ? '' : 's'} ` +
          `(${plannedDuration} \u00f7 ${SECONDS_PER_SHOT}, rounded up) and you wrote ${shots.length}. ` +
          (shots.length < expectedShots
            ? `Add ${expectedShots - shots.length} that carry the script FORWARD — the next moment, not another angle on this one.`
            : `Cut ${shots.length - expectedShots}, or set duration to ${shots.length * SECONDS_PER_SHOT} if the piece genuinely needs the room.`),
      };
    }

    if (script) {
      const words = scriptWords;
      const budget = wordBudget(plannedDuration);
      // Never below the shortest read worth making, however short the piece:
      // MIN_SPEECH_SECONDS at the FASTEST observed rate.
      const audioFloor = Math.ceil(MIN_SPEECH_SECONDS * 2.78);
      const floor = Math.max(audioFloor, Math.round(budget * FILL_RATIO));
      if (words > budget) {
        return {
          success: false,
          output:
            `That script is ${words} words and will not fit. A ${plannedDuration}s clip holds about ${budget} words ` +
            `at the speed you actually speak. Cut ${words - budget} and call write_video_post again — a voice ` +
            `still talking after the picture stops is the most obviously broken thing a short can do.`,
        };
      }
      if (words < floor) {
        return {
          success: false,
          output:
            `That script is only ${words} words — roughly ${(words / SLOWEST_WORDS_PER_SECOND).toFixed(1)}s of speech ` +
            `in a ${plannedDuration}s clip, so the rest of the video would play in silence. Write ${floor}-${budget} words ` +
            `and aim at the top of that range: ${budget} words fills the clip, ${floor} barely covers three quarters ` +
            `of it. (Under ${MIN_SPEECH_SECONDS}s Wan refuses the audio outright and nothing renders at all.) ` +
            `Or drop the script entirely — the model scores its own audio now, and a silent clip carried by the ` +
            `picture and that soundtrack is a real choice rather than a fallback.`,
        };
      }
    }

    const post: VideoPostInput = {
      platform,
      shots,
      script: script || undefined,
      caption: withLink,
      // The length the SCRIPT was written for, not the raw request. If these
      // diverge the voice overruns the picture.
      duration: plannedDuration,
      title: ((args.title as string | undefined)?.trim()) || undefined,
      hashtags: Array.isArray(args.hashtags)
        ? (args.hashtags as unknown[]).map(h => String(h).trim().replace(/^#/, '')).filter(Boolean)
        : [],
      tagNote: ((args.tag_note as string | undefined)?.trim()) || undefined,
      recipe: ((args.recipe as string | undefined)?.trim()) || undefined,
    };

    try {
      const written = await store.write(post);
      // Say plainly whether the opening frame is our own photograph or a
      // generated dish. She must not claim it shows our food if it does not.
      const recipeLine = post.recipe
        ? (written.recipeImageUsed
            ? ` The first still is our own photograph of ${written.recipeImageUsed} — you can say it is our dish.`
            : ` NO photograph found for "${post.recipe}", so the food is generated, not ours. Do not say it is our dish.`)
        : '';
      // A failed read is not a cosmetic problem any more. There is no model
      // dubbing its own track behind this — the piece is simply SILENT, and
      // she has to say so rather than let "video post ready" imply a voice.
      const voiceLine = post.script
        ? written.voiced
          ? ` The voiceover is in your voice${typeof written.voiceSeconds === 'number' ? `, ${written.voiceSeconds.toFixed(1)}s long` : ''}.`
          : ` The VOICEOVER FAILED${written.voiceError ? ` (${written.voiceError})` : ''} — there is NO audio, so this is stills and a caption only. Say so plainly.`
        : '';
      // A hole in the storyboard is reported, never hidden: she is about to
      // tell the operator it is ready, and a missing frame is the one thing
      // they cannot work around in Canva without knowing.
      const shotLine = written.shotErrors.length > 0
        ? ` ${written.shotErrors.length} of the ${shots.length} stills did NOT render (${written.shotErrors.join('; ')}) — tell them which are missing.`
        : '';
      return {
        success: true,
        output:
          `Storyboard ready for ${platform} — ${written.shots.length} still${written.shots.length === 1 ? '' : 's'} ` +
          `for ${plannedDuration}s, the caption, and the voiceover, all saved to the Library. They go in ORDER, ` +
          `${SECONDS_PER_SHOT} seconds each, assembled in Canva. ` +
          `You have not seen the pictures: say what you made and why that angle, never how it looks.` +
          `${recipeLine}${voiceLine}${shotLine}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Could not make the storyboard: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
