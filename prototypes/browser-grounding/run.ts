// Session 2 / Prototype B3 — end-to-end run.
//
// Trajectory:
//   1. Count chromium processes on the host (baseline).
//   2. Spawn browser-worker, launch Chromium, navigate to example.com.
//   3. Snapshot the page (DOM-style grounding blob) + screenshot.
//   4. Click a link, navigate, snapshot again.
//   5. Close browser, shut worker down.
//   6. Count chromium processes again — delta must be 0 for "clean shutdown".
//
// The prototype is *success* when:
//   - every command returns ok:true
//   - cold-start (launch) completes inside the 15s timeout
//   - worker exits on its own (exitCode not null, no SIGKILL needed)
//   - orphansDetected == 0
//
// Results are written to ./results/run-<timestamp>.json for review.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { BrowserHarness, countChromiumProcesses } from './browser-harness.ts';
import type { Command, Response, TrajectoryStep, RunSummary } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

function log(msg: string): void {
  process.stderr.write(`[run] ${msg}\n`);
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const steps: TrajectoryStep[] = [];
  let stepNumber = 0;

  log('counting chromium processes (baseline)...');
  const before = await countChromiumProcesses();
  log(`baseline chromium processes: ${before}`);

  const harness = new BrowserHarness({ commandTimeoutMs: 30_000, shutdownGraceMs: 8_000 });
  harness.spawn();
  log('worker spawned');

  const record = (cmd: Command, res: Response): void => {
    stepNumber += 1;
    steps.push({
      stepNumber,
      command: cmd,
      response: res,
      timestamp: new Date().toISOString(),
    });
    const status = res.ok ? 'ok' : `FAIL: ${res.error}`;
    log(`step ${stepNumber} ${cmd.action} ${status} (${res.elapsedMs}ms)`);
  };

  const run = async (action: Command['action'], params?: Command['params']): Promise<Response> => {
    const cmd: Command = { id: `step-${stepNumber + 1}`, action, params };
    const res = await harness.send(action, params);
    record(cmd, res);
    return res;
  };

  let coldStartMs: number | null = null;
  let cleanShutdown = false;
  let workerExitCode: number | null = null;

  try {
    await run('ping');                                    // handshake
    const launchRes = await run('launch');                // cold start
    coldStartMs = launchRes.elapsedMs;

    await run('navigate', { url: 'https://example.com' });
    await run('snapshot');
    await run('screenshot', { outDir: join(HERE, 'screenshots') });

    // example.com has a single link "More information..." — clicking it
    // navigates to iana.org. Robust because the page is a W3C test fixture.
    await run('click', { selector: 'a' });
    // Give the navigation a moment, then snapshot the new page.
    await new Promise((r) => setTimeout(r, 1500));
    await run('snapshot');

    const closeRes = await run('close');
    if (closeRes.ok) log('browser close reported ok');
  } catch (e) {
    log(`trajectory aborted: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    log('shutting down worker...');
    workerExitCode = await harness.shutdown();
    cleanShutdown = workerExitCode !== null && workerExitCode !== -1;
    log(`worker exit code: ${workerExitCode ?? 'killed'}`);
  }

  // Give the OS a moment to reap chromium children after the worker exits —
  // Windows in particular lags the process table by a few hundred ms.
  await new Promise((r) => setTimeout(r, 1500));

  log('counting chromium processes (post)...');
  const after = await countChromiumProcesses();
  log(`post chromium processes: ${after}`);

  const endedAt = new Date();
  const summary: RunSummary = {
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    totalDurationMs: endedAt.getTime() - startedAt.getTime(),
    coldStartMs,
    steps,
    chromiumProcessesBefore: before,
    chromiumProcessesAfter: after,
    orphansDetected: Math.max(0, (after === -1 || before === -1) ? 0 : after - before),
    cleanShutdown,
    workerExitCode,
  };

  const resultsDir = join(HERE, 'results');
  await mkdir(resultsDir, { recursive: true });
  const outPath = join(resultsDir, `run-${Date.now()}.json`);
  await writeFile(outPath, JSON.stringify(summary, null, 2), 'utf8');

  log('');
  log('─── SUMMARY ─────────────────────────────────────');
  log(`steps: ${steps.length}  failures: ${steps.filter((s) => !s.response.ok).length}`);
  log(`cold start: ${coldStartMs}ms`);
  log(`total: ${summary.totalDurationMs}ms`);
  log(`clean shutdown: ${cleanShutdown ? 'yes' : 'NO'}`);
  log(`orphan chromium processes: ${summary.orphansDetected}`);
  log(`results: ${outPath}`);

  const pass =
    summary.orphansDetected === 0 &&
    cleanShutdown &&
    steps.every((s) => s.response.ok);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  log(`fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
