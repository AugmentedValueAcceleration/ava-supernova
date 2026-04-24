// ─── verify_change Tool ─────────────────────────────────────────────────────
// Deterministic post-build verification.
//
// Given a list of files the Builder claims to have changed, this tool:
//   1. Classifies each file via the verification-matrix.
//   2. Runs each selected check concurrently (Promise.allSettled).
//   3. Returns a structured report the caller (Integrator persona, or the
//      post-build hook in auto-coordinator) reads to decide pass/fail.
//
// No model is involved — this is a pure infrastructure tool. That's the
// architectural point: verification isn't a persona's opinion about whether
// the code works, it's an observable fact.

import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { Socket } from 'node:net';
import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import {
  selectChecks,
  hasMandatoryChecks,
  type Check,
  type CheckId,
} from '../personas/verification-matrix.js';
import { loadTrustState, isTrusted, recordCheckResults } from './verification-trust.js';

// ── Check result shape ───────────────────────────────────────────────────────

interface CheckResult {
  check: CheckId;
  status: 'pass' | 'fail' | 'skip' | 'na';
  durationMs: number;
  message: string;
}

// ── Small utilities ──────────────────────────────────────────────────────────

/**
 * Detect a running dev server by probing common ports with a short TCP
 * connect. We don't curl yet — we just want to know if something is
 * listening before we bother with an HTTP roundtrip.
 */
async function detectDevServer(): Promise<number | null> {
  const candidates = [3000, 3001, 5173, 8080, 4000, 8000];
  for (const port of candidates) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = new Socket();
      const finish = (result: boolean) => {
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(150);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
      socket.connect(port, '127.0.0.1');
    });
    if (ok) return port;
  }
  return null;
}

/**
 * Run a shell command with a hard timeout. Returns stdout+stderr combined
 * and the exit code. Never throws — all failure info is in the return value.
 */
function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    exec(
      command,
      { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 4, shell: process.env.SHELL || undefined },
      (error, stdout, stderr) => {
        const output = ((stdout || '') + (stderr || '')).slice(0, 4000);
        const code = error && 'code' in error ? (error as { code: number }).code : 0;
        resolve({ code, output });
      },
    );
  });
}

/**
 * Walk up from `start` looking for the nearest file matching `filename`.
 * Used to find the package boundary for scoped typecheck.
 */
