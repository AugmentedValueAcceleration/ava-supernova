import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { removeWhiteBackground } from '../creative/image-local.js';

/**
 * Remove the background from an image, making white/near-white pixels transparent.
 * Works best on images with solid white or light backgrounds.
 */

export class RemoveBackgroundTool implements Tool {
  readonly name = 'remove_background';
  readonly description = 'Remove the background from an image, making it transparent';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'remove_background',
    description:
      'Remove the background from a PNG/JPG image, making white or light pixels transparent. ' +
      'Works best on images with solid white or light backgrounds. ' +
      'Can save to a new file or overwrite the original. ' +
      'Useful for making icons transparent, extracting elements from screenshots, cleaning up generated images.',
    parameters: {
      type: 'object',
      properties: {
        input_path: {
          type: 'string',
          description: 'Path to the input image (relative to project root). e.g. "images/logo.png"',
        },
        output_path: {
          type: 'string',
          description: 'Path for the output image. If omitted, appends "-transparent" to the filename. e.g. "images/logo-transparent.png"',
        },
        threshold: {
          type: 'number',
          description: 'RGB threshold for "white" detection (0-255). Higher = only pure white removed. Lower = more aggressive. Default: 240.',
        },
        edge_softness: {
          type: 'number',
          description: 'How much to soften edges (0-255). Higher = softer anti-aliased edges. Default: 40.',
        },
      },
      required: ['input_path'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const inputPath = args.input_path as string;
    const threshold = Math.min(255, Math.max(0, (args.threshold as number) || 240));
    const edgeSoftness = Math.min(255, Math.max(0, (args.edge_softness as number) || 40));

    const absInput = join(context.cwd, inputPath);

    // Default output: input-transparent.png
    const outputPath = (args.output_path as string) ||
      inputPath.replace(extname(inputPath), '-transparent.png');
    const absOutput = join(context.cwd, outputPath);

    context.onOutput?.(`Reading ${inputPath}...\n`);

    try {
      const imageBuffer = await readFile(absInput);
      // The one shared matte (creative/image-local.ts) — the same method the
      // Design Studio now runs on the user's machine. PNG and JPEG.
      const { png: result, removedFraction } = await removeWhiteBackground(imageBuffer, { threshold, edgeSoftness });
      context.onOutput?.(`Removed background from ${(removedFraction * 100).toFixed(1)}% of pixels\n`);

      await mkdir(dirname(absOutput), { recursive: true });
      await writeFile(absOutput, result);

      const sizeKb = (result.length / 1024).toFixed(1);
      context.onOutput?.(`Saved: ${outputPath} (${sizeKb} KB)\n`);

      return {
        success: true,
        output: `Background removed and saved to ${outputPath} (${sizeKb} KB)\n\nSettings: threshold=${threshold}, edge_softness=${edgeSoftness}`,
        metadata: {
          path: outputPath,
          absolutePath: absOutput,
          size: result.length,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Background removal failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
