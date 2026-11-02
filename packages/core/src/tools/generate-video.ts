import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { startGenerationTracking } from '../dataset/generation-emit.js';
import type { GenerationTracker } from '../dataset/generation-emit.js';
import { wanSubmit, wanWait } from '../creative/dashscope.js';

/**
 * Generate a short AI video (with synchronized audio) from a text prompt with
 * Wan, on the user's own Qwen key: submitted to DashScope, then waited on here
 * (creative/dashscope.ts) until the clip is ready.
 */

export class GenerateVideoTool implements Tool {
  readonly name = 'generate_video';
  readonly requiresProviderKey = 'qwen';
  readonly description = 'Generate a short AI video with synced audio from a text prompt using Wan 2.5.';
  readonly riskLevel: ToolRiskLevel = 'write';
  // Media generation is a real charge on the user's own Qwen account —
  // confirm before running so Ava never spends their money without an explicit yes (palette click or
  // chat confirmation).
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'generate_video',
    description:
      'Generate a short AI video with synchronized audio (2-30s) from a prompt and save to project. '
      + 'Billed by the second on the user\'s own Qwen key, and a longer clip takes proportionally longer to render — ask for what the shot needs.',
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
          description: 'Duration in seconds, 2-30, with synchronized audio. Default 5. Billed by the second on the user\'s own key, and a longer clip takes proportionally longer to render — ask for what the shot needs.',
        },
        resolution: {
          type: 'string',
          enum: ['720P', '1080P'],
          description: 'Output resolution. 720P (default) or 1080P (about twice the cost).',
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
    // 2-30s, the model's own range. This read `=== 10 ? 10 : 5` long after the
    // model stopped having only those two lengths.
    const askedDuration = Number(args.duration);
    const duration = Number.isFinite(askedDuration)
      ? Math.max(2, Math.min(30, Math.round(askedDuration)))
      : 5;
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
        output: 'Video generation needs a Qwen API key — add one in Settings. One Qwen key covers chat, images, voice and video.',
      };
    }

    genManager?.update(jobId, { status: 'generating', progress: 10 });
    context.onOutput?.('Generating video (this may take a few minutes)...\n');

    // The tracker is created AFTER the submit, because the submit returns which
    // model ran. A hardcoded name here once named a model for months after it
    // stopped being the one that ran; the response is the source.
    let tracker: GenerationTracker | null = null;
    const paramsSummary = `duration=${duration}s, resolution=${resolution}`;

    try {
      const job = await wanSubmit(resolved.key, { prompt, duration, resolution }, context.signal);
      tracker = startGenerationTracking({ type: 'video', model: job.model, prompt, paramsSummary });
      const videoUrl = await wanWait(resolved.key, job.taskId, {
        signal: context.signal,
        onTick: () => { genManager?.update(jobId, { status: 'generating', progress: 35 }); context.onOutput?.('.'); },
      });

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

      // No cloud upload. The product is local only: the file on disk is the
      // whole story. An uploader lived here long after the toggle that
      // controlled it was removed — see the removal commit.

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

  /** The user's own Qwen key — it goes straight to DashScope. */
  private resolveKey(context: ToolExecutionContext): { key: string } | null {
    const state = context.sharedState as Record<string, unknown> | undefined;
    const getKey = state?.getProviderKey as ((p: string) => string | undefined) | undefined;
    const qwenKey = getKey?.('qwen');
    return qwenKey ? { key: qwenKey } : null;
  }
}
