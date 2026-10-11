// Creative Studio — shared data + helpers (single source of truth).
//
// Browser-safe leaf (no node imports), imported by BOTH the extension
// dashboard webview and the IDE so the two Creative Studios can't drift.
// Imported as `@ava/core/creative`. Labels are `dash.creative.*` i18n keys
// (already in the locale tables); each surface resolves them with its own t().
//
// Preset suffixes are appended to the user's raw prompt at submit time — they
// nudge the generator without the user needing the right adjectives. Auto = no
// append. Keep each suffix to one short sentence; the model has more taste than
// we do.

import { CREDIT_COST, videoCreditCost } from '../billing/credits.js';

export type CreativeMode = 'images' | 'audio' | 'voice' | 'video';

/** All modes, in tab order. */
export const VALID_MODES: readonly CreativeMode[] = ['images', 'audio', 'voice', 'video'] as const;

/** Modes hidden from the UI (MiniMax music + voice, while the provider
 *  relationship is pending). Reversible — drop a key to bring the tab back;
 *  the generation handlers + routes stay intact behind it. */
export const HIDDEN_MODES: ReadonlySet<CreativeMode> = new Set<CreativeMode>(['audio', 'voice']);

/** Mode → i18n label key. Icons live per-surface (framework-specific). */
export const MODE_META: { id: CreativeMode; labelKey: string }[] = [
  { id: 'images', labelKey: 'dash.creative.mode_image' },
  { id: 'audio', labelKey: 'dash.creative.mode_music' },
  { id: 'voice', labelKey: 'dash.creative.mode_voice' },
  { id: 'video', labelKey: 'dash.creative.mode_video' },
];


export interface PresetOption { id: string; labelKey: string; suffix: string }
// The MiniMax-era VOICES table (Calm_Woman, Wise_Woman, English_radiant_girl…),
// its VOICE_EMOTIONS, and the VoiceOption interface they shared all lived here
// and are gone. MiniMax was removed from the Creative Studio and nothing had
// imported any of them since — they were a THIRD voice list, quietly
// disagreeing with the two the surfaces actually used.
//
// The real ones are TTS_VOICES / TTS_VOICE_EMOTIONS below, verified name by
// name against the API.


export const IMAGE_STYLES: PresetOption[] = [
  { id: 'auto', labelKey: 'dash.creative.style_auto', suffix: '' },
  { id: 'cinematic', labelKey: 'dash.creative.style_cinematic', suffix: ', cinematic lighting, anamorphic lens, film grain, professional colour grade' },
  { id: 'photoreal', labelKey: 'dash.creative.style_photoreal', suffix: ', photorealistic, 50mm lens, natural lighting, sharp focus, high detail' },
  { id: 'illustration', labelKey: 'dash.creative.style_illustration', suffix: ', digital illustration, vibrant colours, clean linework, painterly shading' },
  { id: 'anime', labelKey: 'dash.creative.style_anime', suffix: ', anime style, expressive features, soft pastels, detailed background' },
  { id: 'watercolour', labelKey: 'dash.creative.style_watercolour', suffix: ', watercolour painting, soft edges, paper texture, washed pigments' },
  { id: 'graphic', labelKey: 'dash.creative.style_graphic', suffix: ', vector art, flat colours, bold shapes, modern poster aesthetic' },
];

export const MUSIC_MOODS: PresetOption[] = [
  { id: 'auto', labelKey: 'dash.creative.mood_auto', suffix: '' },
  { id: 'cinematic', labelKey: 'dash.creative.mood_cinematic', suffix: ', cinematic orchestral score, sweeping strings, epic build' },
  { id: 'lofi', labelKey: 'dash.creative.mood_lofi', suffix: ', lo-fi hip hop, mellow drums, vinyl crackle, warm bass' },
  { id: 'synthwave', labelKey: 'dash.creative.mood_synthwave', suffix: ', 80s synthwave, analogue synths, gated reverb drums, neon mood' },
  { id: 'orchestral', labelKey: 'dash.creative.mood_orchestral', suffix: ', full orchestral arrangement, lush strings, brass, timpani' },
  { id: 'ambient', labelKey: 'dash.creative.mood_ambient', suffix: ', ambient pads, drones, ethereal textures, no percussion' },
  { id: 'trailer', labelKey: 'dash.creative.mood_trailer', suffix: ', movie trailer score, hybrid orchestral, big drums, tension build' },
];


