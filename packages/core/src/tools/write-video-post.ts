import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { VIDEO_CAPTION_LIMITS, type VideoPostStore, type VideoPostInput } from '../social/index.js';

/** Every video carries the link. Lower-case for the idempotency check; the
 *  appended form is the same string, so it reads as written. */
const AVA_URL = 'avasupernova.com';

/**
 * Emit a finished SHORT-FORM VIDEO POST — the clip, the voiceover, and the
 * caption as one artefact.
 *
 * The split mirrors write_post: this tool does the surface-free work (validate
 * the three parts, enforce the caption cap deterministically) and the injected
 * `videoPostStore` does everything that needs a provider key — rendering her
 * voice and submitting the generation job.
 *
 * The one thing that differs from every other card: what comes back is a JOB,
 * not a finished video. Generation runs for minutes and outlives the turn, so
 * the caption ships immediately and the picture arrives later. She must not
 * describe a clip she has not seen.
 */
export class WriteVideoPostTool implements Tool {
  readonly name = 'write_video_post';
  readonly description =
    'Emit a finished short-form video post — the clip, your voiceover, and the caption together. One call per video.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'write_video_post',
    description:
      'Emit a finished SHORT-FORM VIDEO POST — the clip, the voiceover in your own voice, and the caption, as one artefact. Use when the idea wants to be a video rather than text (TikTok, Reels, Shorts). Call it ONCE PER VIDEO. Do not write the script or caption in your narration — only call this tool. Generation takes a couple of minutes and finishes after your turn, so say what you made and why that angle; never claim you have watched it back.',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['tiktok', 'instagram', 'youtube', 'facebook'],
          description: 'Where this is going. All four are vertical short-form (9:16); "youtube" means Shorts, "instagram" means Reels, "facebook" means Reels on our Page.',
        },
        visual: {
          type: 'string',
          description: 'What is ON SCREEN, written as a video generation prompt — subject, action, setting, camera movement, lighting, mood. Not the caption and not the script; the shot. Be concrete: the model cannot render an abstraction like "the feeling of trust", but it can render a hand stopping halfway to a pan.',
        },
        script: {
          type: 'string',
          description: 'What YOU SAY over the clip, spoken in your own voice. Written to be heard, not read — short sentences, no hashtags, no emoji, no "link in bio". WRITE THE LINE YOU MEAN and leave `duration` out — the clip is then sized to hold it. Both bounds are enforced: roughly 15-20 words at 10s, 25-32 at 15s, 52-68 at 30s, and any length in between. AIM AT THE TOP of whichever range applies. There is air at each end so your voice does not start on the first frame or stop on the last. Timed against the real voice at about 2.4 words a second. The ceiling keeps the voice inside the picture: a voice still talking after the clip stops is the most obviously broken thing a short can do. The floor keeps the picture from running on alone, and under 3 seconds Wan refuses the audio outright so nothing renders. A voiced clip is never 5 seconds — ask for 10 or more. Thirty seconds is a different KIND of writing, not a longer version of the same one: it is a walkthrough or a demonstration, and padding a hook to fill it is worse than keeping it short. Omit the script entirely for a silent clip — the model scores its own audio, and a picture carried by that soundtrack is a real choice rather than a fallback.',
        },
        caption: {
          type: 'string',
          description: 'The post copy that goes in the caption box, ready to paste. The first line is the hook that decides whether anyone watches. It must NOT restate the voiceover — the script is heard and the caption is read, so saying the same thing twice wastes one of them; the caption carries what the voice cannot (the dish or movement by NAME, the concrete detail, why it exists). Write it to be SEARCHED: caption keywords now do more for discovery than hashtags, so the subject belongs in the words and not only in the tags. A one-liner plus two tags is not a caption. Hashtags inline per the platform tag policy. The link to avasupernova.com is appended automatically — do not write it yourself, and never write "link in bio".',
        },
        duration: {
          type: 'number',
          description: 'Clip length in seconds, 2-30. USUALLY LEAVE THIS OUT when there is a script — it is derived from the words so the two cannot disagree. Set it only when the LENGTH is the point rather than the line: a demonstration with few words and a lot to show. Keep it to what the material actually needs — a padded clip loses the viewer, and that gets easier to do with more room. 10 is the default shape for a hook. 15 suits a full coaching line. 30 is for something that genuinely needs showing: a walkthrough, a before-and-after, a process. Naming a `recipe` caps this at 15, because a food video animates our own photograph and that model stops there.',
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
          description: 'For a FOOD video: the name of a dish we already have a photograph of. Naming it animates OUR hero image rather than generating a stranger version of the dish — the picture is already the food, so it cannot misrepresent it. Use this for anything about a recipe. When you do, describe only gentle motion in the visual (steam, a slow push in, light shifting) and say what stays STILL; a locked plate is the whole point.',
        },
        seed: {
          type: 'number',
          description: 'Reuse the seed a previous clip reported to change ONE thing and see only that thing change. Without it every attempt is a different clip entirely, which is re-rolling rather than fixing. Omit for a genuinely new idea.',
        },
      },
      required: ['platform', 'visual', 'caption'],
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
    const visual = ((args.visual as string | undefined) || '').trim();
    const caption = ((args.caption as string | undefined) || '').trim();
    const script = ((args.script as string | undefined) || '').trim();

    if (!visual) {
      return { success: false, output: 'write_video_post requires a visual — describe what is on screen.' };
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
    // We hand Wan a finished audio file, so we cannot offset when it starts —
    // the only lever is making the speech short enough to sit inside the clip.
    // Budget: the duration minus a second of air at each end, at roughly two
    // words a second. A 10s clip is therefore about 16 words, NOT the 20-25 the
    // guidance used to claim — that was 10-12 seconds of speech over a 10 second
    // clip, which is why the voice ran past the end.
    //
    // And a FLOOR, which the ceiling alone hid. Wan refuses any supplied audio
    // under 3.0 seconds outright — "duration should be at least 3.0s, got
    // 1.68s" — so a very short line does not sound sparse, it fails to render.
    // At two words a second that floor is about six words, which is ALSO the
    // ceiling for a 5s clip: the window for a voiced 5s clip is empty, every
    // script short enough to fit being too short to accept. So a voiced clip is
    // always 10s. Found the hard way after a six-word line killed every food
    // video with a generic "generation failed".
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
     * How long the clip may run.
     *
     * A food video names a dish we photographed, so it animates OUR image —
     * image-to-video, which tops out at 15s on wan2.7-i2v. Everything else is
     * text-to-video on wan3.0-video, which reaches 30s. Those ceilings are the
     * models' own, quoted from their validators, and the platform route clamps
     * to them independently; matching them here means the SCRIPT is written for
     * the length that will actually render. Get this wrong and a script sized
     * for 30 seconds gets a 15-second clip, and the voice runs past the end —
     * the exact failure everything below exists to prevent.
     */
    const maxDuration = args.recipe ? 15 : 30;

    /** How many words a clip of this length can carry, with air at both ends. */
    const wordBudget = (seconds: number): number =>
      Math.floor(Math.max(1, seconds - LEAD_IN_SECONDS - TRAILING_AIR_SECONDS) * SLOWEST_WORDS_PER_SECOND);

    /**
     * A voiced clip is never shorter than 10 seconds. The window below that is
     * empty: every script short enough to fit is too short for Wan to accept as
     * audio at all (see the 3.0s minimum above). Learned when a six-word line
     * killed every food video with a generic "generation failed".
     */
    const MIN_VOICED_SECONDS = 10;

    const scriptWords = script ? script.split(/\s+/).filter(Boolean).length : 0;

    /**
     * Duration follows the SCRIPT when she has not named one.
     *
     * She used to have to guess a length first and then cram words into it,
     * finding out only after the attempt whether they fit. That was tolerable
     * when 10 seconds was effectively the only option; with 10, 15 and 30 it is
     * three times as many ways to guess wrong, and each wrong guess costs a
     * turn. So: say the line you mean, and the clip is sized to hold it.
     *
     * An explicit duration still wins, because length is not only about the
     * script — a demonstration may have few words and a great deal to SHOW.
     */
    const requested = typeof args.duration === 'number' ? args.duration : undefined;
    // The EXACT length that holds this script, not the nearest round number.
    // Snapping to 10/15/30 leaves dead zones — 40 words is too long for 15s and
    // too short to fill 30s, so it would be refused with nowhere to go. Both
    // models take any whole number of seconds in range, so there is no reason
    // to invent tiers they do not have.
    const derived = script
      ? Math.min(maxDuration, Math.max(MIN_VOICED_SECONDS,
          Math.ceil(scriptWords / SLOWEST_WORDS_PER_SECOND + LEAD_IN_SECONDS + TRAILING_AIR_SECONDS)))
      : 5;
    const plannedDuration = requested === undefined
      ? derived
      : (wantsVoice
          ? Math.max(10, Math.min(maxDuration, Math.round(requested)))
          : Math.max(2, Math.min(maxDuration, Math.round(requested))));

    if (script) {
      const words = scriptWords;
      const budget = wordBudget(plannedDuration);
      // Never below what Wan will accept as audio at all, however short the
      // clip: MIN_SPEECH_SECONDS at the FASTEST observed rate.
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
      visual,
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
      seed: typeof args.seed === 'number' && Number.isFinite(args.seed) ? args.seed : undefined,
      recipe: ((args.recipe as string | undefined)?.trim()) || undefined,
    };

    try {
      const written = await store.write(post);
      // Report the voiceover honestly. A failed TTS still produces a clip — the
      // model dubs its own — and she needs to know that is not her on it before
      // she tells the operator otherwise.
      // Say plainly whether the clip is built on our own photograph or on a
      // generated dish. She must not claim it shows our food if it does not.
      const recipeLine = post.recipe
        ? (written.recipeImageUsed
            ? ` Built on our own photograph of ${written.recipeImageUsed} — you can say it is our dish.`
            : ` NO photograph found for "${post.recipe}", so the food is generated, not ours. Do not say it is our dish.`)
        : '';
      const voiceLine = post.script
        ? written.voiced
          ? ' Voiceover is in your voice.'
          : ` The VOICEOVER FAILED${written.voiceError ? ` (${written.voiceError})` : ''} — the clip carries the model's own dub, NOT your voice. Say so plainly.`
        : '';
      return {
        success: true,
        output:
          `Video post queued for ${platform} — the caption is on the card now, the clip is still rendering ` +
          `(job ${written.taskId}). Seed ${written.seed} — pass that same seed back if they ask for a change, ` +
          `so you adjust THIS clip instead of rolling a different one. ` +
          `You have not seen it: say what you made and why that angle, never how it looks.${recipeLine}${voiceLine}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Could not queue the video: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
