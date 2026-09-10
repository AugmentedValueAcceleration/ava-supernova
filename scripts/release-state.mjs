#!/usr/bin/env node
/**
 * What is ACTUALLY published, right now, for every surface.
 *
 * Run this BEFORE writing release notes, bumping a version, or tagging anything.
 *
 * Why it exists: on 2026-08-09 I rewrote the release notes for extension 0.92.0
 * and IDE 0.38.0 believing both were unreleased. Both had shipped a week
 * earlier — 0.92.0 to the marketplace, 0.38.0 to GitHub — so for a while anyone
 * running 0.92.0 opened "what's new" and read about features that were not in
 * their build. A release note is a contract about the thing you installed;
 * rewriting it afterwards is worse than leaving it thin, because it is
 * confidently wrong.
 *
 * The information needed to avoid that was one API call away. What I used
 * instead was a to-do line saying "publish 0.92.0", which was a memory of a
 * plan, not evidence of a state. This script makes the evidence cheaper to get
 * than the assumption.
 *
 * It reads and reports. It changes nothing.
 *
 * Usage:
 *   node scripts/release-state.mjs
 *   node scripts/release-state.mjs --json
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const AS_JSON = process.argv.includes('--json');

/** Tokens live in env files, not in your head. See project_release_runbook. */
const HUB_ENV = 'C:/Users/stewa/Desktop/Stew.AI/ava-supernova/packages/augmented-value-acceleration/.env.local';
const WEB_ENV = path.join(repoRoot, 'packages', 'web', '.env.local');

function readEnv(file, key) {
  try {
    const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).replace(/^["']|["'\r]$/g, '') : null;
  } catch { return null; }
}

function localVersion(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8')).version ?? '?';
  } catch { return '?'; }
}

async function githubLatest(repo, token) {
  // A dead token used to make this return { error } -- which left `version`
  // undefined, which printed the same em-dash as "never released". Those mean
  // opposite things and looked identical, and the dash was believed: IDE
  // 0.45.0's notes were written announcing three features that had shipped in
  // 0.44.0 nine days earlier, because this said 0.44.0 was never released.
  //
  // Both repos are public, so auth is an optimisation (rate limit), not a
  // requirement. If the token is rejected, drop it and ask again rather than
  // reporting nothing.
  const attempt = async (useToken) => {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=5`, {
      headers: useToken ? { Authorization: `Bearer ${token}` } : {},
    });
    return res;
  };

  try {
    let usedToken = !!token;
    let res = await attempt(usedToken);
    if (!res.ok && usedToken && (res.status === 401 || res.status === 403)) {
      res = await attempt(false);
      usedToken = false;
      if (res.ok) authWarning = `GitHub token rejected (was HTTP 401/403) — read unauthenticated. `
        + `That token is the hub's VITE_GITHUB_TOKEN and is what PUBLISHES releases, so publishing will fail too.`;
    }
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) return { version: null, published: null };
    return {
      version: list[0].tag_name?.replace(/^v/, '') ?? null,
      published: (list[0].published_at ?? '').slice(0, 10),
      assets: list[0].assets.map((a) => a.name),
      recent: list.map((r) => r.tag_name).join(', '),
    };
  } catch (err) { return { error: err.message }; }
}

/** Set when the token was rejected and we fell back. Printed with the rows. */
let authWarning = null;

async function marketplaceLatest(extensionId) {
  try {
    const res = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json;api-version=3.0-preview.1' },
      body: JSON.stringify({
        filters: [{ criteria: [{ filterType: 7, value: extensionId }] }],
        flags: 914,
      }),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const d = await res.json();
    const v = d?.results?.[0]?.extensions?.[0]?.versions?.[0];
    return v ? { version: v.version, published: (v.lastUpdated ?? '').slice(0, 10) } : { version: null };
  } catch (err) { return { error: err.message }; }
}

