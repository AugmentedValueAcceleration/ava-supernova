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
          description: 'What YOU SAY over the clip, spoken in your own voice. Written to be heard, not read — short sentences, no hashtags, no emoji, no "link in bio". It must FIT INSIDE the clip with a second of air at each end, so budget roughly two words per second of (duration minus 2): about 16 words for a 10s clip, about 6 for a 5s one. Over that and the tool rejects it, because a voice still talking after the picture stops is the most obviously broken thing a short can do. Omit entirely for a silent clip carried by on-screen text.',
        },
        caption: {
          type: 'string',
          description: 'The post copy that goes in the caption box, ready to paste. Hashtags inline per the platform tag policy. The first line is the hook that decides whether anyone watches. The link to avasupernova.com is appended automatically — do not write it yourself, and never write "link in bio".',
        },
        duration: {
          type: 'number',
          description: 'Clip length in seconds. Keep it to what the script actually needs — a padded clip loses the viewer.',
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

    const platform = ((args.platform as string | undefined) || 'tiktok').trim();
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
    const plannedDuration = typeof args.duration === 'number' && args.duration > 7.5 ? 10 : 5;
    if (script) {
      const words = script.split(/\s+/).filter(Boolean).length;
      const speakable = Math.max(1, plannedDuration - 2);
      const budget = Math.floor(speakable * 2);
      if (words > budget) {
        return {
          success: false,
          output:
            `That script is ${words} words and will not fit. A ${plannedDuration}s clip leaves ${speakable}s of ` +
            `speech once you allow a second of air at each end — about ${budget} words. Cut ${words - budget} ` +
            `and call write_video_post again, or raise the duration. Say less; the picture is doing work too.`,
        };
      }
    }

    const post: VideoPostInput = {
      platform,
      visual,
      script: script || undefined,
      caption: withLink,
      duration: typeof args.duration === 'number' ? args.duration : undefined,
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
