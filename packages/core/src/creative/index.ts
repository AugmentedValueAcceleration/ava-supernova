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

/** Ava's brand-locked narration voice. When the Ava-voice toggle is on, the
 *  voice id sent to the server is always this, regardless of the picker. */
export const AVA_VOICE_ID = 'English_radiant_girl';

export interface PresetOption { id: string; labelKey: string; suffix: string }
export interface VoiceOption { id: string; labelKey: string }

export const VOICES: VoiceOption[] = [
  { id: 'Calm_Woman', labelKey: 'dash.creative.voice_calm_woman' },
  { id: 'Wise_Woman', labelKey: 'dash.creative.voice_wise_woman' },
  { id: 'Friendly_Person', labelKey: 'dash.creative.voice_friendly' },
  { id: 'Inspirational_girl', labelKey: 'dash.creative.voice_inspirational' },
  { id: 'Deep_Voice_Man', labelKey: 'dash.creative.voice_deep' },
  { id: 'Calm_Man', labelKey: 'dash.creative.voice_calm_man' },
  { id: 'Newsman', labelKey: 'dash.creative.voice_newscaster' },
  { id: 'Lively_Girl', labelKey: 'dash.creative.voice_lively' },
  { id: 'Patient_Man', labelKey: 'dash.creative.voice_patient' },
  { id: 'Determined_Man', labelKey: 'dash.creative.voice_determined' },
];

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

export const VOICE_EMOTIONS: { id: string; labelKey: string }[] = [
  { id: 'neutral', labelKey: 'dash.creative.emotion_neutral' },
  { id: 'calm', labelKey: 'dash.creative.emotion_calm' },
  { id: 'excited', labelKey: 'dash.creative.emotion_excited' },
  { id: 'serious', labelKey: 'dash.creative.emotion_serious' },
  { id: 'playful', labelKey: 'dash.creative.emotion_playful' },
  { id: 'whisper', labelKey: 'dash.creative.emotion_whispered' },
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

/** Sample N items without repeats — for rotating empty-state suggestions. */
export function pickRandom<T>(items: T[], n: number): T[] {
  const pool = items.slice();
  const out: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}
