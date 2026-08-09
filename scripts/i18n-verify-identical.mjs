#!/usr/bin/env node
/**
 * Decide, per language, whether a value that matches the English is CORRECT or
 * a LEFTOVER — and write the correct ones into the sign-off ledger.
 *
 * `pnpm i18n:check` flags every non-English value identical to the English. Most
 * of those are right: Dutch really does say "Perfect", French really does say
 * "Journal", and nobody anywhere translates "Git" or "URL". Some are wrong:
 * German for Volume is "Lautstärke", so "Volume" sitting in de.ts is a genuine
 * miss. The audit cannot tell those apart, which is why it had drifted into 256
 * errors that everyone had learned to ignore — and an audit nobody reads is
 * worse than no audit, because it looks like cover.
 *
 * This asks the question the audit cannot: in THIS language, for THIS string, is
 * the identical value what a native speaker would write?
 *
 *   - "correct"  → written to scripts/i18n-verified-identical.json, and the
 *                  audit stops flagging that exact (surface, locale, key, value).
 *   - "leftover" → printed, NOT ledgered. Those are real work, and burying them
 *                  in the ledger is precisely the failure being fixed.
 *
 * The ledger stores the English value it was signed off against, so changing the
 * English lapses the sign-off automatically.
 *
 * Usage:
 *   node scripts/i18n-verify-identical.mjs            # verify + write ledger
 *   node scripts/i18n-verify-identical.mjs --dry-run  # decide, print, write nothing
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import url from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const LEDGER_PATH = path.join(repoRoot, 'scripts', 'i18n-verified-identical.json');
const DRY_RUN = process.argv.includes('--dry-run');

const MODEL = 'qwen3.8-max';

const LANGUAGE_NAMES = {
  'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese',
  ja: 'Japanese', ko: 'Korean', es: 'Spanish', pt: 'Portuguese',
  fr: 'French', de: 'German', ru: 'Russian', ar: 'Arabic', hi: 'Hindi',
  it: 'Italian', nl: 'Dutch', tr: 'Turkish', vi: 'Vietnamese', th: 'Thai',
  pl: 'Polish', uk: 'Ukrainian', id: 'Indonesian',
};

function resolveCredential() {
  const classify = (raw) => (raw ? { kind: raw.startsWith('sk-ava-') ? 'platform' : 'qwen', key: raw } : null);
  if (process.env.AVA_PLATFORM_KEY) return { kind: 'platform', key: process.env.AVA_PLATFORM_KEY };
  if (process.env.QWEN_API_KEY) return { kind: 'qwen', key: process.env.QWEN_API_KEY };
  try {
    const cfgPath = path.join(os.homedir(), '.ava', 'config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg?.platformKey) return classify(cfg.platformKey);
      if (cfg?.providers?.qwen?.apiKey) return classify(cfg.providers.qwen.apiKey);
    }
  } catch { /* fall through */ }
  return null;
}

const CRED = resolveCredential();
if (!CRED) {
  console.error('❌ No credential. Set AVA_PLATFORM_KEY or QWEN_API_KEY, or put one in ~/.ava/config.json.');
  process.exit(1);
}
const COMPLETION_URL = CRED.kind === 'platform'
  ? 'https://avasupernova.com/api/chat'
  : 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';

/**
 * The flagged pairs come from the audit itself rather than from a second
 * re-implementation of its rules. One source of truth for "what counts as an
 * English leak" — a private copy here would drift from the check the moment
 * either changed, which is the bug class this whole exercise is about.
 */
function collectFlagged() {
  let out = '';
  try {
    out = execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'i18n-check.mjs')], {
      encoding: 'utf8', cwd: repoRoot, maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    // Non-zero exit is the NORMAL case here: the audit fails, that is why we ran it.
    out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
  const re = /\[([^/\]]+)\/([^\]]+)\]\s+UNTRANSLATED:\s+(\S+)\s+=\s+(.*)$/;
  const flagged = [];
  for (const line of out.split(/\r?\n/)) {
    const m = re.exec(line.trim());
    if (m) flagged.push({ surface: m[1], locale: m[2], key: m[3], value: m[4] });
  }
  return flagged;
}

