import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { VIDEO_CAPTION_LIMITS, type VideoPostStore, type VideoPostInput, MODERATION_GUIDANCE } from '../social/index.js';

/** Every video carries the link. Lower-case for the idempotency check; the
 *  appended form is the same string, so it reads as written. */
const AVA_URL = 'avasupernova.com';

/**
 * The line that goes on every video post.
 *
 * It is the one claim a competitor cannot copy, because their business IS the
 * tier: plans here scale credits and storage and never features, so Free and
 * Enterprise are the same product with different allowances. Said plainly it
 * sounds like it cannot be true, which is exactly why it is worth repeating.
 *
 * Appended here rather than asked for, for the same reason as the link below:
 * a rule the model has to remember is a rule that is missing from the one post
 * that mattered. Idempotent, so a caption that already carries it is left alone.
 *
 * The brand name leads it. I argued for leaving it off — the account name and
 * the link already say who is talking — and that was wrong for the job this
 * line actually does. A caption gets reposted, screenshotted and quoted away
 * from the account that wrote it, and a claim this specific is worth nothing
 * if the reader cannot tell whose it is. The operator called it; he was right.
 *
 * Em dash, not a pipe: the brand is "Ava Supernova" and never "Ava | Supernova".
 *
 * It is a COMMITMENT, not decoration. The day anything ships as a paid-tier
 * exclusive this has to come out, because it is the sentence people will quote
 * back.
 */
const TAGLINE = 'Ava Supernova — Every plan is the whole product. Credits scale. Features never do.';

/** Spoken length of the sign-off, in words. Used to extend the clip rather than
 *  to shrink the script — see the sign-off block in run(). */
const TAGLINE_WORDS = TAGLINE.trim().split(/\s+/).length;

/**
 * Measured read rate for the brand voice, in words per second — the SLOWEST
 * of the measured range, so the budget stays safe on the long lines. The
 * measurements themselves, and the caveat that they belong to ONE voice at ONE
 * pace and must be re-measured if either changes, sit with the word-budget
 * block in run(), the other place this is used.
 *
 * Module level rather than local to run() so the sign-off length below is
 * derived from it ONCE. Restating the rate in a second place is how the clip length
 * and the spoken length drift apart, and a voice still talking after the last
 * still is the most obviously broken thing a short can do.
 */
export const SLOWEST_WORDS_PER_SECOND = 1.50;

/*
 * RE-MEASURED 15 Oct 2026, and it came DOWN from 1.90.
 *
 * Same method as the block in run(): Bellona at speech_rate 0.95, read off
 * the audio actually returned, three takes a length. The slow takes this
 * found were slower than anything in the original table:
 *
 *     18w -> 5.18s  6.94s  6.02s   (3.48  2.59  2.99 w/s)
 *     17w -> 8.96s  8.54s  9.64s   (1.90  1.99  1.76 w/s)
 *     13w -> 8.29s  6.94s  8.54s   (1.57  1.87  1.52 w/s)
 *     40w -> 12.50s 13.01s 11.83s  (3.20  3.08  3.38 w/s)
 *
 * Range 1.52 to 3.48. The old floor of 1.90 was the slowest take anyone had
 * SEEN, not the slowest there is - which is the trap with a voice whose own
 * notes record a 47% spread on identical input. Sample more, find slower.
 *
 * It matters because the floor is what the word ceiling multiplies by: set it
 * too high and a slow read runs past the end of the picture, which is the one
 * failure the band exists to prevent. 1.50 is the measured floor, and the cost
 * of being wrong in this direction is some silence at the end - survivable,
 * unlike a voice still talking over a dead frame.
 */

/**
 * Seconds the spoken sign-off adds to a VOICED clip, on top of the script's own
 * word budget.
 *
 * Exported because it is the whole difference between the duration she asks for
 * and the clip that actually gets cut: ask for 15 and the file is 15 plus this.
 * Tests assert that RELATIONSHIP rather than a magic number, so changing the
 * tagline moves the expectation with it instead of turning the suite red.
 */
