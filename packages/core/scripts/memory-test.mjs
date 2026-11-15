#!/usr/bin/env node
/**
 * Memory test — does Ava remember correctly?
 *
 * Part 0 of the Memory v4 plan. Asks Ava a fixed set of questions about the
 * person and their projects, the way a surface would, and grades each answer
 * against what is actually recorded.
 *
 *   node scripts/memory-test.mjs --questions=<file> --from=<backup dir> [options]
 *
 *   --questions  questions JSON (kept private: it holds personal facts)
 *   --from       a COPY of ~/.ava to test against. It is copied again into a
 *                temp sandbox, so the real store is never touched: recall
 *                writes recall counts, and a test must not change what it measures.
 *   --system     v3 (today's memory). v4 is added when it exists.
 *   --modes      chat,code (default both). Code mode gets no memory brief today;
 *                that difference is part of what is measured.
 *   --only       comma list of question ids
 *   --dry        no model calls: print what memory each question would receive
 *   --out        results folder (default: next to the questions file, results/)
 *
 * Model calls go DIRECT to Qwen with QWEN_API_KEY from packages/web/.env.local.
 * It never falls back to a platform key: platform calls are metered against a
 * real account (see the i18n scripts for the incident that taught us this).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const core = await import(url.pathToFileURL(path.join(here, '..', 'dist', 'index.js')).href);
const { MemoryRecallTool } = await import(url.pathToFileURL(path.join(here, '..', 'dist', 'tools', 'memory-recall.js')).href);
const { MemoryManager, MemoryAgent } = core;

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const ENDPOINT = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const ANSWER_MODEL = { id: 'qwen3.7-plus', inPerM: 0.40, outPerM: 1.60 };   // Maestro's main model
const CURATOR_MODEL = { id: 'qwen3.5-flash', inPerM: 0.20, outPerM: 1.20 }; // what the Memory Agent uses today
const JUDGE_MODEL = ANSWER_MODEL;

// ── Setup ──────────────────────────────────────────────────────────────────

if (!args.questions || !args.from) {
  console.error('Usage: node scripts/memory-test.mjs --questions=<file> --from=<copy of ~/.ava> [--modes=chat,code] [--only=ids] [--dry]');
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(args.questions, 'utf8'));
const modes = String(args.modes || 'chat,code').split(',');
const only = args.only ? new Set(String(args.only).split(',')) : null;
const questions = spec.questions.filter((q) => !only || only.has(q.id));
const system = args.system || 'v3';
if (system !== 'v3') { console.error(`Unknown --system=${system} (only v3 exists yet)`); process.exit(1); }

function qwenKey() {
  const p = path.join(here, '..', '..', 'web', '.env.local');
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*QWEN_API_KEY\s*=\s*(.*)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}
const KEY = args.dry ? null : qwenKey();
if (!args.dry && (!KEY || KEY.startsWith('sk-ava-'))) {
  console.error('No Qwen key in packages/web/.env.local (refusing to use a platform key).');
  process.exit(1);
}

// Sandbox: a fresh copy of the store for every run.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ava-memtest-'));
const home = path.join(sandbox, 'home');
fs.mkdirSync(home, { recursive: true });
for (const f of ['memory', 'memory.json', 'memory.md']) {
  const src = path.join(args.from, f);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(home, f), { recursive: true });
}
// Project stores: <from>/projects/<name>/.ava → sandbox/projects/<ctx>/.ava
const backupProjectDir = { dawnsets: 'DawnSets', sacred: 'SacredCrossing', ava: 'ava-supernova-repo' };
const ctxRoot = {};
for (const [ctx, real] of Object.entries(spec.contexts)) {
  if (!real) { ctxRoot[ctx] = null; continue; }
  const name = path.basename(real);
  const root = path.join(sandbox, 'projects', name);
  fs.mkdirSync(root, { recursive: true });
  const src = path.join(args.from, 'projects', backupProjectDir[ctx] ?? name, '.ava');
  if (fs.existsSync(src)) fs.cpSync(src, path.join(root, '.ava'), { recursive: true });
  ctxRoot[ctx] = root;
}

// ── Model calls ────────────────────────────────────────────────────────────

const usage = {};
function track(model, u) {
  const t = usage[model.id] ??= { in: 0, out: 0, model };
  t.in += u?.prompt_tokens ?? 0;
  t.out += u?.completion_tokens ?? 0;
}

async function complete(model, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: model.id, enable_thinking: false, ...body }),
    });
    if (res.ok) {
      const json = await res.json();
      track(model, json.usage);
      return json;
    }
    const text = await res.text();
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
    throw new Error(`${model.id} ${res.status}: ${text.slice(0, 300)}`);
  }
  throw new Error(`${model.id}: gave up after retries`);
}

/** The Memory Agent's provider: the same createCompletion shape core expects. */
const curatorProvider = {
  async createCompletion(req) {
    const { model: _m, stream: _s, ...rest } = req;
    return complete(CURATOR_MODEL, rest);
  },
};

