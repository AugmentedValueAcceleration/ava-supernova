#!/usr/bin/env node
/**
 * Intent-gate benchmark — accuracy AND latency, across candidate models.
 *
 * WHY THIS EXISTS
 *
 * The gate seat has been decided twice on evidence that could not decide it.
 * The August 2026 run used twenty prompts and Qwen 3.5 Flash scored 20/20 —
 * which does not say "3.5 Flash is best", it says the set is SATURATED and
 * cannot separate the candidates. Qwen 3.7 Flash has sat parked awaiting
 * measurement ever since, and Qwen 3.8 Flash did not exist when that run
 * happened.
 *
 * So this measures the axis that can actually separate them.
 *
 * LATENCY IS THE PRIMARY AXIS, not accuracy. The gate runs BEFORE every turn
 * and emits a single label, so what it costs the user is time-to-first-token,
 * not tokens per second and not price. A gate that is 2s slower makes every
 * answer in the product 2s slower. Accuracy here is a floor to clear, not a
 * score to maximise: any candidate below the floor is out regardless of speed.
 *
 * Reports p50 and p95, not just the mean. A gate that is usually fast and
 * occasionally terrible is a worse experience than one that is evenly middling,
 * and a mean hides exactly that.
 *
 * USAGE
 *   node scripts/gate-bench.mjs                      # all candidates, full set
 *   node scripts/gate-bench.mjs --models=a,b         # specific ids
 *   node scripts/gate-bench.mjs --repeat=3           # N passes for stable p95
 *   node scripts/gate-bench.mjs --json               # machine-readable
 *
 * Credential: AVA_PLATFORM_KEY / QWEN_API_KEY env, or ~/.ava/config.json
 * platformKey — same resolution as the i18n scripts.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) return [a.slice(2, eq), a.slice(eq + 1)];
    if (a.startsWith('--')) return [a.slice(2), 'true'];
    return [a, 'true'];
  }),
);

const AS_JSON = args.json === 'true';
const REPEAT = Math.max(1, Number(args.repeat || 1));

/** Candidates. Add an id here to put it in the running. */
const CANDIDATES = (args.models
  ? String(args.models).split(',')
  : ['qwen3.5-flash', 'qwen3.7-flash', 'qwen3.8-flash']
).map((s) => s.trim()).filter(Boolean);

/**
 * The prompt set, with the answer we expect.
 *
 * `needsTeam` is the gate's actual output: does this turn warrant spawning a
 * specialist team, or can the coordinator answer it directly.
 *
 * Deliberately includes the cases that are genuinely ambiguous rather than
 * only the easy ends — a set of obvious calls is how you get 20/20 and learn
 * nothing. The `hard: true` rows are the ones worth watching per-model.
 */
const PROMPTS = [
  // ── clearly direct ─────────────────────────────────────────────────────
  { p: 'what does this regex do: /^\\d{3}-\\d{4}$/', mode: 'work', needsTeam: false },
  { p: 'rename the variable foo to userCount in this file', mode: 'work', needsTeam: false },
  { p: 'is Python list comprehension faster than a for loop?', mode: 'work', needsTeam: false },
  { p: 'what port does postgres use by default', mode: 'work', needsTeam: false },
  { p: 'fix the typo in the README title', mode: 'work', needsTeam: false },
  { p: 'add a semicolon at the end of line 42', mode: 'work', needsTeam: false },
  { p: 'what is the difference between let and const', mode: 'work', needsTeam: false },
  { p: 'show me the git log for last week', mode: 'work', needsTeam: false },

  // ── clearly team ───────────────────────────────────────────────────────
  { p: 'build me a REST API with auth, rate limiting and postgres', mode: 'work', needsTeam: true },
  { p: 'migrate this whole codebase from JavaScript to TypeScript', mode: 'work', needsTeam: true },
  { p: 'design and implement a caching layer across the three services', mode: 'work', needsTeam: true },
  { p: 'audit this repo for security issues and fix what you find', mode: 'work', needsTeam: true },
  { p: 'add multi-tenant support end to end', mode: 'work', needsTeam: true },
  { p: 'refactor the payment flow and write tests for every branch', mode: 'work', needsTeam: true },

  // ── the ambiguous middle — where a gate actually earns its place ───────
  { p: 'this test is flaky, sort it out', mode: 'work', needsTeam: false, hard: true },
  { p: 'the build is slow, can you speed it up', mode: 'work', needsTeam: true, hard: true },
  { p: 'add dark mode', mode: 'work', needsTeam: true, hard: true },
  { p: 'why is my app crashing on startup', mode: 'work', needsTeam: false, hard: true },
  { p: 'clean up this file', mode: 'work', needsTeam: false, hard: true },
  { p: 'make the dashboard load faster', mode: 'work', needsTeam: true, hard: true },
  { p: 'update the deps', mode: 'work', needsTeam: false, hard: true },
  { p: 'i want users to be able to export their data', mode: 'work', needsTeam: true, hard: true },
  { p: 'something is wrong with the login', mode: 'work', needsTeam: false, hard: true },
  { p: 'tidy up the error handling across the project', mode: 'work', needsTeam: true, hard: true },

  // ── short and low-context, where a classifier can over-reach ───────────
  { p: 'help', mode: 'work', needsTeam: false, hard: true },
  { p: 'continue', mode: 'work', needsTeam: false },
  { p: 'thanks', mode: 'work', needsTeam: false },
  { p: 'do it', mode: 'work', needsTeam: false, hard: true },
];