export const VIDEO_CAMERAS: PresetOption[] = [
  { id: 'auto', labelKey: 'dash.creative.camera_auto', suffix: '' },
  { id: 'static', labelKey: 'dash.creative.camera_static', suffix: ', static camera, locked-off shot' },
  { id: 'pan', labelKey: 'dash.creative.camera_pan', suffix: ', slow horizontal camera pan' },
  { id: 'zoom', labelKey: 'dash.creative.camera_zoom', suffix: ', gentle zoom in on subject' },
  { id: 'dolly', labelKey: 'dash.creative.camera_dolly', suffix: ', dolly forward, smooth tracking shot' },
  { id: 'orbit', labelKey: 'dash.creative.camera_orbit', suffix: ', orbital camera move around subject' },
];

export type VideoMotionId = 'subtle' | 'dynamic' | 'wild';
export const VIDEO_MOTION: { id: VideoMotionId; labelKey: string; suffix: string }[] = [
  { id: 'subtle', labelKey: 'dash.creative.motion_subtle', suffix: ', minimal motion, gentle movement' },
  { id: 'dynamic', labelKey: 'dash.creative.motion_dynamic', suffix: ', dynamic motion, energetic action' },
  { id: 'wild', labelKey: 'dash.creative.motion_wild', suffix: ', explosive motion, high-energy action' },
];

// ── Prompt composition (append preset suffixes) ──────────────────────────────

const suffixFor = (presets: PresetOption[], id: string): string => presets.find((p) => p.id === id)?.suffix ?? '';

export function composeImagePrompt(prompt: string, styleId: string): string {
  return prompt.trim() + suffixFor(IMAGE_STYLES, styleId);
}
export function composeMusicPrompt(prompt: string, moodId: string): string {
  return prompt.trim() + suffixFor(MUSIC_MOODS, moodId);
}
export function composeVideoPrompt(prompt: string, cameraId: string, motionId: string): string {
  return prompt.trim() + suffixFor(VIDEO_CAMERAS, cameraId) + (VIDEO_MOTION.find((m) => m.id === motionId)?.suffix ?? '');
}

// ── Cost estimates (credits per generation) ──────────────────────────────────
// Source of truth: billing/credits CREDIT_COST. The server bills with the same
// constants. Variations fan out client-side (N parallel calls) so they multiply.
// Voice scales by 500-char chunks; music + video are flat-charged.

export const VOICE_CHARS_PER_UNIT = 500;

export function estimateImageCredits(variations: number): number {
  return CREDIT_COST.image_gen * Math.max(1, variations);
}
export function estimateMusicCredits(_durationSec?: number): number {
  return CREDIT_COST.music_gen;
}
export function estimateVoiceCredits(textLen: number): number {
  const chunks = Math.max(1, Math.ceil(textLen / VOICE_CHARS_PER_UNIT));
  return CREDIT_COST.voice_gen * chunks;
}
export function estimateVideoCredits(resolution: string, seconds?: number): number {
  const sr = resolution === '1080P' ? 1080 : resolution === '480P' ? 480 : 720;
  return videoCreditCost(sr, seconds);
}

// ── Empty-state suggestion prompts ───────────────────────────────────────────

