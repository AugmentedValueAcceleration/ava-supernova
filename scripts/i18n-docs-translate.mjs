#!/usr/bin/env node
/**
 * Translate the documentation corpus into all locales.
 *
 * English lives in packages/core/src/docs/content/*.ts (source of truth). This
 * walks the built corpus, extracts every translatable text block via the same
 * key scheme getPages(locale) reads, translates per locale (platform chat /
 * Qwen flash), and writes packages/core/src/docs/i18n/translations.ts.
 *
 * Idempotent + resumable: existing translations are parsed back in and skipped
 * — but only while the English they were made from is unchanged. A hash of each
 * English string is stored alongside (under the reserved `__en` key), so an
 * edited sentence is retranslated instead of silently keeping nineteen stale
 * copies, and a deleted one is pruned from every locale.
 *   pnpm i18n:docs                 # all locales
 *   pnpm i18n:docs --locales=es,fr # subset
 *   pnpm i18n:docs --concurrency=10 --batch-size=25
 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import url from 'node:url';
import { createHash } from 'node:crypto';
import { getPages, docTranslatableEntries } from '../packages/core/dist/docs/index.js';

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const OUT = path.join(repoRoot, 'packages/core/src/docs/i18n/translations.ts');
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const BATCH = Number(args['batch-size'] || 25);
const CONCURRENCY = Math.max(1, Number(args['concurrency'] || 8));
const LOCALES = {
  'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese', ja: 'Japanese', ko: 'Korean',
  es: 'Spanish', pt: 'Portuguese', fr: 'French', de: 'German', ru: 'Russian', ar: 'Arabic',
  hi: 'Hindi', vi: 'Vietnamese', th: 'Thai', tr: 'Turkish', it: 'Italian', pl: 'Polish',
  uk: 'Ukrainian', nl: 'Dutch', id: 'Indonesian',
};
const FILTER = args.locales ? new Set(String(args.locales).split(',')) : null;
/**
 * Qwen key from packages/web/.env.local, so this does not depend on anyone
 * exporting an env var first. Translation is internal tooling and must not
 * spend customer-facing platform credits — every call through the platform
 * endpoint is metered, and preferring it silently emptied a monthly allowance
 * on a test account.
 */
function qwenKeyFromEnvFile() {
  try {
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const p = path.join(here, '..', 'packages', 'web', '.env.local');
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*QWEN_API_KEY\s*=\s*(.*)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '') || null;
    }
  } catch { /* ignore */ }
  return null;
}

function warnPlatform() {
  console.warn('\n  !!  No working Qwen key — falling back to a PLATFORM key.');
  console.warn('      Every call will be METERED against that account\'s credits.');
  console.warn('      To avoid it, put a WORKING QWEN_API_KEY in packages/web/.env.local.');
  console.warn('      The one there on 2026-10-07 was an sk-ws-… value this endpoint');
  console.warn('      rejects with 401, which is why the preflight above tried it first.\n');
}

// QWEN FIRST — internal tooling must not spend platform credits. This used to
// take AVA_PLATFORM_KEY, then config.json's platformKey, and only then the
// qwen key, so the default path billed a platform account silently.
/**
 * Candidate credentials, best first, each labelled with where it came from.
 *
 * They are TRIED, not assumed. On 2026-10-07 the QWEN_API_KEY in
 * packages/web/.env.local was a 115-character `sk-ws-…` value that this
 * endpoint rejects with 401 "Invalid API key format" — and because a failed
 * batch silently fell back to the English, the run wrote English into all 19
 * locales and reported DONE. Preferring a key is only safe if you check it.
 *
 * Note the preference order is about COST, not capability: a direct Qwen key is
 * not metered against platform credits, so it goes first where one exists.
 */
function keyCandidates() {
  const out = [];
  if (process.env.QWEN_API_KEY) out.push(['env QWEN_API_KEY', process.env.QWEN_API_KEY]);
  const fromFile = qwenKeyFromEnvFile();
  if (fromFile) out.push(['packages/web/.env.local QWEN_API_KEY', fromFile]);
  try {
    const c = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.ava', 'config.json'), 'utf8'));
    if (c?.providers?.qwen?.apiKey) out.push(['~/.ava/config.json providers.qwen.apiKey', c.providers.qwen.apiKey]);
    if (c?.platformKey) out.push(['~/.ava/config.json platformKey (METERED)', c.platformKey]);
  } catch { /* ignore */ }
  if (process.env.AVA_PLATFORM_KEY) out.push(['env AVA_PLATFORM_KEY (METERED)', process.env.AVA_PLATFORM_KEY]);
  return out;
}