// ── credential ────────────────────────────────────────────────────────────
function resolveKey() {
  const env = process.env.AVA_PLATFORM_KEY || process.env.QWEN_API_KEY;
  if (env) return env;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.ava', 'config.json'), 'utf8'));
    return cfg.platformKey || cfg.qwenApiKey || null;
  } catch { return null; }
}

const KEY = resolveKey();
if (!KEY) {
  console.error('No credential. Set AVA_PLATFORM_KEY or QWEN_API_KEY, or put platformKey in ~/.ava/config.json');
  process.exit(1);
}

/**
 * Goes through the Ava platform, not DashScope directly.
 *
 * Two reasons. It is the credential that actually exists on a maintainer's
 * machine (platformKey), and more importantly it measures the path a PLATFORM
 * user's gate call really takes — our hop included. A DashScope-direct number
 * would be a truer measure of Alibaba's serving and a worse measure of what
 * the gate costs the person waiting for an answer.
 *
 * Override with --endpoint= to measure a provider directly.
 */
const ENDPOINT = args.endpoint || 'https://avasupernova.com/api/chat';

const SYSTEM = `You are an intent classifier for a coding agent. Decide whether the user's
message needs a team of specialist agents spawned, or whether the coordinator
can answer it directly.

Reply with ONLY a JSON object: {"needsTeam": true|false}

needsTeam is true for multi-step work spanning several files or concerns.
needsTeam is false for questions, small edits, and single-file changes.`;

