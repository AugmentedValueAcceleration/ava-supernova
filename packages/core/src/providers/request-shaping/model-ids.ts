/**
 * Single source of truth for upstream model-id translation + vision rerouting.
 *
 * Both code paths that talk to upstream LLM providers must agree on the API
 * model id: the PLATFORM path (server-side, packages/web) and the BYOK path
 * (client-side, the core providers here). They used to keep separate copies of
 * these maps, and the copies drifted — that's how Aurora shipped calling the
 * non-existent `mistral-medium-3-5` (a 429 ghost) while the platform map said
 * one thing and the BYOK map another. This module is the one map both import.
 *
 * Pure + transport-free on purpose: web calls it before its own fetch (with
 * Ava's keys), core providers call it inside transformRequest (with the user's
 * key). Neither imports the other's transport.
 */

/**
 * Friendly internal id -> the exact id the upstream API accepts.
 *
 * Mistral uses date-stamped snapshot ids (`mistral-<tier>-YYMM`), not the
 * friendly product names. Managed `-platform` entries strip the suffix to the
 * canonical id the upstream API knows. Qwen legacy aliases roll forward to the
 * current generation. Anything not listed passes through unchanged.
 */
export const MODEL_API_NAMES: Record<string, string> = {
  // Qwen legacy rolling aliases -> current generation
  'qwen-flash':        'qwen3.5-flash',
  'qwen-turbo':        'qwen3.5-flash',
  'qwen3-omni-flash':  'qwen3.5-omni-flash',
  // Managed DeepSeek V4 — strip the `-platform` disambiguator
  'deepseek-v4-pro-platform':   'deepseek-v4-pro',
  'deepseek-v4-flash-platform': 'deepseek-v4-flash',
  // Managed Mistral (Aurora's fleet) — friendly name -> the id Mistral accepts.
  // Large 3 and Small 4 use date-stamped snapshots. Medium 3.5 is pinned to the
  // SEMANTIC id `mistral-medium-3-5` (what Mistral's own rate-limit console
  // lists). Mistral ALSO accepts the dated snapshot `mistral-medium-2604` (both
  // return 200); we keep the semantic id. The dotted `mistral-medium-3.5` is rejected.
  // NB: the 429s during the Aurora launch were a free-tier rate limit, NOT the
  // id — fixed by upgrading the Mistral account tier, not by changing this value.
  'mistral-small-4-platform':   'mistral-small-2603',
  'mistral-large-3-platform':   'mistral-large-2512',
  'mistral-medium-3.5-platform':'mistral-medium-3-5',
  'mistral-small-4':            'mistral-small-2603',
  'mistral-large-3':            'mistral-large-2512',
  'mistral-medium-3.5':         'mistral-medium-3-5',
};

/**
 * When a request carries images, reroute text-only models to a vision-capable
 * equivalent. Keys/values are POST-translation ids (run after MODEL_API_NAMES).
 *
 * qwen3.5-flash is text-only; the rest of the 3.5 generation is natively
 * multimodal. DeepSeek V4 (Pro + Flash) is text-only at the API level (verified
 * against api.deepseek.com 2026-04-25) so image requests go to Qwen Omni Plus.
 * Aurora's Large 3 coordinator is text-only -> Medium 3.5 (vision encoder
 * trained from scratch), keeping the EU-stack guarantee instead of falling to Qwen.
 */
export const VISION_REROUTE: Record<string, string> = {
  'qwen3.5-flash':       'qwen3.5-omni-flash',
  'qwen-flash':          'qwen3.5-omni-flash',
  'qwen-turbo':          'qwen3.5-omni-flash',
  'deepseek-v4-pro':     'qwen3.5-omni-plus',
  'deepseek-v4-flash':   'qwen3.5-omni-plus',
  'mistral-large-2512':  'mistral-medium-3-5',
};

/**
 * Translate a friendly model id to the upstream API id, applying the vision
 * reroute when images are present. Unknown ids pass through unchanged.
 */
export function resolveApiModel(model: string, hasImages = false): string {
  const mapped = MODEL_API_NAMES[model] || model;
  if (hasImages && VISION_REROUTE[mapped]) {
    return VISION_REROUTE[mapped];
  }
  return mapped;
}

/** True when any message carries an image_url content part. */
export function messagesHaveImages(messages: ReadonlyArray<Record<string, unknown>>): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) &&
      (m.content as Array<{ type?: string }>).some((p) => p.type === 'image_url'),
  );
}
