import type { ModelDefinition } from '../../core/types.js';

// DeepSeek V4 preview launched 2026-04-24 as two open-weight MIT-licensed
// MoE variants. Both support 1M context, dual thinking/non-thinking modes,
// native OpenAI + Anthropic API compat.
//
// ONE MODEL. DeepSeek collapsed the line on 2026-09-10: `deepseek-flash`
// (V4.1 Flash, and note there is no version number in the id) is the only
// live model. V4 Pro is retiring and redirects to it; `deepseek-flash`
// survives only as a legacy alias.
//
// Every retired id we have ever shipped is mapped in DEEPSEEK_RETIRED_IDS
// below and rewritten by us before a request goes out, rather than trusting
// DeepSeek's redirect with it.
export const DEEPSEEK_MODELS: ModelDefinition[] = [
  {
    id: 'deepseek-flash',
    name: 'DeepSeek Flash',
    provider: 'deepseek',
    contextWindow: 1_000_000,
    // 384K, per DeepSeek's own docs. This said 8192 while V4 Pro and V4 Flash
    // were separate models — a 47x understatement, and the kind that truncates
    // a long piece of work quietly instead of failing.
    maxOutputTokens: 384_000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    // V4.1 Flash IS multimodal. Both predecessors were text-only at the API
    // level and carried a comment saying so. This is a real capability gain:
    // resolveVisionDescriber picks the cheapest vision-capable model, so at
    // $0.15 in this is now a candidate describer for text-only models.
    supportsVision: true,
    desktopCapable: true, // Supernova's coordinator.
    // DeepSeek's peak/off-peak tariff: peak is 01:00-04:00 and 06:00-10:00
    // UTC Mon-Fri and costs exactly 2x on every line.
    //
    //   off-peak  $0.15 in / $0.60 out   (cache hit $0.003)
    //   peak      $0.30 in / $1.20 out   (cache hit $0.006)
    //
    // We record OFF-PEAK: it applies for 17 hours of every 24, and 97.8% of
    // our measured token spend lands outside the peak window — our users work
    // European daytime, which is DeepSeek's quiet time. A BYOK user in another
    // timezone can pay up to double, so the models page carries the peak rate
    // alongside this one.
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  },
];

/**
 * Ids DeepSeek has retired, and what they become.
 *
 * We rewrite these ourselves rather than letting DeepSeek's redirect handle
 * it. A saved setting or an in-flight session can still be holding one of
 * these, and a request that leaves us carrying a retired id is a request whose
 * behaviour someone else controls — including whether it is billed at Pro's
 * old rate. Their notice and their docs disagree by four days on when the
 * redirect even starts, which is reason enough not to depend on it.
 */
export const DEEPSEEK_RETIRED_IDS: Readonly<Record<string, string>> = {
  // NOTE: these KEYS are the retired ids and must keep their old spelling —
  // that is the entire point of the map. A global rename across the package
  // flattened them once already.
  'deepseek-v4-pro': 'deepseek-flash',
  'deepseek-v4-pro-platform': 'deepseek-flash-platform',
  'deepseek-v4-flash': 'deepseek-flash',
  'deepseek-v4-flash-platform': 'deepseek-flash-platform',
  // DeepSeek's own legacy aliases, retired earlier and still occasionally
  // seen in old configs.
  'deepseek-chat': 'deepseek-flash',
  'deepseek-reasoner': 'deepseek-flash',
  'deepseek-v4-flash-vision-exp': 'deepseek-flash',
};

/** Map a possibly-retired DeepSeek id onto the one that still exists. */
export function resolveDeepSeekId(id: string): string {
  return DEEPSEEK_RETIRED_IDS[id] ?? id;
}
