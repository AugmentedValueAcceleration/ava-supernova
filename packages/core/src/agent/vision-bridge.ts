/**
 * Vision bridge — let a TEXT-ONLY coordinator "see" images.
 *
 * Models like DeepSeek V4 (Supernova) and Mistral Codestral (Aurora) have no
 * vision. When an image is attached, instead of stripping it and telling the
 * user to switch models, we run a vision-capable model (e.g. Qwen 3.5 Omni
 * Plus) ONCE to describe the image, then inject that description as text — so
 * the text-only model can act on it as if it had seen it.
 *
 * Shared by the main Agent and the Conductor (per-persona) so direct turns and
 * orchestrated turns behave the same. Descriptions are cached per image (by
 * data URL) so we don't re-run the vision model every turn.
 */

import type { Provider } from '../providers/types.js';
import type { ModelDefinition, Message, ContentPart } from '../core/types.js';
import { logger } from '../core/logger.js';

const DESCRIBE_PROMPT =
  'You are a vision relay for a text-only AI coding/agent model that CANNOT see this image. ' +
  'Describe it in thorough, specific detail so that model can act on it as if it had seen it. ' +
  'Transcribe ALL visible text, code, error messages and UI labels verbatim. Describe layout, ' +
  'components, colours, shapes and anything a developer would need. Do not summarise away detail, ' +
  'and do not add commentary — just the description.';

/** Describe a single image with the vision model. Cached by data URL; returns
 *  null on failure or timeout so callers can fall back gracefully. */
export async function describeImageWithVision(
  visionProvider: Provider,
  visionModel: ModelDefinition,
  image: { url: string; detail?: string },
  cache: Map<string, string>,
): Promise<string | null> {
  if (!image?.url) return null;
  const cached = cache.get(image.url);
  if (cached) return cached;
  try {
    const response = await Promise.race([
      visionProvider.createCompletion({
        model: visionModel.id,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: image },
            { type: 'text', text: DESCRIBE_PROMPT },
          ],
        }],
        max_tokens: 900,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 45_000)),
    ]);
    const content = response?.choices?.[0]?.message?.content;
    const desc = typeof content === 'string' ? content.trim() : '';
    if (desc) { cache.set(image.url, desc); return desc; }
    return null;
  } catch (err) {
    logger.debug(`[vision-bridge] describe failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function fallbackNote(model: ModelDefinition): string {
  return [
    `Your current model (${model.name || model.id}) doesn't support images.`,
    'To analyse images, switch to a vision-capable model:',
    '- Qwen 3.7 Plus / Qwen 3.5 Omni Plus / Omni Flash (multimodal)',
    '- Kimi K2.5, GLM-5.2, Mistral Large, Claude (BYOK)',
  ].join('\n');
}

/**
 * For a TEXT-ONLY model, return a copy of `messages` where image content is
 * replaced by a vision-model description (or a "switch model" note when no
 * vision provider is configured), and image-free array content is flattened to
 * a string. No-op (returns the same array) for vision-capable models.
 */
export async function bridgeImagesForTextModel(
  messages: Message[],
  model: ModelDefinition,
  visionProvider: Provider | undefined,
  visionModel: ModelDefinition | undefined,
  cache: Map<string, string>,
): Promise<Message[]> {
  if (model.supportsVision) return messages;

  const out: Message[] = [];
  for (const m of messages) {
    if (!Array.isArray(m.content)) { out.push(m); continue; }
    const parts = m.content as ContentPart[];
    const textPrefix = parts.filter((p) => p.type === 'text').map((p) => (p as { text: string }).text).join('\n');
    const imageParts = parts.filter((p) => p.type === 'image_url');

    if (imageParts.length === 0) {
      out.push({ ...m, content: textPrefix });
      continue;
    }

    let block: string;
    if (visionProvider && visionModel) {
      const descs: string[] = [];
      for (const part of imageParts) {
        const img = (part as { image_url?: { url: string; detail?: string } }).image_url;
        const d = img ? await describeImageWithVision(visionProvider, visionModel, img, cache) : null;
        if (d) descs.push(d);
      }
      block = descs.length
        ? `[Image — described for you by a vision model:\n${descs.join('\n\n---\n\n')}\n]`
        : fallbackNote(model);
    } else {
      block = fallbackNote(model);
    }

    out.push({ ...m, content: textPrefix ? `${textPrefix}\n\n${block}` : block });
  }
  return out;
}