// ── Today's memory (v3), as the surfaces wire it ──────────────────────────

const managers = new Map();
async function memoryFor(ctx) {
  if (managers.has(ctx)) return managers.get(ctx);
  const mm = new MemoryManager({ globalDir: home, projectRoot: ctxRoot[ctx] ?? undefined });
  await mm.loadAll();
  const agent = args.dry ? null : new MemoryAgent({ memoryManager: mm, provider: curatorProvider, model: { id: CURATOR_MODEL.id } });
  const entry = { mm, agent };
  managers.set(ctx, entry);
  return entry;
}

const recallTool = new MemoryRecallTool();

function systemPrompt(ctx, brain) {
  const real = spec.contexts[ctx];
  const parts = [
    'You are Ava, a coding and life partner who works on the user\'s own computer. You have a persistent memory of the user and their projects; use the memory_recall tool when you need to remember something. Answer the user\'s question directly and briefly. If you do not know, say so plainly: never guess.',
    real ? `Open project: ${path.basename(real)}` : 'No project is open.',
  ];
  // system-prompt.ts adds the project brain in EVERY mode.
  if (brain) parts.push(`[Open folder — background] What the code you're working in is and where it stands (from memory; warm-start reference, not law):\n${brain}`);
  return parts.join('\n\n');
}

async function ask(q, mode) {
  const { mm, agent } = await memoryFor(q.ctx);
  const brain = mm.getProjectBrain?.()?.brief ?? null;
  const messages = [{ role: 'system', content: systemPrompt(q.ctx, brain) }];
  const trace = { brief: null, recalls: [] };

  // The surfaces inject a brief in every mode EXCEPT code (AvaViewProvider:
  // shouldInjectMemory = mode !== 'code'; the IDE sidecar mirrors it).
  if (mode !== 'code' && agent) {
    const brief = await agent.generateBrief(q.q);
    if (brief.summary) {
      const topics = brief.availableTopics.length
        ? '\n\nAvailable memory topics (use memory_recall for detail): ' + brief.availableTopics.map((t) => t.topic).join(', ')
        : '';
      trace.brief = `${brief.summary}${topics}`;
      messages.push({ role: 'system', content: `[Memory Brief]\n${trace.brief}` });
    }
  }
  messages.push({ role: 'user', content: q.q });

  const tools = [{ type: 'function', function: recallTool.schema }];
  for (let round = 0; round < 4; round++) {
    const res = await complete(ANSWER_MODEL, { messages, tools, temperature: 0.2, max_tokens: 700 });
    const msg = res.choices?.[0]?.message ?? {};
    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) return { answer: msg.content ?? '', trace };
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: calls });
    for (const call of calls) {
      let a = {};
      try { a = JSON.parse(call.function.arguments || '{}'); } catch { /* bad args → empty query */ }
      const out = await recallTool.execute(a, { sharedState: { memoryManager: mm, memoryAgent: agent } });
      trace.recalls.push({ query: a.query, scope: a.scope ?? 'all', output: String(out.output).slice(0, 1500) });
      messages.push({ role: 'tool', tool_call_id: call.id, content: String(out.output).slice(0, 6000) });
    }
  }
  return { answer: '(no answer after 4 tool rounds)', trace };
}

async function judge(q, answer) {
  const prompt = `You grade whether an assistant remembered correctly.

Question: ${q.q}
Correct answer (from the user's records): ${q.expect}
${q.forbid ? `Automatic FAIL if the answer: ${q.forbid}` : ''}

Assistant's answer:
"""${answer}"""

PASS only if the answer contains the substance of the correct answer (wording may differ) and does not do the automatic-fail thing. An answer that says it doesn't know is a FAIL unless the correct answer itself says not knowing is acceptable. Reply with JSON only: {"pass": true|false, "reason": "<one short sentence>"}`;
  const res = await complete(JUDGE_MODEL, { messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 150 });
  const text = res.choices?.[0]?.message?.content ?? '';
  const m = text.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m[0]); } catch { return { pass: false, reason: `unparseable judge reply: ${text.slice(0, 80)}` }; }
}

