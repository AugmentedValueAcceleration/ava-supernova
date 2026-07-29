import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import { imageSizeFor, type PostImageStore, type PostImageInput } from '../social/index.js';

/**
 * Make the picture that goes with a post — or repair one that nearly works.
 *
 * Two things are deliberate here:
 *
 * SIZE IS DERIVED, NEVER ASKED FOR. The schema has no width, height or aspect
 * ratio, because a model that can choose a resolution can choose the wrong one
 * and a 1:1 image on a Reel is a wasted generation. She names the platform; the
 * spec map answers.
 *
 * EDIT IS THE FIRST INSTINCT, NOT THE FALLBACK. `reference_image` switches the
 * provider to the edit family so an instruction changes only the part that is
 * wrong. Re-rolling a picture that is 90% right throws away the 90% and gambles
 * on getting it back — the same reasoning as repairing a recipe rather than
 * generating another one.
 */
export class WritePostImageTool implements Tool {
  readonly name = 'write_post_image';
  readonly description =
    'Make the image for a post, sized for its platform — or edit an existing image instead of replacing it.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'write_post_image',
    description:
      'Make the picture that goes with a post, sized correctly for its platform. Use when a post needs a visual — you do NOT need to send them to the Design Studio for this. To FIX an image that is nearly right, pass its URL as reference_image and describe only the change: that edits it rather than generating a new one, which keeps everything that already worked. Check the canvas and browse_library first — the image you want may already exist.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'What the picture shows — subject, composition, style, mood, lighting. Concrete and visual. When editing, describe ONLY the change ("make the headline bigger", "remove the coffee cup"), not the whole picture again.',
        },
        platform: {
          type: 'string',
          enum: ['tweet', 'x', 'linkedin', 'facebook', 'instagram', 'tiktok', 'youtube', 'blog', 'post'],
          description: 'Where the post is going. This decides the image size — you never specify dimensions.',
        },
        format: {
          type: 'string',
          enum: ['feed', 'reel', 'story', 'short'],
          description: 'The shape within that platform. Facebook and Instagram need this: a feed image and a Reel are different shapes on the same platform. Omit for platforms with only one shape.',
        },
        reference_image: {
          type: 'string',
          description: 'URL of an existing image to EDIT. Pass this whenever you are fixing or adjusting something that already exists — including an image from the Library. Leave empty only when making something genuinely new.',
        },
        negative_prompt: {
          type: 'string',
          description: 'What to keep OUT of the frame.',
        },
        title: { type: 'string', description: 'Optional short title for the Library.' },
      },
      required: ['prompt', 'platform'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.postImageStore as PostImageStore | undefined;
    if (!store) {
      return {
        success: false,
        output: 'Post images are not available in this context. The host must inject `postImageStore` into shared state.',
      };
    }

    const prompt = ((args.prompt as string | undefined) || '').trim();
    if (!prompt) {
      return { success: false, output: 'write_post_image requires a prompt — describe the picture, or the change you want made.' };
    }

    const platform = ((args.platform as string | undefined) || 'post').trim();
    const format = ((args.format as string | undefined) || '').trim() || undefined;
    const referenceImage = ((args.reference_image as string | undefined) || '').trim() || undefined;

    const image: PostImageInput = {
      prompt,
      platform,
      format,
      referenceImage,
      negativePrompt: ((args.negative_prompt as string | undefined)?.trim()) || undefined,
      title: ((args.title as string | undefined)?.trim()) || undefined,
    };

    try {
      const written = await store.write(image);
      // Say which shape it came out at. She cannot see the picture, so the size
      // is the one concrete fact about it she is allowed to state.
      const what = written.edited ? 'Edited the image' : 'Made the image';
      return {
        success: true,
        output:
          `${what} for ${platform}${format ? ` (${format})` : ''} at ${written.size}. It is on the canvas. ` +
          `You have NOT seen it — ask them what to change rather than whether it looks right, and when they tell you, ` +
          `edit it with reference_image rather than generating another one.`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Could not make the image: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

/** Exported for the size table's own sake — hosts and tests resolve sizes the
 *  same way the tool does, rather than duplicating the map. */
export { imageSizeFor };
