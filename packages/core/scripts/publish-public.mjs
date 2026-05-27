#!/usr/bin/env node
/**
 * Publish @ava/core to npm under a PUBLIC scoped name — for `web` (the
 * companion's server) to install. The `@ava` scope is owned by the AVA
 * test-runner project, so the published artifact ships under OUR scope
 * (default `@ava-supernova/core`, override with AVA_NPM_SCOPE).
 *
 * SURGICAL BY DESIGN: the monorepo source name stays `@ava/core`. This
 * script never mutates packages/core/package.json — it copies `dist` + a
 * name-swapped package.json into a temp dir and publishes from there. So
 * the extension / IDE / CLI that bundle `@ava/core` from the workspace are
 * completely untouched. Run a `pnpm build` in core first (or let this do it).
 *
 * Usage (needs npm auth — `npm login` or NODE_AUTH_TOKEN / .npmrc):
 *   node scripts/publish-public.mjs            # publishes @ava-supernova/core
 *   AVA_NPM_SCOPE=@your-scope node scripts/publish-public.mjs
 *   node scripts/publish-public.mjs --dry-run  # pack only, no publish
 */
import { mkdtempSync, cpSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const coreDir = dirname(dirname(fileURLToPath(import.meta.url))); // packages/core
const scope = (process.env.AVA_NPM_SCOPE || '@ava-supernova').replace(/\/$/, '');
const dryRun = process.argv.includes('--dry-run');
const publishName = `${scope}/core`;

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

  console.log(`→ ${dryRun ? 'Packing' : 'Publishing'} ${publishName}@${pkg.version} (source name ${originalName} unchanged)`);
  run(dryRun ? 'npm pack' : 'npm publish --access public', stage);
  console.log(dryRun ? '✓ Dry run complete (no publish).' : `✓ Published ${publishName}@${pkg.version}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
