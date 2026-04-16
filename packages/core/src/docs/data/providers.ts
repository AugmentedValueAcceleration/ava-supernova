// Canonical provider + model fact table.
// Pricing is USD per 1M tokens and may drift — verify against provider pages before quoting publicly.
// Update here when models are added, deprecated, or repriced.

export type ProviderKind = 'managed' | 'byok';
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
  {
    id: 'qwen',
    name: 'Qwen (Alibaba Cloud)',
    kind: 'managed',
    notes: 'Qwen 3.6 Plus coordinates Auto Mode; Omni Flash is the free-tier default.',
    models: [
      { id: 'qwen3.6-plus', displayName: 'Qwen 3.6 Plus', inputPricePerM: 0.29, outputPricePerM: 1.70, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3.5-omni-plus', displayName: 'Qwen 3.5 Omni Plus', inputPricePerM: 0.26, outputPricePerM: 1.56, contextWindow: 256_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen3-omni-flash', displayName: 'Qwen Omni Flash', inputPricePerM: 0.065, outputPricePerM: 0.26, contextWindow: 256_000, capabilities: ['tools', 'vision', 'streaming'] },
      { id: 'qwen3.5-plus', displayName: 'Qwen 3.5 Plus', inputPricePerM: 0.20, outputPricePerM: 1.20, contextWindow: 1_000_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'qwen-flash', displayName: 'Qwen Flash', inputPricePerM: 0.05, outputPricePerM: 0.40, contextWindow: 256_000, capabilities: ['tools', 'streaming'] },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    kind: 'managed',
    notes: 'Powers Creative Studio — image, video, music, voice.',
    models: [
      { id: 'MiniMax-M2.7', displayName: 'MiniMax M2.7', inputPricePerM: 0.30, outputPricePerM: 1.20, contextWindow: 204_800, capabilities: ['tools', 'thinking', 'streaming'] },
      { id: 'MiniMax-M2.5', displayName: 'MiniMax M2.5', inputPricePerM: 0.15, outputPricePerM: 1.20, contextWindow: 1_000_000, capabilities: ['tools', 'thinking', 'streaming'] },
      { id: 'MiniMax-M2', displayName: 'MiniMax M2', inputPricePerM: 0.255, outputPricePerM: 1.00, contextWindow: 1_000_000, capabilities: ['tools', 'thinking', 'streaming'] },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'byok',
    models: [
      { id: 'claude-opus-4-6', displayName: 'Claude Opus 4.6', inputPricePerM: 5, outputPricePerM: 25, contextWindow: 200_000, capabilities: ['tools', 'vision', 'streaming'] },
      { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', inputPricePerM: 3, outputPricePerM: 15, contextWindow: 200_000, capabilities: ['tools', 'vision', 'streaming'] },
      { id: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5', inputPricePerM: 1, outputPricePerM: 5, contextWindow: 200_000, capabilities: ['tools', 'vision', 'streaming'] },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'byok',
    models: [
      { id: 'deepseek-chat', displayName: 'DeepSeek V3.2', inputPricePerM: 0.28, outputPricePerM: 0.42, contextWindow: 128_000, capabilities: ['tools', 'streaming'] },
      { id: 'deepseek-reasoner', displayName: 'DeepSeek V3.2 Reasoner', inputPricePerM: 0.28, outputPricePerM: 0.42, contextWindow: 128_000, capabilities: ['tools', 'thinking', 'streaming'] },
    ],
  },
  {
    id: 'kimi',
    name: 'Kimi (Moonshot AI)',
    kind: 'byok',
    notes: 'K2.5 reports 76.8% on SWE-Bench with 256K context.',
    models: [
      { id: 'kimi-k2.5', displayName: 'Kimi K2.5', inputPricePerM: 0.60, outputPricePerM: 3.00, contextWindow: 256_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    kind: 'byok',
    models: [
      { id: 'mistral-large-latest', displayName: 'Mistral Large', inputPricePerM: 2.00, outputPricePerM: 6.00, contextWindow: 262_000, capabilities: ['tools', 'vision', 'streaming'] },
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
      { id: 'glm-5', displayName: 'GLM-5', inputPricePerM: 1.00, outputPricePerM: 3.20, contextWindow: 200_000, capabilities: ['tools', 'vision', 'thinking', 'streaming'] },
      { id: 'glm-4.7-flash', displayName: 'GLM-4.7 Flash', inputPricePerM: 0.07, outputPricePerM: 0.40, contextWindow: 128_000, capabilities: ['tools', 'streaming'] },
      { id: 'glm-4.5-flash', displayName: 'GLM-4.5 Flash (Free)', inputPricePerM: 0, outputPricePerM: 0, contextWindow: 128_000, capabilities: ['tools', 'streaming'] },
    ],
  },
];

export const MANAGED_PROVIDERS = PROVIDERS.filter(p => p.kind === 'managed');
export const BYOK_PROVIDERS = PROVIDERS.filter(p => p.kind === 'byok');
