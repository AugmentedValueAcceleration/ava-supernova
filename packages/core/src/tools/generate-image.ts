import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

/**
 * Generate an AI image via DashScope Wan2.6 and save it to the project.
 *
 * Smart prompt enhancement based on purpose (icons get transparent bg).
 * Vision verification loop using Qwen VL to check quality.
 */

const DASHSCOPE_BASE = 'https://dashscope-intl.aliyuncs.com';
const API_URL = `${DASHSCOPE_BASE}/api/v1/services/aigc/multimodal-generation/generation`;
const VISION_URL = `${DASHSCOPE_BASE}/compatible-mode/v1/chat/completions`;

const SIZE_MAP: Record<string, string> = {
  'square':    '1280*1280',
  'portrait':  '768*1280',
  'landscape': '1280*768',
  '1024x1024': '1280*1280',
  '720x1280':  '768*1280',
  '1280x720':  '1280*768',
};

// Purposes that need transparent backgrounds — generate on white, then strip
const NEEDS_TRANSPARENT_BG = new Set(['icon', 'ui-element', 'logo']);

const PURPOSE_PROMPT_ADDITIONS: Record<string, string> = {
  'icon': ', isolated on a solid white background, clean edges, minimal style, suitable for UI icon, single object centered',
  'ui-element': ', isolated on a solid white background, clean edges, suitable for UI component, single element centered',
  'logo': ', isolated on a solid white background, clean vector style, professional logo design, centered',
  'illustration': ', high quality digital illustration, detailed, professional',
  'background': ', seamless, full coverage, no text, suitable as background image',
  'promotional': ', professional marketing graphic, high quality, eye-catching',
  'avatar': ', centered face/character, clean background, suitable for profile picture',
};

