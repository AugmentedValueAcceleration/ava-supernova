import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Generate AI voice/speech from text using MiniMax TTS.
 *
 * Multiple voice options available with configurable speed.
 * Routes through the Ava platform API.
 */

const PLATFORM_URL = 'https://ava-supernova.com/api';

export class GenerateVoiceTool implements Tool {
  readonly name = 'generate_voice';
  readonly description = 'Generate AI voice/speech from text using MiniMax TTS.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'generate_voice',
    description:
      'Generate AI voice/speech from text and save to project. Multiple voice options available.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to speak',
        },
        filename: {
          type: 'string',
          description: 'Output filename without extension (e.g. "intro-narration")',
        },
        voice_id: {
          type: 'string',
          enum: [
            'Calm_Woman',
            'Wise_Woman',
            'Friendly_Person',
            'Inspirational_girl',
            'Deep_Voice_Man',
            'Calm_Man',
            'Newsman',
            'Lively_Girl',
            'Patient_Man',
            'Determined_Man',
          ],
          description: 'Voice to use. Default: Calm_Woman.',
        },
        speed: {
          type: 'number',
          description: 'Speech speed multiplier. Default: 1.0. Range: 0.5-2.0.',
        },
      },
      required: ['text', 'filename'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const text = args.text as string;
    const filename = (args.filename as string).replace(/\.\w+$/, '');
    const voiceId = (args.voice_id as string) || 'Calm_Woman';
    const speed = (args.speed as number) || 1.0;

    const resolved = this.resolveKey(context);
    if (!resolved) {
      return {
        success: false,
        output: 'Voice generation requires a MiniMax API key (BYOK) or platform account.',
      };
    }

    context.onOutput?.('Generating voice...\n');

    try {
      const res = await fetch(`${PLATFORM_URL}/generate-voice`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resolved.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, voice_id: voiceId, speed }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Voice generation API error (${res.status}): ${errText}`);
      }

      const data = await res.json() as { url?: string; error?: string };
      if (data.error) throw new Error(data.error);
      if (!data.url) throw new Error('No audio URL returned from API');

      // Download audio buffer
      const audioBuffer = await this.downloadAudio(data.url);

      // Save to project
      const savePath = join(context.cwd, '.ava', 'creative', 'voice', `${filename}.mp3`);
      await mkdir(dirname(savePath), { recursive: true });
      await writeFile(savePath, audioBuffer);

      const relativePath = `.ava/creative/voice/${filename}.mp3`;
      const sizeKb = (audioBuffer.length / 1024).toFixed(1);
      context.onOutput?.(`Voice saved: ${relativePath} (${sizeKb} KB)\n`);

      return {
        success: true,
        output: `Generated voice and saved to ${relativePath}`,
        metadata: {
          path: relativePath,
          absolutePath: savePath,
          size: audioBuffer.length,
          voiceId,
          speed,
          textLength: text.length,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
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