/**
 * WHERE a key goes depends on WHAT it is — the same branch i18n-translate.mjs
 * has always had, and whose absence here is the whole story of 2026-10-07.
 *
 * A platform key (sk-ava-*) belongs to our own gateway. Anything else is a
 * provider key and belongs to that provider. This script posted EVERYTHING to
 * the gateway, so the Qwen key in packages/web/.env.local came back 401
 * "Invalid API key format" — not because it is a bad key (it answers DashScope
 * with a 200) but because it was handed to the wrong door. The platform key then
 * won the fallback, and translation ran metered on customer-facing credits,
 * which is precisely what the Qwen key exists to avoid.
 */
const QWEN_BASE = (() => {
  try {
    const p = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'packages', 'web', '.env.local');
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*QWEN_API_BASE_URL\s*=\s*(.*)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '').replace(/\/$/, '') || null;
    }
  } catch { /* ignore */ }
  return null;
})() || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

const isPlatformKey = (key) => /^sk-ava-/.test(key);
const completionUrl = (key) => (isPlatformKey(key)
  ? 'https://avasupernova.com/api/chat'
  : `${QWEN_BASE}/chat/completions`);

/** One cheap round trip. 38 batches against a dead credential is a slow way to
 *  learn something a single call answers in a second. */
async function keyWorks(key) {
  try {
    const res = await fetch(completionUrl(key), {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen3.5-flash', messages: [{ role: 'user', content: 'ok' }], max_tokens: 2000 }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, why: `HTTP ${res.status} ${JSON.stringify(await res.json()).slice(0, 120)}` };
  } catch (e) { return { ok: false, why: e.message }; }
}

const candidates = keyCandidates();
if (!candidates.length) { console.error('No platform/Qwen key found.'); process.exit(1); }
let PK = null;
for (const [label, key] of candidates) {
  const r = await keyWorks(key);
  if (r.ok) {
    console.log(`key: ${label} — verified`);
    if (/METERED/.test(label)) warnPlatform();
    PK = key;
    break;
  }
  console.warn(`key: ${label} — REJECTED, ${r.why}`);
}
if (!PK) { console.error(`\nNo working key. Tried ${candidates.length}; all rejected. Nothing was translated.`); process.exit(1); }

// Preserve these tokens verbatim — brands + the mode shortcut symbols + paths.
const GLOSSARY = ['Ava', 'Supernova', 'Ava Supernova', 'JARVIS', 'Qwen', 'DeepSeek', 'Mistral', 'MiniMax',
  'Anthropic', 'Claude', 'GitHub', 'Slack', 'Discord', 'Git', 'IDE', 'CLI', 'API', 'BYOK', 'OWASP', 'CVE',
  'OK', 'Maestro', 'Supernova', 'VS Code', 'Tauri', 'Creative Studio', 'Office Suite'];

// The vendor alone is not enough. 'Qwen' was on the list above and Japanese
// still came back with "Qwen 3.5 フラッシュ" — the vendor preserved, the TIER
// translated — across eleven values on 2026-10-07. A model name is a product
// name end to end, and it is the string a reader has to recognise in a picker,
// so the tier words need naming in their own right.
const MODEL_NAME_RULE =
  'Model names are product names and must be copied EXACTLY, every word of them, '
  + 'including the tier: Flash, Plus, Max, Pro, Code, Medium, Small, Large and any '
  + 'version number. "Qwen 3.5 Flash" stays "Qwen 3.5 Flash" in every language — '
  + 'never translate Flash, Plus or Max when they follow a model name.';

function loadExisting() {
  try { const t = fs.readFileSync(OUT, 'utf8'); const m = t.match(/=\s*(\{[\s\S]*\});?\s*$/); return m ? JSON.parse(m[1]) : {}; } catch { return {}; }
}
function writeOut(obj) {
  const header = '// Per-locale documentation translations. GENERATED by scripts/i18n-docs-translate.mjs.\n// Shape: { [locale]: { [blockKey]: translatedText } }. English is the source of truth in content/*.ts.\n\n';
  fs.writeFileSync(OUT, header + 'export const DOC_TRANSLATIONS: Record<string, Record<string, string>> = ' + JSON.stringify(obj) + ';\n', 'utf8');
}
async function translate(entries, lang, attempt = 1) {
  // An empty string has no translation, and asking for one costs a round trip
  // and then fails: the model simply omits the key from its JSON rather than
  // echoing "", which read as a short key set and failed 19 of 59 batches on
  // 2026-10-07. The fleet table's first header cell is '' by design — the empty
  // corner above the row labels — so this is a real case, not a data error.
  const blank = entries.filter(([, v]) => String(v) === '');
  const work = entries.filter(([, v]) => String(v) !== '');
  if (!work.length) return blank.map(([k]) => [k, '']);

  const obj = Object.fromEntries(work);
  try {
    const res = await fetch(completionUrl(PK), { method: 'POST', headers: { Authorization: `Bearer ${PK}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'qwen3.5-flash', messages: [
      { role: 'system', content: `You are translating product documentation into ${lang}. Translate the VALUES of the given JSON object into natural, clear ${lang} aimed at non-technical readers. Return ONLY a JSON object with the EXACT same keys, no prose or code fences. Preserve: inline markdown (**bold**, \`code\`), file paths (like ~/.ava/), URLs, the mode shortcut symbols (>> :: .. ?? !! **), numbers, and these tokens unchanged: ${GLOSSARY.join(', ')}. ${MODEL_NAME_RULE} Keep the warm, plain-language tone.` },
      { role: 'user', content: JSON.stringify(obj) },
    ], temperature: 0.3, max_tokens: 8000 }) });
    const body = await res.json();
    const choice = body?.choices?.[0];
    // No choices at all means this is not a completion — it is an error body, a
    // rate-limit, or a gateway page. Say which. Without this the next line
    // stringifies undefined and the failure reads '"undefined" is not valid
    // JSON', which sends you hunting for a malformed translation that was never
    // sent in the first place.
    if (!choice) {
      throw new Error(`HTTP ${res.status} with no choices — ${JSON.stringify(body).slice(0, 220)}`);
    }
    // CUT OFF AT THE OUTPUT LIMIT. Worth its own error rather than letting the
    // truncated JSON fail to parse: the parse error says "Unexpected end of
    // input", which reads like a malformed model response and sends you
    // looking at the prompt, when the real answer is that the budget ran out.
    if (choice?.finish_reason === 'length') {
      throw new Error(`output limit hit (${body?.usage?.completion_tokens ?? '?'} completion tokens, of which ${body?.usage?.completion_tokens_details?.reasoning_tokens ?? '?'} reasoning) — reduce --batch-size or raise max_tokens`);
    }
    const tx = JSON.parse(String(choice?.message?.content).replace(/^```json\s*|\s*```$/g, '').trim());
    // "Missing" means the model did not return the key, or returned an empty
    // string for English that was NOT empty. An empty value is a perfectly good
    // translation of an empty value: the fleet table's first header cell is ''
    // by design (the corner above the row labels), and a truthiness test here
    // failed 19 of 59 batches over it.
    const missing = work.filter(([k, v]) => typeof tx[k] !== 'string' || (tx[k] === '' && v !== ''));
    // A key the model did not return used to fall back to the ENGLISH value,
    // silently, and the run still reported DONE. That is how 19 locales ended
    // up holding English for every string this pass touched on 2026-10-07
    // while the log said "38 batches, no failures".
    if (missing.length) {
      throw new Error(`model returned ${work.length - missing.length}/${work.length} keys — missing e.g. ${missing.slice(0, 2).map(([k]) => k).join(', ')}`);
    }
    // Blanks rejoin here so the caller still receives every key it asked for.
    return [...work.map(([k]) => [k, tx[k]]), ...blank.map(([k]) => [k, ''])];
  } catch (e) {
    if (attempt < 3) { await new Promise(r => setTimeout(r, 3000)); return translate(entries, lang, attempt + 1); }
    // THROW. Returning `entries` here returned the English, which the caller
    // then wrote into the locale as though it were a translation — a failure
    // that looks exactly like a success in both the log and the key counts.
    // The caller counts and reports these; a run with any of them is a failed
    // run and says so at the end.
    throw new Error(`[${lang}] ${entries.length} strings failed after 3 attempts: ${e.message}`);
  }
}
/** Runs the tasks, and RETURNS the failures rather than swallowing them. The
 *  caller needs them: a batch that failed must not have its English recorded as
 *  translated, or it is never retried. */
