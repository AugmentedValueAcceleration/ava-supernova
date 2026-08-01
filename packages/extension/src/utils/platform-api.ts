import * as https from 'node:https';
import * as crypto from 'node:crypto';

const PLATFORM_API = 'https://avasupernova.com/api';

export { PLATFORM_API };

// Stable device ID — generated once per install, persisted in module scope
let _deviceId: string | null = null;
export function getDeviceId(): string {
  if (!_deviceId) {
    // Generate a stable ID from machine characteristics + entropy salt
    try {
      const os = require('os');
      const raw = `${os.hostname()}-${os.userInfo().username}-${os.platform()}-${os.arch()}-${os.cpus()[0]?.model || ''}-${os.totalmem()}`;
      _deviceId = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
    } catch {
      _deviceId = crypto.randomUUID().slice(0, 16);
    }
  }
  return _deviceId;
}

/** Default request timeout. Without this, a slow / unreachable platform
 *  can make Node's default socket timeout (which is long — minutes on
 *  HTTPS keep-alive idle hosts) bubble all the way up to the dashboard,
 *  showing a blank screen for 2-3 minutes on cold starts. 10s covers
 *  every healthy call we make today; callers that genuinely need more
 *  pass `timeoutMs` explicitly. */
const DEFAULT_TIMEOUT_MS = 10_000;

export async function apiFetch(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    /** Optional — anonymous endpoints (public reads + anonymous-allowed
     *  contribution flow) work without a platform key. When unset, the
     *  Authorization header is omitted and the server falls back to
     *  device-id-based identity. */
    platformKey?: string;
    timeoutMs?: number;
    /** Extra headers to attach (e.g. BYOK provider/key for the health
     *  generation passthrough). */
    extraHeaders?: Record<string, string>;
  },
): Promise<{ ok: boolean; status: number; data: unknown }> {
  return new Promise((resolve) => {
    const url = new URL(PLATFORM_API + path);
    if (url.protocol !== 'https:') { resolve({ ok: false, status: 0, data: 'HTTPS required' }); return; }
    const body = options.body ? JSON.stringify(options.body) : undefined;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let settled = false;
    const settle = (val: { ok: boolean; status: number; data: unknown }) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Ava-Platform': 'extension',
      'X-Ava-Device': getDeviceId(),
      ...(options.platformKey ? { 'Authorization': `Bearer ${options.platformKey}` } : {}),
      ...(options.extraHeaders ?? {}),
      ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}),
    };

    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: options.method ?? 'GET',
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        timeout: timeoutMs,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk: string) => (raw += chunk));
        res.on('end', () => {
          try {
            settle({ ok: (res.statusCode ?? 0) < 400, status: res.statusCode ?? 0, data: JSON.parse(raw) });
          } catch {
            settle({ ok: (res.statusCode ?? 0) < 400, status: res.statusCode ?? 0, data: raw });
          }
        });
      },
    );

    req.on('error', (err) => settle({ ok: false, status: 0, data: err.message }));
    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
      settle({ ok: false, status: 0, data: `timeout after ${timeoutMs}ms` });
    });
    if (body) req.write(body);
    req.end();
  });
}
