/**
 * The providers a key can be added for — the same list, links and notes the
 * extension's and the IDE's key screens show, so all three apps agree. `id` is
 * the provider id core's key test and the shared keychain use (glm, not zhipu).
 */
export interface KeyProvider {
  id: string;
  name: string;
  url: string;
  note: string;
}

export const QWEN: KeyProvider = {
  id: 'qwen',
  name: 'Qwen (Alibaba Cloud Model Studio)',
  url: 'https://modelstudio.console.alibabacloud.com/ap-southeast-1/settings/api-key',
  note: 'Recommended first — Maestro, the Design Studio and image reading run on it. Create the key in the Singapore region: keys are region-locked.',
};

export const CHAT_PROVIDERS: KeyProvider[] = [
  QWEN,
  { id: 'deepseek', name: 'DeepSeek', url: 'https://platform.deepseek.com/api_keys', note: 'Coding and reasoning — Supernova runs on it.' },
  { id: 'mistral', name: 'Mistral', url: 'https://console.mistral.ai/api-keys', note: 'European models — Aurora runs on them.' },
  { id: 'kimi', name: 'Kimi (Moonshot)', url: 'https://platform.kimi.ai/console/api-keys', note: 'Long context — Longxiang runs on it.' },
  { id: 'glm', name: 'GLM (Z.ai)', url: 'https://z.ai/manage-apikey/apikey-list', note: 'Open-weights coding models.' },
  { id: 'tencent', name: 'Tencent TokenHub (Hunyuan)', url: 'https://console.tencentcloud.com/tokenhub/apikey', note: 'Pick the Singapore region before creating the key.' },
  { id: 'nvidia', name: 'NVIDIA', url: 'https://build.nvidia.com/settings/api-keys', note: 'Keys start with nvapi-.' },
  { id: 'minimax', name: 'MiniMax', url: 'https://platform.minimax.io/console/keys', note: 'MiniMax M3 — reads images too, 1M context.' },
  { id: 'xiaomi', name: 'Xiaomi MiMo', url: 'https://platform.xiaomimimo.com/#/console/api-keys', note: 'Use a pay-as-you-go key (sk-), not a Token Plan key.' },
];

export const BRAVE: KeyProvider = {
  id: 'brave',
  name: 'Brave Search',
  url: 'https://api-dashboard.search.brave.com/app/keys',
  note: 'Optional — better web search. Without it Ava searches with DuckDuckGo.',
};

export const ALL_KEY_PROVIDERS: KeyProvider[] = [...CHAT_PROVIDERS, BRAVE];

/** Registry name for a provider id (the registry calls GLM 'zhipu'). */
export const registryName = (id: string): string => (id === 'glm' ? 'zhipu' : id);
