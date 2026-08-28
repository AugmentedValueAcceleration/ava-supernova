import { writeFile, mkdir } from 'node:fs/promises';
import { persistCreativeAsset } from './creative-asset-sync.js';
import { join, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { startGenerationTracking } from '../dataset/generation-emit.js';
import type { GenerationTracker } from '../dataset/generation-emit.js';
import { chargeCredits } from '../billing/meter.js';

/**
 * Generate a short AI video (with synchronized audio) from a text prompt
 * using Wan 2.5 on the Ava platform.
 *
 * Supports 5-second and 10-second clips at 720P. The platform submit
 * endpoint is async — it returns a task_id and the clip is produced over
 * the next 1–6 minutes — so this tool submits, then polls the status
 * route until the job reaches a terminal state.
 */

const PLATFORM_URL = 'https://avasupernova.com/api';
  /**
   * How long to keep asking, and how often.
   *
   * Measured 28 August on wan3.0: two 30-second renders of the same shape took
   * 8 minutes and 25 minutes. The spread is queue contention rather than clip
   * length, so a short clip is not reliably quick either. The old ceiling was
   * 8 minutes, set when wan2.5 only made 5 and 10 second clips.
   *
   * A timeout is the most expensive failure available to us: the render
   * succeeds, we are billed, and the user is told it failed. So the ceiling is
   * generous, and the cadence backs off instead - 5s while it might genuinely
   * be about to land, 15s once we are plainly waiting. That is FEWER requests
   * across a 25-minute render than the old loop made across an 8-minute one.
   */
const POLL_CEILING_MS = 45 * 60 * 1000;
const POLL_FAST_WINDOW_MS = 2 * 60 * 1000;
const POLL_FAST_MS = 5000;
const POLL_SLOW_MS = 15000;

export class GenerateVideoTool implements Tool {
  readonly name = 'generate_video';
  readonly description = 'Generate a short AI video with synced audio from a text prompt using Wan 2.5.';
  readonly riskLevel: ToolRiskLevel = 'write';
  // Media generation costs credits — confirm before running so Ava never
  // spends the user's balance without an explicit yes (palette click or
  // chat confirmation).
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'generate_video',
    description:
      'Generate a short AI video with synchronized audio (5s or 10s) from a prompt and save to project.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Video description — scene, style, mood, action',
        },
        filename: {
          type: 'string',
          description: 'Output filename without extension (e.g. "intro-clip")',
        },
        duration: {
          type: 'number',
          enum: [5, 10],
          description: 'Duration in seconds. 5 or 10, with synchronized audio. Default: 5.',
        },
        resolution: {
          type: 'string',
          enum: ['720P', '1080P'],
          description: 'Output resolution. 720P (default) or 1080P (~2× the credit cost).',
        },
        target_path: {
          type: 'string',
          description: 'Exact path relative to project root for the video. Overrides default .ava/creative/video/ folder.',
        },
      },
      required: ['prompt', 'filename'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const prompt = args.prompt as string;
    const filename = (args.filename as string).replace(/\.\w+$/, '');
    const duration = (args.duration as number) === 10 ? 10 : 5;
    const resolution = args.resolution === '1080P' ? '1080P' : '720P';
    const targetPath = args.target_path as string | undefined;

    const genManager = (context.sharedState as Record<string, unknown>)?.generationManager as
      { create: (j: any) => any; update: (id: string, p: any) => void; complete: (id: string, m?: any) => void; fail: (id: string, e: string) => void } | undefined;
    const jobId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const defaultPath = `.ava/creative/video/${filename}.mp4`;
    genManager?.create({ id: jobId, type: 'video', prompt, filename, targetPath: targetPath || defaultPath });

    const resolved = this.resolveKey(context);
    if (!resolved) {
      genManager?.fail(jobId, 'No API key');
      return {
        success: false,
        output: 'Video generation requires an Ava platform account.',
      };
    }

    genManager?.update(jobId, { status: 'generating', progress: 10 });
    context.onOutput?.('Generating video (this may take a few minutes)...\n');

    // The tracker is created AFTER the submit, because core does not choose the
    // model — the platform route does, and it returns which one it used. This
    // recorded 'wan2.5-t2v-preview' for months after the route moved to
    // wan3.0-video, so every usage row for a Design Studio clip named a model
    // that had not run. A hardcoded name here is a second copy of a fact that
    // lives somewhere else; the response is the source.
    let tracker: GenerationTracker | null = null;
    const paramsSummary = `duration=${duration}s, resolution=${resolution}`;

    try {
      // Submit the async job — the platform returns a task_id immediately.
      const submitRes = await fetch(`${PLATFORM_URL}/generate-video`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resolved.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, duration, resolution }),
      });

      if (!submitRes.ok) {
        const errText = await submitRes.text();
        throw new Error(`Video generation API error (${submitRes.status}): ${errText}`);
      }

      const submitData = await submitRes.json() as {
        task_id?: string; url?: string; error?: string; model?: string;
      };
      if (submitData.error) throw new Error(submitData.error);

      tracker = startGenerationTracking({
        type: 'video',
        // What the route says it ran. 'unknown' rather than a guess if an older
        // deployment does not report it — an honest gap beats a wrong label.
        model: submitData.model || 'unknown',
        prompt,
        paramsSummary,
      });

      // Poll the status route until the clip is ready (Wan runs 1–6 min).
      // A synchronous `url` (legacy path) is honoured if ever present.
      let videoUrl = submitData.url;
      if (!videoUrl && submitData.task_id) {
        videoUrl = await this.pollVideoStatus(submitData.task_id, resolved.key, genManager, jobId, context);
      }
      if (!videoUrl) throw new Error('No video URL returned from API');

      // Download video buffer
      genManager?.update(jobId, { status: 'downloading', progress: 70 });
      const videoBuffer = await this.downloadVideo(videoUrl);

      // Save to project — use target_path if provided
      const relativePath = targetPath || `.ava/creative/video/${filename}.mp4`;
      const savePath = join(context.cwd, relativePath);
      await mkdir(dirname(savePath), { recursive: true });
      await writeFile(savePath, videoBuffer);

      const sizeMb = (videoBuffer.length / (1024 * 1024)).toFixed(1);
      context.onOutput?.(`Video saved: ${relativePath} (${sizeMb} MB)\n`);

      const meta = { path: relativePath, absolutePath: savePath, size: videoBuffer.length, duration, resolution, prompt };
      genManager?.complete(jobId, meta);
      tracker?.complete({ fileSizeBytes: videoBuffer.length });

      persistCreativeAsset(context, {
        assetType: 'video',
        filename: relativePath.split(/[\\/]/).pop() || 'video.mp4',
        contentType: 'video/mp4',
        bytes: videoBuffer,
        title: prompt.slice(0, 100),
        prompt,
      });

      chargeCredits('video_gen');
      return {
        success: true,
        output: `Generated ${duration}s ${resolution} video and saved to ${relativePath}`,
        metadata: meta,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      genManager?.fail(jobId, message);
      // A submit that never got as far as a task_id has no tracker yet, and the
      // started/failed pair is still worth having — so make one to fail.
      (tracker ?? startGenerationTracking({
        type: 'video', model: 'unknown', prompt, paramsSummary,
      })).fail(message);
      return { success: false, output: `Video generation failed: ${message}` };
    }
  }

  /**
   * Poll the platform's async video status route until the job finishes.
   * Runs in the core process (CLI / extension host) with no serverless timeout.
   * Transient poll failures are tolerated — only an explicit `failed` status or
   * the ceiling ends the loop. See POLL_CEILING_MS for why it is what it is.
   */
  private async pollVideoStatus(
    taskId: string,
    key: string,
    genManager: { update: (id: string, p: any) => void } | undefined,
    jobId: string,
    context: ToolExecutionContext,
  ): Promise<string | undefined> {
    const statusUrl = `${PLATFORM_URL}/generate-video/status/${encodeURIComponent(taskId)}`;
    const started = Date.now();
    const deadline = started + POLL_CEILING_MS;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, Date.now() - started < POLL_FAST_WINDOW_MS
        ? POLL_FAST_MS : POLL_SLOW_MS));
      let data: { status?: string; url?: string; error?: string } | null;
      try {
        const res = await fetch(statusUrl, { headers: { 'Authorization': `Bearer ${key}` } });
        if (!res.ok) continue; // transient — keep polling
        data = await res.json() as { status?: string; url?: string; error?: string };
      } catch {
        continue; // network blip — keep polling until the ceiling
      }
      if (data?.status === 'success' && data?.url) return data.url;
      if (data?.status === 'failed') throw new Error(data?.error || 'Video generation failed');
      // status === 'processing' — keep going. The progress number is a STAGE
      // marker, not a measurement: Wan reports a state and never a percentage,
      // so a creeping number (this used to reach 60% on a timer) tells the user
      // something we do not know. The surfaces read `status` and show elapsed
      // time, which is a fact.
      genManager?.update(jobId, { status: 'generating', progress: 35 });
      context.onOutput?.('.');
    }
    throw new Error('Video generation timed out');
  }

  private async downloadVideo(url: string): Promise<Buffer> {
    if (url.startsWith('data:')) {
      const base64 = url.split(',')[1];
      if (!base64) throw new Error('Invalid data URI');
      return Buffer.from(base64, 'base64');
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download video (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  private resolveKey(context: ToolExecutionContext): { key: string; via: 'platform' } | null {
    // Video runs via the platform route, which uses the server's DashScope key
    // and chooses the model itself — so this is platform-only (no provider BYOK
    // path), and core deliberately does not name the model anywhere.
    const state = context.sharedState as Record<string, unknown> | undefined;
    const platformKey = state?.platformKey as string | undefined;
    if (platformKey) return { key: platformKey, via: 'platform' };
    return null;
  }
}