async function releaseNotesRows() {
  const supaUrl = readEnv(WEB_ENV, 'NEXT_PUBLIC_SUPABASE_URL');
  const key = readEnv(WEB_ENV, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!supaUrl || !key) return { error: 'no supabase credentials in packages/web/.env.local' };
  try {
    const res = await fetch(
      `${supaUrl}/rest/v1/release_notes?select=platform,version,title,visible,updated_at&order=updated_at.desc&limit=12`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { rows: await res.json() };
  } catch (err) { return { error: err.message }; }
}

const ghToken = readEnv(HUB_ENV, 'VITE_GITHUB_TOKEN');

const [ext, ide, market, notes] = await Promise.all([
  githubLatest('AugmentedValueAcceleration/ava-supernova', ghToken),
  githubLatest('AugmentedValueAcceleration/ava-supernova-ide', ghToken),
  marketplaceLatest('augmentedvalueacceleration.ava-supernova'),
  releaseNotesRows(),
]);

const state = {
  extension: {
    local: localVersion('packages/extension/package.json'),
    marketplace: market.version ?? null,
    github: ext.version ?? null,
    githubPublished: ext.published ?? null,
  },
  ide: {
    local: localVersion('packages/ide/package.json'),
    github: ide.version ?? null,
    githubPublished: ide.published ?? null,
  },
};

if (AS_JSON) {
  console.log(JSON.stringify({ ...state, notes: notes.rows ?? notes }, null, 2));
} else {
  // `err` distinguishes "the lookup failed" from "nothing is published".
  // Printing a bare dash for both is what made this tool lie.
  const row = (label, local, published, where, when, err) => {
    const shipped = published && local === published;
    const shown = err ? `LOOKUP FAILED` : String(published ?? '—');
    console.log(`  ${label.padEnd(11)} local ${String(local).padEnd(9)} ${where.padEnd(12)} ${shown.padEnd(9)} ${when ?? ''}`
      + (err ? `   ⚠️  ${err} — this is NOT "nothing published", it is "could not tell"` : '')
      + (shipped ? '   ⚠️  SAME VERSION IS ALREADY PUBLISHED' : ''));
  };

  console.log('\nPublished state — read this BEFORE writing notes or tagging.\n');
  row('extension', state.extension.local, state.extension.marketplace, 'marketplace', market.published, market.error);
  row('extension', state.extension.local, state.extension.github, 'github', ext.published, ext.error);
  row('ide', state.ide.local, state.ide.github, 'github', ide.published, ide.error);

  if (authWarning) console.log(`\n  ⚠️  ${authWarning}`);

  if (ext.recent) console.log(`\n  ava-supernova releases:     ${ext.recent}`);
  if (ide.recent) console.log(`  ava-supernova-ide releases: ${ide.recent}`);

  if (notes.rows) {
    console.log('\n  release_notes, most recently edited:');
    for (const r of notes.rows.slice(0, 8)) {
      console.log(`    ${r.platform.padEnd(10)} ${r.version.padEnd(8)} vis=${String(r.visible).padEnd(5)} edited ${String(r.updated_at).slice(0, 10)}  ${r.title.slice(0, 44)}`);
    }
  } else if (notes.error) {
    console.log(`\n  release_notes: ${notes.error}`);
  }

  // The one line that matters. A version already out there must never be
  // rewritten -- bump instead, so a version number never means two binaries.
  const clashes = [];
  if (state.extension.marketplace && state.extension.local === state.extension.marketplace) clashes.push(`extension ${state.extension.local} (marketplace)`);
  if (state.extension.github && state.extension.local === state.extension.github) clashes.push(`extension ${state.extension.local} (github)`);
  if (state.ide.github && state.ide.local === state.ide.github) clashes.push(`ide ${state.ide.local} (github)`);

  console.log('');
  if (clashes.length) {
    console.log(`❌ Already published: ${clashes.join(', ')}`);
    console.log('   BUMP before writing notes or tagging. Do not rewrite the notes of a shipped version —');
    console.log('   people are running it, and the notes are a contract about what they installed.');
    process.exit(1);
  }
  console.log('✅ Local versions are ahead of what is published. Safe to write notes and tag.');
}
