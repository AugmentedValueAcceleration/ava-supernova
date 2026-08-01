import { writeFile, mkdir } from 'node:fs/promises';
import { persistCreativeAsset } from './creative-asset-sync.js';
import { join, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { startGenerationTracking } from '../dataset/generation-emit.js';
import { chargeCredits } from '../billing/meter.js';

/**
 * Generate AI music from a text prompt using MiniMax.
 *
 * Supports instrumental tracks and vocal tracks with lyrics.
 * Routes through the Ava platform API.
 */

const PLATFORM_URL = 'https://avasupernova.com/api';

export class GenerateMusicTool implements Tool {
  readonly name = 'generate_music';
  readonly description = 'Generate AI music from a text prompt. Supports instrumental and vocal tracks with lyrics.';
  readonly riskLevel: ToolRiskLevel = 'write';
  // Media generation costs credits — confirm before running so Ava never
  // spends the user's balance without an explicit yes (palette click or
  // chat confirmation).
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'generate_music',
    description:
      'Generate AI music from a prompt and save to project. Can create instrumental tracks or vocal tracks with lyrics.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Music description — genre, mood, instrumentation, tempo',
        },
        lyrics: {
          type: 'string',
          description: 'Optional song lyrics. If provided, generates vocal track. Omit for instrumental.',
        },
        filename: {
          type: 'string',
          description: 'Output filename without extension (e.g. "background-music")',
        },
      },
      required: ['prompt', 'filename'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const prompt = args.prompt as string;
    const lyrics = args.lyrics as string | undefined;
    const filename = (args.filename as string).replace(/\.\w+$/, '');
    const targetPath = args.target_path as string | undefined;

    const genManager = (context.sharedState as Record<string, unknown>)?.generationManager as
      { create: (j: any) => any; update: (id: string, p: any) => void; complete: (id: string, m?: any) => void; fail: (id: string, e: string) => void } | undefined;
    const jobId = `mus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const defaultPath = `.ava/creative/audio/${filename}.mp3`;
    genManager?.create({ id: jobId, type: 'music', prompt, filename, targetPath: targetPath || defaultPath });

    const resolved = this.resolveKey(context);
    if (!resolved) {
      genManager?.fail(jobId, 'No API key');
      return {
        success: false,
        output: 'Music generation requires a MiniMax API key (BYOK) or platform account.',
      };
    }

    genManager?.update(jobId, { status: 'generating', progress: 10 });
    context.onOutput?.('Generating music...\n');

    const tracker = startGenerationTracking({
      type: 'music',
      model: 'minimax-music',
      prompt,
      paramsSummary: lyrics ? 'with-lyrics' : 'instrumental',
    });

    try {
      const body: Record<string, unknown> = { prompt };
      if (lyrics) body.lyrics = lyrics;

      const res = await fetch(`${PLATFORM_URL}/generate-music`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resolved.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Music generation API error (${res.status}): ${errText}`);
      }

      const data = await res.json() as { url?: string; error?: string };
      if (data.error) throw new Error(data.error);
      if (!data.url) throw new Error('No audio URL returned from API');

      // Download audio buffer
      genManager?.update(jobId, { status: 'downloading', progress: 70 });
      const audioBuffer = await this.downloadAudio(data.url);

      // Save to project — use target_path if provided
      const relativePath = targetPath || defaultPath;
      const savePath = join(context.cwd, relativePath);
      await mkdir(dirname(savePath), { recursive: true });
      await writeFile(savePath, audioBuffer);

      const sizeKb = (audioBuffer.length / 1024).toFixed(1);
      context.onOutput?.(`Music saved: ${relativePath} (${sizeKb} KB)\n`);

      const meta = { path: relativePath, absolutePath: savePath, size: audioBuffer.length, prompt, hasLyrics: !!lyrics };
      genManager?.complete(jobId, meta);
      tracker.complete({ fileSizeBytes: audioBuffer.length });

      persistCreativeAsset(context, {
        assetType: 'music',
        filename: relativePath.split(/[\\/]/).pop() || 'track.mp3',
        contentType: 'audio/mpeg',
        bytes: audioBuffer,
        title: prompt.slice(0, 100),
        prompt,
      });

      chargeCredits('music_gen');
      return {
        success: true,
        output: `Generated music and saved to ${relativePath}`,
        metadata: meta,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      genManager?.fail(jobId, message);
      tracker.fail(message);
      return { success: false, output: `Music generation failed: ${message}` };
    }
  }

  private async downloadAudio(url: string): Promise<Buffer> {
    if (url.startsWith('data:')) {
      const base64 = url.split(',')[1];
      if (!base64) throw new Error('Invalid data URI');
      return Buffer.from(base64, 'base64');
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download audio (${res.status})`);
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
