import * as https from 'node:https';
import * as http from 'node:http';

const PLATFORM_API = 'https://ava-supernova.com/api';

export { PLATFORM_API };

export async function apiFetch(
  path: string,
  options: { method?: string; body?: unknown; platformKey: string },
): Promise<{ ok: boolean; status: number; data: unknown }> {
  return new Promise((resolve) => {
    const url = new URL(PLATFORM_API + path);
    const body = options.body ? JSON.stringify(options.body) : undefined;
    const mod = url.protocol === 'https:' ? https : http;

    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: options.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.platformKey}`,
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk: string) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ ok: (res.statusCode ?? 0) < 400, status: res.statusCode ?? 0, data: JSON.parse(raw) });
          } catch {
            resolve({ ok: (res.statusCode ?? 0) < 400, status: res.statusCode ?? 0, data: raw });
          }
        });
      },
    );

    req.on('error', (err) => resolve({ ok: false, status: 0, data: err.message }));
    if (body) req.write(body);
    req.end();
  });
}
