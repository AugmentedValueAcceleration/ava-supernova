// Session 3 / Prototype F1 — OmniParser v2 cost + latency measurement.
//
// Flow:
//   1. Use Playwright to open a realistic UI and capture a screenshot. This
//      mirrors the production path — Rust captures the screen, sends bytes to
//      the grounding tier. We vary target sites to exercise different UI
//      densities (simple text page, mid-density dashboard, dense editor).
//   2. For each screenshot: base64-encode, send to Replicate's OmniParser v2,
//      poll until ready, parse the output.
//   3. Record per-call: wall time, Replicate's GPU predict_time, element
//      count, response size. Estimate cost from Replicate's $0.011/call T4
//      pricing.
//   4. Write a summary JSON with enough numbers to revise spec 4 (Cost
//      ceiling) and spec 8 (Token budget math OmniParser line).
//
// Keeps sample size deliberately small (3 calls, ~$0.033 total) — we're
// de-risking the contract and getting ballpark numbers, not running a full
// benchmark. Further sessions can expand if the billing decision needs more
// confidence.

import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runOmniParser, uploadToReplicate } from './replicate-client.ts';
import type { ReplicateRunResult } from './replicate-client.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

// ── Pricing constants — sourced from Replicate page at prototype time ─────
// If Replicate changes pricing, these numbers go stale. We record them in the
// results JSON so each run is self-contained for future reference.
const REPLICATE_T4_COST_PER_CALL_USD = 0.011;
const REPLICATE_T4_PUBLISHED_HARDWARE = 'Nvidia T4';
const QWEN_3_6_PLUS_APPROX_PER_1K_TOKENS_USD = 0.001;  // blended I/O estimate

interface Sample {
  label: string;
  url: string;
  screenshotPath: string;
  screenshotBytes: number;
  result?: ReplicateRunResult;
  elementCount?: number;
  outputSizeBytes?: number;
  error?: string;
}

function log(msg: string): void {
  process.stderr.write(`[f1] ${msg}\n`);
}

async function capture(url: string, label: string, screenshotsDir: string): Promise<Sample> {
  log(`capturing ${label} (${url})...`);
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    // Give layout a beat to settle — fonts, lazy-loaded images, etc.
    await page.waitForTimeout(2000);
    const screenshotPath = join(screenshotsDir, `${label}.png`);
    const buf = await page.screenshot({ path: screenshotPath, fullPage: false });
    return {
      label, url, screenshotPath,
      screenshotBytes: buf.length,
    };
  } finally {
    await browser.close();
  }
}

async function parse(sample: Sample): Promise<void> {
  log(`sending ${sample.label} to OmniParser...`);
  try {
    const buf = await readFile(sample.screenshotPath);
    const dataUri = `data:image/png;base64,${buf.toString('base64')}`;
    const result = await runOmniParser(dataUri);
    sample.result = result;
    const outJson = JSON.stringify(result.output);
    sample.outputSizeBytes = Buffer.byteLength(outJson, 'utf8');
    // OmniParser output shape varies — array of elements, or object with
    // elements key. Normalise for counting without over-interpreting.
    if (Array.isArray(result.output)) {
      sample.elementCount = result.output.length;
    } else if (result.output && typeof result.output === 'object') {
      const maybe = result.output as Record<string, unknown>;
      if (Array.isArray(maybe.elements)) sample.elementCount = (maybe.elements as unknown[]).length;
      else if (Array.isArray(maybe.parsed_content_list)) sample.elementCount = (maybe.parsed_content_list as unknown[]).length;
      else sample.elementCount = undefined;
    }
    log(
      `  ok — wall ${result.wallTimeMs}ms, predict ${result.predictTimeSeconds ?? '?'}s, ` +
      `elements ${sample.elementCount ?? '?'}, output ${sample.outputSizeBytes}B`,
    );
  } catch (e) {
    sample.error = e instanceof Error ? e.message : String(e);
    log(`  FAIL — ${sample.error}`);
  }
}

