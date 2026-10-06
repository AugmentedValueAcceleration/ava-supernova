import type { ModelDefinition } from '../../core/types.js';
import { LONGXIANG_ENABLED } from '../../auto/longxiang-router.js';

/**
 * Platform models — available on managed plans + free accounts.
 * Paid plans: Qwen family + the managed coordinators (Supernova/Aurora).
 * Free accounts: Qwen only (3.5 Flash default).
 * MiniMax is BYOK only — users supply their own MiniMax API key (see
 *   providers/minimax/models.ts). It carries no managed/platform entry.
 * Kimi: K2.6 / K2.5 / K2.7 Code remain BYOK only. K3 is the exception — it
 *   is served managed as Longxiang's coordinator + Builder seat, so that
 *   fleet is reachable on a plan like every other fleet. Operator decision
 *   2026-07-18, superseding the earlier blanket "Kimi is BYOK-only" position.
 */
/**
 * Kimi K3 as a MANAGED model — Longxiang's lead seat (coordinator AND
 * Builder). 2.8T Stable LatentMoE, 1M context, native vision. The priciest
 * model we serve at $3.00/$15.00, hence the largest credit multiplier in
 * credits.ts (7.28x) — real cost passed through, not margin.
 *
 * Only K3 is promoted to managed; the rest of the Kimi line stays BYOK.
 *
 * GATED on LONGXIANG_ENABLED. A managed K3 exists solely to make Longxiang
 * reachable on a plan, so while the fleet is dark this entry must not exist
 * either — otherwise it is registerable through the provider registry (CLI,
 * IDE sidecar) as a bookable managed model for a fleet nobody can select.
 */
const KIMI_K3_PLATFORM: ModelDefinition = {
  id: 'kimi-k3-platform',
  name: 'Kimi K3',
  provider: 'platform',
  contextWindow: 1000000,
  maxOutputTokens: 8192,
  supportsToolCalls: true,
  supportsStreaming: true,
  supportsThinking: true,
  supportsVision: true,
  desktopCapable: true, // Frontier agentic model — strongest coordinator we serve.
  pricing: { inputPerMillion: 3.00, outputPerMillion: 15.00 },
};

/*
 * Kimi K2.7 Code stood here as a managed single model until 2026-10-06.
 *
 * Its own comment recorded that it was deliberately NOT gated on Longxiang and
 * that "the Kimi is BYOK-only rule was retired". That rule is back: Moonshot
 * never answered the 9 September approach, and a managed seat means we pay a
 * platform key to resell a lab that has not replied.
 *
 * BYOK is untouched — providers/kimi still serves the whole line, so anyone with
 * a Moonshot key has exactly what they had. Restoring the managed seat is a
 * `git show` away if they write back.
 */

