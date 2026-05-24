// ─── Verification Matrix ────────────────────────────────────────────────────
// Pure, testable mapping from "what changed" to "what to verify".
//
// Builder emits a <changes-summary> block after finishing a task. The
// Integrator persona (or the post-build hook) feeds the listed files +
// declared categories through this matrix to pick which checks to run.
//
// Keeping this a pure function matters: the selection logic is the part
// most likely to grow over time (new frameworks, new routes), and the
// only way to stay sane is to test it with string-in / check-list-out.

export type ChangeCategory =
  | 'ts'            // TypeScript / JavaScript source edit (non-test)
  | 'test'          // Test file
  | 'route'         // Route/page/handler (Next.js app/pages, API route)
  | 'asset'         // Static asset reference or file under public/
  | 'migration'     // Database migration (SQL / Prisma / Drizzle)
  | 'config'        // Config file (tsconfig, next.config, tailwind, etc.)
  | 'dep'           // Dependency change (package.json, lockfile)
  | 'prose'         // Markdown, plain docs
  | 'auth'          // Auth / session / token-handling code
  | 'payment'       // Payment / billing / Stripe code
  | 'deployed';     // File under a declared deployed surface (ava.deploy.json)

export type CheckId =
  | 'typecheck'          // tsc --noEmit scoped to changed package
  | 'test_run'           // run tests adjacent to changed source
  | 'route_curl'         // curl the edited routes against a running dev server
  | 'asset_head'         // HEAD request against referenced assets
  | 'migration_dry_run'  // dry-run migration (never apply)
  | 'build_smoke'        // cached `next build --no-lint` smoke
  | 'deps_install'       // pnpm install --lockfile-only + audit
  | 'link_check'         // check internal links resolve (prose)
  | 'auth_full_suite'    // mandatory full suite for high-stakes paths
  | 'deploy_state';      // confirm the change is live on its deployed surface

export interface Check {
  id: CheckId;
  /** Files this check applies to. Empty = whole-package check. */
  files: string[];
  /**
   * Stakes floor: 'mandatory' means this check cannot be opt-out'd and never
   * graduates to a lighter check even with trust compounded over many runs.
   * Used for auth/payment/migration paths.
   */
  stakesFloor?: 'mandatory';
  /** Short reason surfaced in the verification stream block. */
  reason: string;
}

/**
 * Route file detector. Matches Next.js app-router pages/handlers, pages-dir
 * pages/api, and generic Express-style route files. Intentionally permissive
 * — false positives here just mean an extra curl, which is cheap.
 */
const ROUTE_PATTERNS: RegExp[] = [
  /\bapp\/.*\/(page|route|layout|opengraph-image|sitemap|robots|manifest)\.(tsx?|jsx?|ts|js)$/,
  /\bpages\/.*\.(tsx?|jsx?)$/,
  /\bpages\/api\/.*\.(ts|js)$/,
  /\bsrc\/app\/.*\/(page|route|layout)\.(tsx?|jsx?)$/,
];

const MIGRATION_PATTERNS: RegExp[] = [
  /\bmigrations\/.*\.sql$/,
  /\bsupabase\/migrations\//,
  /\bprisma\/(schema\.prisma|migrations\/)/,
  /\bdrizzle\//,
];

const CONFIG_PATTERNS: RegExp[] = [
  /\btsconfig(\..*)?\.json$/,
  /\bnext\.config\.(ts|js|mjs)$/,
  /\btailwind\.config\.(ts|js|mjs)$/,
  /\bpostcss\.config\.(ts|js|mjs)$/,
  /\bvitest\.config\.(ts|js|mjs)$/,
  /\bvite\.config\.(ts|js|mjs)$/,
  /\b\.env(\.example|\.local)?$/,
];

const TEST_PATTERNS: RegExp[] = [
  /\.(test|spec)\.(tsx?|jsx?)$/,
  /\b__tests__\//,
];

const AUTH_PATTERNS: RegExp[] = [
  /\bauth\//,
  /\bauthn?\./,
  /\bsession\./,
  /\btoken\./,
  /\bmiddleware\.ts$/,  // often houses auth/session gates
];

const PAYMENT_PATTERNS: RegExp[] = [
  /\bstripe\//,
  /\bbilling\//,
  /\bwebhook(s)?\//,
  /\bpayment/,
];

/**
 * True when `p` (already forward-slash normalised) sits under one of the
 * declared deployed-surface prefixes. Prefixes come from ava.deploy.json via
 * the caller — the matrix never reads the manifest itself, so it stays pure.
 */