async function main(): Promise<void> {
  if (!process.env.REPLICATE_API_TOKEN) {
    log('REPLICATE_API_TOKEN not set — aborting before any network calls.');
    process.exit(1);
  }

  const startedAt = new Date();
  const screenshotsDir = join(HERE, 'screenshots');
  const resultsDir = join(HERE, 'results');
  await mkdir(screenshotsDir, { recursive: true });
  await mkdir(resultsDir, { recursive: true });

  // Three representative UIs — simple / medium / dense. Public, stable pages
  // so the prototype is reproducible for anyone cloning the repo.
  const targets = [
    { label: 'simple-text', url: 'https://example.com' },
    { label: 'medium-news', url: 'https://news.ycombinator.com' },
    { label: 'dense-editor', url: 'https://playwright.dev' },
  ];

  const samples: Sample[] = [];
  for (const t of targets) {
    try {
      samples.push(await capture(t.url, t.label, screenshotsDir));
    } catch (e) {
      log(`capture failed for ${t.label}: ${e instanceof Error ? e.message : String(e)}`);
      samples.push({
        label: t.label, url: t.url, screenshotPath: '', screenshotBytes: 0,
        error: `capture: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  for (const s of samples) {
    if (s.error) continue;
    await parse(s);
  }

  const endedAt = new Date();

  // ── Aggregate stats ──────────────────────────────────────────────────
  const successful = samples.filter((s) => s.result && !s.error);
  const wallTimes = successful.map((s) => s.result!.wallTimeMs);
  const predictTimes = successful
    .map((s) => s.result!.predictTimeSeconds)
    .filter((x): x is number => x !== null);
  const avgWall = wallTimes.length ? wallTimes.reduce((a, b) => a + b, 0) / wallTimes.length : 0;
  const avgPredict = predictTimes.length ? predictTimes.reduce((a, b) => a + b, 0) / predictTimes.length : 0;

  const callCount = successful.length;
  const actualCostUsd = callCount * REPLICATE_T4_COST_PER_CALL_USD;
  // Spec 8 bills OmniParser at "10K tokens equivalent per call" in the free
  // pool. Using Qwen 3.6 Plus blended pricing ~$0.001/1K tokens, that's
  // $0.01 of billing credit per call. Compare to $0.011 hard cost on T4.
  const billingUnitValueUsd = 10 * QWEN_3_6_PLUS_APPROX_PER_1K_TOKENS_USD;
  const marginPerCallUsd = billingUnitValueUsd - REPLICATE_T4_COST_PER_CALL_USD;

  const summary = {
    prototype: 'F1 — OmniParser v2 latency + cost',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    totalDurationMs: endedAt.getTime() - startedAt.getTime(),
    provider: { platform: 'Replicate', model: 'microsoft/omniparser-v2', hardware: REPLICATE_T4_PUBLISHED_HARDWARE },
    pricing: {
      per_call_usd: REPLICATE_T4_COST_PER_CALL_USD,
      billing_unit_spec: '10K Qwen-equivalent tokens per call',
      billing_unit_value_usd: billingUnitValueUsd,
      margin_per_call_usd: marginPerCallUsd,
      margin_pct: billingUnitValueUsd > 0 ? (marginPerCallUsd / billingUnitValueUsd) * 100 : 0,
    },
    samples: samples.map((s) => ({
      label: s.label,
      url: s.url,
      screenshotBytes: s.screenshotBytes,
      wallTimeMs: s.result?.wallTimeMs ?? null,
      predictTimeSeconds: s.result?.predictTimeSeconds ?? null,
      elementCount: s.elementCount ?? null,
      outputSizeBytes: s.outputSizeBytes ?? null,
      predictionId: s.result?.predictionId ?? null,
      error: s.error ?? null,
    })),
    stats: {
      callsAttempted: samples.length,
      callsSuccessful: callCount,
      avgWallMs: Math.round(avgWall),
      avgPredictSeconds: Number(avgPredict.toFixed(3)),
      totalCostUsd: Number(actualCostUsd.toFixed(4)),
    },
  };

  const outPath = join(resultsDir, `run-${Date.now()}.json`);
  await writeFile(outPath, JSON.stringify(summary, null, 2), 'utf8');

  log('');
  log('─── SUMMARY ─────────────────────────────────────');
  log(`provider: Replicate (${REPLICATE_T4_PUBLISHED_HARDWARE})`);
  log(`calls: ${callCount}/${samples.length} successful`);
  log(`avg wall time: ${Math.round(avgWall)}ms`);
  log(`avg GPU predict: ${avgPredict.toFixed(2)}s`);
  log(`total cost: $${actualCostUsd.toFixed(4)}`);
  log(`billing unit value (spec 8): $${billingUnitValueUsd.toFixed(4)}/call`);
  log(`margin vs T4 cost: $${marginPerCallUsd.toFixed(4)}/call (${Math.round(((marginPerCallUsd / billingUnitValueUsd) * 100))}%)`);
  log(`results: ${outPath}`);

  const pass = callCount >= 1;
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  log(`fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
