/**
 * Test a key before it is saved (BYOK plan, 1 Nov 2026).
 *
 * With no accounts, a working key is the only way into Ava — so onboarding and
 * Settings check every pasted key and say plainly what is wrong. The commonest
 * failure has its own message: a Qwen key made in a non-Singapore region, which
 * the international endpoint refuses as if it were mistyped.
 */

import { BaseProvider } from './base-provider.js';
import { DeepSeekProvider } from './deepseek/index.js';
import { KimiProvider } from './kimi/index.js';
import { QwenProvider } from './qwen/index.js';
import { ZhipuProvider } from './zhipu/index.js';
import { MistralProvider } from './mistral/index.js';
import { MiniMaxProvider } from './minimax/index.js';
import { XiaomiProvider } from './xiaomi/index.js';
import { TencentProvider } from './tencent/index.js';
import { NvidiaProvider } from './nvidia/index.js';

export type KeyTestResult =
  | { status: 'valid' }
  /** The provider refused the key. */
  | { status: 'invalid'; message: string }
  /** No verdict (provider down, rate-limited…). Saving is still allowed. */
  | { status: 'unverified'; message: string };

const PROVIDERS: Record<string, (apiKey: string) => BaseProvider> = {
  deepseek: (k) => new DeepSeekProvider({ apiKey: k }),
  kimi: (k) => new KimiProvider({ apiKey: k }),
  qwen: (k) => new QwenProvider({ apiKey: k }),
  zhipu: (k) => new ZhipuProvider({ apiKey: k }),
  glm: (k) => new ZhipuProvider({ apiKey: k }), // the extension's config name for Zhipu
  mistral: (k) => new MistralProvider({ apiKey: k }),
  minimax: (k) => new MiniMaxProvider({ apiKey: k }),
  xiaomi: (k) => new XiaomiProvider({ apiKey: k }),
  tencent: (k) => new TencentProvider({ apiKey: k }),
  nvidia: (k) => new NvidiaProvider({ apiKey: k }),
};

const QWEN_REGION_HINT =
  'Qwen refused this key. Ava uses the international (Singapore) endpoint — in Model Studio, '
  + 'switch the region at the top of the page to Singapore and create the key there.';

/** Brave Search: one query is the only way to ask (it has no key-check endpoint). */
async function testBrave(apiKey: string, signal?: AbortSignal): Promise<KeyTestResult> {
  const res = await fetch('https://api.search.brave.com/res/v1/web/search?q=ava&count=1', {
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
    signal,
  }).catch(() => null);
  if (!res) return { status: 'unverified', message: 'Could not reach Brave Search — saved anyway; Ava will try it when she searches.' };
  if (res.ok) return { status: 'valid' };
  if (res.status === 401 || res.status === 403 || res.status === 422) return { status: 'invalid', message: 'Brave Search refused this key. Check it was copied whole.' };
  return { status: 'unverified', message: `Brave Search answered ${res.status} — saved anyway; Ava will try it when she searches.` };
}

export async function testProviderKey(provider: string, apiKey: string, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<KeyTestResult> {
  const key = apiKey.trim();
  if (!key) return { status: 'invalid', message: 'Paste a key first.' };
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), opts.timeoutMs ?? 15_000);
  const signal = opts.signal ?? timeout.signal;
  try {
    if (provider === 'brave') return await testBrave(key, signal);
    const make = PROVIDERS[provider];
    if (!make) return { status: 'unverified', message: `No test for ${provider} — saved as given.` };
    const r = await make(key).testKey(signal);
    if (r.ok === true) return { status: 'valid' };
    if (r.ok === false) {
      return { status: 'invalid', message: provider === 'qwen' ? QWEN_REGION_HINT : 'The provider refused this key. Check it was copied whole, and that the account has credit.' };
    }
    return { status: 'unverified', message: r.status ? `The provider answered ${r.status}, so the key could not be checked — saved anyway.` : 'Could not reach the provider — saved anyway.' };
  } catch {
    return { status: 'unverified', message: 'The check timed out — saved anyway.' };
  } finally {
    clearTimeout(timer);
  }
}
