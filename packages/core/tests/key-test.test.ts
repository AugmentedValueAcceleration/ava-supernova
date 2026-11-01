// Keys are tested before they are saved (BYOK plan, 1 Nov 2026). Fetch is
// mocked: no real provider is called.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { testProviderKey } from '../src/providers/key-test.js';

type Call = { url: string; init: RequestInit };
function mockFetch(respond: (url: string) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const r = respond(String(url));
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('testProviderKey', () => {
  it('a key the model list accepts is valid, and only the free list call is made', async () => {
    const calls = mockFetch(() => ({ status: 200, body: { data: [] } }));
    expect(await testProviderKey('deepseek', 'sk-good')).toEqual({ status: 'valid' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.deepseek.com/v1/models');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk-good');
  });

  it('a refused Qwen key says to make it in the Singapore region', async () => {
    mockFetch(() => ({ status: 401 }));
    const r = await testProviderKey('qwen', 'sk-cn-region');
    expect(r.status).toBe('invalid');
    expect(r.status === 'invalid' && r.message).toMatch(/Singapore/);
  });

  it('no model list → one 1-token turn decides it', async () => {
    const calls = mockFetch((url) => (url.endsWith('/models') ? { status: 404 } : { status: 200, body: { choices: [] } }));
    expect(await testProviderKey('tencent', 'k')).toEqual({ status: 'valid' });
    expect(JSON.parse(String(calls[1].init.body)).max_tokens).toBe(1);
  });

  it('a provider that is down is not a verdict', async () => {
    mockFetch(() => ({ status: 503 }));
    expect((await testProviderKey('mistral', 'k')).status).toBe('unverified');
  });

  it('glm is Zhipu, and Brave is checked with its own header', async () => {
    let calls = mockFetch(() => ({ status: 200 }));
    await testProviderKey('glm', 'k');
    expect(calls[0].url.startsWith('https://api.z.ai/')).toBe(true);
    calls = mockFetch(() => ({ status: 401 }));
    const r = await testProviderKey('brave', 'bk');
    expect(r.status).toBe('invalid');
    expect((calls[0].init.headers as Record<string, string>)['X-Subscription-Token']).toBe('bk');
  });

  it('an empty paste is caught without a call', async () => {
    const calls = mockFetch(() => ({ status: 200 }));
    expect((await testProviderKey('qwen', '   ')).status).toBe('invalid');
    expect(calls).toHaveLength(0);
  });
});
