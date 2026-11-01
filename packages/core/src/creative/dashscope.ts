/**
 * Alibaba DashScope, called DIRECTLY with the user's own Qwen key.
 *
 * Ava goes fully bring-your-own-key (decided 1 Nov 2026): no accounts, no
 * hosted models. Images already went straight to DashScope with a Qwen key;
 * voice and video went through OUR server, which only accepts our own platform
 * keys — so a user's Qwen key was sent to us and refused, and own-key voice
 * and video never worked. These are the same requests our server makes, made
 * from the user's machine with their key. One Qwen key now covers chat,
 * images, voice and video.
 *
 * The video request builder lives here as the single copy; the website
 * imports it rather than keeping its own.
 */

export const DASHSCOPE_BASE = 'https://dashscope-intl.aliyuncs.com';
const TTS_URL = `${DASHSCOPE_BASE}/api/v1/services/aigc/multimodal-generation/generation`;
const WAN_URL = `${DASHSCOPE_BASE}/api/v1/services/aigc/video-generation/video-synthesis`;
const TASK_URL = `${DASHSCOPE_BASE}/api/v1/tasks`;

// ── Voice (Qwen3-TTS) ────────────────────────────────────────────────────────

/**
 * The voice model. `instructions` is accepted and ignored by it (Qwen retired
 * the instruction model on 10 Oct 2026); `speech_rate` and `volume` are the
 * controls that actually change the audio — measured, not assumed.
 */
export const TTS_MODEL = 'qwen3-tts-flash';

export interface TtsOptions {
  text: string;
  voice?: string;
  language?: string;
  instructions?: string;
  /** 0.5-2.0, clamped: outside it DashScope rejects the whole request. */
  speechRate?: number;
  /** 0-100, clamped for the same reason. The model's default is 75. */
  volume?: number;
  signal?: AbortSignal;
}

/** Synthesise speech. Returns the audio URL (DashScope keeps it ~24h — download it). */
export async function qwenTts(apiKey: string, o: TtsOptions): Promise<{ url: string; model: string }> {
  const input: Record<string, unknown> = {
    text: o.text,
    voice: o.voice || 'Cherry',
    language_type: o.language || 'English',
  };
  if (o.instructions?.trim()) {
    input.instructions = o.instructions.trim();
    input.optimize_instructions = true;
  }
  const parameters: Record<string, unknown> = {};
  if (typeof o.speechRate === 'number' && Number.isFinite(o.speechRate)) {
    parameters.speech_rate = Math.min(2, Math.max(0.5, o.speechRate));
  }
  if (typeof o.volume === 'number' && Number.isFinite(o.volume)) {
    parameters.volume = Math.min(100, Math.max(0, Math.round(o.volume)));
  }
  const body: Record<string, unknown> = { model: TTS_MODEL, input };
  if (Object.keys(parameters).length) body.parameters = parameters;

  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: o.signal,
  });
  if (!res.ok) throw new Error(`Qwen voice error (${res.status}): ${(await res.text()).slice(0, 400)}`);
  const data = (await res.json()) as { output?: { audio?: { url?: string } } };
  const url = data?.output?.audio?.url;
  if (!url) throw new Error('Qwen voice returned no audio');
  return { url, model: TTS_MODEL };
}

// ── Video (Wan) ──────────────────────────────────────────────────────────────

/**
 * Holding a pose, said as things that HAPPEN. wan3.0 treats an instruction to
 * do nothing as an instruction to GENERATE nothing: the same photograph and
 * seed came back as a first frame then 29 seconds of black (1.31 MB) when the
 * hold was worded as negation, and held the dish perfectly (38.09 MB) when the
 * small movements were named instead. Both returned SUCCEEDED. Tighten it by
 * adding something that MOVES, never by forbidding something.
 */
const HOLD_POSE_DIRECTION =
  'The subject holds this exact position throughout, steady and composed. '
  + 'Quiet breathing, the smallest shifts of weight, muscle tension settling under the skin. '
  + 'The expression stays calm and settled. Dust drifts slowly through the light. '
  + 'The camera pushes in very slowly and steadily, smooth and unhurried.';

/** One model for everything: wan3.0-video, 2-30s, text or a verified first frame. */
export const WAN_VIDEO_MODEL = 'wan3.0-video';

export function wanResolution(resolution?: string): '480P' | '720P' | '1080P' {
  if (resolution === '1080P') return '1080P';
  if (resolution === '480P') return '480P';
  return '720P';
}

/** wan3.0's `ratio`: 16:9, 4:3, 1:1, 3:4, 9:16 or adaptive. A typo falls back to 16:9. */
export function wanRatio(aspect: string | undefined): string {
  const allowed = ['16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'];
  return allowed.includes(aspect ?? '') ? (aspect as string) : '16:9';
}

export interface WanRequestInput {
  prompt: string;
  duration?: unknown;
  resolution?: unknown;
  aspect?: string;
  first_frame_image?: string;
  audio_url?: string;
  hold_pose?: boolean;
  seed: number;
}

/**
 * The DashScope video request. Every value was established against the real
 * API — the official docs do not describe wan3.0-video, and the part that
 * fails SILENTLY is here: a wrong media type is ignored, not rejected, so a
 * bad shape still returns a good video of the wrong thing.
 */
