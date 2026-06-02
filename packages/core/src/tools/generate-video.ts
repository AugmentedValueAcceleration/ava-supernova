import { writeFile, mkdir } from 'node:fs/promises';
import { persistCreativeAsset } from './creative-asset-sync.js';
import { join, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { startGenerationTracking } from '../dataset/generation-emit.js';
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

const PLATFORM_URL = 'https://ava-supernova.com/api';

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

    const tracker = startGenerationTracking({
      type: 'video',
      model: 'wan2.5-t2v-preview',
      prompt,
      paramsSummary: `duration=${duration}s, resolution=${resolution}`,
    });

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

      const submitData = await submitRes.json() as { task_id?: string; url?: string; error?: string };
      if (submitData.error) throw new Error(submitData.error);

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
      tracker.complete({ fileSizeBytes: videoBuffer.length });

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
      tracker.fail(message);
      return { success: false, output: `Video generation failed: ${message}` };
    }
  }

  /**
   * Poll the platform's async video status route until the job finishes.
   * Runs in the core process (CLI / extension host) with no serverless
   * timeout, on a 5s cadence with an ~8-minute ceiling. Transient poll
   * failures are tolerated — only an explicit `failed` status or the
   * timeout ends the loop.
   */
  private async pollVideoStatus(
    taskId: string,
    key: string,
    genManager: { update: (id: string, p: any) => void } | undefined,
    jobId: string,
    context: ToolExecutionContext,
  ): Promise<string | undefined> {
    const statusUrl = `${PLATFORM_URL}/generate-video/status/${encodeURIComponent(taskId)}`;
    const intervalMs = 5000;
    const maxAttempts = 96; // ~8 min ceiling — well past a typical Wan clip
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, intervalMs));
      let data: { status?: string; url?: string; error?: string } | null = null;
      try {
        const res = await fetch(statusUrl, { headers: { 'Authorization': `Bearer ${key}` } });
        if (!res.ok) continue; // transient — keep polling
        data = await res.json() as { status?: string; url?: string; error?: string };
      } catch {
        continue; // network blip — keep polling until the ceiling
      }
      if (data?.status === 'success' && data?.url) return data.url;
      if (data?.status === 'failed') throw new Error(data?.error || 'Video generation failed');
      // status === 'processing' — surface progress and keep going
      genManager?.update(jobId, { status: 'generating', progress: Math.min(60, 10 + attempt * 3) });
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
    // Video runs on Wan 2.5 via the platform route, which uses the server's
    // DashScope key — so this is platform-only (no provider BYOK path).
    const state = context.sharedState as Record<string, unknown> | undefined;
    const platformKey = state?.platformKey as string | undefined;
    if (platformKey) return { key: platformKey, via: 'platform' };
    return null;
  }
}
