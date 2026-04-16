// Minimal Replicate HTTP client — create prediction, poll until terminal.
//
// Two public methods matter for the prototype:
//   - runOmniParser(imageDataUri): send a screenshot, wait for result, return
//     parsed elements + timing + Replicate's own predict_time metric.
//
// The token is read from REPLICATE_API_TOKEN at call time — never passed as
// a constructor arg and never written to disk. If it's missing we fail fast
// so a misconfigured run doesn't silently hit a rate-limited unauthenticated
// endpoint.

interface PredictionCreateResponse {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  urls: { get: string; cancel: string };
  output?: unknown;
  error?: string | null;
  metrics?: { predict_time?: number };
  created_at?: string;
  started_at?: string;
  completed_at?: string;
}

export interface ReplicateRunResult {
  predictionId: string;
  output: unknown;                      // raw model output — shape depends on model
  predictTimeSeconds: number | null;    // reported by Replicate (GPU-side)
  wallTimeMs: number;                   // measured from request start to result
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

const BASE = 'https://api.replicate.com/v1';
const MODEL_VERSION = '49cf3d41b8d3aca1360514e83be4c97131ce8f0d99abfc365526d8384caa88df';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 120_000;

function getToken(): string {
  const t = process.env.REPLICATE_API_TOKEN;
  if (!t) {
    throw new Error(
      'REPLICATE_API_TOKEN env var not set. Set it before running:\n' +
      '  PowerShell:  $env:REPLICATE_API_TOKEN = "r8_..."\n' +
      '  bash:        export REPLICATE_API_TOKEN=r8_...',
    );
  }
  return t;
}

async function rfetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '<unreadable>');
    throw new Error(`Replicate ${res.status} ${res.statusText}: ${body}`);
  }
  return res;
}

/**
 * Upload a local file to Replicate's files API and get a serving URL back.
 * OmniParser's input schema requires `format: uri`, which means a real
 * HTTP URL — data URIs may not be reliably accepted.
 */
export async function uploadToReplicate(buf: Buffer, filename: string): Promise<string> {
  const res = await fetch(`${BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/octet-stream',
      'X-Filename': filename,
    },
    body: new Uint8Array(buf),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Replicate file upload ${res.status}: ${body}`);
  }
  const data = (await res.json()) as { urls: { get: string } };
  return data.urls.get;
}

export async function runOmniParser(imageUrl: string): Promise<ReplicateRunResult> {
  const startMs = Date.now();

  // Use the /v1/predictions endpoint with an explicit version hash — the
  // model-path endpoint returned 404 for this community-wrapped model.
  const createRes = await rfetch('/predictions', {
    method: 'POST',
    body: JSON.stringify({
      version: MODEL_VERSION,
      input: { image: imageUrl },
    }),
  });
  const created = (await createRes.json()) as PredictionCreateResponse;

  // Poll the prediction URL until terminal or timeout.
  let final: PredictionCreateResponse = created;
  while (final.status !== 'succeeded' && final.status !== 'failed' && final.status !== 'canceled') {
    if (Date.now() - startMs > POLL_TIMEOUT_MS) {
      throw new Error(`Replicate poll timed out after ${POLL_TIMEOUT_MS}ms (status=${final.status})`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await rfetch(final.urls.get);
    final = (await res.json()) as PredictionCreateResponse;
  }

  const wallTimeMs = Date.now() - startMs;

  if (final.status !== 'succeeded') {
    throw new Error(`Prediction ${final.status}: ${final.error ?? '<no error message>'}`);
  }

  return {
    predictionId: final.id,
    output: final.output,
    predictTimeSeconds: final.metrics?.predict_time ?? null,
    wallTimeMs,
    createdAt: final.created_at ?? null,
    startedAt: final.started_at ?? null,
    completedAt: final.completed_at ?? null,
  };
}
