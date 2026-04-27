import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const DEFAULT_TIMEOUT = 15_000;
const MAX_TIMEOUT = 60_000;
const MAX_BODY_LENGTH = 30_000;
const MAX_REDIRECTS = 5;

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

/** Block requests to private/internal IP ranges (SSRF protection). */
function isPrivateHost(hostname: string): boolean {
  // Block obvious private hostnames
  if (hostname === 'localhost' || hostname === '[::1]') return true;

  // IPv4 private ranges
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every(n => !isNaN(n))) {
    if (parts[0] === 127) return true;                                    // 127.0.0.0/8 loopback
    if (parts[0] === 10) return true;                                     // 10.0.0.0/8 private
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12 private
    if (parts[0] === 192 && parts[1] === 168) return true;               // 192.168.0.0/16 private
    if (parts[0] === 169 && parts[1] === 254) return true;               // 169.254.0.0/16 link-local / cloud metadata
    if (parts[0] === 0) return true;                                      // 0.0.0.0/8
  }

  return false;
}

/** Headers worth showing in the response summary. */
const INTERESTING_HEADERS = new Set([
  'content-type', 'content-length', 'location', 'set-cookie',
  'x-request-id', 'x-ratelimit-remaining', 'retry-after',
  'cache-control', 'etag', 'last-modified',
]);

interface RequestOptions {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  redirectCount?: number;
  timeout?: number;
  verbose?: boolean;
}

function doRequest(opts: RequestOptions): Promise<{ status: number; statusText: string; headers: Record<string, string>; allHeaders: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(opts.url);
    const isHttps = parsed.protocol === 'https:';
    const reqFn = isHttps ? httpsRequest : httpRequest;

    const reqHeaders: Record<string, string> = {
      'User-Agent': 'Ava-Supernova/1.0',
      ...(opts.headers ?? {}),
    };

    if (opts.body && !reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }

    const req = reqFn(
      opts.url,
      {
        method: opts.method,
        headers: reqHeaders,
        timeout: opts.timeout ?? DEFAULT_TIMEOUT,
      },
      (res) => {
        // Handle redirects
        const isRedirect = res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location;
        if (isRedirect) {
          const redirectCount = opts.redirectCount ?? 0;
          if (redirectCount >= MAX_REDIRECTS) {
            resolve({
              status: res.statusCode!,
              statusText: `Too many redirects (${MAX_REDIRECTS})`,
              headers: {},
              allHeaders: {},
              body: `Redirect limit exceeded. Last location: ${res.headers.location}`,
            });
            return;
          }

          // Resolve relative redirects
          const redirectUrl = new URL(res.headers.location!, opts.url).href;
          doRequest({ ...opts, url: redirectUrl, redirectCount: redirectCount + 1 })
            .then(resolve)
            .catch(reject);
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const rawHeaders = res.headers as Record<string, string | string[] | undefined>;
          const filteredHeaders: Record<string, string> = {};
          const allHeaders: Record<string, string> = {};
          for (const [key, value] of Object.entries(rawHeaders)) {
            if (value) {
              const strValue = Array.isArray(value) ? value.join(', ') : value;
              allHeaders[key] = strValue;
              if (INTERESTING_HEADERS.has(key.toLowerCase())) {
                filteredHeaders[key] = strValue;
              }
            }
          }

          let body = Buffer.concat(chunks).toString('utf-8');
          if (body.length > MAX_BODY_LENGTH) {
            body = body.slice(0, MAX_BODY_LENGTH) + '\n... (body truncated)';
          }

          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            headers: filteredHeaders,
            allHeaders,
            body,
          });
        });
        res.on('error', reject);
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    if (opts.body) {
      req.write(opts.body);
    }
    req.end();
  });
}

export class HttpRequestTool implements Tool {
  readonly name = 'http_request';
  readonly description = 'Make HTTP requests to test APIs or fetch data';
  readonly riskLevel: ToolRiskLevel = 'dangerous';
  readonly outputTrust = 'untrusted' as const;
  readonly requiresConfirmation = true;

