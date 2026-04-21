import { writeFile, mkdir } from 'node:fs/promises';
import { persistCreativeAsset } from './creative-asset-sync.js';
import { join, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { startGenerationTracking } from '../dataset/generation-emit.js';

/**
 * Generate a short AI video from a text prompt using MiniMax Hailuo.
 *
 * Supports 6-second (1080P) and 10-second (768P) clips.
 * Routes through the Ava platform API which handles async polling internally.
 */

const PLATFORM_URL = 'https://ava-supernova.com/api';

export class GenerateVideoTool implements Tool {
  readonly name = 'generate_video';
  readonly description = 'Generate a short AI video from a text prompt using MiniMax Hailuo.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'generate_video',
    description:
      'Generate a short AI video (6s or 10s) from a prompt and save to project.',
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
          enum: [6, 10],
          description: 'Duration in seconds. 6s at 1080P, 10s at 768P. Default: 6.',
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
    const duration = (args.duration as number) || 6;
    const resolution = duration === 10 ? '768P' : '1080P';
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
        output: 'Video generation requires a MiniMax API key (BYOK) or platform account.',
      };
    }

    genManager?.update(jobId, { status: 'generating', progress: 10 });
    context.onOutput?.('Generating video (this may take a few minutes)...\n');

    const tracker = startGenerationTracking({
      type: 'video',
      model: 'minimax-video',
      prompt,
      paramsSummary: `duration=${duration}s, resolution=${resolution}`,
    });

    try {
      const res = await fetch(`${PLATFORM_URL}/generate-video`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resolved.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, duration, resolution }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Video generation API error (${res.status}): ${errText}`);
      }

      const data = await res.json() as { url?: string; error?: string };
      if (data.error) throw new Error(data.error);
      if (!data.url) throw new Error('No video URL returned from API');

      // Download video buffer
      genManager?.update(jobId, { status: 'downloading', progress: 70 });
      const videoBuffer = await this.downloadVideo(data.url);

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

  private resolveKey(context: ToolExecutionContext): { key: string; via: 'minimax' | 'platform' } | null {
    const state = context.sharedState as Record<string, unknown> | undefined;
    const getKey = state?.getProviderKey as ((p: string) => string | undefined) | undefined;
    const minimaxKey = getKey?.('minimax');
    if (minimaxKey) return { key: minimaxKey, via: 'minimax' };
    const platformKey = state?.platformKey as string | undefined;
    if (platformKey) return { key: platformKey, via: 'platform' };
    return null;
  }
}
