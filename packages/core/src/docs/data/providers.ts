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
      { id: 'qwen3.7-plus', displayName: 'Qwen 3.7 Plus — Builder + coding, image-gen; Architect persona', inputPricePerM: 0.29, outputPricePerM: 1.70, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'deepseek-v4-flash-platform', displayName: 'DeepSeek V4 Flash — Teach route; Code Reviewer, Fact Checker, Quiz Master, Recon, Scanner, Curriculum Architect, Tutor, Curator, Explorer, Refiner, Security Verifier/Reporter personas', inputPricePerM: 0.14, outputPricePerM: 0.28, contextWindow: 1_000_000, capabilities: ['tools', 'thinking', 'streaming'] },
      { id: 'qwen3.5-plus', displayName: 'Qwen 3.5 Plus — Content Writer persona (cost-sensitive long-output writing)', inputPricePerM: 0.20, outputPricePerM: 1.20, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.5-flash', displayName: 'Qwen 3.5 Flash — intent gate; Scout, Verifier, Sequencer, Challenger, Integrator personas (depth ≤ 2)', inputPricePerM: 0.05, outputPricePerM: 0.40, contextWindow: 256_000, capabilities: ['tools', 'streaming'] },
      { id: 'qwen3.5-omni-plus', displayName: 'Qwen 3.5 Omni Plus — vision route + Design Reviewer persona (only vision + audio capable model in scope)', inputPricePerM: 0.26, outputPricePerM: 1.56, contextWindow: 256_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
    ],
  },
  {
    id: 'aurora',
    name: '✦ Aurora — European AI stack',
    kind: 'orchestration',
    notes: 'Mistral-only routing. Every call lands on a Mistral model — Aurora deployments never leave European infrastructure. For GDPR-strict deployments, AI Act compliance, sovereignty mandates. Apache-2.0 open weights end-to-end. No cross-routing fallback — that is the EU-stack guarantee.',
    models: [
      { id: 'mistral-medium-3.5-platform', displayName: 'Mistral Medium 3.5 — lead seat: coordinator + Builder + vision + deep specialists (Researcher, Challenger, CVE Researcher, Fact Checker, Security Verifier, Architect, Tutor, Content Writer). Frontier flagship, AA Index 39', inputPricePerM: 1.50, outputPricePerM: 7.50, contextWindow: 256_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'mistral-small-4-platform', displayName: 'Mistral Small 4 — high-volume workhorse: chat, intent gate, image-gen orchestration, long-context, brainstorm; light specialists (Verifier, Sequencer, Recon, Scanner, Reporter, Quiz Master). Cheaper and smarter than Large 3', inputPricePerM: 0.15, outputPricePerM: 0.60, contextWindow: 262_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'mistral-large-3-platform', displayName: 'Mistral Large 3 — heavy reserve / fallback (675B/41B MoE, Apache-2.0, broad knowledge, multimodal; non-reasoning today)', inputPricePerM: 0.50, outputPricePerM: 1.50, contextWindow: 262_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
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
    notes: 'BYOK chat models — bring your own MiniMax API key. (MiniMax also powers Creative Studio voice.)',
    models: [
      { id: 'MiniMax-M3', displayName: 'MiniMax M3', inputPricePerM: 0.60, outputPricePerM: 2.40, contextWindow: 1_048_576, capabilities: ['tools', 'thinking', 'streaming', 'vision'] },
      { id: 'MiniMax-M2.7', displayName: 'MiniMax M2.7', inputPricePerM: 0.30, outputPricePerM: 1.20, contextWindow: 204_800, capabilities: ['tools', 'thinking', 'streaming'] },
      { id: 'MiniMax-M2.7-highspeed', displayName: 'MiniMax M2.7 HighSpeed', inputPricePerM: 0.60, outputPricePerM: 2.40, contextWindow: 204_800, capabilities: ['tools', 'thinking', 'streaming'] },
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
    notes: 'Powers Aurora routing mode. EU-based, Apache-2.0 open weights, never leaves European infrastructure. Medium 3.5 (frontier flagship) leads; Small 4 carries volume; Large 3 is the heavy reserve.',
    models: [
      { id: 'mistral-medium-3.5-platform', displayName: 'Mistral Medium 3.5', inputPricePerM: 1.50, outputPricePerM: 7.50, contextWindow: 256_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'mistral-small-4-platform', displayName: 'Mistral Small 4', inputPricePerM: 0.15, outputPricePerM: 0.60, contextWindow: 262_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'mistral-large-3-platform', displayName: 'Mistral Large 3', inputPricePerM: 0.50, outputPricePerM: 1.50, contextWindow: 262_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'byok',
    models: [
      { id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8', inputPricePerM: 5, outputPricePerM: 25, contextWindow: 200_000, capabilities: ['tools', 'vision', 'streaming'] },
      { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', inputPricePerM: 3, outputPricePerM: 15, contextWindow: 200_000, capabilities: ['tools', 'vision', 'streaming'] },
      { id: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5', inputPricePerM: 1, outputPricePerM: 5, contextWindow: 200_000, capabilities: ['tools', 'vision', 'streaming'] },
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
  {
    id: 'kimi',
    name: 'Kimi (Moonshot AI)',
    kind: 'byok',
    notes: 'K2.6 is SoTA on agentic coding — 58.6 on SWE-Bench Pro (beats Opus 4.6), built for 300-sub-agent orchestration. 256K context.',
    models: [
      { id: 'kimi-k2.6', displayName: 'Kimi K2.6', inputPricePerM: 0.95, outputPricePerM: 4.00, contextWindow: 256_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'kimi-k2.5', displayName: 'Kimi K2.5', inputPricePerM: 0.60, outputPricePerM: 3.00, contextWindow: 256_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    kind: 'byok',
    notes: 'Same models the Aurora routing mode uses — pick them directly with your own Mistral key, or let Aurora orchestrate. EU infrastructure, Apache-2.0 open weights.',
    models: [
      { id: 'mistral-medium-3.5', displayName: 'Mistral Medium 3.5 (frontier flagship)', inputPricePerM: 1.50, outputPricePerM: 7.50, contextWindow: 256_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'mistral-small-4', displayName: 'Mistral Small 4', inputPricePerM: 0.15, outputPricePerM: 0.60, contextWindow: 262_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'mistral-large-3', displayName: 'Mistral Large 3', inputPricePerM: 0.50, outputPricePerM: 1.50, contextWindow: 262_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'codestral-latest', displayName: 'Codestral', inputPricePerM: 0.30, outputPricePerM: 0.90, contextWindow: 256_000, capabilities: ['tools', 'streaming'] },
      { id: 'devstral-latest', displayName: 'Devstral 2', inputPricePerM: 0.40, outputPricePerM: 2.00, contextWindow: 262_000, capabilities: ['tools', 'streaming'] },
    ],
  },
  {
    id: 'zhipu',
    name: 'Zhipu AI',
    kind: 'byok',
    notes: 'GLM-5 reports 77.8% on SWE-Bench.',
    models: [
      { id: 'glm-5.1', displayName: 'GLM-5.1', inputPricePerM: 1.40, outputPricePerM: 4.40, contextWindow: 200_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'glm-5', displayName: 'GLM-5', inputPricePerM: 1.00, outputPricePerM: 3.20, contextWindow: 200_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'glm-4.7', displayName: 'GLM-4.7', inputPricePerM: 0.60, outputPricePerM: 2.20, contextWindow: 200_000, capabilities: ['tools', 'thinking', 'streaming'] },
      { id: 'glm-4.5-air', displayName: 'GLM-4.5 Air', inputPricePerM: 0.20, outputPricePerM: 1.10, contextWindow: 128_000, capabilities: ['tools', 'streaming'] },
    ],
  },
  {
    id: 'xiaomi',
    name: 'Xiaomi',
    kind: 'byok',
    notes: 'MiMo V2.5 — matches Claude Sonnet 4.6 on agentic multimodal, Gemini 3 Pro on Video-MME. Sustains 1,000+ sequential tool calls. Released 2026-04-22.',
    models: [
      { id: 'mimo-v2.5-pro', displayName: 'MiMo V2.5-Pro', inputPricePerM: 1.00, outputPricePerM: 3.00, contextWindow: 1_048_576, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'mimo-v2.5',     displayName: 'MiMo V2.5',     inputPricePerM: 0.40, outputPricePerM: 2.00, contextWindow: 1_048_576, capabilities: ['tools', 'vision', 'streaming'] },
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
