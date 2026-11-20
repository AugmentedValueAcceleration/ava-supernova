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
  'qwen-flash':        'qwen3.8-flash',
  'qwen-turbo':        'qwen3.8-flash',
  // Qwen 3.5 Plus / 3.5 Flash retired 2026-11-19 (gone from Alibaba's model
  // list; his call): rolled forward to the current Plus and Flash, so a saved
  // selection keeps working on a better, multimodal model.
  'qwen3.5-plus':      'qwen3.7-plus',
  'qwen3.5-flash':     'qwen3.8-flash',
  // Qwen 3.8 Max retired 2026-11-19 in favour of Qwen 4 Max — newer and
  // cheaper ($1.50/$4.50 against $2/$6), same 1M context (his call).
  'qwen3.8-max':       'qwen4-max',
  // 3.7 Max retired 2026-08-09 in favour of 3.8 Max, which is better on every
  // axis AND cheaper ($2/$6 against $2.50/$7.50, 131K output against 65K) and
  // therefore costs FEWER credits (2.58x against 3.22x). Rolled forward rather
  // than removed: a saved selection keeps working, and the person holding it
  // gets a better model for less money without being asked to do anything.
  'qwen3.7-max':       'qwen4-max',
  // MiniMax M2.7 (+ Highspeed) retired upstream 2026-11-18 (closed to new
  // users 2026-10-19). MiniMax routes them to M3.1 Flash on its plans; we do
  // the same for own-key calls, so a saved choice survives the shutdown.
  'MiniMax-M2.7':           'MiniMax-M3.1-Flash',
  'MiniMax-M2.7-highspeed': 'MiniMax-M3.1-Flash',
  // Kimi K2.7 Code and K2.6 close to new Moonshot accounts on 2026-11-01 and
  // retire at the end of December 2026: rolled forward to K3.1 Pro (his
  // call, 20 Nov 2026), so a saved choice survives the shutdown.
  'kimi-k2.7-code':        'kimi-k3.1-pro',
  'kimi-k2.6':             'kimi-k3.1-pro',
  // Tencent Hy3 replaced by Hy4 (his call, 20 Nov 2026) — the like-for-like
  // flagship step: 1M context against 256K, and it takes images. The April
  // preview id goes the same way.
  'hy3':                   'hy4',
  'hy3-preview':           'hy4',
  // Managed DeepSeek — strip the `-platform` disambiguator
  'deepseek-flash-platform':   'deepseek-flash',
  // Managed Kimi K3 (Longxiang's lead seat) — strip the disambiguator.
  // Moonshot only knows `kimi-k3`; sending the suffixed id returns
  // 404 "Not found the model kimi-k3-platform or Permission denied".
  'kimi-k3-platform':           'kimi-k3',
  // Same for K2.7 Code. Migration 373 created the `kimi-k2.7-code-platform`
  // row so it could be picked as a credit single, but no strip was added
  // alongside it — so every surface reading that row (extension, IDE, hub)
  // would have sent the suffixed id to Moonshot and taken the same 404 the
  // line above exists to prevent.
  'kimi-k2.7-code-platform':    'kimi-k3.1-pro', // K2.7 Code rolled forward (above)
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
 * (qwen3.5-flash, text-only, used to be here; since 2026-11-19 it and the qwen-flash /
 * qwen-turbo aliases roll forward to qwen3.8-flash, which takes images itself.)
 * DeepSeek is absent: V4 Pro (text-only) is routed to V4.1 Flash before it
 * gets here, and V4.1 Flash takes images itself. Aurora coordinates on Medium 3.5,
 * whose vision encoder was trained from scratch, so images stay in-fleet and
 * the EU-stack guarantee holds instead of falling to Qwen. (Large 3 — text-only
 * — was the coordinator before the fleet was re-tiered; it's the heavy reserve
 * now.)
 */
export const VISION_REROUTE: Record<string, string> = {
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
