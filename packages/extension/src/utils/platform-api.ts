import * as https from 'node:https';
import * as crypto from 'node:crypto';

const PLATFORM_API = 'https://ava-supernova.com/api';

export { PLATFORM_API };

// Stable device ID — generated once per install, persisted in module scope
let _deviceId: string | null = null;
export function getDeviceId(): string {
  if (!_deviceId) {
    // Try to generate a stable ID from machine characteristics
    try {
      const os = require('os');
      const raw = `${os.hostname()}-${os.userInfo().username}-${os.platform()}-${os.arch()}`;
      _deviceId = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
    } catch {
      _deviceId = crypto.randomUUID().slice(0, 16);
    }
  }
  return _deviceId;
}

export async function apiFetch(
  path: string,
  options: { method?: string; body?: unknown; platformKey: string },
): Promise<{ ok: boolean; status: number; data: unknown }> {
  return new Promise((resolve) => {
    const url = new URL(PLATFORM_API + path);
    if (url.protocol !== 'https:') { resolve({ ok: false, status: 0, data: 'HTTPS required' }); return; }
    const body = options.body ? JSON.stringify(options.body) : undefined;

    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: options.method ?? 'GET',
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.platformKey}`,
          'X-Ava-Platform': 'extension',
          'X-Ava-Device': getDeviceId(),
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