/** One call. Returns latency to first token and the parsed decision. */
async function callOnce(model, prompt, mode) {
  const t0 = Date.now();
  let ttft = null;
  let text = '';
  let thinking = false;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Mode: ${mode}\nUser message: ${prompt}` },
      ],
      temperature: 0,
      max_tokens: 120,
      // Matches the real gate exactly. Without this the model runs a reasoning
      // pass first and the measurement is of a different call: intent-gate.ts
      // measured 601 output tokens with thinking on against 9 with it off, for
      // an identical answer. Leaving it on made this harness read ~5s where the
      // gate actually costs well under one.
      enable_thinking: false,
      stream: true,
    }),
  });

  if (!res.ok) {
    return { error: `HTTP ${res.status} ${(await res.text()).slice(0, 120)}` };
  }

  // Streaming, because TTFT is the number that matters and you cannot get it
  // from a buffered response.
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const j = JSON.parse(payload);
        const d = j.choices?.[0]?.delta ?? {};
        if (d.reasoning_content) thinking = true;
        if (d.content) {
          if (ttft === null) ttft = Date.now() - t0;
          text += d.content;
        }
      } catch { /* keep-alive or partial frame */ }
    }
  }

  const total = Date.now() - t0;
  let needsTeam = null;
  const m = text.match(/"needsTeam"\s*:\s*(true|false)/i);
  if (m) needsTeam = m[1].toLowerCase() === 'true';
  return { ttft: ttft ?? total, total, needsTeam, thinking, raw: text.trim().slice(0, 80) };
}

function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

(async () => {
  const results = {};

  for (const model of CANDIDATES) {
    const ttfts = [];
    let correct = 0, hardCorrect = 0, hardTotal = 0, counted = 0, failed = 0, thinkingSeen = 0;
    const misses = [];

    for (let pass = 0; pass < REPEAT; pass++) {
      for (const t of PROMPTS) {
        let r;
        try { r = await callOnce(model, t.p, t.mode); }
        catch (e) { r = { error: e.message }; }

        if (r.error) { failed++; continue; }
        if (r.thinking) thinkingSeen++;
        ttfts.push(r.ttft);
        counted++;
        if (t.hard) hardTotal++;
        if (r.needsTeam === t.needsTeam) {
          correct++;
          if (t.hard) hardCorrect++;
        } else if (pass === 0) {
          misses.push(`${t.hard ? '[hard] ' : ''}${t.p.slice(0, 46)} -> ${r.needsTeam} (want ${t.needsTeam})`);
        }
      }
    }

    ttfts.sort((a, b) => a - b);
    results[model] = {
      accuracy: counted ? correct / counted : 0,
      hardAccuracy: hardTotal ? hardCorrect / hardTotal : null,
      ttftP50: pct(ttfts, 50),
      ttftP95: pct(ttfts, 95),
      calls: counted,
      failed,
      misses,
    };

    if (!AS_JSON) {
      const r = results[model];
      console.log(`\n${model}`);
      console.log(`  accuracy      ${(r.accuracy * 100).toFixed(1)}%  (${correct}/${counted})`);
      console.log(`  on hard cases ${r.hardAccuracy === null ? 'n/a' : (r.hardAccuracy * 100).toFixed(1) + '%'}  (${hardCorrect}/${hardTotal})`);
      console.log(`  TTFT p50      ${r.ttftP50}ms`);
      console.log(`  TTFT p95      ${r.ttftP95}ms`);
      if (r.failed) console.log(`  failed calls  ${r.failed}`);
      if (thinkingSeen) console.log(`  ⚠ reasoning pass ran on ${thinkingSeen}/${counted} calls — enable_thinking is not being honoured, latency here is NOT the gate's`);
      for (const m of r.misses.slice(0, 6)) console.log(`    miss: ${m}`);
    }
  }

  if (AS_JSON) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // ── the verdict, stated rather than left to the reader ──────────────────
  console.log('\n' + '─'.repeat(66));
  const ranked = Object.entries(results).filter(([, r]) => r.calls > 0);
  const FLOOR = 0.85;
  const passing = ranked.filter(([, r]) => r.accuracy >= FLOOR);

  if (!passing.length) {
    console.log(`No candidate cleared the ${FLOOR * 100}% accuracy floor. The gate seat`);
    console.log('should not move on this run.');
  } else {
    passing.sort((a, b) => a[1].ttftP50 - b[1].ttftP50);
    const [winner, w] = passing[0];
    console.log(`Fastest candidate clearing the ${FLOOR * 100}% floor: ${winner}`);
    console.log(`  ${w.ttftP50}ms p50, ${(w.accuracy * 100).toFixed(1)}% accuracy`);
    if (passing.length > 1) {
      const [second, s] = passing[1];
      const gap = s.ttftP50 - w.ttftP50;
      console.log(`  ${gap}ms faster at p50 than ${second}, for ${((w.accuracy - s.accuracy) * 100).toFixed(1)}pp accuracy difference`);
    }
    const spread = Math.max(...passing.map(([, r]) => r.accuracy)) - Math.min(...passing.map(([, r]) => r.accuracy));
    if (spread < 0.05) {
      console.log('\n  Accuracy spread is under 5pp across passing candidates, so this set');
      console.log('  is not separating them on correctness — which is the expected result,');
      console.log('  and the reason latency is the deciding axis. Widen the set only if');
      console.log('  you want a firmer accuracy floor, not to break the tie.');
    }
  }
  console.log('─'.repeat(66));
})();