export const PLATFORM_MODELS: ModelDefinition[] = [
  ...(LONGXIANG_ENABLED ? [KIMI_K3_PLATFORM] : []),
  // Qwen 3.8 Max — Alibaba's flagship as of 3 August 2026, and the successor to
  // 3.7 Max on credits. Strictly better and strictly cheaper: $2/$6 against
  // $2.50/$7.50, 131,072 output against 65,536. Cheaper input means a LOWER
  // credit multiplier than 3.7 Max — 2.58 against 3.22, same formula
  // (0.4952 x (in + 4*out) / 5). Not a fleet coordinator; a standalone single
  // pick for users who want the flagship on credits.
  {
    id: 'qwen3.8-max',
    name: 'Qwen 3.8 Max',
    provider: 'platform',
    contextWindow: 1000000,
    maxOutputTokens: 131072,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 2.00, outputPerMillion: 6.00 },
  },
  // Qwen 3.7 Max was here until 2026-08-09. Retired, not merely deprecated:
  // 3.8 Max beats it on price, output ceiling and capability at once, so there
  // is no task for which it is the right pick. `qwen3.7-max` rolls forward to
  // `qwen3.8-max` in model-ids.ts, so a saved selection keeps working and gets
  // the better model for a lower credit multiplier.
  // Qwen 3.7 Plus — flagship Maestro conductor. Agentic coding, 1M context,
  // vision + video, reasoning. Supersedes Qwen 3.6 Plus + the 3.5 Omni tier:
  // better agentic coding, multimodal, and cheaper.
  // Qwen 3.8 Flash (production build of Flash-Next, August 2026) - 1M context,
  // 131K max output, multimodal INCLUDING VIDEO, native tool calling.
  //
  // It is not a cheaper 3.7 Plus. Flash-Next is Qwen's early preview of the
  // Qwen4 architecture, so this is a newer generation arriving in the flash
  // line first: 180B total with 6B active. It beats 3.7 Plus on SWE-bench Pro
  // (62.5 vs 55.8) and on CoWorkBench and LiveCodeBench v6, and sits level on
  // GPQA, MMLU and MATH - better where it matters for agentic work, no worse
  // anywhere found.
  //
  // NOTE those figures are published for Flash-Next, the open-weight preview.
  // Alibaba have not published a separate table for this production id. Close
  // enough to route vision on; not close enough to move the Builder seat
  // without measuring our own traffic first.
  {
    id: 'qwen3.8-flash',
    name: 'Qwen 3.8 Flash',
    provider: 'platform',
    contextWindow: 1000000,
    maxOutputTokens: 131072,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.47 },
  },
  {
    id: 'qwen3.7-plus',
    name: 'Qwen 3.7 Plus',
    provider: 'platform',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true, // Default Maestro coordinator. Reliable tool calls, sees images natively.
    pricing: { inputPerMillion: 0.40, outputPerMillion: 1.60 },
  },
  // Qwen 3.5 Plus — 1M context.
  //
  // hiddenFromPicker, matching the BYOK copy in providers/qwen/models.ts:
  // superseded by 3.7 Plus and kept for routing and fallback only. The two
  // copies disagreed, so the same model was correctly hidden from the BYOK
  // list and still offered under the plan — it would have reappeared the
  // moment somebody signed in. It stays resolvable by id; DEFAULT_ROUTES
  // still names it as a fallback and that is unaffected.
  {
    id: 'qwen3.5-plus',
    hiddenFromPicker: true,
    name: 'Qwen 3.5 Plus',
    provider: 'platform',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    supportsVision: true,
    desktopCapable: true, // Solid coordinator on the older Qwen line; works.
    pricing: { inputPerMillion: 0.20, outputPerMillion: 1.20 },
  },
  // Qwen 3.5 Flash — fast, lightweight, text-only.
  // Not desktop-capable: same reasoning as Omni Flash above.
  {
    id: 'qwen3.5-flash',
    name: 'Qwen 3.5 Flash',
    provider: 'platform',
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsVision: false,
    pricing: { inputPerMillion: 0.05, outputPerMillion: 0.40 },
  },
  // DeepSeek Flash (managed) — LIVE to all accounts. The ONLY DeepSeek model:
  // they collapsed the line on 2026-09-10, retiring V4 Pro into V4.1 Flash,
  // which their notice says "has comprehensively surpassed V4 Pro across all
  // key metrics". Two entries became one.
  //
  // ID matches the row in the `models` table so server lookups resolve. The
  // table is the authority on visibility — admin_only and enabled live there,
  // not in this file. Read the row, not this comment.
  {
    id: 'deepseek-flash-platform',
    name: 'DeepSeek V4.1 Flash',
    provider: 'platform',
    contextWindow: 1_000_000,
    // 384K per DeepSeek's docs. Both merged entries said 8192 — a 47x
    // understatement that truncates long work rather than failing on it.
    maxOutputTokens: 384_000,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsThinking: true,
    // V4.1 Flash is multimodal; both predecessors were text-only at the API
    // level. Real capability gain — the vision bridge picks the cheapest
    // vision-capable model, and at $0.15 in this is now a candidate.
    supportsVision: true,
    // Keeps Pro's desktop capability rather than old Flash's caution. The old
    // "not desktop-capable, Flash bracket" note was about a weaker model in a
    // two-model line; this one replaces the coordinator, not the runt.
    desktopCapable: true,
    // Off-peak; peak (01:00-04:00 and 06:00-10:00 UTC, Mon-Fri) is exactly
    // double. Platform-served, so this is OUR cost — the credit multiplier in
    // billing/credits.ts is derived from measured traffic against these
    // numbers, not from the list price alone.
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  },
  //
  // ── The three Mistral entries and Kimi K2.7 Code came off on 2026-10-06 ──
  //
  // Every managed Mistral seat existed to serve Aurora, and the Kimi ones to
  // serve Longxiang. Both fleets went dark the same day: five labs were
  // approached on 9 September and only Qwen and DeepSeek replied, so paying a
  // platform key to resell models from labs that have not answered is the one
  // thing we should not be doing.
  //
  // They are gone from the ACCOUNT list only. Mistral and Kimi remain fully
  // supported BYOK — see providers/mistral/models.ts and providers/kimi — so a
  // user with their own key loses nothing. The /api/chat aliases stay too, so a
  // stale `mistral-medium-3.5-platform` resolves rather than 404s.
  //
  // What is left is exactly the labs that answered: Qwen and DeepSeek.
];
