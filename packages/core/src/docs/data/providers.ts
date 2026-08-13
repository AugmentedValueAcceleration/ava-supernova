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
  // The 3 routing modes that appear in the model selector (✦ Maestro,
  // ✦ Supernova, ✦ Aurora). Each one is an ensemble — the listed models
  // are the constituent specialists the conductor routes to.
  {
    id: 'maestro',
    name: '✦ Maestro — single-conductor',
    kind: 'orchestration',
    notes: 'One conductor drives the entire persona pipeline (Scout, Architect, Builder, Verifier). A cheap fast model handles the upstream intent gate so the conductor only spins up when orchestration is actually needed. Default for everyone, live on every plan.',
    models: [
      { id: 'qwen3.7-plus', displayName: 'Qwen 3.7 Plus — conductor + every persona', inputPricePerM: 0.29, outputPricePerM: 1.70, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.5-flash', displayName: 'Qwen 3.5 Flash — upstream intent gate / classifier', inputPricePerM: 0.05, outputPricePerM: 0.40, contextWindow: 256_000, capabilities: ['tools', 'streaming'] },
    ],
  },
  {
    id: 'supernova',
    name: '✦ Supernova — polyglot ensemble',
    kind: 'orchestration',
    notes: 'Best-of-breed routing — the coordinator picks the right specialist for each subtask. Frontier reasoning where it matters, flash-tier cost where it does not.',
    models: [
      { id: 'deepseek-v4-pro-platform', displayName: 'DeepSeek V4 Pro — coordinator + planning, chat, long-context, security, brainstorm; Researcher, CVE Researcher, Ideator personas', inputPricePerM: 0.435, outputPricePerM: 0.87, contextWindow: 1_000_000, capabilities: ['tools', 'thinking', 'streaming'] },
      { id: 'qwen3.7-plus', displayName: 'Qwen 3.7 Plus — Builder + coding, image-gen; Architect + Content Writer personas', inputPricePerM: 0.29, outputPricePerM: 1.70, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'deepseek-v4-flash-platform', displayName: 'DeepSeek V4 Flash — Teach route; Code Reviewer, Fact Checker, Quiz Master, Recon, Scanner, Curriculum Architect, Tutor, Curator, Explorer, Refiner, Security Verifier/Reporter personas', inputPricePerM: 0.14, outputPricePerM: 0.28, contextWindow: 1_000_000, capabilities: ['tools', 'thinking', 'streaming'] },
      { id: 'qwen3.5-plus', displayName: 'Qwen 3.5 Plus — outage fallback tier only (retired from primary routes)', inputPricePerM: 0.20, outputPricePerM: 1.20, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.5-flash', displayName: 'Qwen 3.5 Flash — intent gate; Scout, Verifier, Sequencer, Challenger, Integrator personas (depth ≤ 2)', inputPricePerM: 0.05, outputPricePerM: 0.40, contextWindow: 256_000, capabilities: ['tools', 'streaming'] },
      { id: 'qwen3.5-omni-plus', displayName: 'Qwen 3.5 Omni Plus — vision route + Design Reviewer persona (only vision + audio capable model in scope)', inputPricePerM: 0.26, outputPricePerM: 1.56, contextWindow: 256_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
    ],
  },
  {
    id: 'aurora',
    name: '✦ Aurora — European AI stack',
    kind: 'orchestration',
    notes: 'Mistral-only routing. Every call lands on a Mistral model — Aurora deployments never leave European infrastructure. For GDPR-strict deployments, AI Act compliance, sovereignty mandates. Open weights end-to-end. No cross-routing fallback — that is the EU-stack guarantee.',
    models: [
      { id: 'mistral-medium-3.5-platform', displayName: 'Mistral Medium 3.5 — lead seat: coordinator + Builder + vision + deep specialists (Researcher, Challenger, CVE Researcher, Fact Checker, Security Verifier, Architect, Tutor, Content Writer). Frontier flagship', inputPricePerM: 1.50, outputPricePerM: 7.50, contextWindow: 256_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'mistral-small-4-platform', displayName: 'Mistral Small 4 — high-volume workhorse: chat, intent gate, image-gen orchestration, long-context, brainstorm; light specialists (Verifier, Sequencer, Recon, Scanner, Reporter, Quiz Master). Cheaper than Large 3', inputPricePerM: 0.15, outputPricePerM: 0.60, contextWindow: 262_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'mistral-large-3-platform', displayName: 'Mistral Large 3 — heavy reserve / fallback (675B/41B MoE, Apache-2.0, broad knowledge, multimodal; non-reasoning today)', inputPricePerM: 0.50, outputPricePerM: 1.50, contextWindow: 262_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
    ],
  },
  {
    id: 'longxiang',
    name: '✦ Longxiang — Chinese-model stack',
    kind: 'orchestration',
    // Deliberately does NOT claim open weights, in the name or anywhere below:
    // Kimi K3's weights are due 2026-07-27 and Qwen 3.7 Plus is still API-only,
    // so today only DeepSeek V4 Flash is genuinely open. Describe the fleet
    // accurately now; strengthen the wording when it becomes true.
    notes: 'Kimi K3 holds both the coordinator and Builder seats — the strongest coder we serve (88.3 Terminal-Bench 2.1, 81.2 FrontierSWE). Qwen 3.7 Plus takes mid-tier builds and vision; DeepSeek V4 Flash carries chat, brainstorm and the intent gate. K3 is the priciest model we serve, so Longxiang uses more credits per turn than the other fleets — or none at all on your own keys.',
    models: [
      { id: 'kimi-k3-platform', displayName: 'Kimi K3 — lead seat: coordinator AND Builder, plus deep specialists (Architect, Researcher, CVE Researcher, Ideator). 2.8T Stable LatentMoE, native vision', inputPricePerM: 3.00, outputPricePerM: 15.00, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.7-plus', displayName: 'Qwen 3.7 Plus — mid-tier builds, vision input, long context, teach delivery, long-form writing', inputPricePerM: 0.29, outputPricePerM: 1.70, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash — chat, brainstorm, image-gen orchestration, intent gate, light specialists (MIT)', inputPricePerM: 0.14, outputPricePerM: 0.28, contextWindow: 1_000_000, capabilities: ['tools', 'thinking', 'streaming'] },
    ],
  },
  // ── Platform-managed providers ────────────────────────────────────────────
  {
    id: 'qwen',
    name: 'Qwen (Alibaba Cloud)',
    kind: 'managed',
    notes: 'Qwen 3.7 Plus coordinates Auto Mode; 3.5 Flash and 3.5 Omni Flash are the fast-path options. All models available on every plan.',
    models: [
      { id: 'qwen3.7-plus', displayName: 'Qwen 3.7 Plus', inputPricePerM: 0.29, outputPricePerM: 1.70, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.5-omni-plus', displayName: 'Qwen 3.5 Omni Plus', inputPricePerM: 0.26, outputPricePerM: 1.56, contextWindow: 256_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.5-omni-flash', displayName: 'Qwen 3.5 Omni Flash', inputPricePerM: 0.065, outputPricePerM: 0.26, contextWindow: 256_000, capabilities: ['tools', 'vision', 'streaming'] },
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
    notes: 'Powers Supernova routing mode. V4 Pro coordinates the persona pipeline; V4 Flash handles high-volume builds and review. Both open-weight MIT, 1M context, dual thinking/non-thinking modes.',
    models: [
      { id: 'deepseek-v4-pro-platform', displayName: 'DeepSeek V4 Pro', inputPricePerM: 0.435, outputPricePerM: 0.87, contextWindow: 1_000_000, capabilities: ['tools', 'thinking', 'streaming'] },
      { id: 'deepseek-v4-flash-platform', displayName: 'DeepSeek V4 Flash', inputPricePerM: 0.14, outputPricePerM: 0.28, contextWindow: 1_000_000, capabilities: ['tools', 'thinking', 'streaming'] },
    ],
  },
  {
    id: 'mistral-managed',
    name: 'Mistral AI (Aurora orchestration)',
    kind: 'managed',
    notes: 'Powers Aurora routing mode. EU-based, open weights, never leaves European infrastructure. Medium 3.5 (frontier flagship) leads; Small 4 carries volume; Large 3 is the heavy reserve.',
    models: [
      { id: 'mistral-medium-3.5-platform', displayName: 'Mistral Medium 3.5', inputPricePerM: 1.50, outputPricePerM: 7.50, contextWindow: 256_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'mistral-small-4-platform', displayName: 'Mistral Small 4', inputPricePerM: 0.15, outputPricePerM: 0.60, contextWindow: 262_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'mistral-large-3-platform', displayName: 'Mistral Large 3', inputPricePerM: 0.50, outputPricePerM: 1.50, contextWindow: 262_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'byok',
    notes: 'V4 launched 2026-04-24 — open-weight MIT, 1M context, dual thinking modes. Legacy V3.2 IDs are auto-routed to V4 Flash and retire 2026-07-24.',
    models: [
      { id: 'deepseek-v4-pro', displayName: 'DeepSeek V4 Pro', inputPricePerM: 0.435, outputPricePerM: 0.87, contextWindow: 1_000_000, capabilities: ['tools', 'thinking', 'streaming'] },
      { id: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash', inputPricePerM: 0.14, outputPricePerM: 0.28, contextWindow: 1_000_000, capabilities: ['tools', 'thinking', 'streaming'] },
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
    notes: 'Same models the Aurora routing mode uses — pick them directly with your own Mistral key, or let Aurora orchestrate. EU infrastructure, open weights (Large 3 and Small 4 Apache-2.0; Medium 3.5 Modified MIT).',
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
    notes: 'GLM-5.2 is Zhipu\'s open-weights (MIT) flagship with a 1M-token context window. Both GLM models we offer are TEXT ONLY — Zhipu keeps vision in a separate "V" line (GLM-5V, GLM-4.6V) that we do not carry, so a higher GLM version number does not mean it can read images. Verified against Zhipu\'s API 2026-07-17.',
    models: [
      { id: 'glm-5.2', displayName: 'GLM-5.2', inputPricePerM: 1.40, outputPricePerM: 4.40, contextWindow: 1_000_000, capabilities: ['tools', 'thinking', 'streaming'] },
      { id: 'glm-4.5-air', displayName: 'GLM-4.5 Air', inputPricePerM: 0.20, outputPricePerM: 1.10, contextWindow: 128_000, capabilities: ['tools', 'streaming'] },
    ],
  },
  {
    id: 'xiaomi',
    name: 'Xiaomi',
    kind: 'byok',
    notes: 'MiMo V2.5 — open-weight multimodal model tuned for agentic work and long tool-call chains (sustains 1,000+ sequential calls). Released 2026-04-22.',
    models: [
      { id: 'mimo-v2.5-pro', displayName: 'MiMo V2.5-Pro', inputPricePerM: 1.00, outputPricePerM: 3.00, contextWindow: 1_048_576, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'mimo-v2.5',     displayName: 'MiMo V2.5',     inputPricePerM: 0.40, outputPricePerM: 2.00, contextWindow: 1_048_576, capabilities: ['tools', 'vision', 'streaming'] },
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