  readonly schema: FunctionSchema = {
    name: 'http_request',
    description:
      'Make an HTTP request. Supports GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS. ' +
      'Use to test API endpoints, check URLs, or fetch data. ' +
      'Supports auth shortcuts, response assertions, JSON path extraction, and timing. ' +
      'Returns status code, relevant headers, and response body (truncated at 30KB). ' +
      'Follows redirects automatically (up to 5).',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to request (must be http:// or https://)',
        },
        method: {
          type: 'string',
          description: 'HTTP method. Default: GET',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
        },
        headers: {
          type: 'object',
          description: 'Custom request headers (optional)',
        },
        body: {
          type: 'string',
          description: 'Request body for POST/PUT/PATCH (optional). Defaults to JSON content type.',
        },
        auth: {
          type: 'object',
          description: 'Authentication shortcut. Sets Authorization header automatically.',
          properties: {
            type: { type: 'string', enum: ['bearer', 'basic'], description: 'Auth type' },
            token: { type: 'string', description: 'Bearer token (for type: bearer)' },
            username: { type: 'string', description: 'Username (for type: basic)' },
            password: { type: 'string', description: 'Password (for type: basic)' },
          },
        },
        timeout_ms: {
          type: 'number',
          description: 'Request timeout in milliseconds. Default: 15000. Max: 60000.',
        },
        assert_status: {
          type: 'number',
          description: 'Expected HTTP status code. Tool returns failure if status does not match.',
        },
        assert_body_contains: {
          type: 'string',
          description: 'String that must appear in response body. Tool returns failure if not found.',
        },
        extract_json_path: {
          type: 'string',
          description: 'Dot-notation path to extract from JSON response (e.g. "data.users[0].name").',
        },
        verbose: {
          type: 'boolean',
          description: 'Show full request/response headers and timing. Default: false.',
        },
      },
      required: ['url'],
    },
  };

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const url = args.url as string;
    const method = ((args.method as string) ?? 'GET').toUpperCase();
    const headers = { ...(args.headers as Record<string, string> | undefined) };
    const body = args.body as string | undefined;
    const auth = args.auth as { type?: string; token?: string; username?: string; password?: string } | undefined;
    const timeoutMs = Math.min(Math.max((args.timeout_ms as number) || DEFAULT_TIMEOUT, 1000), MAX_TIMEOUT);
    const assertStatus = args.assert_status as number | undefined;
    const assertBodyContains = args.assert_body_contains as string | undefined;
    const extractJsonPath = args.extract_json_path as string | undefined;
    const verbose = (args.verbose as boolean) ?? false;

    if (!url) {
      return { success: false, output: 'URL is required.' };
    }

    // Validate URL protocol and block private/internal hosts (SSRF protection)
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { success: false, output: `Unsupported protocol: ${parsed.protocol}. Only http:// and https:// are allowed.` };
      }
      if (isPrivateHost(parsed.hostname)) {
        return { success: false, output: `Blocked: requests to private/internal addresses are not allowed (${parsed.hostname}).` };
      }
    } catch {
      return { success: false, output: `Invalid URL: ${url}` };
    }

    if (!ALLOWED_METHODS.has(method)) {
      return { success: false, output: `Unsupported method: ${method}. Use one of: ${[...ALLOWED_METHODS].join(', ')}` };
    }

    // Apply auth shortcut
    if (auth?.type === 'bearer' && auth.token) {
      headers['Authorization'] = `Bearer ${auth.token}`;
    } else if (auth?.type === 'basic' && auth.username) {
      const encoded = Buffer.from(`${auth.username}:${auth.password ?? ''}`).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
    }

    try {
      const startTime = Date.now();
      const result = await doRequest({ url, method, headers, body, timeout: timeoutMs });
      const elapsed = Date.now() - startTime;

      const lines: string[] = [];
      const assertions: string[] = [];

      // Verbose: show request info
      if (verbose) {
        lines.push(`> ${method} ${url}`);
        for (const [key, value] of Object.entries(headers)) {
          lines.push(`> ${key}: ${value}`);
        }
        lines.push('');
      }

      lines.push(`HTTP ${result.status} ${result.statusText}`);

      // Headers (verbose = all, normal = interesting only)
      const showHeaders = verbose ? result.allHeaders : result.headers;
      const headerEntries = Object.entries(showHeaders);
      if (headerEntries.length > 0) {
        lines.push('');
        for (const [key, value] of headerEntries) {
          lines.push(`${key}: ${value}`);
        }
      }

      // JSON path extraction
      let extracted: unknown;
      if (extractJsonPath && result.body) {
        try {
          const json = JSON.parse(result.body);
          extracted = resolveJsonPath(json, extractJsonPath);
          if (extracted !== undefined) {
            lines.push('');
            lines.push(`[extracted ${extractJsonPath}]: ${typeof extracted === 'object' ? JSON.stringify(extracted, null, 2) : String(extracted)}`);
          } else {
            lines.push('');
            lines.push(`[extracted ${extractJsonPath}]: (not found)`);
          }
        } catch {
          lines.push('');
          lines.push(`[extract_json_path]: Response is not valid JSON`);
        }
      }

      // Body
      if (result.body && method !== 'HEAD' && !extractJsonPath) {
        lines.push('');
        // Strip <script>/<style> blocks from HTML responses before they
        // reach the model context. The trust-tag wrapper at the registry
        // level tells the model "this is data" — but we still don't need
        // to ship raw JS payloads embedded in fetched HTML to the model
        // in the first place. Prose-only is what's useful for LLM-driven
        // web fetches; the actual scripts add only attack surface.
        const contentType = (result.headers['content-type'] || '').toLowerCase();
        const looksLikeHtml = contentType.includes('html') || /<html[\s>]|<!doctype html/i.test(result.body.slice(0, 200));
        const sanitised = looksLikeHtml
          ? result.body
              .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
          : result.body;
        lines.push(sanitised);
      }

      // Timing
      if (verbose) {
        lines.push('');
        lines.push(`Time: ${elapsed}ms`);
      }

      // Assertions
      let isSuccess = result.status >= 200 && result.status < 400;
      if (assertStatus !== undefined && result.status !== assertStatus) {
        isSuccess = false;
        assertions.push(`Status assertion failed: expected ${assertStatus}, got ${result.status}`);
      }
      if (assertBodyContains && !result.body.includes(assertBodyContains)) {
        isSuccess = false;
        assertions.push(`Body assertion failed: "${assertBodyContains}" not found in response`);
      }
      if (assertions.length > 0) {
        lines.push('');
        lines.push('ASSERTIONS FAILED:');
        for (const a of assertions) lines.push(`  - ${a}`);
      }

      return {
        success: isSuccess,
        output: lines.join('\n'),
        metadata: {
          status: result.status, method, url, elapsed_ms: elapsed,
          ...(extracted !== undefined ? { extracted } : {}),
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `HTTP request failed: ${message}` };
    }
  }
}

/** Resolve a dot-notation path like "data.users[0].name" against a JSON object. */
function resolveJsonPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