async function pool(tasks, limit) {
  const q = [...tasks]; let n = 0; const failures = [];
  await Promise.all(Array.from({ length: limit }, async () => {
    while (q.length) {
      const t = q.shift();
      try { await t(); n++; if (n % 20 === 0) console.log(`  ${n}/${tasks.length} batches`); }
      catch (e) { failures.push(e); console.log('batch FAIL:', e.message); }
    }
  }));
  return failures;
}

const englishEntries = docTranslatableEntries(getPages('en'));
console.log('translatable doc strings (English):', englishEntries.length);
const store = loadExisting();

// A hash of the English each translation was made FROM. Without this the script
// could only ask "is there a translation for this key", never "is it still a
// translation of what the key now says".
const enHash = (v) => createHash('sha1').update(String(v)).digest('hex').slice(0, 12);
const enNow = new Map(englishEntries.map(([k, v]) => [k, enHash(v)]));
const enWas = store.__en || {};

// Prune anything the English no longer has — otherwise a removed sentence keeps
// its translation in all nineteen locales forever.
let pruned = 0;
for (const [loc, d] of Object.entries(store)) {
  if (loc === '__en') continue;
  for (const k of Object.keys(d)) if (!enNow.has(k)) { delete d[k]; pruned++; }
}
for (const k of Object.keys(enWas)) if (!enNow.has(k)) delete enWas[k];
if (pruned) console.log('pruned', pruned, 'translations whose English is gone');

