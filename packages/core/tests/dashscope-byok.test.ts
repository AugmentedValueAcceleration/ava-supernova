// Voice and video on the user's own Qwen key, straight to DashScope (BYOK
// plan, 1 Nov 2026). Before this, an own key was POSTed to OUR server, which
// only accepts our platform keys — so own-key voice and video never worked.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildWanRequest, qwenTts, wanStatus, wanSubmit, DASHSCOPE_BASE } from '../src/creative/dashscope.js';
import { GenerateVoiceTool } from '../src/tools/generate-voice.js';

type Call = { url: string; init: RequestInit };
function mockFetch(respond: (url: string, init: RequestInit) => unknown) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const body = respond(String(url), init);
    if (body instanceof Uint8Array) return new Response(body, { status: 200 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('the Wan request', () => {
  it('text to video: ratio, clamped duration, prompt rewrite only for a short prompt', () => {
    const r = buildWanRequest({ prompt: 'a comet over the sea', duration: 99, aspect: '9:16', seed: 7 }) as any;
    expect(r.model).toBe('wan3.0-video');
    expect(r.parameters).toMatchObject({ duration: 30, ratio: '9:16', resolution: '720P', prompt_extend: true, watermark: false, seed: 7 });
    expect(r.input.media).toBeUndefined();
  });

  it('a first frame and a voice go as typed media; no ratio, no 480P', () => {
    const r = buildWanRequest({ prompt: 'p', first_frame_image: 'https://x/f.png', audio_url: 'https://x/a.mp3', resolution: '480P', hold_pose: true, seed: 1 }) as any;
    expect(r.input.media).toEqual([{ type: 'first_frame', url: 'https://x/f.png' }, { type: 'reference_audio', url: 'https://x/a.mp3' }]);
    expect(r.parameters.ratio).toBeUndefined();
    expect(r.parameters.resolution).toBe('720P');
    expect(r.parameters.duration).toBe(15);
    expect(r.input.prompt).toMatch(/holds this exact position/);
  });
});

describe('direct calls', () => {
  it('voice: the user key goes to DashScope, with rate and volume clamped', async () => {
    const calls = mockFetch(() => ({ output: { audio: { url: 'https://oss/a.mp3' } } }));
    const out = await qwenTts('sk-ws-user', { text: 'hi', voice: 'Bellona', speechRate: 9, volume: -3 });
    expect(out.url).toBe('https://oss/a.mp3');
    expect(calls[0].url.startsWith(DASHSCOPE_BASE)).toBe(true);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk-ws-user');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.input.voice).toBe('Bellona');
    expect(body.parameters).toEqual({ speech_rate: 2, volume: 0 });
  });

  it('video: submits async and reads the job states', async () => {
    const calls = mockFetch((url) => url.includes('/tasks/')
      ? { output: { task_status: 'SUCCEEDED', video_url: 'https://oss/v.mp4' } }
      : { output: { task_id: 't-1' } });
    const job = await wanSubmit('sk-ws-user', { prompt: 'p' });
    expect(job.taskId).toBe('t-1');
    expect((calls[0].init.headers as Record<string, string>)['X-DashScope-Async']).toBe('enable');
    expect(await wanStatus('sk-ws-user', 't-1')).toEqual({ status: 'success', url: 'https://oss/v.mp4' });
  });

  it('video: pending is processing, unknown is expired, failed says why', async () => {
    let state = 'RUNNING';
    mockFetch(() => ({ output: { task_status: state, message: 'content blocked' } }));
    expect((await wanStatus('k', 't')).status).toBe('processing');
    state = 'UNKNOWN';
    expect((await wanStatus('k', 't')).status).toBe('expired');
    state = 'FAILED';
    expect(await wanStatus('k', 't')).toEqual({ status: 'failed', error: 'content blocked' });
  });
});

describe('the voice tool on an own key', () => {
  it('goes to DashScope, never to our server', async () => {
    const calls = mockFetch((url) => url.startsWith(DASHSCOPE_BASE)
      ? { output: { audio: { url: 'https://oss/a.mp3' } } }
      : new Uint8Array([1, 2, 3]));
    const dir = await import('node:os').then((os) => os.tmpdir());
    const r = await new GenerateVoiceTool().execute(
      { text: 'hello', filename: 'byok-voice-test' },
      { cwd: dir, sharedState: { getProviderKey: (p: string) => (p === 'qwen' ? 'sk-ws-user' : undefined) } } as never,
    );
    expect(r.success).toBe(true);
    expect(calls.some((c) => c.url.includes('avasupernova.com'))).toBe(false);
    expect(calls[0].url.startsWith(DASHSCOPE_BASE)).toBe(true);
  });
});
