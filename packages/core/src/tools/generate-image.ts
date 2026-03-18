import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Generate an AI image via DashScope (Qwen WanX) and save it to the project.
 *
 * - BYOK users need image credits (uses our Qwen API)
 * - Paid plan users deduct from their token balance
 * - Images are saved to the project's images/ folder with sensible names
 */

const DASHSCOPE_BASE = 'https://dashscope-intl.aliyuncs.com';
const SUBMIT_URL = `${DASHSCOPE_BASE}/api/v1/services/aigc/text2image/image-synthesis`;
const POLL_URL = `${DASHSCOPE_BASE}/api/v1/tasks`;
const MAX_POLLS = 30;
const POLL_INTERVAL_MS = 2000;

const SIZE_MAP: Record<string, string> = {
  'square':    '1024*1024',
  'portrait':  '720*1280',
  'landscape': '1280*720',
  '1024x1024': '1024*1024',
  '720x1280':  '720*1280',
  '1280x720':  '1280*720',
};

export class GenerateImageTool implements Tool {
  readonly name = 'generate_image';
  readonly description = 'Generate an AI image from a text prompt and save it to the project';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'generate_image',
    description:
      'Generate an AI image using text-to-image and save it to the project. ' +
      'Use for custom icons, illustrations, backgrounds, promotional graphics, or any visual asset. ' +
      'Images are saved to the project\'s images/ folder. Provide a descriptive prompt and a meaningful filename. ' +
      'Supports square (1024x1024), portrait (720x1280), and landscape (1280x720) sizes.',
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
          description: 'Image size: square (1024x1024), portrait (720x1280), landscape (1280x720). Default: square.',
        },
        negative_prompt: {
          type: 'string',
          description: 'What to avoid in the image (e.g. "blurry, low quality, text, watermark").',
        },
      },
      required: ['prompt', 'filename'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const prompt = args.prompt as string;
    const rawFilename = (args.filename as string).replace(/\.\w+$/, ''); // strip extension if given
    const size = SIZE_MAP[(args.size as string) || 'square'] || '1024*1024';
    const negativePrompt = (args.negative_prompt as string) || '';

    // Get API key from shared state or env
    const apiKey = this.getApiKey(context);
    if (!apiKey) {
      return {
        success: false,
        output: 'Image generation requires a Qwen API key. Add QWEN_API_KEY to your environment or configure it in Ava settings.',
      };
    }

    context.onOutput?.('Submitting image generation request...\n');

    try {
      // Step 1: Submit async task
      const submitRes = await fetch(SUBMIT_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify({
          model: 'wanx2.1-t2i-turbo',
          input: {
            prompt,
            ...(negativePrompt && { negative_prompt: negativePrompt }),
          },
          parameters: { size, n: 1 },
        }),
      });

      if (!submitRes.ok) {
        const errText = await submitRes.text();
        return { success: false, output: `Image generation failed: ${errText}` };
      }

      const submitData = await submitRes.json() as { output?: { task_id?: string } };
      const taskId = submitData.output?.task_id;
      if (!taskId) {
        return { success: false, output: 'No task ID returned from image service' };
      }

      // Step 2: Poll for completion
      context.onOutput?.('Generating image');
      let imageUrl: string | null = null;

      for (let poll = 0; poll < MAX_POLLS; poll++) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        context.onOutput?.('.');

        const pollRes = await fetch(`${POLL_URL}/${taskId}`, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        if (!pollRes.ok) continue;

        const pollData = await pollRes.json() as {
          output?: { task_status?: string; results?: Array<{ url?: string }>; message?: string };
        };
        const status = pollData.output?.task_status;

        if (status === 'SUCCEEDED') {
          imageUrl = pollData.output?.results?.[0]?.url || null;
          break;
        }
        if (status === 'FAILED') {
          return { success: false, output: `Image generation failed: ${pollData.output?.message || 'Unknown error'}` };
        }
      }

      context.onOutput?.('\n');

      if (!imageUrl) {
        return { success: false, output: 'Image generation timed out after 60 seconds' };
      }

      // Step 3: Download the image
      context.onOutput?.('Downloading image...\n');
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        return { success: false, output: `Failed to download generated image: HTTP ${imageRes.status}` };
      }
      const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

      // Step 4: Save to project images/ folder
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
    } catch (err) {
      return {
        success: false,
        output: `Image generation error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private getApiKey(context: ToolExecutionContext): string | undefined {
    // Check shared state (from extension config)
    const fromState = (context.sharedState as Record<string, unknown>)?.qwenApiKey as string | undefined;
    if (fromState) return fromState;

    // Fallback to environment
    return process.env.QWEN_API_KEY;
  }
}
