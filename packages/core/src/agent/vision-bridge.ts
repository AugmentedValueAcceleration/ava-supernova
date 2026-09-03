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
import { listAllModelDefs, PLATFORM_MODELS } from '../providers/catalog.js';
import { logger } from '../core/logger.js';
import { avaEvents } from '../dataset/emitter.js';

/**
 * Pick a model to describe images for a text-only coordinator.
 *
 * Replaces a hardcoded Qwen chain that lived in three files and was missing
 * from a fourth. That chain asked "is Qwen available?", when the question is
 * "does this user hold a key for anything that can see?" -- so a user whose
 * only key was Zhipu, Moonshot, Mistral, Xiaomi or MiniMax got no relay at
 * all, while holding a perfectly good describer.
 *
 * Platform first, so a managed user does not spend a BYOK key describing a
 * picture. Then the shared catalogue -- and resolveModel() returning undefined
 * for an unregistered provider IS the key check, so no new plumbing is needed.
 *
 * Neither pass names a model id. The chain this replaces did, and it rotted:
 * all four of its ids (qwen3.5-omni-plus / -flash, on platform and BYOK) had
 * been removed from the catalogue, so the extension's bridge resolved to
 * nothing for EVERY user, on every plan, until 2026-09-01. Nobody noticed
 * because resolveModel() returning undefined looks identical to "this user
 * holds no key" — the rot and the normal case have the same shape.
 *
 * Cheapest rather than best on purpose. This describes one image for a model
 * that would otherwise see nothing at all; it is not the coordinator, and the
 * bar it has to clear is "better than blind".
 *
 * Returns null when the user holds no vision-capable key anywhere -- a real
 * state (DeepSeek alone has no vision model), which the caller reports rather
 * than hides.
 */
export function resolveVisionDescriber(
  // Structural, not the ProviderRegistry class: this file is imported by the
  // Agent and the Conductor, and a concrete import would tie the vision
  // bridge to the registry's module graph for one method.
  registry: { resolveModel(qualifiedId: string): { provider: Provider; model: ModelDefinition } | undefined },
): { provider: Provider; model: ModelDefinition } | null {
  const cheapestFirst = (defs: ModelDefinition[]) => defs
    .filter((m) => m.supportsVision && !m.disabled)
    .sort((a, b) => (a.pricing?.inputPerMillion ?? Number.POSITIVE_INFINITY)
                  - (b.pricing?.inputPerMillion ?? Number.POSITIVE_INFINITY));

  for (const m of cheapestFirst(PLATFORM_MODELS)) {
    const hit = registry.resolveModel(`platform:${m.id}`);
    if (hit) return hit;
  }

  for (const m of cheapestFirst(listAllModelDefs())) {
    const hit = registry.resolveModel(`${m.provider}:${m.id}`);
    if (hit) return hit;
  }
  return null;
}

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

/**
 * What the model is handed when it can't see and no relay is available.
 *
 * This is addressed to Ava, not to the user, and it deliberately does NOT read
 * like an error: a model without vision is a known property of the model the
 * user picked, not a failure. Ava explains it herself, in her own voice, and
 * carries on — errors are reserved for things that actually went wrong.
 *
 * It points at the picker's affordance rather than naming models, because a
 * hard-coded roster goes stale (this note used to recommend Kimi K2.5 and
 * "Mistral Large") whereas the struck-through paperclip is always current.
 */
function fallbackNote(model: ModelDefinition): string {
  return [
    `[Context for you — not a message from the user, and not an error.`,
    `They attached an image, but ${model.name || model.id} has no vision and no vision`,
    `relay is available right now, so you genuinely cannot see it.`,
    ``,
    `Tell them briefly and plainly, in your own voice, that you can't see images on this`,
    `model. Don't apologise at length and don't frame it as something broken — it's a`,
    `property of the model they chose. Offer the ways forward: switch to a`,
    `vision-capable model (the model picker strikes through the paperclip on any model`,
    `that can't read images); or, if their only key is for a provider with no vision`,
    `model at all, add a key for one that has — any of them will do, it is only used to`,
    `describe the picture; or describe the image and you'll work from their description.`,
    `Then get on with whatever else they asked for.]`,
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
  // Dataset signal accounting (shape-only) — totals across this turn's messages.
  let totalImages = 0;
  let totalDescribed = 0;
  const startedAt = Date.now();
  for (const m of messages) {
    if (!Array.isArray(m.content)) { out.push(m); continue; }
    const parts = m.content as ContentPart[];
    const textPrefix = parts.filter((p) => p.type === 'text').map((p) => (p as { text: string }).text).join('\n');
    const imageParts = parts.filter((p) => p.type === 'image_url');

    if (imageParts.length === 0) {
      out.push({ ...m, content: textPrefix });
      continue;
    }

    totalImages += imageParts.length;
    let block: string;
    if (visionProvider && visionModel) {
      const descs: string[] = [];
      for (const part of imageParts) {
        const img = (part as { image_url?: { url: string; detail?: string } }).image_url;
        const d = img ? await describeImageWithVision(visionProvider, visionModel, img, cache) : null;
        if (d) descs.push(d);
      }
      totalDescribed += descs.length;
      block = descs.length
        ? `[Image — described for you by a vision model:\n${descs.join('\n\n---\n\n')}\n]`
        : fallbackNote(model);
    } else {
      block = fallbackNote(model);
    }

    out.push({ ...m, content: textPrefix ? `${textPrefix}\n\n${block}` : block });
  }

  // ── Dataset event: the vision bridge ran for a text-only coordinator ──
  // Only when images were actually present. Shape-only: model id, counts,
  // latency, and whether descriptions were produced (vs a fallback note).
  if (totalImages > 0) {
    avaEvents.emit('vision_bridge', {
      describer_model: visionModel?.id ?? 'none',
      image_count: totalImages,
      described_count: totalDescribed,
      latency_ms: Date.now() - startedAt,
      success: totalDescribed > 0,
    });
  }
  return out;
}