export const VOICED_OUTRO_SECONDS = Math.ceil(TAGLINE_WORDS / SLOWEST_WORDS_PER_SECOND);

/**
 * Air at each end of the read, in seconds, so the voice neither starts on
 * frame one nor stops on the last.
 *
 * Exported with the rate so a test can work out the word band the way the
 * tool does. The duration tests used to hard-code counts measured against
 * one voice; when the brand voice changed they all failed at once, and
 * every one of them had to be re-picked by hand.
 */
export const AIR_SECONDS = 1.5;

/** The most words that fit a clip of `seconds`, the way run() computes it. */
export function maxWordsFor(seconds: number): number {
  return Math.floor(Math.max(1, seconds - AIR_SECONDS) * SLOWEST_WORDS_PER_SECOND);
}

/**
 * Emit a finished SHORT-FORM VIDEO POST as the PARTS a person assembles — the
 * storyboard, the voiceover, and the caption.
 *
 * WE GENERATE VIDEO AGAIN, as of 2026-10-15. This reverses the 5 September
 * decision recorded here, and the reason is worth keeping.
 *
 * That decision was right at the time: generated video was not good enough,
 * so posts became a voiceover plus one still per five seconds, cut together
 * in Canva. What changed is not our taste but TikTok's. It flagged a post
 * built that way as "Unoriginal, low-quality ... ineligible for
 * recommendation", citing STATIC IMAGES by name, and ineligible means it
 * never enters the feed at all — which is exactly the zero views every post
 * on that account had been getting. A strip of stills cannot earn a view
 * there however well it is written.
 *
 * So the storyboard becomes ONE CLIP that actually moves, plus the voiceover
 * to lay over it. The operator still assembles in Canva and still overlays
 * the text by hand, which is the part that was never the problem.
 *
 * The split mirrors write_post: this tool does the surface-free work (validate
 * the parts, enforce the caption cap and the script band deterministically) and
 * the injected `videoPostStore` does everything that needs a provider key —
 * rendering her voice and the stills.
 *
 * Still nothing pending. The clip takes MINUTES rather than seconds, but the
 * store waits for it inside the turn and the hub survives that: the SSE
 * heartbeat and --disable-quic went in on 0.48.37 for 10-15 minute Classroom
 * repairs, and Render allows ~100 minutes a request. So the card is still
 * complete when it lands and there is still no job to poll. She has not SEEN
 * the clip, and must not describe how it looks.
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
      MODERATION_GUIDANCE + ' Emit a finished SHORT-FORM VIDEO POST as the PARTS a person assembles: ONE CLIP that actually moves, the voiceover in your own voice, and the caption. We generate video again as of 2026-10-15 — a strip of stills was ruled low-quality STATIC IMAGES by TikTok and made ineligible for the feed entirely, which is zero views however well it is written. The clip arrives with its own soundtrack; the operator mutes it in Canva, lays your voiceover over the top and overlays the text by hand. Use it when the idea wants to be a video rather than text (Shorts, Reels, TikTok). Call it ONCE PER VIDEO and list EVERY platform it is going to in `posts` — the clip and the voiceover are generated once and shared, and each platform gets its own caption and tags. Calling it four times for one video pays for four identical renders and four identical reads. Do not write the script or the caption in your narration — only call this tool. The clip and the voice are made after your turn, so say what you made and why that shot; never claim you have seen it.',
    parameters: {
      type: 'object',
      properties: {
        posts: {
          type: 'array',
          description: 'One entry per platform this video is going to. The STORYBOARD, the SCRIPT and the DURATION are shared by all of them — same footage, cut once — so list every destination here rather than calling the tool again. What differs is the words: each entry carries its own caption and its own tags, because the tag policies barely overlap. TikTok wants ONE OR TWO tags and reads a stack of five as low-effort; Instagram wants eight to twelve; Facebook wants none or two, because a stack there reads as spam; YouTube Shorts wants #Shorts FIRST and only the top three show above the title. One set of tags carried across all four is wrong on three of them.',
          items: {
            type: 'object',
            properties: {
              platform: {
                type: 'string',
                enum: ['tiktok', 'instagram', 'youtube', 'facebook'],
                description: 'All four are vertical short-form (9:16); "youtube" means Shorts, "instagram" means Reels, "facebook" means Reels on our Page.',
              },
              caption: {
                type: 'string',
                description: 'The post copy for THIS platform, ready to paste. The first line is the hook that decides whether anyone watches. It must NOT restate the voiceover — the script is heard and the caption is read, so saying the same thing twice wastes one of them. Write it to be SEARCHED: caption keywords now do more for discovery than hashtags. Genuinely rewritten per room, not the same words with the tags swapped — Facebook is a mixed crowd who want plain language and a story, TikTok is watched muted in two seconds. The tagline and the link to avasupernova.com are appended automatically — never write either yourself, and never write "link in bio".',
              },
              hashtags: {
                type: 'array',
                items: { type: 'string' },
                description: 'The tags you chose for THIS platform, so the UI shows an editable chip row. Count and character both follow that platform\'s policy. They must be about THIS video, not the category we are in: #devtools #aitools #OpenSource would fit any post we have ever written, which is the definition of a tag that earns nothing.',
              },
              tag_note: {
                type: 'string',
                description: 'One line on why these tags, for this platform — which are reach and which are niche.',
              },
              title: {
                type: 'string',
                description:
                  'The title, where the platform shows one. REQUIRED for youtube and refused without it. ' +
                  'On Shorts the description is collapsed on mobile, so this is the only thing most people read ' +
                  'before deciding — it is the discovery surface, not a label. Write what someone would TYPE to ' +
                  'find this: the plain claim with the searchable words in it ("A coding agent that runs offline"), ' +
                  'not the hook from the script repeated ("Wifi off Still Coding"), which reads well only to ' +
                  'someone already watching. Front-load it; it truncates around 40-50 characters on a phone. ' +
                  'NO hashtags in here — they belong in the description, and in a title they eat the space the ' +
                  'claim needed.',
              },
            },
            required: ['platform', 'caption'],
          },
        },
        subject: {
          type: 'string',
          description:
            'WHAT THIS VIDEO IS ABOUT, in a few plain words — the thing a viewer should come away knowing '
            + '("Ava runs offline with no API key", "the pantry turns what you have into a recipe"). '
            + 'This is not a title and nobody sees it: it is the anchor the shot and the script are both '
            + 'held against. Write it FIRST, then write a shot that shows it.',
        },
        shot: {
          type: 'string',
          description: 'THE SHOT — one continuous video clip, described as a single moving image. '
            + 'IT MUST SHOW THE SUBJECT. A beautiful clip of something else is a failed clip, however '
            + 'well it renders: the picture is the argument, and a viewer who watches a sunset while '
            + 'hearing about offline coding has been shown nothing. Before writing it, ask what this '
            + 'idea LOOKS like — then shoot that. Stock-feeling filler (abstract light, generic city, '
            + 'anonymous hands on a keyboard) is the failure mode to avoid: it would fit any post we '
            + 'have ever written, which is the same fault as a tag that fits any post. '
            + 'This is GENERATED AS VIDEO now, not a still, so say what MOVES: the subject, the setting, the framing, the light, the mood, and then the movement itself — what changes across the clip, and the one camera move if there is one. NAME THINGS THAT HAPPEN, NEVER THINGS THAT DO NOT. This model reads an instruction to hold still as an instruction to render nothing: "nothing moves, nothing changes" came back as a black clip, while the same shot described positively (steam, shifting light, a slow push in) held perfectly. If you want a near-static shot, say which small things still move in it. The subject must be legible in the FIRST SECOND, because most people watch these with the sound off and decide in that second. Be concrete — a model cannot render "the feeling of trust", but it can render a hand stopping halfway to a pan. One idea, one shot: this is a single continuous take, so do not describe a sequence of moments or ask for a cut. The clip arrives with its own generated soundtrack, which the operator mutes before laying your voiceover over it — so write the PICTURE and never the sound.',
        },
        script: {
          type: 'string',
          description: 'What YOU SAY over the clip, spoken in your own voice. Written to be heard, not read — short sentences, no hashtags, no emoji, no "link in bio". THE OPENING LINE IS A DISCOVERY SURFACE, not just a hook: TikTok and Instagram both index the spoken words and the on-screen text of a short, so the plain term a person would SEARCH for belongs in the first sentence, said out loud. "A coding agent that runs offline" is findable; "wifi off, still coding" is only clever to someone already watching. Say the thing, then be clever. THE LENGTH IS DECIDED FIRST and you write to fill it. A video is 15 SECONDS — write 16-20 words. Both bounds are enforced, so a one-line hook is REFUSED rather than quietly becoming a shorter clip, and an essay is refused rather than overrunning the picture. Fifteen seconds is one clear thought said properly: a claim and its turn, not a list. If an idea genuinely needs longer, set `duration` yourself and write to THAT length — the band moves with it (30s is 33-42 words). Reach for it because the idea earns the room, not out of habit. There is air at each end so your voice does not start on the first frame or stop on the last. Timed against the real voice at about 1.5 words a second, which is the SLOWEST measured take rather than the average — the budget multiplies by it, so an average would let a slow read run past the end of the picture. The ceiling keeps the voice inside the picture: a voice still talking after the clip stops is the most obviously broken thing a short can do. The floor keeps the picture from running on alone, and under 3 seconds Wan refuses the audio outright so nothing renders. A voiced clip is never 5 seconds — ask for 10 or more. Thirty seconds is a different KIND of writing, not a longer version of the same one: it is a walkthrough or a demonstration, and padding fifteen seconds of idea to fill it is worse than keeping it short. Omit the script entirely for a silent clip — the model scores its own audio, and a picture carried by that soundtrack is a real choice rather than a fallback.',
        },
        caption: {
          type: 'string',
          description: 'The post copy that goes in the caption box, ready to paste. The first line is the hook that decides whether anyone watches. It must NOT restate the voiceover — the script is heard and the caption is read, so saying the same thing twice wastes one of them; the caption carries what the voice cannot (the dish or movement by NAME, the concrete detail, why it exists). Write it to be SEARCHED: caption keywords now do more for discovery than hashtags, so the subject belongs in the words and not only in the tags. A one-liner plus two tags is not a caption. Hashtags inline per the platform tag policy. The tagline and the link to avasupernova.com are both appended automatically — do not write either yourself, and never write "link in bio".',
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
      required: ['posts', 'subject', 'shot'],
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
    // ONE call, one video, as many platforms as it is going to.
    //
    // The footage is identical everywhere — all four short-form platforms are
    // 1080x1920 and the operator cuts the clip once — so the stills and the
    // read are generated ONCE and every platform points at the same files.
    // Calling this four times instead would pay for four identical
    // storyboards and four identical voiceovers, and quadruple the exposure
    // to a rate limit that already drops a still now and then.
    //
    // What DOES differ is the words. The tag policies barely overlap: TikTok
    // wants one or two tags, Instagram eight to twelve, Facebook none or two,
    // Shorts wants #Shorts first. One caption carried across all four is
    // wrong in three rooms.
    //
    // The legacy single-platform shape still works, so a call already in
    // flight does not fail on the way through.
    type RawVariant = { platform?: unknown; caption?: unknown; title?: unknown; hashtags?: unknown; tag_note?: unknown };
    const rawVariants: RawVariant[] = Array.isArray(args.posts) && (args.posts as unknown[]).length > 0
      ? (args.posts as RawVariant[])
      : [{ platform: args.platform, caption: args.caption, title: args.title, hashtags: args.hashtags, tag_note: args.tag_note }];

    const known = ['tiktok', 'instagram', 'youtube', 'facebook'];
    const parsed = rawVariants.map((v) => ({
      platform: String(v?.platform ?? '').trim().toLowerCase(),
      caption: String(v?.caption ?? '').trim(),
      title: (typeof v?.title === 'string' && v.title.trim()) ? v.title.trim() : undefined,
      hashtags: Array.isArray(v?.hashtags)
        ? (v.hashtags as unknown[]).map((h) => String(h).trim().replace(/^#/, '')).filter(Boolean)
        : [],
      tagNote: (typeof v?.tag_note === 'string' && v.tag_note.trim()) ? v.tag_note.trim() : undefined,
    }));

    // NO silent default. This used to fall back to 'tiktok', so a video the
    // operator never chose a home for quietly became a TikTok post. Guessing
    // is not a small convenience, it is picking the audience on their behalf.
    const missingPlatform = parsed.some((v) => !v.platform);
    if (missingPlatform) {
      return {
        success: false,
        output:
          'write_video_post needs a platform on every entry and there is no default — the platform decides '
          + 'the tag policy, the caption register and where this lands. If the operator has not said, ASK which '
          + 'ones before calling this again: tiktok, instagram, youtube or facebook.',
      };
    }
    const unknown = parsed.map((v) => v.platform).filter((pf) => !known.includes(pf));
    if (unknown.length > 0) {
      return {
        success: false,
        output: `write_video_post does not know ${unknown.join(', ')}. Short-form video goes to tiktok, instagram, youtube or facebook.`,
      };
    }
    const dupes = parsed.map((v) => v.platform).filter((pf, i, a) => a.indexOf(pf) !== i);
    if (dupes.length > 0) {
      return {
        success: false,
        output: `Two entries for ${[...new Set(dupes)].join(', ')} — one caption per platform. Merge them and call again.`,
      };
    }
    // Named for the messages below; the picture size is the same for all four.
    const platform = parsed[0].platform;
    const shot = ((args.shot as string | undefined) || '').trim();
    const script = ((args.script as string | undefined) || '').trim();

    if (!shot) {
      return {
        success: false,
        output:
          'write_video_post requires `shot` — the clip, described as one continuous moving image. '
          + 'Say what MOVES in it, never what stays still: this model renders an instruction to hold '
          + 'still as nothing at all.',
      };
    }
    // ── The clip has to be ABOUT the thing ──────────────────────────────
    //
    // Asked for 19 Oct 2026: videos were coming back well-made and off-topic.
    // Guidance alone does not hold this — "show the subject" reads as advice,
    // and a model that has just written a vivid shot will not go back and
    // check it. So the overlap is measured, and a shot that shares no content
    // word with what the video is about is refused rather than rendered.
    //
    // Deliberately crude: it catches total drift (a sunset for a post about
    // offline coding) and nothing subtler, because a stricter rule would
    // start refusing good metaphors. One shared word is enough to pass.
    const subject = ((args.subject as string | undefined) || '').trim();
    if (!subject) {
      return {
        success: false,
        output:
          'write_video_post requires `subject` — what this video is ABOUT, in a few plain words. '
          + 'It is the anchor the shot is held against, so the clip shows the idea rather than '
          + 'something attractive beside it.',
      };
    }
    const STOP = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from',
      'is', 'are', 'was', 'it', 'its', 'this', 'that', 'as', 'by', 'into', 'over', 'then', 'while',
      'slow', 'close', 'shot', 'clip', 'camera', 'light', 'frame', 'push', 'pull', 'moves', 'move',
      'across', 'through', 'one', 'single', 'continuous', 'soft', 'warm', 'dark', 'bright',
    ]);
    const words = (s: string) => new Set(
      s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
        .filter((w) => w.length > 3 && !STOP.has(w))
        .map((w) => w.replace(/(ing|ed|es|s)$/, '')),
    );
    const subjectWords = words(subject);
    const shotWords = words(shot);
    const shared = [...subjectWords].filter((w) => shotWords.has(w));
    if (subjectWords.size > 0 && shared.length === 0) {
      return {
        success: false,
        output:
          `The shot does not show the subject. This video is about "${subject}", but the clip `
          + 'describes something with no part of that in it — so a viewer watches one thing and '
          + 'hears about another, and the picture argues for nothing.\n\n'
          + 'Rewrite `shot` so the subject is what is ON SCREEN, legible in the first second. '
          + 'Ask what this idea LOOKS like, then shoot that — not something attractive beside it.',
      };
    }

    const captionless = parsed.filter((v) => !v.caption).map((v) => v.platform);
    if (captionless.length > 0) {
      return {
        success: false,
        output: `write_video_post requires a caption for every platform — missing for ${captionless.join(', ')}. The clip is only half the post.`,
      };
    }

    // Same deterministic enforcement as write_post: count by code point and
    // hand back the exact overage, so she trims and re-calls in the same turn.
    // THE LINK GOES ON EVERY VIDEO, and it is appended here rather than asked
    // for. A rule the model has to remember is a rule that is missing from the
    // one post that mattered — and a video nobody can act on is a video that
    // did nothing. Idempotent: if she already wrote it, it is not doubled.
    // The tagline goes on first, then the link — so a reader hits the claim
    // and then the place to check it, which is the order that persuades.
    // Per platform, because the caps differ by orders of magnitude — 2,200
    // on Instagram against 63,206 on Facebook. Enforced AFTER the link,
    // because the link is not optional: if adding it breaks the cap then the
    // caption is what gives.
    const finished = parsed.map((v) => {
      const withTagline = v.caption.includes(TAGLINE) ? v.caption : `${v.caption}\n\n${TAGLINE}`;
      const withLink = withTagline.toLowerCase().includes(AVA_URL)
        ? withTagline
        : `${withTagline}\n\n${AVA_URL}`;
      return { ...v, caption: withLink };
    });
    // YouTube without a title is a Short nobody can find. The field was
    // optional for months and was skipped every single time, so it is checked
    // rather than described. Hashtags are refused in it for the same reason
    // the policy now says to keep them out: on Shorts the title IS the
    // discovery surface and tags were consuming it.
    const ytMissingTitle = finished.filter((v) => v.platform === 'youtube' && !(v.title || '').trim());
    if (ytMissingTitle.length > 0) {
      return {
        success: false,
        output:
          'The youtube entry has no `title`. On Shorts the description is collapsed on mobile, so the title is ' +
          'the only thing most people read before they decide — without one the post goes up unfindable. Write ' +
          'the plain searchable claim, the words someone would actually type, front-loaded and under about 50 ' +
          'characters. Then call write_video_post again.',
      };
    }
    const ytTaggedTitle = finished.filter((v) => v.platform === 'youtube' && (v.title || '').includes('#'));
    if (ytTaggedTitle.length > 0) {
      return {
        success: false,
        output:
          `The youtube title contains hashtags: "${ytTaggedTitle[0].title}". They belong in the description. ` +
          'In the title they eat the space the claim needed, and the title is the one thing a viewer reads on a ' +
          'phone. Take them out, put them in the caption, and call write_video_post again.',
      };
    }

    // Instagram caps posts and Reels at FIVE hashtags — rolled out December
    // 2025, and anything beyond it is rejected. Every Instagram post written
    // here carried ten, because the policy still said 8-12. Checked rather
    // than described: refusing above five is safe even if the true cap turns
    // out higher, because 3-5 is the recommendation either way.
    const IG_TAG_CAP = 5;
    const igTooManyTags = finished.filter(
      (v) => v.platform === 'instagram' && (v.hashtags?.length ?? 0) > IG_TAG_CAP,
    );
    if (igTooManyTags.length > 0) {
      const n = igTooManyTags[0].hashtags?.length ?? 0;
      return {
        success: false,
        output:
          `The instagram entry has ${n} hashtags. Instagram caps posts and Reels at ${IG_TAG_CAP} and rejects ` +
          'anything over it, so this would not publish as written. Keep the ' + IG_TAG_CAP + ' that are genuinely ' +
          'closest to the subject and drop the rest — they categorise and feed search, they do not add reach. ' +
          'Then call write_video_post again.',
      };
    }

    const tooLong = finished
      .map((v) => ({ v, limit: VIDEO_CAPTION_LIMITS[v.platform], len: Array.from(v.caption).length }))
      .filter((x) => x.limit && x.len > x.limit);
    if (tooLong.length > 0) {
      return {
        success: false,
        output:
          tooLong
            .map((x) =>
              `The ${x.v.platform} caption is ${x.len} characters with the tagline and ${AVA_URL} appended — ` +
              `${x.len - x.limit} over the ${x.limit} limit.`)
            .join(' ')
          + ' Trim those captions and call write_video_post again. The link is not optional; the words are what give.',
      };
    }

    // ── The voiceover has to FIT ─────────────────────────────────────────
    // The read is laid against a fixed run of stills, so the only lever is
    // making the speech short enough to sit inside it. This mattered when Wan
    // took the audio as input and it matters just as much now that a person
    // does the cutting: a voice still talking after the last still is the same
    // broken short either way, and now there is nobody to notice but them.
    // Budget: the duration minus a second of air at each end, at roughly two
    // words a second. A 10s clip is therefore about 14 words, NOT the 20-25 the
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
    // MEASURED through the real voice — qwen3-tts-flash, Bellona, at
    // speech_rate 0.95, no written direction, timed off the audio actually
    // returned. Eight lengths, THREE takes each, slowest take shown:
    //
    //      6w -> 2.06s    10w -> 4.50s   14w -> 7.37s   17w -> 8.54s
    //     25w -> 11.83s   34w -> 15.70s  45w -> 19.07s  71w -> 35.24s
    //
    // Floor 1.90 w/s. Note she is the LEAST consistent of the voices measured
    // on the long reads — 71 words came back 24.04s, 25.30s and 35.24s, a 47%
    // spread on identical input, against 32% at 45 words and under 20% for
    // everything shorter. Budgeting from the floor is what absorbs that, which
    // is the whole reason the floor and not the average is used.
    // The SLOWEST is the one that matters: the budget multiplies by it, so
    // taking the average would let a slow read run past the last still.
    //
    // THREE takes each, not one, because this model's timing is not
    // deterministic — the same fourteen words came back 5.51s and 6.44s. A
    // single take per length is how you measure a rate that is not there.
    //
    // RE-MEASURED four times on 10 Oct 2026, and the history is the warning.
    // Qwen retired qwen3-tts-instruct-flash. Maia, the previous brand voice,
    // came back sounding like a non-native speaker on the replacement, so the
    // voice changed to Katerina at 2.08 against Maia's 2.41 — carrying 2.41
    // over would have overrun every script by a sixth. Then the written
    // direction came out (it no longer does anything and it made the timing
    // swing 31% — see ava-voice.ts), which moved the floor to 1.99. Then the
    // pace became an explicit 0.95, taking it to 1.96. Then the operator heard
    // the nine voices nobody had sampled yet and moved to Vivian, 2.18. Then he
    // listened to all seventeen properly across an evening and settled on
    // Bellona, 1.90.
    //
    // FIVE numbers in a day, and only three of the five changes were a change
    // of voice. The rate is not a property of the voice alone, and it is not
    // guessable from one: Maia 2.41, Katerina 1.96, Vivian 2.18, Bellona 1.90,
    // all at the same pace through the same model.
    //
    // So: if AVA_BRAND_VOICE, AVA_VOICE_RATE or what gets sent alongside them
    // changes, re-measure. Do not scale this — it is not linear in the pace
    // multiplier, and the roster spread is enormous (the same 34 words run
    // 11.8s through Jennifer and 24.2s through Seren).
    //
    // The floor used to be 12, set to clear Wan's 3s minimum and nothing else.
    // Twelve words is under five seconds — half a ten second clip — and a floor
    // is exactly where a model writes to when the tool keeps rejecting it, so
    // every voiced clip came back half silent. The floor now exists to FILL the
    // clip rather than merely to be accepted.
    //
    const MIN_SPEECH_SECONDS = 3.0;
    // SLOWEST_WORDS_PER_SECOND is module-level now: the sign-off length is
    // derived from the same number, and it has to BE the same number.
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

    // ── The spoken sign-off ──────────────────────────────────────────────
    //
    // The tagline is read at the end of every voiced post, and it is ON TOP of
    // the word budget rather than inside it: the script above was already
    // validated against the full allowance for the clip, so the content never
    // gets shorter to make room. Operator's call, and the right one — a sign-off
    // that eats a third of a 15s reel is a sign-off that costs you the reel.
    //
    // The consequence is that the CLIP gets longer, and it has to, or the voice
    // runs past the last still — the one thing the length check above exists to
    // prevent. So the duration reported downstream covers the whole read. The
    // final still holds through the sign-off; no extra shot is required, and
    // the output below says so because the operator is the one cutting it.
    const voicedScript = script
      ? (script.includes(TAGLINE) ? script : `${script} ${TAGLINE}`)
      : script;
    const outroSeconds = script ? VOICED_OUTRO_SECONDS : 0;
    const clipDuration = plannedDuration + outroSeconds;

    const post: VideoPostInput = {
      // One entry per platform. The store generates the stills and the read
      // once and files a card for each of these against the same assets.
      variants: finished.map((v) => ({
        platform: v.platform,
        caption: v.caption,
        title: v.title,
        hashtags: v.hashtags,
        tagNote: v.tagNote,
      })),
      shot,
      script: voicedScript || undefined,
      // Covers the WHOLE read — the script the model wrote plus the sign-off
      // appended above. If this diverges from the audio the voice overruns the
      // picture, which is the most obviously broken thing a short can do.
      duration: clipDuration,
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
          : ` The VOICEOVER FAILED${written.voiceError ? ` (${written.voiceError})` : ''} — there is NO narration, so this is the clip and a caption only. Say so plainly.`
        : '';
      // A hole in the storyboard is reported, never hidden: she is about to
      // tell the operator it is ready, and a missing frame is the one thing
      // they cannot work around in Canva without knowing.
      const shotLine = written.clipError
        ? ` The CLIP FAILED to render (${written.clipError}) — there is no picture, only the voiceover and the caption. Say so plainly rather than describing a video that does not exist.`
        : '';
      return {
        success: true,
        output:
          `Video post ready for ${platform} — a ${plannedDuration}s clip, the caption, and the voiceover, ` +
          `all saved to the Library. The clip carries its own generated soundtrack: it gets MUTED in Canva and ` +
          `your voiceover goes over the top, with the text overlaid by hand. ` +
          // The operator cuts this by hand, so the extra seconds have to be
          // stated or the last still gets cut on the beat and the sign-off is
          // clipped mid-sentence.
          (outroSeconds > 0
            ? `The voiceover ends with the sign-off, which runs about ${outroSeconds}s past the ${plannedDuration}s of ` +
              `picture — so the finished piece is roughly ${clipDuration}s and the last frame has to hold through it. `
            : '') +
          `You have not seen the clip: say what you made and why that shot, never how it looks.` +
          `${recipeLine}${voiceLine}${shotLine}`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Could not make the video post: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