async function ask(language, entries, attempt = 1) {
  const system = [
    `You are a native ${language} speaker reviewing the ${language} translation of a software interface.`,
    '',
    'Each entry below has a value that is IDENTICAL to the English. For each one,',
    `decide whether that is CORRECT ${language} or an untranslated leftover.`,
    '',
    'Answer "correct" when:',
    `  - ${language} genuinely uses this same word (a loanword or shared spelling),`,
    '  - it is a proper noun or brand (Git, Ava, GitHub),',
    '  - it is a technical token or unit that is never translated (URL, Top-p, BYOK, min),',
    `  - translating it would look wrong or foreign to a ${language} speaker.`,
    '',
    'Answer "leftover" when a normal, natural word exists and should have been used.',
    'When you answer "leftover" you MUST supply that word in "suggestion".',
    '',
    'Be strict. Signing off a real leftover hides a bug; there is no cost to',
    'flagging one, because a human reviews what you flag.',
    '',
    'Return ONLY JSON: {"results":[{"key":"...","verdict":"correct"|"leftover","suggestion":"..."}]}',
  ].join('\n');

  const payload = entries.map((e) => ({ key: e.key, value: e.value }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  let res;
  try {
    res = await fetch(COMPLETION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CRED.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Review these ${language} interface strings:\n\n${JSON.stringify(payload, null, 2)}` },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
        enable_thinking: false,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      return ask(language, entries, attempt + 1);
    }
    throw err;
  }
  clearTimeout(timer);

  if (!res.ok) {
    if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      return ask(language, entries, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? json.content ?? '';
  const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, '').trim());
  const byKey = new Map((parsed.results ?? []).map((r) => [r.key, r]));

  // Anything the model did not rule on stays UNVERIFIED rather than defaulting
  // to correct. A missing answer is not a pass.
  return entries.map((e) => {
    const r = byKey.get(e.key);
    return {
      ...e,
      verdict: r?.verdict === 'correct' ? 'correct' : r?.verdict === 'leftover' ? 'leftover' : 'unknown',
      suggestion: typeof r?.suggestion === 'string' ? r.suggestion : null,
    };
  });
}

async function main() {
  const flagged = collectFlagged();
  if (!flagged.length) {
    console.log('✅ Nothing flagged — the audit is clean.');
    return;
  }
  console.log(`${flagged.length} identical value(s) flagged across ${new Set(flagged.map((f) => `${f.surface}/${f.locale}`)).size} locale file(s).\n`);

  const groups = new Map();
  for (const f of flagged) {
    const g = `${f.surface}|${f.locale}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(f);
  }

  const ledger = {};
  const leftovers = [];
  const unknowns = [];

  for (const [group, entries] of groups) {
    const [surface, locale] = group.split('|');
    const language = LANGUAGE_NAMES[locale];
    if (!language) {
      console.log(`  ${surface}/${locale}: SKIPPED — no language name mapped.`);
      entries.forEach((e) => unknowns.push(e));
      continue;
    }
    process.stdout.write(`  ${surface}/${locale}: ${entries.length} … `);

    // CHUNKED. Dutch had 37 entries in one request and timed out, which cost
    // the whole locale -- 37 strings fell to "undecided" because of the batch
    // size rather than because anything was genuinely unclear. A failure should
    // cost one chunk, not one language.
    const CHUNK = 15;
    const results = [];
    let failed = 0;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const slice = entries.slice(i, i + CHUNK);
      try {
        results.push(...await ask(language, slice));
      } catch {
        failed += slice.length;
        slice.forEach((e) => unknowns.push(e));
      }
    }
    if (failed) process.stdout.write(`(${failed} failed) `);
    let ok = 0;
    for (const r of results) {
      if (r.verdict === 'correct') {
        ledger[surface] ??= {};
        ledger[surface][locale] ??= {};
        ledger[surface][locale][r.key] = r.value;
        ok++;
      } else if (r.verdict === 'leftover') {
        leftovers.push(r);
      } else {
        unknowns.push(r);
      }
    }
    console.log(`${ok} correct, ${results.length - ok} to review`);
  }

  console.log('');
  if (leftovers.length) {
    console.log(`⚠️  ${leftovers.length} genuine leftover(s) — NOT ledgered, these need translating:`);
    for (const l of leftovers) {
      console.log(`   [${l.surface}/${l.locale}] ${l.key} = ${JSON.stringify(l.value)}`
        + (l.suggestion ? `  → suggested: ${JSON.stringify(l.suggestion)}` : ''));
    }
    console.log('');
  }
  if (unknowns.length) {
    console.log(`❓ ${unknowns.length} undecided — left flagged rather than assumed correct.`);
    console.log('');
  }

  const total = Object.values(ledger).reduce(
    (a, byLocale) => a + Object.values(byLocale).reduce((b, keys) => b + Object.keys(keys).length, 0), 0);

  if (DRY_RUN) {
    console.log(`--dry-run: would sign off ${total} entr${total === 1 ? 'y' : 'ies'}. Nothing written.`);
    return;
  }

  fs.writeFileSync(LEDGER_PATH, `${JSON.stringify({
    $comment: [
      'Values that legitimately match the English, per language.',
      'Written by scripts/i18n-verify-identical.mjs; each entry was judged in',
      'context by a native-level reviewer for that language, not waved through.',
      'The stored value is the English text signed off against — change the',
      'English and the sign-off lapses, so the pair is flagged again.',
      'A genuine leftover NEVER belongs here; translate it instead.',
    ].join(' '),
    verifiedBy: `${MODEL} (per-language review)`,
    entries: ledger,
  }, null, 2)}\n`);

  console.log(`✅ Signed off ${total} entr${total === 1 ? 'y' : 'ies'} → ${path.relative(repoRoot, LEDGER_PATH)}`);
  console.log(leftovers.length
    ? `   ${leftovers.length} left flagged on purpose. The audit stays red until they are translated.`
    : '   Nothing left flagged.');
}

main().catch((err) => { console.error(err); process.exit(1); });
