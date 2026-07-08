import { writeFile, mkdir } from 'node:fs/promises';
import { persistCreativeAsset } from './creative-asset-sync.js';
import { join, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { startGenerationTracking } from '../dataset/generation-emit.js';
import { chargeCredits } from '../billing/meter.js';

/**
 * Generate AI voice/speech from text via Qwen3-TTS.
 *
 * You author the script and the delivery; pick a voice from the roster and set
 * the spoken language. Routes through the Ava platform API.
 */

const PLATFORM_URL = 'https://ava-supernova.com/api';

export class GenerateVoiceTool implements Tool {
  readonly name = 'generate_voice';
  readonly description = 'Generate AI voice/speech from text via Qwen3-TTS.';
  readonly riskLevel: ToolRiskLevel = 'write';
  // Media generation costs credits — confirm before running so Ava never
  // spends the user's balance without an explicit yes (palette click or
  // chat confirmation).
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'generate_voice',
    description:
      'Generate AI voice/speech from text and save to project. Pick a voice from the roster; set the spoken language and delivery instructions.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The exact words to speak, verbatim.',
        },
        filename: {
          type: 'string',
          description: 'Output filename without extension (e.g. "intro-narration")',
        },
        voice: {
          type: 'string',
          enum: ['Cherry', 'Serena', 'Vivian', 'Maia', 'Bellona', 'Ethan', 'Moon', 'Vincent', 'Neil', 'Kai'],
          description: 'Voice from the Qwen3-TTS roster. Default: Cherry.',
        },
        language: {
          type: 'string',
          description:
            'The spoken language (e.g. "English", "French", "Japanese"). Default "English". To voice a translated read, translate the text yourself and set this — the same voice speaks it.',
        },
        instructions: {
          type: 'string',
          description:
            'Delivery direction: tone, pace, emotion, energy (e.g. "warm, unhurried, reassuring"). There is no numeric speed knob — shape the read here.',
        },
      },
      required: ['text', 'filename'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const text = args.text as string;
    const filename = (args.filename as string).replace(/\.\w+$/, '');
    const voice = (args.voice as string) || 'Cherry';
    const language = (args.language as string) || 'English';
    const instructions = (args.instructions as string) || undefined;
    const targetPath = args.target_path as string | undefined;

    const genManager = (context.sharedState as Record<string, unknown>)?.generationManager as
      { create: (j: any) => any; update: (id: string, p: any) => void; complete: (id: string, m?: any) => void; fail: (id: string, e: string) => void } | undefined;
    const jobId = `vox-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const defaultPath = `.ava/creative/voice/${filename}.mp3`;
    genManager?.create({ id: jobId, type: 'voice', prompt: text.slice(0, 100), filename, targetPath: targetPath || defaultPath });

    const resolved = this.resolveKey(context);
    if (!resolved) {
      genManager?.fail(jobId, 'No API key');
      return {
        success: false,
        output: 'Voice generation requires a Qwen API key (BYOK) or platform account.',
      };
    }

    genManager?.update(jobId, { status: 'generating', progress: 10 });
    context.onOutput?.('Generating voice...\n');

    const tracker = startGenerationTracking({
      type: 'voice',
      model: 'qwen3-tts',
      prompt: text,
      paramsSummary: `voice=${voice}, language=${language}`,
    });

    try {
      const res = await fetch(`${PLATFORM_URL}/generate-voice`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resolved.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, voice, language_type: language, instructions }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Voice generation API error (${res.status}): ${errText}`);
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
      context.onOutput?.(`Voice saved: ${relativePath} (${sizeKb} KB)\n`);

      const meta = { path: relativePath, absolutePath: savePath, size: audioBuffer.length, voice, language, textLength: text.length };
      genManager?.complete(jobId, meta);
      tracker.complete({ fileSizeBytes: audioBuffer.length });

      persistCreativeAsset(context, {
        assetType: 'voice',
        filename: relativePath.split(/[\\/]/).pop() || 'voice.mp3',
        contentType: 'audio/mpeg',
        bytes: audioBuffer,
        title: text.slice(0, 100),
        prompt: text,
      });

      chargeCredits('voice_gen');
      return {
        success: true,
        output: `Generated voice and saved to ${relativePath}`,
        metadata: meta,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      genManager?.fail(jobId, message);
      tracker.fail(message);
      return { success: false, output: `Voice generation failed: ${message}` };
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

  private resolveKey(context: ToolExecutionContext): { key: string; via: 'qwen' | 'platform' } | null {
    const state = context.sharedState as Record<string, unknown> | undefined;
    const getKey = state?.getProviderKey as ((p: string) => string | undefined) | undefined;
    const qwenKey = getKey?.('qwen');
    if (qwenKey) return { key: qwenKey, via: 'qwen' };
    const platformKey = state?.platformKey as string | undefined;
    if (platformKey) return { key: platformKey, via: 'platform' };
    return null;
  }
}
