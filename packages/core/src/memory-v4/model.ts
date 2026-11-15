/**
 * Which model does the end-of-session tidy-up.
 *
 * DECIDED 15 Nov (revised the same day after a real trial): the fleet's MAIN
 * model, not its cheapest. Qwen 3.8 Flash ignored two of the tidy-up's rules
 * on a real conversation (it copied a brand kit into memory and wrote changes
 * as "Superseded by…"); Qwen 3.7 Plus followed them. The tidy-up runs once per
 * session, so the difference is ~$0.0008 against ~$0.004, and it is the one
 * writer of the person's memory.
 *
 *   Maestro (Qwen)              → Qwen 3.7 Plus
 *   Supernova (Qwen + DeepSeek) → DeepSeek Flash, its coordinator
 *   Aurora (Mistral)            → Mistral Small 4
 *   own keys, no fleet          → the first of these the person holds a key for
 *   no key, a local model       → that local model (DECIDED 15 Nov: someone
 *                                 running Ava only on their own machine still
 *                                 gets the tidy-up)
 *
 * Each fleet stays on its own providers. Null when none is reachable: saves
 * they ask for still work, and only the tidy-up is skipped.
 */

import type { ModelDefinition } from '../core/types.js';
import type { Provider } from '../providers/types.js';
import type { ProviderRegistry } from '../providers/provider-registry.js';
import { FLEET_PROVIDERS, resolveOnFleet } from '../auto/coordinator-model.js';

const FLEET_LADDER: Record<string, readonly string[]> = {
  auto: ['qwen3.7-plus', 'qwen3.8-flash'],
  supernova: ['deepseek-flash', 'qwen3.7-plus', 'qwen3.8-flash'],
  aurora: ['mistral-small-4'],
};

const OWN_KEYS_LADDER = ['qwen3.7-plus', 'deepseek-flash', 'mistral-small-4', 'qwen3.8-flash', 'qwen3.7-flash', 'qwen3.5-flash', 'nvidia/nemotron-3.5-lightning-30b-a3b'];

/** A local model (Ollama, LM Studio, any OpenAI-compatible server they run): registered as `generic`. */
export function isLocalModel(current: { provider: Provider } | null | undefined): boolean {
  return current?.provider.name === 'generic';
}

export function resolveMemoryModel(
  providerRegistry: ProviderRegistry,
  availableProviders: Iterable<string>,
  routingMode?: string,
  /** The model they are chatting with: used when nothing else is reachable and it is a local one. */
  current?: { provider: Provider; model: ModelDefinition } | null,
): { provider: Provider; model: ModelDefinition } | null {
  const local = current && isLocalModel(current) ? current : null;
  const fleet = routingMode ? FLEET_PROVIDERS[routingMode as keyof typeof FLEET_PROVIDERS] : undefined;
  if (fleet) {
    for (const id of FLEET_LADDER[routingMode as string] ?? OWN_KEYS_LADDER) {
      const r = resolveOnFleet(providerRegistry, fleet, id);
      if (r) return r;
    }
    return local;
  }
  const providers = [...availableProviders];
  for (const id of OWN_KEYS_LADDER) {
    for (const p of providers) {
      const r = providerRegistry.resolveModel(`${p}:${id}`);
      if (r && r.provider.name === p) return { provider: r.provider, model: r.model };
    }
    const direct = providerRegistry.resolveModel(id);
    if (direct) return { provider: direct.provider, model: direct.model };
  }
  return local;
}