// Anything whose English has CHANGED since it was translated.
const changed = englishEntries.filter(([k]) => enWas[k] && enWas[k] !== enNow.get(k));
if (changed.length) {
  console.log('English changed for', changed.length, 'strings — retranslating:');
  for (const [k] of changed.slice(0, 10)) console.log('   ', k);
  if (changed.length > 10) console.log('    …and', changed.length - 10, 'more');
}
const staleKeys = new Set(changed.map(([k]) => k));
const targets = Object.entries(LOCALES).filter(([loc]) => !FILTER || FILTER.has(loc));
const tasks = [];
for (const [loc, lang] of targets) {
  store[loc] = store[loc] || {};
  const missing = englishEntries.filter(([k]) => !(k in store[loc]) || staleKeys.has(k));
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const task = async () => { const out = await translate(batch, lang); for (const [k, v] of out) store[loc][k] = v; };
    // Which keys this batch is responsible for, so a failure can keep them out
    // of the __en ledger below.
    task.keys = batch.map(([k]) => k);
    tasks.push(task);
  }
}
console.log('locales:', targets.length, '| batches to run:', tasks.length);
let since = 0;
// write periodically so a crash is resumable
const writer = setInterval(() => { if (since) { writeOut(store); since = 0; } }, 15000);
const failedKeys = new Set();
const wrapped = tasks.map((t) => {
  const w = async () => { try { await t(); since++; } catch (e) { for (const k of t.keys) failedKeys.add(k); throw e; } };
  return w;
});
const failures = await pool(wrapped, CONCURRENCY);
clearInterval(writer);

// Record what the English said at the moment each locale was translated from it
// — but ONLY for keys that actually translated.
//
// Writing the whole ledger unconditionally is what made the 2026-10-07 failure
// permanent rather than merely annoying. A stale key keeps its OLD translation
// when its batch fails; stamping the NEW English hash against it then says "this
// has been translated from the current English", so the next run sees nothing
// changed and never retries it. The wrong translation would have sat there for
// good, and re-running the script would have reported success every time.
store.__en = Object.fromEntries(
  [...enNow].map(([k, h]) => [k, failedKeys.has(k) && enWas[k] ? enWas[k] : h]),
);
for (const k of failedKeys) if (!enWas[k]) delete store.__en[k];
writeOut(store);
const totals = Object.fromEntries(Object.entries(store).map(([l, d]) => [l, Object.keys(d).length]));

// The key COUNTS were never evidence of anything — they were 577/577 across all
// nineteen locales on the run that wrote English into every one of them, because
// an untranslated string still occupies its key. Lead with the failures.
if (failures.length) {
  console.log('');
  console.log(`FAILED: ${failures.length} of ${tasks.length} batches, covering ${failedKeys.size} distinct strings.`);
  console.log('Those strings were NOT written and NOT marked as translated, so re-running picks them up.');
  console.log('per-locale key counts (a count includes untranslated keys — do not read it as success):', JSON.stringify(totals));
  process.exit(1);
}
console.log('DONE, no failures. per-locale key counts:', JSON.stringify(totals));
