import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('node:https', () => ({
  request: vi.fn(),
}));

import { request } from 'node:https';
import { WebSearchTool } from '../src/tools/web-search.js';

const mockRequest = request as unknown as ReturnType<typeof vi.fn>;
const ctx = { cwd: '/test' };

/** Helper: mock DuckDuckGo returning HTML */
function mockDDGResponse(html: string, statusCode = 200) {
  mockRequest.mockImplementation((_url: string, _opts: unknown, callback: Function) => {
    const res = new EventEmitter() as any;
    res.statusCode = statusCode;
    callback(res);
    process.nextTick(() => {
      res.emit('data', Buffer.from(html));
      res.emit('end');
    });
    return {
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    };
  });
}

const SAMPLE_HTML =
  '<table>' +
  '<a rel="nofollow" href="https://example.com/page1" class="result-link">Example Page 1</a>' +
  '<td class="result-snippet">First result snippet.</td>' +
  '<a rel="nofollow" href="https://example.com/page2" class="result-link">Example Page 2</a>' +
  '<td class="result-snippet">Second result snippet.</td>' +
  '</table>';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('WebSearchTool', () => {
  const tool = new WebSearchTool();

  beforeEach(() => vi.clearAllMocks());

  it('has name "web_search" and riskLevel "safe"', () => {
    expect(tool.name).toBe('web_search');
    expect(tool.riskLevel).toBe('safe');
  });

  it('rejects empty query', async () => {
    const result = await tool.execute({ query: '  ' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('empty');
  });

  it('parses DuckDuckGo Lite HTML into structured results', async () => {
    mockDDGResponse(SAMPLE_HTML);
    const result = await tool.execute({ query: 'test query' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain('Example Page 1');
    expect(result.output).toContain('https://example.com/page1');
    expect(result.output).toContain('Example Page 2');
    expect(result.metadata?.count).toBe(2);
  });

  // A page that parses to nothing is FAR more often the markup having moved,
  // or a throttle, than the web being silent. Reporting it as "no results
  // found" with success:true told the caller a fact about the world that it
  // had no business asserting — measured 26 Sep 2026, when DuckDuckGo was
  // answering a script's User-Agent with 22KB of results-free HTML.
  it('a page with nothing parseable is a FAILURE, not an empty web', async () => {
    mockDDGResponse('<html><body>No results</body></html>');
    const result = await tool.execute({ query: 'xyznonexistent' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('nothing in it parsed as a result');
    expect(result.output).toContain('changed shape');
    // The conclusion that must never be drawn from it.
    expect(result.output).toContain('Do not report this as "no information exists"');
  });

  it('a throttle says it was refused, not that there is nothing', async () => {
    // What being rate-limited actually looks like: HTTP 202 and an anomaly
    // page. Not 429, not an error — a 200-shaped response with no results.
    mockDDGResponse('<html><body>If this error persists, please let us know... anomaly</body></html>', 202);
    const result = await tool.execute({ query: 'javascript modulo' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('refused, not empty');
    expect(result.output).toContain('do not conclude there is nothing');
    expect(result.metadata?.blocked).toBe(true);
  });

  it('handles network errors gracefully', async () => {
    mockRequest.mockImplementation((_url: string, _opts: unknown, _callback: Function) => {
      const req = new EventEmitter();
      (req as any).write = vi.fn();
      (req as any).end = vi.fn();
      (req as any).destroy = vi.fn();
      process.nextTick(() => req.emit('error', new Error('ECONNREFUSED')));
      return req;
    });

    const result = await tool.execute({ query: 'test' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('search failed');
  });

  it('formats output as numbered list', async () => {
    mockDDGResponse(SAMPLE_HTML);
    const result = await tool.execute({ query: 'test' }, ctx);
    expect(result.output).toContain('1. Example Page 1');
    expect(result.output).toContain('2. Example Page 2');
  });

  it('defaults to 5 max results', async () => {
    // Generate HTML with 7 results
    const rows = Array.from({ length: 7 }, (_, i) =>
      `<a href="https://example.com/${i}" class="result-link">Result ${i}</a>
       <td class="result-snippet">Snippet ${i}</td>`,
    ).join('');
    mockDDGResponse(`<table>${rows}</table>`);

    const result = await tool.execute({ query: 'test' }, ctx);
    expect(result.metadata?.count).toBeLessThanOrEqual(5);
  });

  it('caps max_results at 10', async () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      `<a href="https://example.com/${i}" class="result-link">Result ${i}</a>
       <td class="result-snippet">Snippet ${i}</td>`,
    ).join('');
    mockDDGResponse(`<table>${rows}</table>`);

    const result = await tool.execute({ query: 'test', max_results: 20 }, ctx);
    expect(result.metadata?.count).toBeLessThanOrEqual(10);
  });
});