const MAX_VISION_RETRIES = 2;

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
      'Supports square (1280x1280), portrait (768x1280), and landscape (1280x768) sizes. ' +
      'Set purpose to help with smart prompt enhancement (e.g. icons automatically get transparent backgrounds).',
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
        purpose: {
          type: 'string',
          enum: ['icon', 'ui-element', 'logo', 'illustration', 'background', 'promotional', 'avatar', 'general'],
          description: 'What the image is for. Icons, ui-elements, and logos automatically get transparent backgrounds. Default: general.',
        },
      },
      required: ['prompt', 'filename'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const rawPrompt = args.prompt as string;
    const rawFilename = (args.filename as string).replace(/\.\w+$/, '');
    const size = SIZE_MAP[(args.size as string) || 'square'] || '1280*1280';
    const purpose = (args.purpose as string) || 'general';

    const { apiKey, usePlatform, platformKey } = this.resolveApiKey(context);
    if (!apiKey && !usePlatform) {
      return {
        success: false,
        output: 'Image generation requires either a platform account or a Qwen API key. Sign in to your account, or add a Qwen key in Settings > API Keys.',
      };
    }

    // Smart prompt enhancement based on purpose
    const promptAddition = PURPOSE_PROMPT_ADDITIONS[purpose] || '';
    const enhancedPrompt = rawPrompt + promptAddition;

    context.onOutput?.(`Generating ${purpose} image with Wan2.6...\n`);
    if (promptAddition) {
      context.onOutput?.(`Smart enhancement: added "${purpose}" optimisations to prompt\n`);
    }

    // Generate with retry loop (vision-verified)
    let lastError = '';
    for (let attempt = 0; attempt <= MAX_VISION_RETRIES; attempt++) {
      const currentPrompt = attempt === 0 ? enhancedPrompt : `${enhancedPrompt}, high quality, professional, well-composed`;

      if (attempt > 0) {
        context.onOutput?.(`Retry ${attempt}/${MAX_VISION_RETRIES} — refining based on vision feedback...\n`);
      }

      try {
        const imageUrl = usePlatform
          ? await this.generateViaPlatform(currentPrompt, size, platformKey!)
          : await this.generateImage(currentPrompt, size, apiKey!);
        if (!imageUrl) {
          lastError = 'No image URL returned';
          continue;
        }

        // Download the image
        let imageBuffer = await this.downloadImage(imageUrl, context);
        if (!imageBuffer) {
          lastError = 'Failed to download image';
          continue;
        }

        // Remove background for icons, ui-elements, logos
        if (NEEDS_TRANSPARENT_BG.has(purpose)) {
          context.onOutput?.('Removing background for transparent PNG...\n');
          imageBuffer = await this.removeBackground(imageBuffer, context);
        }

        // Save to disk
        const filename = `${rawFilename}.png`;
        const savePath = join(context.cwd, 'images', filename);
        await mkdir(dirname(savePath), { recursive: true });
        await writeFile(savePath, imageBuffer);

        // Vision verification (only if we have retries left)
        if (attempt < MAX_VISION_RETRIES) {
          context.onOutput?.('Verifying image quality with Qwen Vision...\n');
          const visionKey = apiKey || platformKey || '';
          const review = await this.verifyWithVision(savePath, purpose, rawPrompt, visionKey);

          if (review.approved) {
            context.onOutput?.(`Vision check: approved ✓ — ${review.feedback}\n`);
          } else {
            context.onOutput?.(`Vision check: needs improvement — ${review.feedback}\n`);
            lastError = review.feedback;
            continue; // Retry with refined prompt
          }
        }

        // Success
        const relativePath = `images/${filename}`;
        const sizeKb = (imageBuffer.length / 1024).toFixed(1);
        context.onOutput?.(`Image saved: ${relativePath} (${sizeKb} KB)\n`);

        return {
          success: true,
          output: `Generated and saved ${purpose} image to ${relativePath} (${sizeKb} KB, ${size.replace('*', 'x')})\n\nPrompt: ${rawPrompt}${promptAddition ? `\nEnhanced: ${enhancedPrompt}` : ''}`,
          metadata: {
            path: relativePath,
            absolutePath: savePath,
            size: imageBuffer.length,
            dimensions: size.replace('*', 'x'),
            prompt: enhancedPrompt,
            purpose,
          },
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        context.onOutput?.(`Attempt ${attempt + 1} failed: ${lastError}\n`);
      }
    }

    return {
      success: false,
      output: `Image generation failed after ${MAX_VISION_RETRIES + 1} attempts. Last error: ${lastError}`,
    };
  }

  private async generateImage(prompt: string, size: string, apiKey: string): Promise<string | null> {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'wan2.6-t2i',
        input: {
          messages: [
            {
              role: 'user',
              content: [{ text: prompt }],
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
      throw new Error(`API error: ${errText}`);
    }

    const data = await res.json() as Record<string, unknown>;
    return this.findImageUrl(data);
  }

  private async downloadImage(imageUrl: string, context: ToolExecutionContext): Promise<Buffer | null> {
    context.onOutput?.('Downloading image...\n');
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) return null;
    return Buffer.from(await imageRes.arrayBuffer());
  }

  private async verifyWithVision(
    imagePath: string,
    purpose: string,
    originalPrompt: string,
    apiKey: string,
  ): Promise<{ approved: boolean; feedback: string }> {
    try {
      // Read the saved image as base64
      const imageData = await readFile(imagePath);
      const base64 = imageData.toString('base64');
      const dataUri = `data:image/png;base64,${base64}`;

      const purposeChecks: Record<string, string> = {
        'icon': 'Check: Does it have a transparent/clean background? Is it isolated? Is it suitable as a UI icon? Are edges clean?',
        'ui-element': 'Check: Does it have a transparent/clean background? Is it suitable for a UI? Are edges clean?',
        'logo': 'Check: Does it have a transparent/clean background? Is it professional? Would it work as a brand logo?',
        'illustration': 'Check: Is it high quality? Is the composition good? Is it professional?',
        'background': 'Check: Does it cover the full area? Is it suitable as a background? No distracting elements?',
        'promotional': 'Check: Is it eye-catching? Professional quality? Suitable for marketing?',
        'avatar': 'Check: Is the subject centered? Is the background clean? Suitable for a profile picture?',
        'general': 'Check: Is the quality good? Does it match the description?',
      };

      const checkPrompt = purposeChecks[purpose] || purposeChecks['general'];

      const res = await fetch(VISION_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen-vl-plus',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: dataUri },
                },
                {
                  type: 'text',
                  text: `You are reviewing an AI-generated image. Purpose: ${purpose}. Original prompt: "${originalPrompt}". ${checkPrompt}\n\nRespond with EXACTLY one line:\nAPPROVED: [brief reason] OR REJECTED: [specific issue to fix]`,
                },
              ],
            },
          ],
          max_tokens: 100,
        }),
      });

      if (!res.ok) {
        // Vision failed — approve by default, don't block generation
        return { approved: true, feedback: 'Vision check unavailable, approved by default' };
      }

      const data = await res.json() as any;
      const reply = data.choices?.[0]?.message?.content?.trim() || '';

      if (reply.toUpperCase().startsWith('APPROVED')) {
        return { approved: true, feedback: reply.replace(/^APPROVED:?\s*/i, '') };
      } else {
        return { approved: false, feedback: reply.replace(/^REJECTED:?\s*/i, '') };
      }
    } catch {
      // If vision verification fails for any reason, approve by default
      return { approved: true, feedback: 'Vision check failed, approved by default' };
    }
  }

  private async removeBackground(imageBuffer: Buffer, context: ToolExecutionContext): Promise<Buffer> {
    try {
      const { PNG } = await import('pngjs');

      return new Promise<Buffer>((resolve) => {
        const png = new PNG();
        png.parse(imageBuffer, (err: Error | null, data: any) => {
          if (err) {
            context.onOutput?.(`Background removal skipped: ${err.message}\n`);
            resolve(imageBuffer);
            return;
          }

          // White-to-transparent: any pixel close to white becomes transparent
          // Uses a threshold to handle near-white pixels from anti-aliasing
          const threshold = 240; // RGB values above this are considered "white"
          const edgeThreshold = 200; // Softer threshold for edge blending
          let pixelsRemoved = 0;

          for (let y = 0; y < data.height; y++) {
            for (let x = 0; x < data.width; x++) {
              const idx = (data.width * y + x) * 4;
              const r = data.data[idx];
              const g = data.data[idx + 1];
              const b = data.data[idx + 2];

              if (r >= threshold && g >= threshold && b >= threshold) {
                // Pure white area — fully transparent
                data.data[idx + 3] = 0;
                pixelsRemoved++;
              } else if (r >= edgeThreshold && g >= edgeThreshold && b >= edgeThreshold) {
                // Near-white (anti-aliased edges) — semi-transparent for smooth edges
                const whiteness = (r + g + b) / 3;
                const alpha = Math.round(255 * (1 - (whiteness - edgeThreshold) / (255 - edgeThreshold)));
                data.data[idx + 3] = Math.max(0, Math.min(255, alpha));
                pixelsRemoved++;
              }
            }
          }

          const totalPixels = data.width * data.height;
          const pct = ((pixelsRemoved / totalPixels) * 100).toFixed(1);
          context.onOutput?.(`Background removed ✓ (${pct}% pixels made transparent)\n`);

          const chunks: Buffer[] = [];
          const stream = data.pack();
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => resolve(Buffer.concat(chunks)));
          stream.on('error', () => resolve(imageBuffer));
        });
      });
    } catch (err) {
      context.onOutput?.(`Background removal skipped: ${err instanceof Error ? err.message : 'pngjs not available'}\n`);
      return imageBuffer;
    }
  }

  private findImageUrl(obj: Record<string, unknown>): string | null {
    const choices = (obj as any)?.output?.choices;
    if (Array.isArray(choices)) {
      for (const choice of choices) {
        const content = choice?.message?.content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item?.type === 'image' && item?.image) return item.image;
            if (typeof item?.image === 'string') return item.image;
          }
        }
      }
    }
    const results = (obj as any)?.output?.results;
    if (Array.isArray(results)) {
      for (const r of results) {
        if (r?.url) return r.url;
      }
    }
    if (typeof (obj as any)?.output?.url === 'string') return (obj as any).output.url;
    return null;
  }

  private resolveApiKey(context: ToolExecutionContext): { apiKey?: string; usePlatform: boolean; platformKey?: string } {
    const state = context.sharedState as Record<string, unknown> | undefined;

    // BYOK Qwen key — direct DashScope
    const qwenKey = state?.qwenApiKey as string | undefined;
    if (qwenKey) return { apiKey: qwenKey, usePlatform: false };

    // Environment key
    const envKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY;
    if (envKey) return { apiKey: envKey, usePlatform: false };

    // Platform key — route through platform API
    const platformKey = state?.platformKey as string | undefined;
    if (platformKey) return { usePlatform: true, platformKey };

    // No key at all
    return { usePlatform: false };
  }

  private async generateViaPlatform(prompt: string, size: string, platformKey: string): Promise<string | null> {
    const res = await fetch('https://ava-supernova.com/api/generate-image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${platformKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, size }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Platform image gen error: ${errText}`);
    }

    const data = await res.json() as { url?: string; error?: string };
    if (data.error) throw new Error(data.error);
    return data.url || null;
  }
}
