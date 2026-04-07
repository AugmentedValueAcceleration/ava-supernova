import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

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
      },
      required: ['prompt', 'filename'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const prompt = args.prompt as string;
    const filename = (args.filename as string).replace(/\.\w+$/, '');
    const duration = (args.duration as number) || 6;
    const resolution = duration === 10 ? '768P' : '1080P';

    const resolved = this.resolveKey(context);
    if (!resolved) {
      return {
        success: false,
        output: 'Video generation requires a MiniMax API key (BYOK) or platform account.',
      };
    }

    context.onOutput?.('Generating video (this may take a few minutes)...\n');

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
      const videoBuffer = await this.downloadVideo(data.url);

      // Save to project
      const savePath = join(context.cwd, '.ava', 'creative', 'video', `${filename}.mp4`);
      await mkdir(dirname(savePath), { recursive: true });
      await writeFile(savePath, videoBuffer);

      const relativePath = `.ava/creative/video/${filename}.mp4`;
      const sizeMb = (videoBuffer.length / (1024 * 1024)).toFixed(1);
      context.onOutput?.(`Video saved: ${relativePath} (${sizeMb} MB)\n`);

      return {
        success: true,
        output: `Generated ${duration}s ${resolution} video and saved to ${relativePath}`,
        metadata: {
          path: relativePath,
          absolutePath: savePath,
          size: videoBuffer.length,
          duration,
          resolution,
          prompt,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
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