export function buildWanRequest(args: WanRequestInput): Record<string, unknown> {
  const isImageToVideo = !!args.first_frame_image;
  // "duration must be -1 or in [2,30]" — the model's own validator.
  const requested = Number(args.duration);
  const duration = Number.isFinite(requested)
    ? Math.max(2, Math.min(30, Math.round(requested)))
    : (isImageToVideo ? 15 : 5);
  const tier = wanResolution(args.resolution as string | undefined);
  const resolution = isImageToVideo && tier === '480P' ? '720P' : tier;
  // A pose to hold needs a first frame; wan3.0 ignores negative_prompt, so the
  // hold lives in the prompt where the model actually reads it.
  const holdPose = !!args.hold_pose && isImageToVideo;

  // wan3.0's media types, from its validator: first_frame, last_frame,
  // reference_image, reference_video, reference_audio, file, link. The audio
  // type is named differently in other Wan models — changing the model means
  // rechecking this vocabulary, not just the ceiling.
  const media: Array<{ type: string; url: string }> = [];
  if (args.first_frame_image) media.push({ type: 'first_frame', url: args.first_frame_image });
  if (args.audio_url) media.push({ type: 'reference_audio', url: args.audio_url });

  const input: Record<string, unknown> = {
    prompt: holdPose ? `${args.prompt} ${HOLD_POSE_DIRECTION}` : args.prompt,
  };
  if (media.length) input.media = media;

  return {
    model: WAN_VIDEO_MODEL,
    input,
    parameters: {
      resolution,
      // The first frame already decides the aspect.
      ...(isImageToVideo ? {} : { ratio: wanRatio(args.aspect) }),
      duration,
      // The rewriter helps a short prompt and harms a composed one.
      prompt_extend: !args.first_frame_image && String(args.prompt).length < 180,
      watermark: false,
      seed: args.seed,
    },
  };
}

/** A fresh seed, or the caller's — it comes back so "same but warmer" can iterate. */
export function wanSeed(requested?: unknown): number {
  const n = Number(requested);
  return Number.isFinite(n)
    ? Math.max(0, Math.min(2147483647, Math.floor(n)))
    : Math.floor(Math.random() * 2147483647);
}

/** Submit a video job. DashScope accepts in ~1s and renders over minutes. */
export async function wanSubmit(
  apiKey: string,
  input: Omit<WanRequestInput, 'seed'> & { seed?: number },
  signal?: AbortSignal,
): Promise<{ taskId: string; model: string; seed: number }> {
  const seed = wanSeed(input.seed);
  const res = await fetch(WAN_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' },
    body: JSON.stringify(buildWanRequest({ ...input, seed })),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as { output?: { task_id?: string }; message?: string; code?: string };
  const taskId = data?.output?.task_id;
  if (!res.ok || !taskId) throw new Error(`Wan video error (${res.status}): ${data?.message || data?.code || 'no task id returned'}`);
  return { taskId, model: WAN_VIDEO_MODEL, seed };
}

export type WanStatus =
  | { status: 'processing' }
  | { status: 'success'; url: string }
  | { status: 'failed'; error: string }
  /** DashScope no longer holds the job (records expire after about a day). */
  | { status: 'expired'; error: string };

export async function wanStatus(apiKey: string, taskId: string, signal?: AbortSignal): Promise<WanStatus> {
  const res = await fetch(`${TASK_URL}/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!res.ok) return { status: 'processing' }; // transient — the caller keeps polling
  const data = (await res.json()) as { output?: { task_status?: string; video_url?: string; message?: string } };
  const s = String(data?.output?.task_status ?? '').toUpperCase();
  if (!s || s === 'PENDING' || s === 'RUNNING') return { status: 'processing' };
  if (s === 'SUCCEEDED' && data.output?.video_url) return { status: 'success', url: data.output.video_url };
  if (s === 'UNKNOWN') return { status: 'expired', error: 'This job has expired — the provider no longer has it. Generate it again.' };
  return { status: 'failed', error: data?.output?.message || `Video generation ${s.toLowerCase() || 'failed'}` };
}

/**
 * Poll until the clip is ready. Generous ceiling, backing-off cadence: two
 * 30-second renders of the same shape took 8 and 25 minutes (queue, not
 * length), and a timeout is the costliest failure — the render succeeds, is
 * billed, and the user is told it failed.
 */
export async function wanWait(
  apiKey: string,
  taskId: string,
  opts: { signal?: AbortSignal; onTick?: () => void; ceilingMs?: number } = {},
): Promise<string> {
  const ceiling = opts.ceilingMs ?? 45 * 60_000;
  const started = Date.now();
  while (Date.now() - started < ceiling) {
    if (opts.signal?.aborted) throw new Error('Video generation was stopped');
    await new Promise((r) => setTimeout(r, Date.now() - started < 120_000 ? 5_000 : 15_000));
    let st: WanStatus;
    try {
      st = await wanStatus(apiKey, taskId, opts.signal);
    } catch {
      continue; // network blip — keep polling until the ceiling
    }
    if (st.status === 'success') return st.url;
    if (st.status === 'failed' || st.status === 'expired') throw new Error(st.error);
    opts.onTick?.();
  }
  throw new Error('Video generation timed out');
}