export const SUGGESTIONS: Record<CreativeMode, string[]> = {
  images: [
    'A neon-lit Tokyo alley at midnight, light rain, anamorphic lens',
    'A minimalist logo for a coffee shop called Ember, warm earthy palette',
    'A studio portrait of a tortoiseshell cat, soft window light',
    'An astronaut planting a sapling on a red Martian dune at sunrise',
    'A vintage 1970s travel poster for the moons of Saturn',
    'A solarpunk rooftop garden in Lisbon, bees, tomato vines, golden hour',
    'A line illustration of a fox curled around a cup of tea, single brush stroke',
    'A foggy Highland loch at first light, lone heron, painterly mood',
    'A glass terrarium ecosystem floating in deep space, bioluminescent moss',
    'A stop-motion-style hedgehog librarian, tiny round glasses, candle-lit shelves',
    'An isometric pixel-art bakery, cinnamon rolls cooling on the windowsill',
    'A black-and-white street photograph of an umbrella crowd in Shibuya',
  ],
  audio: [
    'A 60s lo-fi beat with mellow Rhodes piano and warm bass',
    'A cinematic trailer build, hybrid orchestral, big drums in the back half',
    'Ambient pads, slow, no percussion, late-night focus mood',
    'A 90s synthwave drive, gated reverb snares, neon arpeggios',
    'A jazz café trio, brushed drums, upright bass, melancholic piano',
    'A morning intro stinger, bright marimba and hand-claps, 8 seconds',
    'A foggy minimal-techno loop, dub chords, shuffle hi-hats',
    'A heroic orchestral fanfare, brass-led, building to timpani hit',
    'A Studio-Ghibli-inspired piano theme, hopeful, gentle strings',
    'A warm folk acoustic guitar instrumental, fingerpicked, no vocals',
    'A glitchy IDM intro, fractured drum hits, rising sub bass',
    'A lullaby with music box and soft choral pads, three minutes',
  ],
  voice: [
    "Welcome to the show. I have something I think you'll love.",
    "Three. Two. One. Let's ride.",
    'In the quiet of the morning, before the world wakes, there is space to think.',
    'You did the hard part already. The rest is just showing up.',
    "Today's episode: how to ship one small thing every single day.",
    "Press play. Take a breath. We're going somewhere new.",
    'I built this for the people who never thought they could.',
    "New drop incoming. You'll want to be there for this one.",
    'Settle in. Pour yourself something warm. This story takes a while.',
    'The forecast for tomorrow is bright, with a chance of unexpected joy.',
    "Quick reminder — you don't have to be ready, you just have to begin.",
    "And that's a wrap. Thanks for being here. Until next time.",
  ],
  video: [
    'A wide aerial shot drifting over a misty pine forest at dawn',
    'A close-up of hands kneading bread on a flour-dusted wooden bench',
    'A neon-pink classic Mustang on a coastal highway, golden-hour sun',
    'A slow dolly through a candle-lit Kyoto teahouse, steam rising',
    'A surfer cresting a glassy wave at sunrise, slow-motion spray',
    "A satellite's view of city lights blooming at twilight, time-lapse",
    'A ballerina spinning in a sun-drenched studio, dust motes in the light',
    'A barista pulling a perfect espresso, syrup-thick crema in macro',
    'A snow leopard padding through a Himalayan ridge at first light',
    'A vinyl record dropping onto a turntable, needle landing, close-up',
    'A drone weaving between Manhattan skyscrapers at golden hour',
    'A potter shaping a vase on a wheel, clay slipping under their thumb',
  ],
};


/* ── Voice: the roster, and the dials that actually do something ── */

/**
 * Every voice qwen3-tts-flash has, with what it is.
 *
 * VERIFIED id by id against the API — all 48 on 2026-10-11, the eleven before
 * them on 2026-08-28. This list exists because the two surfaces once drifted
 * onto different rosters that shared exactly one name, and seven of the IDE's
 * nine did not exist at all, including its default, so picking almost any
 * voice there failed outright. A bogus id returns 400, so verification is one
 * call. Adding a name without making that call is how the drift happened.
 *
 * It was ELEVEN until 2026-10-11 — a shortlist inherited from the retired
 * qwen3-tts-instruct-flash. Operator: *"we want to include every voice that is
 * offered as every user will have a different need"*. He is right, and it
 * matters more than it looks: this model IGNORES written delivery direction
 * (see voiceSpeechRate below), so the VOICE is the tone. Offering a quarter of
 * the roster was offering a quarter of the expressive range.
 *
 * `group` exists so a 48-item picker stays usable:
 *   neutral — intended to read English straight
 *   accent  — a character accent by design (Spanish, Korean, French and so
 *             on); they speak English, but audibly as that character
 *   dialect — Chinese regional voices; right for a localised read, wrong for
 *             an English brand read
 *
 * `gender` and `style` come from Alibaba's published roster rather than from
 * listening, so treat them as labels and not as the decision. The roster calls
 * Vivian "cute, slightly temperamental", and on hearing her the operator said
 * she was the voice this project had spent months failing to find. Listen
 * first, always.
 */
