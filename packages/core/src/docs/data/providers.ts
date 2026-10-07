// Canonical provider + model fact table.
// Pricing is USD per 1M tokens and may drift — verify against provider pages before quoting publicly.
// Update here when models are added, deprecated, or repriced.

export type ProviderKind = 'orchestration' | 'managed' | 'byok';
export type ModelCapability = 'tools' | 'vision' | 'thinking' | 'streaming';

export interface ModelFact {
  id: string;
  displayName: string;
  inputPricePerM: number;
  outputPricePerM: number;
  contextWindow: number;
  capabilities: ModelCapability[];
}

export interface ProviderFact {
  id: string;
  name: string;
  kind: ProviderKind;
  models: ModelFact[];
  notes?: string;
}

export const PROVIDERS: ProviderFact[] = [
  // ── Orchestration ensembles ──────────────────────────────────────────────
  // The 2 routing modes that appear in the model selector (✦ Maestro,
  // ✦ Supernova). Each one is an ensemble — the listed models are the
  // constituent specialists the conductor routes to.
  //
  // Aurora and Longxiang were removed on 2026-10-06 when both fleets went
  // dark. The gate lives in core/src/auto/routing-modes.ts; this file is
  // documentation and simply must not describe what the selector no longer
  // offers.
  {
    id: 'maestro',
    name: '✦ Maestro — single-conductor',
    kind: 'orchestration',
    notes: 'One conductor drives the entire persona pipeline (Scout, Architect, Builder, Verifier). A cheap fast model handles the upstream intent gate so the conductor only spins up when orchestration is actually needed. Default for everyone, live on every plan.',
    models: [
      { id: 'qwen3.8-flash', displayName: 'Qwen 3.8 Flash — conductor + every persona + vision; multimodal incl. video', inputPricePerM: 0.15, outputPricePerM: 0.47, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.7-plus', displayName: 'Qwen 3.7 Plus — second rung on the ladder, and long-form writing', inputPricePerM: 0.40, outputPricePerM: 1.60, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.5-flash', displayName: 'Qwen 3.5 Flash — light classifier tier', inputPricePerM: 0.05, outputPricePerM: 0.40, contextWindow: 256_000, capabilities: ['tools', 'streaming'] },
    ],
  },
  {
    id: 'supernova',
    name: '✦ Supernova — polyglot ensemble',
    kind: 'orchestration',
    notes: 'Best-of-breed routing — the coordinator picks the right specialist for each subtask. Every DeepSeek seat is now one model at one price: DeepSeek collapsed V4 Pro into V4.1 Flash on 2026-09-10, so the fleet gets frontier-class reasoning at flash-tier cost throughout rather than paying up for the seats that need depth.',
    models: [
      { id: 'deepseek-flash-platform', displayName: 'DeepSeek Flash — coordinator + planning, chat, long-context, security, brainstorm, teach; Researcher, CVE Researcher, Ideator, Code Reviewer, Fact Checker, Quiz Master, Recon, Scanner, Curriculum Architect, Tutor, Curator, Explorer, Refiner, Security Verifier/Reporter personas. One model across every DeepSeek seat since 2026-09-10', inputPricePerM: 0.15, outputPricePerM: 0.60, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.8-flash', displayName: 'Qwen 3.8 Flash — vision seat + Design Reviewer persona', inputPricePerM: 0.15, outputPricePerM: 0.47, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.7-plus', displayName: 'Qwen 3.7 Plus — Builder + coding, image-gen; Architect + Content Writer personas', inputPricePerM: 0.40, outputPricePerM: 1.60, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.5-plus', displayName: 'Qwen 3.5 Plus — outage fallback tier only (retired from primary routes)', inputPricePerM: 0.20, outputPricePerM: 1.20, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.7-flash', displayName: 'Qwen 3.7 Flash — upstream intent gate', inputPricePerM: 0.10, outputPricePerM: 0.40, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.5-flash', displayName: 'Qwen 3.5 Flash — Scout, Verifier, Sequencer, Challenger, Integrator personas (depth ≤ 2)', inputPricePerM: 0.05, outputPricePerM: 0.40, contextWindow: 256_000, capabilities: ['tools', 'streaming'] },
    ],
  },
  // ── Platform-managed providers ────────────────────────────────────────────
  {
    id: 'qwen',
    name: 'Qwen (Alibaba Cloud)',
    kind: 'managed',
    notes: 'Qwen 3.8 Flash coordinates Auto Mode; 3.5 Flash is the fast-path option. All models available on every plan.',
    // MUST MATCH PLATFORM_MODELS in core/src/providers/platform/models.ts —
    // the managed catalogue, which is what a signed-in plan can actually drive.
    // Nothing else belongs in a `managed` entry. Corrected 2026-10-07: this
    // listed qwen3-coder-next, qwen3-coder-flash and qwen3.7-flash, none of
    // which are in PLATFORM_MODELS, and omitted qwen3.8-max, which is. Listing
    // a model here that a plan cannot select is selling something we do not
    // offer; omitting one hides something we do.
    //
    // qwen3.7-flash is deliberately absent despite being very much in use: it
    // runs every fleet's intent gate, so it appears in the ORCHESTRATION
    // entries above. Served on your behalf is not the same as selectable.
    models: [
      { id: 'qwen3.8-max', displayName: 'Qwen 3.8 Max', inputPricePerM: 2.00, outputPricePerM: 6.00, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.8-flash', displayName: 'Qwen 3.8 Flash', inputPricePerM: 0.15, outputPricePerM: 0.47, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.7-plus', displayName: 'Qwen 3.7 Plus', inputPricePerM: 0.40, outputPricePerM: 1.60, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.5-plus', displayName: 'Qwen 3.5 Plus', inputPricePerM: 0.20, outputPricePerM: 1.20, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.5-flash', displayName: 'Qwen 3.5 Flash', inputPricePerM: 0.05, outputPricePerM: 0.40, contextWindow: 256_000, capabilities: ['tools', 'streaming'] },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    kind: 'byok',
    notes: 'BYOK chat — bring your own MiniMax API key. M3 is the flagship (1M context, native multimodal); M2.7 is the cheaper 204K text tier, with a highspeed variant for latency-sensitive work. MiniMax does not document vision support for M2.7, so we treat it as text-only.',
    models: [
      { id: 'MiniMax-M3', displayName: 'MiniMax M3 — prices shown are the ≤512k tier; turns above 512k bill at double', inputPricePerM: 0.30, outputPricePerM: 1.20, contextWindow: 1_048_576, capabilities: ['tools', 'thinking', 'streaming', 'vision'] },
      { id: 'MiniMax-M2.7', displayName: 'MiniMax M2.7', inputPricePerM: 0.30, outputPricePerM: 1.20, contextWindow: 204_800, capabilities: ['tools', 'thinking', 'streaming'] },
      { id: 'MiniMax-M2.7-highspeed', displayName: 'MiniMax M2.7 Highspeed', inputPricePerM: 0.60, outputPricePerM: 2.40, contextWindow: 204_800, capabilities: ['tools', 'thinking', 'streaming'] },
    ],
  },
  {
    id: 'deepseek-managed',
    name: 'DeepSeek (Supernova orchestration)',
    kind: 'managed',
    notes: 'Powers Supernova routing mode. One model across every DeepSeek seat since 2026-09-10, when DeepSeek retired V4 Pro into V4.1 Flash: it coordinates the persona pipeline AND handles builds and review. Open-weight MIT, 1M context, 384K max output, multimodal, dual thinking/non-thinking modes. Prices are off-peak; peak (01:00-04:00 and 06:00-10:00 UTC, Mon-Fri) is exactly double.',
    models: [
      { id: 'deepseek-flash-platform', displayName: 'DeepSeek V4.1 Flash', inputPricePerM: 0.15, outputPricePerM: 0.60, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'byok',
    notes: 'One model, since DeepSeek collapsed the line on 2026-09-10 and retired V4 Pro into V4.1 Flash — open-weight MIT, 1M context, 384K max output, multimodal, dual thinking modes. Every retired id we have shipped (V4 Pro, V4 Flash, and the older V3.2 deepseek-chat / deepseek-reasoner) is rewritten to this one before the request goes out, so an old saved setting keeps working. Prices are off-peak; peak (01:00-04:00 and 06:00-10:00 UTC, Mon-Fri) is exactly double.',
    models: [
      { id: 'deepseek-flash', displayName: 'DeepSeek V4.1 Flash', inputPricePerM: 0.15, outputPricePerM: 0.60, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
    ],
  },
  // Qwen has a managed section above (models we serve on your plan). This is the
  // BYOK half — the same split DeepSeek and Mistral already have. It exists
  // because qwen3.7-max shipped in the catalogue and the picker while being
  // absent from the docs entirely, which meant docs_lookup could not answer
  // questions about it. (It was BYOK-only when this section was written; Max
  // was opened to credits on 2026-07-23 and the note here went stale.)
  {
    id: 'qwen-byok',
    name: 'Qwen (Alibaba Cloud) — your own key',
    kind: 'byok',
    notes: 'Bring your own DashScope (international) key. Qwen 3.8 Max (3 August 2026) is the current flagship. It replaced 3.7 Max entirely on 2026-08-09 — it is cheaper at $2/$6, doubles the output ceiling to 131K, and takes video as well as images, so there was no task left that 3.7 Max was the right pick for. Max is ALSO served on a plan; the earlier note that it was BYOK-only stopped being true on 2026-07-23. Prices are Alibaba\'s published international rates; 3.7 Plus is tiered (input rises above 256K tokens) and the figure shown is the base tier. 3.5 Plus and 3.5 Flash still answer but Alibaba now treats them as legacy.',
    models: [
      { id: 'qwen3.8-max', displayName: 'Qwen 3.8 Max — Alibaba\'s flagship, 131K output, video in', inputPricePerM: 2.00, outputPricePerM: 6.00, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.7-plus', displayName: 'Qwen 3.7 Plus', inputPricePerM: 0.40, outputPricePerM: 1.60, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.5-plus', displayName: 'Qwen 3.5 Plus — legacy', inputPricePerM: 0.40, outputPricePerM: 2.40, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.5-flash', displayName: 'Qwen 3.5 Flash — legacy, text only', inputPricePerM: 0.10, outputPricePerM: 0.40, contextWindow: 262_000, capabilities: ['tools', 'streaming'] },
    ],
  },
  {
    id: 'kimi',
    name: 'Kimi (Moonshot AI)',
    kind: 'byok',
    notes: 'K3 is Moonshot\'s frontier model (2.8T MoE, 1M context, native vision; open weights due 2026-07-27). K2.7 Code remains the cheaper agentic coder at roughly a third of K3\'s price. All benchmarks Moonshot-reported: K3 leads Opus 4.8 on most agentic rows but trails Claude Fable 5 on FrontierSWE, HLE and GDPval.',
    models: [
      { id: 'kimi-k3', displayName: 'Kimi K3', inputPricePerM: 3.00, outputPricePerM: 15.00, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'kimi-k2.7-code', displayName: 'Kimi K2.7 Code', inputPricePerM: 0.95, outputPricePerM: 4.00, contextWindow: 256_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'kimi-k2.6', displayName: 'Kimi K2.6', inputPricePerM: 0.95, outputPricePerM: 4.00, contextWindow: 256_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    kind: 'byok',
    notes: 'Bring your own Mistral key and pick any of these directly. EU infrastructure, open weights (Large 3 and Small 4 Apache-2.0; Medium 3.5 Modified MIT).',
    models: [
      { id: 'mistral-medium-3.5', displayName: 'Mistral Medium 3.5 (frontier flagship)', inputPricePerM: 1.50, outputPricePerM: 7.50, contextWindow: 256_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'mistral-small-4', displayName: 'Mistral Small 4', inputPricePerM: 0.15, outputPricePerM: 0.60, contextWindow: 262_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'mistral-large-3', displayName: 'Mistral Large 3', inputPricePerM: 0.50, outputPricePerM: 1.50, contextWindow: 262_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      // Codestral + Devstral 2 retired 2026-07-23 — superseded by Mistral Small 4.
    ],
  },
  {
    id: 'zhipu',
    name: 'Zhipu AI',
    kind: 'byok',
    notes: 'GLM-5.3 is Zhipu\'s open-weights (MIT) flagship with a 1M-token context window, and it is TEXT ONLY — as the whole GLM main line has been, because Zhipu keeps vision in a separate "V" line (GLM-5V, GLM-4.6V) that we do not carry. A higher GLM version number does not mean it can read images. The one exception is GLM-5.3 Flash, which genuinely does take image and video input; "Flash" there is the price tier, not a smaller model. Verified against Zhipu\'s documentation 2026-09-01.',
    models: [
      { id: 'glm-5.3', displayName: 'GLM-5.3', inputPricePerM: 1.40, outputPricePerM: 4.40, contextWindow: 1_000_000, capabilities: ['tools', 'thinking', 'streaming'] },
      { id: 'glm-5.3-flash', displayName: 'GLM-5.3 Flash', inputPricePerM: 0.15, outputPricePerM: 0.50, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
    ],
  },
  {
    id: 'xiaomi',
    name: 'Xiaomi',
    kind: 'byok',
    notes: 'MiMo V2.6 — open weights under MIT, full modality (text, image, video and audio in), 1M context, tuned for long-horizon agentic work. Pro is 1.02T parameters, Flash 309B. UltraSpeed is the SAME Pro model served up to 20x faster at ten times the price, so reach for it only when latency is the product. Released 2026-09-21; V2.5 retired the day after.',
    models: [
      { id: 'mimo-v2.6-pro',            displayName: 'MiMo V2.6-Pro',            inputPricePerM: 0.435, outputPricePerM: 0.87, contextWindow: 1_048_576, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'mimo-v2.6-flash',          displayName: 'MiMo V2.6-Flash',          inputPricePerM: 0.14,  outputPricePerM: 0.28, contextWindow: 1_048_576, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'mimo-v2.6-pro-ultraspeed', displayName: 'MiMo V2.6-Pro UltraSpeed', inputPricePerM: 4.35,  outputPricePerM: 8.70, contextWindow: 1_048_576, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
    ],
  },
  {
    id: 'tencent',
    name: 'Tencent Hunyuan',
    kind: 'byok',
    notes: 'Hunyuan Hy3 — open-weight MoE (295B total / 21B active), hybrid fast/slow reasoning, built for agentic workflows. OpenAI-compatible, 262K context, very cheap. BYOK.',
    models: [
      { id: 'hy3', displayName: 'Hunyuan Hy3', inputPricePerM: 0.15, outputPricePerM: 0.59, contextWindow: 262_144, capabilities: ['tools', 'thinking', 'streaming'] },
    ],
  },
  {
    id: 'nvidia',
    name: 'NVIDIA',
    kind: 'byok',
    notes: 'Nemotron 3 Ultra — open-weight MoE (550B total / 55B active), hybrid Transformer-Mamba, frontier reasoning + agent orchestration, 1M context. NVIDIA Open Model License. BYOK only.',
    models: [
      { id: 'nvidia/nemotron-3-ultra-550b-a55b', displayName: 'Nemotron 3 Ultra', inputPricePerM: 0.50, outputPricePerM: 2.20, contextWindow: 1_000_000, capabilities: ['tools', 'thinking', 'streaming'] },
      { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', displayName: 'Nemotron 3.5 Lightning — 30B total / 3B active, open weights under OpenMDW-1.1', inputPricePerM: 0.05, outputPricePerM: 0.20, contextWindow: 1_000_000, capabilities: ['tools', 'streaming'] },
    ],
  },
  {
    id: 'custom',
    name: 'Custom (Ollama / LM Studio / vLLM / BYOM)',
    kind: 'byok',
    notes: 'Point Ava at any OpenAI-compatible endpoint — local (Ollama, LM Studio, vLLM on your machine) or remote (private vLLM cluster, self-hosted finetune, OpenRouter, Together). Configure via Settings → Custom Model in the extension or IDE. You supply the base URL + model name; capabilities depend entirely on what you have running.',
    models: [
      { id: 'custom', displayName: 'Your model', inputPricePerM: 0, outputPricePerM: 0, contextWindow: 32_000, capabilities: ['tools', 'streaming'] },
    ],
  },
];

export const MANAGED_PROVIDERS = PROVIDERS.filter(p => p.kind === 'managed');
export const BYOK_PROVIDERS = PROVIDERS.filter(p => p.kind === 'byok');
