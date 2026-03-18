import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Generate an AI image via DashScope Wan2.6 and save it to the project.
 *
 * Uses the new multimodal-generation endpoint with messages format.
 * Model: wan2.6-image
 */

const DASHSCOPE_BASE = 'https://dashscope-intl.aliyuncs.com';
const API_URL = `${DASHSCOPE_BASE}/api/v1/services/aigc/multimodal-generation/generation`;

const SIZE_MAP: Record<string, string> = {
  'square':    '1280*1280',
  'portrait':  '768*1280',
  'landscape': '1280*768',
  '1024x1024': '1280*1280',
  '720x1280':  '768*1280',
  '1280x720':  '1280*768',
};

export class GenerateImageTool implements Tool {
  readonly name = 'generate_image';
  readonly description = 'Generate an AI image from a text prompt and save it to the project';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'generate_image',
    description:
      'Generate an AI image using Wan2.6 text-to-image and save it to the project. ' +
      'Use for custom icons, illustrations, backgrounds, promotional graphics, or any visual asset. ' +
      'Images are saved to the project\'s images/ folder. Provide a descriptive prompt and a meaningful filename. ' +
      'Supports square (1280x1280), portrait (768x1280), and landscape (1280x768) sizes.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed image description. Be specific about style, colours, composition, subject.',
        },
        filename: {
          type: 'string',
          description: 'Filename without extension (e.g. "dashboard-icon", "hero-background", "icons/settings"). Subdirectories are created automatically.',
        },
        size: {
          type: 'string',
          enum: ['square', 'portrait', 'landscape'],
          description: 'Image size: square (1280x1280), portrait (768x1280), landscape (1280x768). Default: square.',
        },
      },
      required: ['prompt', 'filename'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const prompt = args.prompt as string;
    const rawFilename = (args.filename as string).replace(/\.\w+$/, '');
    const size = SIZE_MAP[(args.size as string) || 'square'] || '1280*1280';

    const apiKey = this.getApiKey(context);
    if (!apiKey) {
      return {
        success: false,
        output: 'Image generation requires a Qwen API key. Configure it in Ava settings (Provider Keys > Qwen).',
      };
    }

    context.onOutput?.('Generating image with Wan2.6...\n');

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'wan2.6-image',
          input: {
            messages: [
              {
                role: 'user',
                content: [{ type: 'text', text: prompt }],
              },
            ],
          },
          parameters: {
            size,
            n: 1,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { success: false, output: `Image generation failed: ${errText}` };
      }

      const data = await res.json() as { output?: { task_id?: string; task_status?: string; results?: Array<{ url?: string }> } };

      // If synchronous response (no async)
      if (data.output?.task_status === 'SUCCEEDED' && data.output?.results?.[0]?.url) {
        return this.downloadAndSave(data.output.results[0].url, rawFilename, size, prompt, context);
      }

      // Async — poll for result
      const taskId = data.output?.task_id;
      if (!taskId) {
        return { success: false, output: `No task ID returned. Response: ${JSON.stringify(data)}` };
      }

      context.onOutput?.('Waiting for image');
      const pollUrl = `${DASHSCOPE_BASE}/api/v1/tasks/${taskId}`;
      const maxPolls = 60;
      const pollInterval = 2000;

      for (let i = 0; i < maxPolls; i++) {
        await new Promise(r => setTimeout(r, pollInterval));
        context.onOutput?.('.');

        const pollRes = await fetch(pollUrl, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        if (!pollRes.ok) continue;

        const pollData = await pollRes.json() as {
          output?: { task_status?: string; results?: Array<{ url?: string }>; message?: string };
        };
        const status = pollData.output?.task_status;

        if (status === 'SUCCEEDED') {
          const imageUrl = pollData.output?.results?.[0]?.url;
          if (!imageUrl) {
            return { success: false, output: 'Image generated but no URL returned' };
          }
          context.onOutput?.('\n');
          return this.downloadAndSave(imageUrl, rawFilename, size, prompt, context);
        }

        if (status === 'FAILED') {
          return { success: false, output: `Image generation failed: ${pollData.output?.message || 'Unknown error'}` };
        }
      }

      return { success: false, output: 'Image generation timed out after 2 minutes' };
    } catch (err) {
      return {
        success: false,
        output: `Image generation error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async downloadAndSave(
    imageUrl: string,
    rawFilename: string,
    size: string,
    prompt: string,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    context.onOutput?.('Downloading image...\n');
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return { success: false, output: `Failed to download generated image: HTTP ${imageRes.status}` };
    }
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

    const filename = `${rawFilename}.png`;
    const savePath = join(context.cwd, 'images', filename);
    await mkdir(dirname(savePath), { recursive: true });
    await writeFile(savePath, imageBuffer);

    const relativePath = `images/${filename}`;
    const sizeKb = (imageBuffer.length / 1024).toFixed(1);

    context.onOutput?.(`Image saved: ${relativePath} (${sizeKb} KB)\n`);

    return {
      success: true,
      output: `Generated and saved image to ${relativePath} (${sizeKb} KB, ${size.replace('*', 'x')})\n\nPrompt: ${prompt}`,
      metadata: {
        path: relativePath,
        absolutePath: savePath,
        size: imageBuffer.length,
        dimensions: size.replace('*', 'x'),
        prompt,
      },
    };
  }

  private getApiKey(context: ToolExecutionContext): string | undefined {
    const state = context.sharedState as Record<string, unknown> | undefined;

    // Check shared state (from extension config — provider.qwen.apiKey)
    const fromState = state?.qwenApiKey as string | undefined;
    if (fromState) return fromState;

    // Fallback to environment
    return process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY;
  }
}
