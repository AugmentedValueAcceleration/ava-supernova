#!/usr/bin/env node
/**
 * Publish @ava/core to npm under a PUBLIC scoped name — for `web` (the
 * companion's server) to install. The `@ava` scope is owned by the AVA
 * test-runner project, so the published artifact ships under OUR scope
 * (default `@project-ava-supernova/core`, override with AVA_NPM_SCOPE).
 *
 * The scope moved from `@ava-supernova` to `@project-ava-supernova` on
 * 2026-08-20. The original account's recovery has been unanswered by npm
 * support for a week, and with the site's build blocked on a core fix that
 * could not be published, waiting stopped being an option. `@ava-supernova`
 * is abandoned at 0.2.70.
 *
 * SURGICAL BY DESIGN: the monorepo source name stays `@ava/core`. This
 * script never mutates packages/core/package.json — it copies `dist` + a
 * name-swapped package.json into a temp dir and publishes from there. So
 * the extension / IDE / CLI that bundle `@ava/core` from the workspace are
 * completely untouched. Run a `pnpm build` in core first (or let this do it).
 *
 * AUTH: put the token in `packages/core/.env.local` as NPM_TOKEN=… and this
 * script does the rest. `.env.*` is gitignored at the repo root, so it stays on
 * the machine and never needs to be pasted anywhere to be used. A granular
 * access token with 2FA bypass is required — npm rejects a plain session token
 * for publishing.
 *
 * Usage:
 *   node scripts/publish-public.mjs            # publishes @project-ava-supernova/core
 *   AVA_NPM_SCOPE=@your-scope node scripts/publish-public.mjs
 *   node scripts/publish-public.mjs --dry-run  # pack only, no publish, no token needed
 */
import { mkdtempSync, cpSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const coreDir = dirname(dirname(fileURLToPath(import.meta.url))); // packages/core
const scope = (process.env.AVA_NPM_SCOPE || '@project-ava-supernova').replace(/\/$/, '');
const dryRun = process.argv.includes('--dry-run');
const publishName = `${scope}/core`;

/**
 * Read `packages/core/.env.local` for NPM_TOKEN.
 *
 * The token used to be pasted into `~/.npmrc` by hand, which meant it had to
 * be shared to get it there. Keeping it in a gitignored env file alongside the
 * other keys means it never leaves the machine — `.env.*` is ignored at the
 * repo root, so it cannot be committed either.
 *
 * Deliberately a five-line parser rather than a dependency: this script runs
 * before anything is installed and should not need one.
 */
function loadEnvLocal() {
  const path = join(coreDir, '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^['"]|['"]$/g, '');
    if (value && !process.env[m[1]]) process.env[m[1]] = value;
  }
}
loadEnvLocal();

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

// 1. Fresh build so the published dist matches source.
console.log('→ Building core…');
run('npm run build', coreDir);

const distDir = join(coreDir, 'dist');
if (!existsSync(distDir)) {
  console.error('✗ dist/ not found after build — aborting.');
  process.exit(1);
}

// 2. Transform package.json: swap ONLY the name; keep version/exports/etc.
const pkg = JSON.parse(readFileSync(join(coreDir, 'package.json'), 'utf8'));
const originalName = pkg.name;
pkg.name = publishName;
delete pkg.private;
pkg.publishConfig = { ...(pkg.publishConfig || {}), access: 'public' };

// 3. Assemble a clean publish dir (dist + transformed manifest + license/readme).
const stage = mkdtempSync(join(tmpdir(), 'ava-core-publish-'));
try {
  cpSync(distDir, join(stage, 'dist'), { recursive: true });
  writeFileSync(join(stage, 'package.json'), JSON.stringify(pkg, null, 2));
  for (const f of ['LICENSE', 'LICENSE.md', 'README.md']) {
    if (existsSync(join(coreDir, f))) cpSync(join(coreDir, f), join(stage, f));
  }

  // Auth for the publish, scoped to this run.
  //
  // npm reads .npmrc from the working directory first, so a token here beats
  // whatever is in ~/.npmrc without touching it. The file holds the VARIABLE
  // NAME, not the value — npm substitutes ${NPM_TOKEN} from the environment at
  // read time, so the secret is never written to disk. The stage directory is
  // removed in the finally below either way.
  if (!dryRun) {
    if (!process.env.NPM_TOKEN) {
      console.error('✗ NPM_TOKEN is not set.');
      console.error('  Put it in packages/core/.env.local as:  NPM_TOKEN=npm_xxxxxxxx');
      console.error('  Generate one at npmjs.com → Access Tokens → Granular Access Token,');
      console.error('  read+write on the project-ava-supernova scope, with 2FA bypass enabled.');
      process.exit(1);
    }
    writeFileSync(join(stage, '.npmrc'), '//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n');
  }

  console.log(`→ ${dryRun ? 'Packing' : 'Publishing'} ${publishName}@${pkg.version} (source name ${originalName} unchanged)`);
  run(dryRun ? 'npm pack' : 'npm publish --access public', stage);
  console.log(dryRun ? '✓ Dry run complete (no publish).' : `✓ Published ${publishName}@${pkg.version}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