export interface TtsVoiceInfo {
  id: string;
  gender: 'female' | 'male';
  style: string;
  group: 'neutral' | 'accent' | 'dialect';
}

export const TTS_VOICE_CATALOGUE: readonly TtsVoiceInfo[] = [
  // ── Reads English straight ──
  { id: 'Cherry',      gender: 'female', style: 'sunny, friendly',             group: 'neutral' },
  { id: 'Serena',      gender: 'female', style: 'gentle, warm',                group: 'neutral' },
  { id: 'Vivian',      gender: 'female', style: 'bright, characterful',        group: 'neutral' },
  { id: 'Maia',        gender: 'female', style: 'intellect and gentleness',    group: 'neutral' },
  { id: 'Bellona',     gender: 'female', style: 'clear, carrying, articulate', group: 'neutral' },
  { id: 'Katerina',    gender: 'female', style: 'mature, resonant',            group: 'neutral' },
  { id: 'Jennifer',    gender: 'female', style: 'cinematic American',          group: 'neutral' },
  { id: 'Bella',       gender: 'female', style: 'youthful, lively',            group: 'neutral' },
  { id: 'Mia',         gender: 'female', style: 'soft, even',                  group: 'neutral' },
  { id: 'Stella',      gender: 'female', style: 'playful, spirited',           group: 'neutral' },
  { id: 'Seren',       gender: 'female', style: 'soothing, slow',              group: 'neutral' },
  { id: 'Nini',        gender: 'female', style: 'sweet, close',                group: 'neutral' },
  { id: 'Chelsie',     gender: 'female', style: 'animated, companionable',     group: 'neutral' },
  { id: 'Momo',        gender: 'female', style: 'playful, humorous',           group: 'neutral' },
  { id: 'Bunny',       gender: 'female', style: 'very cute, childlike',        group: 'neutral' },
  { id: 'Elias',       gender: 'female', style: 'instructional, explanatory',  group: 'neutral' },
  { id: 'Ethan',       gender: 'male',   style: 'warm, energetic',             group: 'neutral' },
  { id: 'Moon',        gender: 'male',   style: 'bold, confident',             group: 'neutral' },
  { id: 'Kai',         gender: 'male',   style: 'soothing',                    group: 'neutral' },
  { id: 'Neil',        gender: 'male',   style: 'news-anchor precision',       group: 'neutral' },
  { id: 'Vincent',     gender: 'male',   style: 'raspy, cinematic',            group: 'neutral' },
  { id: 'Nofish',      gender: 'male',   style: 'casual, offhand',             group: 'neutral' },
  { id: 'Ryan',        gender: 'male',   style: 'theatrical, high energy',     group: 'neutral' },
  { id: 'Aiden',       gender: 'male',   style: 'friendly American',           group: 'neutral' },
  { id: 'Andre',       gender: 'male',   style: 'magnetic, composed',          group: 'neutral' },
  { id: 'Arthur',      gender: 'male',   style: 'elderly storyteller',         group: 'neutral' },
  { id: 'Eldric Sage', gender: 'male',   style: 'wise elder',                  group: 'neutral' },
  { id: 'Mochi',       gender: 'male',   style: 'bright, precocious child',    group: 'neutral' },
  { id: 'Pip',         gender: 'male',   style: 'mischievous child',           group: 'neutral' },

  // ── A character accent by design ──
  { id: 'Sonrisa',     gender: 'female', style: 'warm Latin American',         group: 'accent' },
  { id: 'Sohee',       gender: 'female', style: 'warm, expressive Korean',     group: 'accent' },
  { id: 'Ono Anna',    gender: 'female', style: 'playful Japanese',            group: 'accent' },
  { id: 'Bodega',      gender: 'male',   style: 'enthusiastic Spanish',        group: 'accent' },
  { id: 'Alek',        gender: 'male',   style: 'Russian, cool then warm',     group: 'accent' },
  { id: 'Dolce',       gender: 'male',   style: 'languid Italian',             group: 'accent' },
  { id: 'Lenn',        gender: 'male',   style: 'rational German',             group: 'accent' },
  { id: 'Emilien',     gender: 'male',   style: 'romantic French',             group: 'accent' },
  { id: 'Radio Gol',   gender: 'male',   style: 'football commentator',        group: 'accent' },

  // ── Chinese regional ──
  { id: 'Jada',        gender: 'female', style: 'Shanghai, spirited',          group: 'dialect' },
  { id: 'Sunny',       gender: 'female', style: 'Sichuan, sweet',              group: 'dialect' },
  { id: 'Kiki',        gender: 'female', style: 'Cantonese, sweet',            group: 'dialect' },
  { id: 'Dylan',       gender: 'male',   style: 'Beijing, youthful',           group: 'dialect' },
  { id: 'Li',          gender: 'male',   style: 'Nanjing, patient',            group: 'dialect' },
  { id: 'Marcus',      gender: 'male',   style: 'Shaanxi, earthy',             group: 'dialect' },
  { id: 'Roy',         gender: 'male',   style: 'Minnan, witty',               group: 'dialect' },
  { id: 'Peter',       gender: 'male',   style: 'Tianjin, comic',              group: 'dialect' },
  { id: 'Eric',        gender: 'male',   style: 'Sichuan, modern',             group: 'dialect' },
  { id: 'Rocky',       gender: 'male',   style: 'Cantonese, humorous',         group: 'dialect' },
];