async function findUpward(start: string, filename: string): Promise<string | null> {
  let dir = start;
  const root = dirname(dir);
  while (dir !== root) {
    if (existsSync(join(dir, filename))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * Detect which package a file belongs to in a pnpm/npm monorepo. Returns the
 * package directory so we can run tsc/test there instead of across the whole
 * monorepo (expensive and produces unrelated errors).
 */
async function detectPackageRoot(file: string, cwd: string): Promise<string> {
  const abs = existsSync(file) ? file : join(cwd, file);
  const pkgDir = await findUpward(dirname(abs), 'package.json');
  return pkgDir ?? cwd;
}

// ── Per-check implementations ────────────────────────────────────────────────

async function runTypecheck(check: Check, cwd: string, trusted: boolean): Promise<CheckResult> {
  const start = Date.now();
  const pkgRoot = check.files[0] ? await detectPackageRoot(check.files[0], cwd) : cwd;
  if (!existsSync(join(pkgRoot, 'tsconfig.json'))) {
    return {
      check: 'typecheck',
      status: 'na',
      durationMs: Date.now() - start,
      message: `No tsconfig.json at ${pkgRoot} — typecheck not applicable`,
    };
  }
  // Trusted path: incremental mode reuses the .tsbuildinfo cache from prior
  // runs, cutting typecheck time roughly 60–80% on warm runs. The flag is
  // additive — if the project's tsconfig doesn't enable incremental at
  // compiler level, the CLI flag alone still works.
  const tscCmd = trusted ? 'npx tsc --noEmit --incremental' : 'npx tsc --noEmit';
  const { code, output } = await runCommand(tscCmd, pkgRoot, 90_000);
  const modeTag = trusted ? ' [trusted]' : '';
  return {
    check: 'typecheck',
    status: code === 0 ? 'pass' : 'fail',
    durationMs: Date.now() - start,
    message: code === 0 ? `tsc clean in ${pkgRoot}${modeTag}` : output.trim() || 'tsc exited non-zero',
  };
}

async function runTestCheck(check: Check, cwd: string): Promise<CheckResult> {
  const start = Date.now();
  const pkgRoot = check.files[0] ? await detectPackageRoot(check.files[0], cwd) : cwd;
  const pkgJsonPath = join(pkgRoot, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    return {
      check: 'test_run',
      status: 'na',
      durationMs: Date.now() - start,
      message: 'No package.json — test runner cannot be selected',
    };
  }
  let hasTestScript = false;
  try {
    const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf8')) as { scripts?: Record<string, string> };
    hasTestScript = typeof pkg.scripts?.test === 'string';
  } catch {
    hasTestScript = false;
  }
  if (!hasTestScript) {
    return {
      check: 'test_run',
      status: 'na',
      durationMs: Date.now() - start,
      message: `No "test" script in ${pkgRoot}/package.json`,
    };
  }
  // Pass the changed test files as arg so we only run those
  const fileArgs = check.files.map((f) => JSON.stringify(f)).join(' ');
  const cmd = `npm test -- ${fileArgs}`;
  const { code, output } = await runCommand(cmd, pkgRoot, 120_000);
  return {
    check: 'test_run',
    status: code === 0 ? 'pass' : 'fail',
    durationMs: Date.now() - start,
    message: code === 0 ? `Tests passed (${check.files.length} file(s))` : output.trim().slice(0, 800),
  };
}

async function runRouteCurl(check: Check, trusted: boolean): Promise<CheckResult> {
  const start = Date.now();
  const port = await detectDevServer();
  if (!port) {
    return {
      check: 'route_curl',
      status: 'skip',
      durationMs: Date.now() - start,
      message: 'No dev server detected on :3000/:3001/:5173/:8080 — route curl skipped',
    };
  }

  // Trusted path: halve the per-probe HTTP timeout. This project has
  // been shipping 2xx/3xx on these route patterns for 10+ consecutive
  // runs, so a slow response is more likely a blip than a real failure
  // worth waiting a full 3s for.
  const probeTimeoutSec = trusted ? 1.5 : 3;

  // Derive probable URL paths from file names. For Next.js app router:
  //   app/foo/page.tsx          → /foo
  //   app/[locale]/bar/page.tsx → /en/bar (pick default locale)
  //   app/api/x/route.ts        → /api/x
  //   app/opengraph-image.tsx   → /opengraph-image
  //   app/sitemap.ts            → /sitemap.xml
  //   app/robots.ts             → /robots.txt
  //   app/manifest.ts           → /manifest.webmanifest
  const urls: string[] = [];
  for (const file of check.files) {
    const p = file.replace(/\\/g, '/');
    const appMatch = p.match(/\bapp\/(.+)$/);
    if (!appMatch) continue;
    let route = appMatch[1]
      .replace(/\/(page|route|layout)\.(tsx?|jsx?)$/, '')
      .replace(/\.(tsx?|jsx?|ts|js)$/, '')
      .replace(/\/\((\w+)\)/g, '') // strip route groups
      .replace(/\[locale\]/g, 'en'); // default locale probe
    // Specials
    if (/sitemap$/.test(route)) route = 'sitemap.xml';
    else if (/robots$/.test(route)) route = 'robots.txt';
    else if (/manifest$/.test(route)) route = 'manifest.webmanifest';
    const url = `http://127.0.0.1:${port}/${route.replace(/^\/+/, '')}`;
    urls.push(url);
  }

  const probes = await Promise.allSettled(
    urls.map(
      (url) =>
        new Promise<{ url: string; status: number | string }>((resolve) => {
          exec(`curl -s -o /dev/null -w "%{http_code}" -m ${probeTimeoutSec} "${url}"`, (err, stdout) => {
            if (err) return resolve({ url, status: 'ERR' });
            resolve({ url, status: parseInt(stdout.trim(), 10) || stdout.trim() });
          });
        }),
    ),
  );

  const failures = probes
    .map((r) => (r.status === 'fulfilled' ? r.value : { url: 'unknown', status: 'REJECTED' }))
    .filter((p) => typeof p.status !== 'number' || p.status < 200 || p.status >= 400);

  if (failures.length === 0) {
    return {
      check: 'route_curl',
      status: 'pass',
      durationMs: Date.now() - start,
      message: `All ${urls.length} route probe(s) returned 2xx/3xx`,
    };
  }
  return {
    check: 'route_curl',
    status: 'fail',
    durationMs: Date.now() - start,
    message: failures.map((f) => `${f.url} → ${f.status}`).join('; '),
  };
}

async function runMigrationDryRun(_check: Check, _cwd: string): Promise<CheckResult> {
  // M1 behaviour: we don't actually shell out to prisma/drizzle/supabase CLI
  // here — too many provider-specific quirks. Report status 'skip' with a
  // clear note that the user must run the dry-run manually. The mandatory
  // floor still fires (the check appears in the report, coloured amber),
  // which is the signal we want.
  return {
    check: 'migration_dry_run',
    status: 'skip',
    durationMs: 0,
    message:
      'Migration touched — run the dry-run manually (prisma migrate diff / drizzle-kit generate --dry-run / supabase migration repair). Ava never auto-applies migrations.',
  };
}

async function runBuildSmoke(_check: Check, _cwd: string): Promise<CheckResult> {
  // M1 behaviour: typecheck substitutes for full build smoke. Full build
  // smoke (next build --no-lint) is 30-90s cold and would triple verification
  // time for most tasks. If the config change is serious enough to warrant
  // a full build, the user runs it themselves.
  return {
    check: 'build_smoke',
    status: 'skip',
    durationMs: 0,
    message: 'Config-affecting change — consider running a full build manually (M2 will automate).',
  };
}

async function runDepsInstall(_check: Check, cwd: string): Promise<CheckResult> {
  const start = Date.now();
  // Lightweight: lockfile check only. If pnpm-lock.yaml is present, run
  // `pnpm install --lockfile-only` which is ~5s cached.
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
    const { code, output } = await runCommand('pnpm install --lockfile-only --prefer-offline', cwd, 60_000);
    return {
      check: 'deps_install',
      status: code === 0 ? 'pass' : 'fail',
      durationMs: Date.now() - start,
      message: code === 0 ? 'Lockfile consistent' : output.trim().slice(0, 400),
    };
  }
  return {
    check: 'deps_install',
    status: 'na',
    durationMs: Date.now() - start,
    message: 'No pnpm-lock.yaml — deps check skipped',
  };
}

async function runLinkCheck(check: Check, cwd: string): Promise<CheckResult> {
  // Minimal: scan the changed prose files for internal markdown links, flag
  // any whose target file doesn't exist. Full link checking (external HTTP)
  // is intentionally out of scope — too many false positives from rate limits
  // and out-of-office sites.
  const start = Date.now();
  const broken: string[] = [];
  for (const file of check.files) {
    const abs = existsSync(file) ? file : join(cwd, file);
    if (!existsSync(abs)) continue;
    try {
      const body = await readFile(abs, 'utf8');
      const matches = body.matchAll(/\]\(([^)]+)\)/g);
      for (const m of matches) {
        const target = m[1];
        if (/^(https?:|mailto:|tel:|#)/.test(target)) continue;
        const resolved = target.startsWith('/') ? join(cwd, target) : join(dirname(abs), target);
        // Strip anchor fragments before existence check
        const bare = resolved.split('#')[0];
        if (!existsSync(bare)) broken.push(`${file}: ${target}`);
      }
    } catch {
      /* ignore unreadable file */
    }
  }
  if (broken.length === 0) {
    return {
      check: 'link_check',
      status: 'pass',
      durationMs: Date.now() - start,
      message: `Internal links resolved (${check.files.length} file(s))`,
    };
  }
  return {
    check: 'link_check',
    status: 'fail',
    durationMs: Date.now() - start,
    message: `Broken internal links: ${broken.slice(0, 5).join('; ')}${broken.length > 5 ? ` (+${broken.length - 5} more)` : ''}`,
  };
}

async function runAssetHead(check: Check, trusted: boolean): Promise<CheckResult> {
  const start = Date.now();
  const port = await detectDevServer();
  if (!port) {
    return {
      check: 'asset_head',
      status: 'skip',
      durationMs: Date.now() - start,
      message: 'No dev server — asset HEAD skipped',
    };
  }
  const urls = check.files
    .map((f) => f.replace(/\\/g, '/').replace(/^.*\bpublic\//, '/'))
    .filter((p) => p.startsWith('/'));
  if (urls.length === 0) {
    return {
      check: 'asset_head',
      status: 'na',
      durationMs: Date.now() - start,
      message: 'No public-served assets in change list',
    };
  }
  // Trusted path: halve the HEAD timeout. Same logic as route_curl.
  const probeTimeoutSec = trusted ? 1.5 : 3;
  const failures: string[] = [];
  await Promise.all(
    urls.map(
      (u) =>
        new Promise<void>((resolve) => {
          exec(`curl -sI -o /dev/null -w "%{http_code}" -m ${probeTimeoutSec} "http://127.0.0.1:${port}${u}"`, (err, stdout) => {
            const code = parseInt((stdout || '').trim(), 10);
            if (err || !code || code < 200 || code >= 400) failures.push(`${u} → ${code || 'ERR'}`);
            resolve();
          });
        }),
    ),
  );
  return {
    check: 'asset_head',
    status: failures.length === 0 ? 'pass' : 'fail',
    durationMs: Date.now() - start,
    message: failures.length === 0 ? `All ${urls.length} asset(s) served` : failures.join('; '),
  };
}

async function runAuthFullSuite(check: Check, cwd: string): Promise<CheckResult> {
  // M1: auth/payment full suite = typecheck + test_run (if available). Full
  // integration suite with session smoke is M2 territory.
  // The auth_full_suite never graduates (stakesFloor='mandatory'), so the
  // inner typecheck runs with trusted=false regardless of project history.
  const start = Date.now();
  const tc = await runTypecheck({ id: 'typecheck', files: check.files, reason: '' }, cwd, false);
  const tr = await runTestCheck({ id: 'test_run', files: check.files, reason: '' }, cwd);
  const status: CheckResult['status'] =
    tc.status === 'fail' || tr.status === 'fail' ? 'fail' : 'pass';
  return {
    check: 'auth_full_suite',
    status,
    durationMs: Date.now() - start,
    message: `${tc.check}: ${tc.status} — ${tc.message} | ${tr.check}: ${tr.status} — ${tr.message}`,
  };
}

async function runSingleCheck(check: Check, cwd: string, trusted: boolean): Promise<CheckResult> {
  switch (check.id) {
    case 'typecheck':         return runTypecheck(check, cwd, trusted);
    case 'test_run':          return runTestCheck(check, cwd);
    case 'route_curl':        return runRouteCurl(check, trusted);
    case 'asset_head':        return runAssetHead(check, trusted);
    case 'migration_dry_run': return runMigrationDryRun(check, cwd);
    case 'build_smoke':       return runBuildSmoke(check, cwd);
    case 'deps_install':      return runDepsInstall(check, cwd);
    case 'link_check':        return runLinkCheck(check, cwd);
    case 'auth_full_suite':   return runAuthFullSuite(check, cwd);
  }
}

// ── Report shaping ───────────────────────────────────────────────────────────

function formatReport(files: string[], checks: Check[], results: CheckResult[]): string {
  if (checks.length === 0) {
    return `Verification skipped: nothing to verify (${files.length} file(s) declared, no matching checks).`;
  }
  const failed = results.filter((r) => r.status === 'fail');
  const passed = results.filter((r) => r.status === 'pass');
  const skipped = results.filter((r) => r.status === 'skip' || r.status === 'na');
  const lines: string[] = [];

  if (failed.length > 0) {
    lines.push(`VERIFY_FAIL: ${failed.length} of ${results.length} check(s) failed.`);
  } else {
    lines.push(`Verification passed: ${passed.length} check(s) clean, ${skipped.length} skipped.`);
  }

  for (const r of results) {
    const icon =
      r.status === 'pass' ? '✓' :
      r.status === 'fail' ? '✗' :
      r.status === 'skip' ? '·' : '-';
    lines.push(`  ${icon} ${r.check} (${r.durationMs}ms) — ${r.message}`);
  }

  return lines.join('\n');
}

// ── Tool class ───────────────────────────────────────────────────────────────

export class VerifyChangeTool implements Tool {
  readonly name = 'verify_change';
  readonly description =
    'Run post-build verification against a list of changed files. ' +
    'Selects appropriate checks (typecheck, test run, route curl, asset HEAD, ' +
    'migration dry-run, link check) based on what changed, runs them in parallel, ' +
    'and returns a pass/fail report. Non-destructive — never applies migrations.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'verify_change',
    description:
      'Verify that changes work. Pass the files that were touched; the tool picks ' +
      'verification steps automatically (tsc for TS, curl for routes, etc.) and ' +
      'runs them. Output starts with "VERIFY_FAIL:" on any failure, which upstream ' +
      'handlers treat as a halt signal.',
    parameters: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of files that were changed. Paths relative to cwd are fine.',
        },
        skip: {
          type: 'boolean',
          description:
            'If true, skip non-mandatory checks. Mandatory (auth, payment, migration) still run. Default: false.',
        },
      },
      required: ['files'],
    },
  };

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const files = (args.files as string[]) ?? [];
    const skip = (args.skip as boolean) === true;

    if (!Array.isArray(files) || files.length === 0) {
      return {
        success: true,
        output: 'Verification skipped: no files declared.',
      };
    }

    const allChecks = selectChecks(files);
    const toRun = skip ? allChecks.filter((c) => c.stakesFloor === 'mandatory') : allChecks;

    if (toRun.length === 0) {
      return {
        success: true,
        output: `Verification skipped: ${files.length} file(s), ${skip ? 'opt-out flag set' : 'no applicable checks'}.`,
      };
    }

    // Load trust state ONCE for this pass. Each check's trusted flag is
    // resolved against the state snapshot — running this pass doesn't
    // affect its own graduation decisions (the update happens after).
    const trustState = await loadTrustState(context.cwd);

    // Run in parallel — each implementation owns its own timeout.
    const results = await Promise.all(
      toRun.map((c) => runSingleCheck(c, context.cwd, isTrusted(trustState, c.id))),
    );

    const output = formatReport(files, toRun, results);
    const anyFailed = results.some((r) => r.status === 'fail');
    const mandatoryFailed = results.some(
      (r, i) => r.status === 'fail' && toRun[i].stakesFloor === 'mandatory',
    );

    // Record outcomes for trust graduation. pass → increment consecutive
    // counter. fail → reset to 0. skip/na → neutral. High-stakes checks
    // (auth/payment/migration) are tracked the same way but won't ever
    // return true from isTrusted — the NEVER_GRADUATES set in
    // verification-trust.ts is the floor.
    try {
      await recordCheckResults(
        context.cwd,
        toRun.map((c, i) => ({ checkId: c.id, status: results[i].status })),
      );
    } catch {
      // Persistence failure is non-fatal — the verification result still
      // returns normally; next run just starts from whatever last persisted.
    }

    return {
      success: !anyFailed,
      output,
      metadata: {
        total: results.length,
        passed: results.filter((r) => r.status === 'pass').length,
        failed: results.filter((r) => r.status === 'fail').length,
        skipped: results.filter((r) => r.status === 'skip' || r.status === 'na').length,
        mandatoryFailed,
        hasMandatory: hasMandatoryChecks(toRun),
      },
    };
  }
}
