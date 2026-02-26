import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';

const REQUEST_TIMEOUT = 15_000;
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
}

function doRequest(opts: RequestOptions): Promise<{ status: number; statusText: string; headers: Record<string, string>; body: string }> {
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
        timeout: REQUEST_TIMEOUT,
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
          for (const [key, value] of Object.entries(rawHeaders)) {
            if (INTERESTING_HEADERS.has(key.toLowerCase()) && value) {
              filteredHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
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
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'http_request',
    description:
      'Make an HTTP request. Supports GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS. ' +
      'Use to test API endpoints, check URLs, or fetch data. ' +
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
      },
      required: ['url'],
    },
  };

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const url = args.url as string;
    const method = ((args.method as string) ?? 'GET').toUpperCase();
    const headers = args.headers as Record<string, string> | undefined;
    const body = args.body as string | undefined;

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

    try {
      const result = await doRequest({ url, method, headers, body });

      const lines: string[] = [];
      lines.push(`HTTP ${result.status} ${result.statusText}`);

      // Headers
      const headerEntries = Object.entries(result.headers);
      if (headerEntries.length > 0) {
        lines.push('');
        for (const [key, value] of headerEntries) {
          lines.push(`${key}: ${value}`);
        }
      }

      // Body
      if (result.body && method !== 'HEAD') {
        lines.push('');
        lines.push(result.body);
      }

      const isSuccess = result.status >= 200 && result.status < 400;

      return {
        success: isSuccess,
        output: lines.join('\n'),
        metadata: { status: result.status, method, url },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: `HTTP request failed: ${message}` };
    }
  }
}