function isUnderDeployPrefix(p: string, deployPrefixes: string[]): boolean {
  const f = p.replace(/^\.\//, '');
  return deployPrefixes.some((prefix) => f === prefix || f.startsWith(prefix + '/'));
}

/**
 * Classify a single changed file. A file can be in multiple categories
 * (e.g. an auth middleware is both `auth` and `ts`). Order returned is
 * high-stakes → low-stakes so the caller can short-circuit on the first
 * mandatory check if they only want the minimum gate.
 *
 * `deployPrefixes` (optional) are the literal path prefixes of declared
 * deployed surfaces; a file under one is additionally tagged `deployed` so
 * the liveness check fires for it. Empty/omitted = no deploy awareness.
 */
export function classifyFile(path: string, deployPrefixes: string[] = []): ChangeCategory[] {
  const categories: ChangeCategory[] = [];
  const p = path.replace(/\\/g, '/');

  // Deployed-surface marker (additive — combines with the file's own type)
  if (isUnderDeployPrefix(p, deployPrefixes)) categories.push('deployed');

  // High-stakes markers first
  if (AUTH_PATTERNS.some((r) => r.test(p))) categories.push('auth');
  if (PAYMENT_PATTERNS.some((r) => r.test(p))) categories.push('payment');
  if (MIGRATION_PATTERNS.some((r) => r.test(p))) categories.push('migration');

  // Structural classifications
  if (/package(-lock)?\.json$/.test(p) || /pnpm-lock\.yaml$/.test(p)) categories.push('dep');
  if (CONFIG_PATTERNS.some((r) => r.test(p))) categories.push('config');
  if (ROUTE_PATTERNS.some((r) => r.test(p))) categories.push('route');
  if (/\bpublic\//.test(p) || /\.(png|jpg|jpeg|gif|svg|webp|ico)$/.test(p)) categories.push('asset');

  // Source type (catch-all)
  if (TEST_PATTERNS.some((r) => r.test(p))) categories.push('test');
  else if (/\.(tsx?|jsx?)$/.test(p)) categories.push('ts');
  else if (/\.(md|mdx|txt)$/.test(p)) categories.push('prose');

  return categories.length > 0 ? categories : ['ts']; // Fallback: treat unknown as ts (cheap to typecheck)
}

/**
 * Select the checks to run given a list of changed files. Deduplicates
 * so `tsc` is requested once regardless of how many .ts files were touched.
 *
 * `opts.deployPrefixes` (from ava.deploy.json) opt the run into a liveness
 * check: any changed file under a declared surface gets a `deploy_state`
 * check that confirms the change is actually serving, not just committed.
 */
export function selectChecks(
  changedFiles: string[],
  opts: { deployPrefixes?: string[] } = {},
): Check[] {
  if (changedFiles.length === 0) return [];

  const deployPrefixes = opts.deployPrefixes ?? [];
  const allCategories = new Set<ChangeCategory>();
  const filesByCategory: Record<ChangeCategory, string[]> = {
    ts: [], test: [], route: [], asset: [],
    migration: [], config: [], dep: [], prose: [],
    auth: [], payment: [], deployed: [],
  };

  for (const file of changedFiles) {
    const cats = classifyFile(file, deployPrefixes);
    for (const c of cats) {
      allCategories.add(c);
      filesByCategory[c].push(file);
    }
  }

  const checks: Check[] = [];

  // High-stakes gates always run first — mandatory floor
  if (allCategories.has('auth')) {
    checks.push({
      id: 'auth_full_suite',
      files: filesByCategory.auth,
      stakesFloor: 'mandatory',
      reason: 'Auth-adjacent file touched — full verification required',
    });
  }

  if (allCategories.has('payment')) {
    checks.push({
      id: 'auth_full_suite',
      files: filesByCategory.payment,
      stakesFloor: 'mandatory',
      reason: 'Payment-adjacent file touched — full verification required',
    });
  }

  if (allCategories.has('migration')) {
    checks.push({
      id: 'migration_dry_run',
      files: filesByCategory.migration,
      stakesFloor: 'mandatory',
      reason: 'Migration file touched — dry-run only, never auto-apply',
    });
  }

  // Typecheck runs if any ts/tsx/test/route was touched — one call, no matter how many files
  if (allCategories.has('ts') || allCategories.has('test') || allCategories.has('route')) {
    checks.push({
      id: 'typecheck',
      files: [...filesByCategory.ts, ...filesByCategory.test, ...filesByCategory.route],
      reason: 'TypeScript source changed — run tsc',
    });
  }

  // Test run — only if a test file was touched (don't re-run suite on every src edit)
  if (allCategories.has('test')) {
    checks.push({
      id: 'test_run',
      files: filesByCategory.test,
      reason: 'Test file changed — run the affected tests',
    });
  }

  // Route curl — for every route file touched
  if (allCategories.has('route')) {
    checks.push({
      id: 'route_curl',
      files: filesByCategory.route,
      reason: 'Route/page changed — curl for HTTP status',
    });
  }

  // Asset HEAD — for referenced public assets
  if (allCategories.has('asset')) {
    checks.push({
      id: 'asset_head',
      files: filesByCategory.asset,
      reason: 'Asset changed — HEAD request to confirm served',
    });
  }

  // Config / build smoke — run when tsconfig / next.config / tailwind move
  if (allCategories.has('config')) {
    checks.push({
      id: 'build_smoke',
      files: filesByCategory.config,
      reason: 'Build-affecting config changed — smoke the build',
    });
  }

  // Dep change — lockfile-only install + audit
  if (allCategories.has('dep')) {
    checks.push({
      id: 'deps_install',
      files: filesByCategory.dep,
      reason: 'Dependency change — lockfile install + audit',
    });
  }

  // Prose only — link check, skip typecheck
  if (allCategories.has('prose') && !allCategories.has('ts') && !allCategories.has('route')) {
    checks.push({
      id: 'link_check',
      files: filesByCategory.prose,
      reason: 'Prose-only change — link check',
    });
  }

  // Deploy-state — last, after correctness. Confirms the change is live on its
  // declared surface, not just committed. Only fires when a deploy manifest
  // matched at least one changed file. Never blocks (deploys are async) — it
  // turns "shipped means live" from an assumption into an observation.
  if (allCategories.has('deployed')) {
    checks.push({
      id: 'deploy_state',
      files: filesByCategory.deployed,
      reason: 'File under a deployed surface — confirm it is live, not just committed',
    });
  }

  return checks;
}

/**
 * True if the check list contains any mandatory-floor items. Used by the
 * opt-out path: if the user passes --skip-verify, we honour it for everything
 * except mandatory checks.
 */
export function hasMandatoryChecks(checks: Check[]): boolean {
  return checks.some((c) => c.stakesFloor === 'mandatory');
}
