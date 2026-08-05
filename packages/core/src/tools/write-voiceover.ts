import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { VoiceoverStore } from '../social/index.js';

/**
 * Emit a standalone VOICEOVER — her voice, no clip.
 *
 * write_video_post already renders a voiceover, but only ever as part of a
 * video. When what someone wants is the audio — a read to lay under footage
 * they already shot, a line they want to hear before committing to it — going
 * through write_video_post spends a video generation to get at the audio inside
 * it, and hands back a clip nobody asked for.
 *
 * The split is the same as every other card: this tool does the surface-free
 * work (validate the script, keep the read inside what a voice can carry), and
 * the injected `voiceoverStore` holds the provider key and the wallet.
 *
 * Deliberately NOT the Design Studio's design_generate_voice. That tool speaks
 * through the `designControl` canvas channel, which surfaces outside the Design
 * Studio never mount — allowlisting it into another room registers a tool that
 * answers "no canvas" every single time.
 */
export class WriteVoiceoverTool implements Tool {
  readonly name = 'write_voiceover';
  readonly description =
    'Render a standalone voiceover in your own voice — audio on its own, with no video around it. Use when they ask for a read, narration, or a voiceover without describing a shot.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'write_voiceover',
    description:
      'Render a VOICEOVER ON ITS OWN — your voice, no clip. Use when they ask for a read, narration, or audio without describing anything to SEE; if they describe a shot, that is write_video_post instead, which voices the clip itself — never make both for one idea. YOU author the exact words. Costs credits, so it runs only on a yes.',
    parameters: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description:
            'The exact words to speak, verbatim — what is heard, not read. Short sentences, no hashtags, no emoji, nothing that only works on a page. Unlike a video script this has no picture to stay inside, so write the length the line actually needs rather than trimming to a clip.',
        },
        direction: {
          type: 'string',
          description:
            'How it should be delivered — tone, pace, where to land. One or two sentences in your own words (e.g. "unhurried, quieter on the last line, no advert lilt"). The brand voice is already applied; this is the direction on top of it.',
        },
        title: {
          type: 'string',
          description: 'Short label so the read is identifiable later (e.g. "privacy line — v2").',
        },
        language: {
          type: 'string',
          description: 'Language to voice it in. Defaults to English. To voice a translated read, translate the script YOURSELF and set this — do not ask the generator to translate.',
        },
      },
      required: ['script'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.voiceoverStore as VoiceoverStore | undefined;
    if (!store) {
      return {
        success: false,
        output:
          'Voiceover rendering is not available in this context. The host must inject `voiceoverStore` into shared state.',
      };
    }

    const script = ((args.script as string | undefined) || '').trim();
    if (!script) {
      return { success: false, output: 'write_voiceover requires a `script` — the exact words to speak, authored by you.' };
    }

    // The floor is the generator's, not a style rule: a read this short is a
    // fragment, and the same 3-second minimum that kills short video voiceovers
    // applies to the audio itself. At ~1.9 words a second that is about six
    // words, so eight carries real margin.
    const words = script.split(/\s+/).filter(Boolean).length;
    if (words < 8) {
      return {
        success: false,
        output:
          `That read is only ${words} words — roughly ${(words / 1.92).toFixed(1)}s, and the generator refuses ` +
          `any audio under 3 seconds outright, so it would fail rather than sound short. Write at least 8 words.`,
      };
    }

    // No ceiling. A standalone read has no picture to run past — capping it
    // would be inventing a constraint, which is how the video script budget
    // ended up half filling its clip.

    try {
      const written = await store.write({
        script,
        direction: ((args.direction as string | undefined)?.trim()) || undefined,
        title: ((args.title as string | undefined)?.trim()) || undefined,
        language: ((args.language as string | undefined)?.trim()) || undefined,
      });
      const length = typeof written.seconds === 'number' ? ` (${written.seconds.toFixed(1)}s)` : '';
      return {
        success: true,
        output:
          `Rendered the voiceover${length} — it's on the canvas${written.assetId ? ' and saved to the Library' : ''}. ` +
          `You have not heard it back, so say what you were going for, never how it sounds.`,
        metadata: { url: written.url, seconds: written.seconds ?? null, assetId: written.assetId ?? null },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: `Failed to render the voiceover: ${msg}` };
    }
  }
}
