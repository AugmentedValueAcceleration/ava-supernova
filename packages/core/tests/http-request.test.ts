import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('node:https', () => ({
  request: vi.fn(),
}));

vi.mock('node:http', () => ({
  request: vi.fn(),
}));

import { request as httpsRequest } from 'node:https';
import { HttpRequestTool } from '../src/tools/http-request.js';

const mockHttpsRequest = httpsRequest as unknown as ReturnType<typeof vi.fn>;
const ctx = { cwd: '/test' };

/** Helper: simulate an HTTP response */
function mockResponse(statusCode: number, body: string, headers: Record<string, string> = {}) {
  mockHttpsRequest.mockImplementation((_url: string, _opts: unknown, callback: Function) => {
    const res = new EventEmitter() as EventEmitter & {
      statusCode: number;
      statusMessage: string;
      headers: Record<string, string>;
    };
    res.statusCode = statusCode;
    res.statusMessage = statusCode === 200 ? 'OK' : statusCode === 404 ? 'Not Found' : 'Error';
    res.headers = headers;

    callback(res);

    process.nextTick(() => {
      res.emit('data', Buffer.from(body));
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('HttpRequestTool', () => {
  const tool = new HttpRequestTool();

  beforeEach(() => vi.clearAllMocks());

  it('has name "http_request" and riskLevel "safe"', () => {
    expect(tool.name).toBe('http_request');
    expect(tool.riskLevel).toBe('safe');
  });

  it('makes GET request and returns status + body', async () => {
    mockResponse(200, '{"ok":true}', { 'content-type': 'application/json' });
    const result = await tool.execute({ url: 'https://api.example.com/test' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain('HTTP 200');
    expect(result.output).toContain('{"ok":true}');
  });

  it('defaults method to GET', async () => {
    mockResponse(200, 'ok');
    await tool.execute({ url: 'https://example.com' }, ctx);
    expect(mockHttpsRequest).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ method: 'GET' }),
      expect.any(Function),
    );
  });

  it('rejects empty URL', async () => {
    const result = await tool.execute({ url: '' }, ctx);
    expect(result.success).toBe(false);
  });

  it('rejects invalid URL', async () => {
    const result = await tool.execute({ url: 'not-a-url' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Invalid URL');
  });

  it('rejects unsupported protocol (ftp://)', async () => {
    const result = await tool.execute({ url: 'ftp://files.example.com/data' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Unsupported protocol');
  });

  it('rejects unsupported HTTP method', async () => {
    const result = await tool.execute({ url: 'https://example.com', method: 'PURGE' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Unsupported method');
  });

  it('includes relevant headers in output', async () => {
    mockResponse(200, 'body', { 'content-type': 'text/html', 'x-internal': 'skip' });
    const result = await tool.execute({ url: 'https://example.com' }, ctx);
    expect(result.output).toContain('content-type');
    // x-internal should be filtered out
    expect(result.output).not.toContain('x-internal');
  });

  it('truncates body at 30,000 characters', async () => {
    mockResponse(200, 'x'.repeat(35000));
    const result = await tool.execute({ url: 'https://example.com' }, ctx);
    expect(result.output).toContain('truncated');
  });

  it('returns success:false for 4xx status', async () => {
    mockResponse(404, 'Not Found');
    const result = await tool.execute({ url: 'https://example.com/missing' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('404');
  });

  it('returns success:true for 2xx status', async () => {
    mockResponse(201, '{"id":1}');
    const result = await tool.execute({ url: 'https://api.example.com', method: 'POST', body: '{}' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain('201');
  });

  it('handles network error', async () => {
    mockHttpsRequest.mockImplementation((_url: string, _opts: unknown, _callback: Function) => {
      const req = new EventEmitter();
      (req as any).write = vi.fn();
      (req as any).end = vi.fn();
      (req as any).destroy = vi.fn();
      process.nextTick(() => req.emit('error', new Error('ECONNREFUSED')));
      return req;
    });

    const result = await tool.execute({ url: 'https://dead.host' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toContain('ECONNREFUSED');
  });

  it('sends request body for POST', async () => {
    let writtenBody = '';
    mockHttpsRequest.mockImplementation((_url: string, _opts: unknown, callback: Function) => {
      const res = new EventEmitter() as any;
      res.statusCode = 200;
      res.statusMessage = 'OK';
      res.headers = {};
      callback(res);
      process.nextTick(() => {
        res.emit('data', Buffer.from('ok'));
        res.emit('end');
      });
      return {
        on: vi.fn(),
        write: vi.fn((data: string) => { writtenBody = data; }),
        end: vi.fn(),
        destroy: vi.fn(),
      };
    });

    await tool.execute({ url: 'https://api.example.com', method: 'POST', body: '{"name":"test"}' }, ctx);
    expect(writtenBody).toBe('{"name":"test"}');
  });
});