// ── Run ────────────────────────────────────────────────────────────────────

// Register every project first so cross-project recall knows them.
for (const ctx of Object.keys(spec.contexts)) await memoryFor(ctx);
await new Promise((r) => setTimeout(r, 300));

if (args.dry) {
  for (const q of questions) {
    const { mm } = await memoryFor(q.ctx);
    const hits = await mm.recall({ query: q.q, limit: 5, scope: 'all' });
    console.log(`\n${q.id} [${q.ctx}] ${q.q}`);
    for (const h of hits) console.log(`   ${Math.round(h.relevance * 100)}% ${h.matchType} ${h.scope}: ${h.entry.content.replace(/\s+/g, ' ').slice(0, 110)}`);
    if (!hits.length) console.log('   (no recall hits)');
  }
  fs.rmSync(sandbox, { recursive: true, force: true });
  process.exit(0);
}

const results = [];
for (const q of questions) {
  for (const mode of modes) {
    process.stdout.write(`${q.id} ${mode.padEnd(4)} … `);
    try {
      const { answer, trace } = await ask(q, mode);
      const verdict = await judge(q, answer);
      results.push({ id: q.id, group: q.group, ctx: q.ctx, mode, q: q.q, expect: q.expect, answer, verdict, trace });
      console.log(verdict.pass ? 'PASS' : `FAIL  ${verdict.reason}`);
    } catch (err) {
      results.push({ id: q.id, group: q.group, ctx: q.ctx, mode, q: q.q, expect: q.expect, answer: '', verdict: { pass: false, reason: `error: ${err.message}` }, trace: {} });
      console.log(`ERROR ${err.message}`);
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────────

const cost = Object.values(usage).reduce((s, u) => s + u.in / 1e6 * u.model.inPerM + u.out / 1e6 * u.model.outPerM, 0);
const groups = [...new Set(questions.map((q) => q.group))];
const tally = (rows) => `${rows.filter((r) => r.verdict.pass).length}/${rows.length}`;

const lines = [];
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
lines.push(`# Memory test — ${system} — ${stamp}`, '');
lines.push(`Answer model ${ANSWER_MODEL.id}, curator ${CURATOR_MODEL.id}, judge ${JUDGE_MODEL.id}. Store: copy of ${args.from}. Cost $${cost.toFixed(3)}.`, '');
lines.push(`| Group | ${modes.join(' | ')} |`, `|---|${modes.map(() => '---').join('|')}|`);
for (const g of groups) lines.push(`| ${g} | ${modes.map((m) => tally(results.filter((r) => r.group === g && r.mode === m))).join(' | ')} |`);
lines.push(`| **total** | ${modes.map((m) => `**${tally(results.filter((r) => r.mode === m))}**`).join(' | ')} |`, '');
const recallRate = (m) => {
  const rows = results.filter((r) => r.mode === m);
  return `${rows.filter((r) => r.trace?.recalls?.length).length}/${rows.length}`;
};
lines.push(`Questions where Ava searched memory herself: ${modes.map((m) => `${m} ${recallRate(m)}`).join(', ')}.`, '');
lines.push('## Every answer', '');
for (const r of results) {
  lines.push(`### ${r.id} · ${r.mode} · ${r.verdict.pass ? 'PASS' : 'FAIL'}`);
  lines.push(`**Q** (${r.ctx}): ${r.q}  `, `**Expected:** ${r.expect}  `, `**Answer:** ${r.answer.replace(/\n+/g, ' ').slice(0, 600)}  `, `**Judge:** ${r.verdict.reason}  `);
  if (r.trace?.brief) lines.push(`**Brief given:** ${r.trace.brief.replace(/\n+/g, ' ').slice(0, 400)}  `);
  for (const c of r.trace?.recalls ?? []) lines.push(`**Searched:** "${c.query}" (${c.scope})  `);
  lines.push('');
}

const outDir = args.out || path.join(path.dirname(args.questions), 'results');
fs.mkdirSync(outDir, { recursive: true });
const base = path.join(outDir, `${new Date().toISOString().slice(0, 10)}-${system}`);
fs.writeFileSync(`${base}.md`, lines.join('\n'));
fs.writeFileSync(`${base}.json`, JSON.stringify({ system, stamp, cost, usage, results }, null, 2));
fs.rmSync(sandbox, { recursive: true, force: true });
console.log(`\n${lines.slice(4, 6 + groups.length + 2).join('\n')}\nCost $${cost.toFixed(3)} → ${base}.md`);
