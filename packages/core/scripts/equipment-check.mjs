#!/usr/bin/env node
/**
 * Does core's equipment vocabulary still match the catalogue's `equipment` table?
 *
 * core/src/health/equipment.ts mirrors that table so the extension, the IDE and
 * the CLI can match equipment with no network — local-first is not negotiable
 * for building a plan. A mirror rots silently, so this prints the drift:
 * slugs added to the table, slugs removed from it, and names that changed.
 *
 * REPORT ONLY. It never writes to the table and never edits the file: the table
 * is the source of truth, and what to do about a difference is a judgement
 * (a new row might deserve a chip, or might be a machine `gym_full` covers).
 *
 * Exits 1 on drift so CI can fail on it; run it with --quiet in a hook.
 *
 * Credential: the Supabase MANAGEMENT token (`sbp_…`) from
 * packages/web/.env.local — the same one migrations are applied with. Read-only
 * here. No platform key is spent; this is internal tooling.
 *
 * Usage:  node scripts/equipment-check.mjs [--quiet]
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const QUIET = process.argv.includes('--quiet');

const PROJECT_REF = 'dpxdjnpqaxhsydoeaogl';
const envPath = path.join(root, '..', 'web', '.env.local');
const token = (() => {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  try { return fs.readFileSync(envPath, 'utf8').match(/sbp_[A-Za-z0-9_]+/)?.[0] ?? null; }
  catch { return null; }
})();

if (!token) {
  console.error('No Supabase management token — set SUPABASE_ACCESS_TOKEN or add it to packages/web/.env.local.');
  process.exit(2);
}

const { EQUIPMENT } = await import(url.pathToFileURL(path.join(root, 'dist', 'health', 'equipment.js')).href)
  .catch(() => { console.error('Run `pnpm build` in core first — this reads dist/.'); process.exit(2); });

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  // `connection: close` on purpose. Left keep-alive, node's socket teardown
  // races process.exit on Windows and aborts with a libuv assertion — which
  // surfaced as exit 127 on a PASSING run, i.e. a checker that fails CI when
  // everything is fine. One request; nothing to keep alive for.
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'ava-equipment-check',
    connection: 'close',
  },
  body: JSON.stringify({ query: 'select slug, name from public.equipment order by slug' }),
});
if (!res.ok) { console.error(`Query failed: HTTP ${res.status}`); process.exit(2); }
const table = await res.json();
if (!Array.isArray(table)) { console.error('Unexpected response:', JSON.stringify(table).slice(0, 200)); process.exit(2); }

const byDb = new Map(table.map((r) => [r.slug, r.name]));
// `gym_full` is ours, not the catalogue's: it describes ACCESS, so no exercise
// is ever tagged with it and it must not read as "missing from the table".
const OURS_ALONE = new Set(['gym_full']);
const byCore = new Map(EQUIPMENT.filter((e) => !OURS_ALONE.has(e.slug)).map((e) => [e.slug, e.name]));

const added = [...byDb.keys()].filter((s) => !byCore.has(s));
const removed = [...byCore.keys()].filter((s) => !byDb.has(s));
const renamed = [...byCore.entries()].filter(([s, n]) => byDb.has(s) && byDb.get(s) !== n);

// `process.exitCode`, never `process.exit()`, from here down. Calling exit()
// while node is still tearing down the HTTPS socket aborts with a libuv
// assertion on Windows — which showed up as exit 127 on a run that had just
// printed a tick: a checker that fails CI when nothing is wrong. Setting the
// code and letting the loop drain gives the same answer without the race.
if (!added.length && !removed.length && !renamed.length) {
  if (!QUIET) console.log(`✓ equipment vocabulary matches the catalogue (${byCore.size} rows + gym_full)`);
  process.exitCode = 0;
} else {
  console.log('Equipment vocabulary has drifted from the catalogue:\n');
  for (const s of added) console.log(`  + in the TABLE, missing from core: ${s}  ("${byDb.get(s)}")`);
  for (const s of removed) console.log(`  - in CORE, gone from the table:    ${s}  ("${byCore.get(s)}")`);
  for (const [s, n] of renamed) console.log(`  ~ renamed: ${s}  core "${n}" → table "${byDb.get(s)}"`);
  console.log('\nFix core/src/health/equipment.ts — the table is the source of truth.');
  console.log('A new row is a judgement: it may deserve a profile chip, or it may be gym-floor kit that gym_full already covers.');
  process.exitCode = 1;
}