/** Just the ids — the shape the tool schemas and the pickers want. */
export const TTS_VOICES: readonly string[] = TTS_VOICE_CATALOGUE.map((v) => v.id);
export type TtsVoice = string;

/**
 * Pace and loudness: the only two delivery controls this model honours.
 *
 * There used to be an Emotion dial here too, and a voiceDeliveryInstruction()
 * that turned both dials into an English sentence sent as `instructions`. That
 * was right for qwen3-tts-instruct-flash, which shaped delivery from plain
 * language and had no numeric parameters at all. Qwen retired it on
 * 2026-10-10. The replacement still ACCEPTS `instructions` and no longer acts
 * on them: the same line directed "slowly" and directed "manic" came back
 * 7.12s and 7.04s, which is the same read twice.
 *
 * So both dials silently did nothing, and a panel whose controls do nothing
 * teaches people the panel is decorative. Emotion is GONE rather than
 * relabelled, because tone has no numeric equivalent here — it now comes from
 * WHICH VOICE you pick, which is why the roster above matters more than it
 * used to.
 *
 * Everything below was MEASURED rather than read from a doc, because this API
 * accepts unknown parameters silently: an invented `bogus_param` returned 200.
 * "It did not error" proves nothing; only changed audio does.
 */
export const TTS_VOICE_SPEEDS = ['slower', 'normal', 'brisk'] as const;

/**
 * Pace, as the numeric `speech_rate` the API actually reads.
 *
 * MEASURED on one fixed line: 13.52s at 0.5, 7.04s at 1.0, 5.14s at 1.5.
 * DashScope accepts 0.5-2.0 and returns InvalidParameter outside it (verified
 * at 0.3, 0.4, 2.5 and 3.0).
 *
 * `normal` returns undefined so the parameter is omitted entirely, leaving the
 * voice at its own natural pace rather than asserting a 1.0 that a later model
 * might not read the same way.
 */
export function voiceSpeechRate(speed?: string): number | undefined {
  const rate: Record<string, number> = { slower: 0.8, brisk: 1.25 };
  return rate[speed ?? ''];
}

export const TTS_VOICE_VOLUMES = ['quiet', 'normal', 'loud'] as const;

/**
 * Loudness, as the numeric `volume` the API reads. 0-100; 200 is rejected.
 *
 * MEASURED by peak sample on an identical line: 0 is silence (peak 1), 10 is
 * 1631, 25 is 5695, 50 is 11392, 75 is 19775, 100 is 27647. Linear, and 100
 * does not clip (27647 of a possible 32767).
 *
 * The DEFAULT measured 19199, which is 75. So `normal` omits the parameter
 * rather than sending a number, and `loud` is a real step above it instead of
 * a no-op. Sending a plausible-looking 50 as "normal" would have made every
 * read quieter than before while appearing to change nothing.
 */
export function voiceVolume(volume?: string): number | undefined {
  const level: Record<string, number> = { quiet: 40, loud: 100 };
  return level[volume ?? ''];
}

/** Sample N items without repeats — for rotating empty-state suggestions. */
export function pickRandom<T>(items: T[], n: number): T[] {
  const pool = items.slice();
  const out: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}
