// Search, best first (BYOK plan, 1 Nov 2026): what the surface injected → the
// user's own Brave key → DuckDuckGo. Offline: fetch is faked.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// DuckDuckGo goes through node:https, not fetch — faked here so nothing
// reaches the network, and so the test can SEE the fallback happen.
const ddgCalls: string[] = [];
vi.mock('node:https', () => ({
  request: (url: string, _opts: unknown, cb: (res: EventEmitter & { statusCode: number; setEncoding: () => void }) => void) => {
    ddgCalls.push(String(url));
    const req = new EventEmitter() as EventEmitter & { write: () => void; end: () => void; setTimeout: () => void; destroy: () => void };
    req.write = () => {}; req.setTimeout = () => {}; req.destroy = () => {};
    req.end = () => {
      const res = Object.assign(new EventEmitter(), { statusCode: 200, setEncoding: () => {} });
      cb(res);
      res.emit('data', '<a rel="nofollow" href="https://duck/result" class="result-link">Duck result</a><td class="result-snippet">from duckduckgo</td>');
      res.emit('end');
    };
    return req;
  },
}));

import { WebSearchTool, resolveWebSearch } from '../src/tools/web-search.js';
import { ResearchPostTool } from '../src/tools/research-post.js';

const BRAVE = { web: { results: [{ title: 'Ava <b>Supernova</b>', url: 'https://x/ava', description: 'a local-first agent', extra_snippets: ['open source'] }] } };
const DDG_HTML = '<a rel="nofollow" href="https://duck/result" class="result-link">Duck result</a><td class="result-snippet">from duckduckgo</td>';

function fakeFetch(opts: { braveFails?: boolean } = {}) {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    urls.push(String(url));
    if (String(url).includes('api.search.brave.com')) {
      expect((init.headers as Record<string, string>)['X-Subscription-Token']).toBe('brave-user-key');
      return opts.braveFails ? new Response('quota', { status: 429 }) : new Response(JSON.stringify(BRAVE), { status: 200 });
    }
    if (String(url).includes('duckduckgo')) return new Response(DDG_HTML, { status: 200 });
    if (String(url).includes('bsky.app')) return new Response(JSON.stringify({ posts: [] }), { status: 200 });
    return new Response('{}', { status: 200 });
  }));
  return urls;
}
afterEach(() => vi.unstubAllGlobals());

const withBrave = { cwd: '.', sharedState: { getProviderKey: (p: string) => (p === 'brave' ? 'brave-user-key' : undefined) } } as never;
const bare = { cwd: '.', sharedState: {} } as never;

describe('which search answers', () => {
  it('the surface\'s own backend first, then the user\'s Brave key, then DuckDuckGo', () => {
    const injected = { cwd: '.', sharedState: { webSearch: async () => [], getProviderKey: () => 'k' } } as never;
    expect(resolveWebSearch(injected).backend).toBe('platform');
    expect(resolveWebSearch(withBrave).backend).toBe('brave');
    expect(resolveWebSearch(bare).backend).toBe('duckduckgo');
  });

  it('web_search uses the user\'s Brave key, with tags stripped', async () => {
    const urls = fakeFetch();
    const r = await new WebSearchTool().execute({ query: 'ava supernova' }, withBrave);
    expect(r.success).toBe(true);
    expect(r.metadata?.backend).toBe('brave');
    expect(r.output).toMatch(/Ava Supernova/);
    expect(r.output).toMatch(/local-first agent open source/);
    expect(urls.some((u) => u.includes('duckduckgo'))).toBe(false);
    expect(ddgCalls.length).toBe(0);
  });

  it('a failing Brave key falls back to DuckDuckGo instead of ending the turn', async () => {
    fakeFetch({ braveFails: true });
    ddgCalls.length = 0;
    const r = await new WebSearchTool().execute({ query: 'ava supernova' }, withBrave);
    expect(ddgCalls.length).toBeGreaterThan(0);
    expect(r.metadata?.backend).not.toBe('brave');
  });

  it('research_post works without the server — it used to refuse outright', async () => {
    fakeFetch();
    const r = await new ResearchPostTool().execute({ subject: 'local-first AI', platform: 'bluesky' }, withBrave);
    expect(r.success).toBe(true);
    expect(JSON.parse(r.output).current_discussion.length).toBeGreaterThan(0);
  });
});
