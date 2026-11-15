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
 *   --system     v3 (today's memory) or v4 (the rebuilt memory; --from is then
 *                a v4 memory folder, and memory reaches Ava the way Part 3
 *                will: core always, the app's own search each message, the
 *                project's last day and open threads, and a named day's episode).
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
if (system !== 'v3' && system !== 'v4') { console.error(`Unknown --system=${system}`); process.exit(1); }

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
if (system === 'v4') {
  fs.cpSync(args.from, path.join(sandbox, 'v4'), { recursive: true });
} else {
  for (const f of ['memory', 'memory.json', 'memory.md']) {
    const src = path.join(args.from, f);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(home, f), { recursive: true });
  }
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

PASS only if the answer contains the substance of the correct answer (wording may differ) and does not do the automatic-fail thing. Extra details that are not contradicted do not make it fail. Read carefully which project each statement is about: mentioning another project by name is fine; only a claim about the open project or the user counts. An answer that says it doesn't know is a FAIL unless the correct answer itself says not knowing is acceptable. Reply with JSON only: {"pass": true|false, "reason": "<one short sentence>"}`;
  const res = await complete(JUDGE_MODEL, { messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 150 });
  const text = res.choices?.[0]?.message?.content ?? '';
  const m = text.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m[0]); } catch { return { pass: false, reason: `unparseable judge reply: ${text.slice(0, 80)}` }; }
}

// ── The rebuilt memory (v4), as Part 3 will wire it ───────────────────────

const v4 = system === 'v4'
  ? await import(url.pathToFileURL(path.join(here, '..', 'dist', 'memory-v4', 'index.js')).href)
  : null;
let v4mem = null;
const v4project = {};
async function v4Ready() {
  if (v4mem) return v4mem;
  v4mem = new v4.AvaMemory({ root: path.join(sandbox, 'v4') });
  for (const [ctx, real] of Object.entries(spec.contexts)) {
    v4project[ctx] = real ? (await v4mem.projects.find(real)) ?? null : null;
  }
  return v4mem;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** Days named in a message: "27 October", "October 27", "2026-10-27". Year defaults to the latest past one. */
function datesIn(text, now = new Date()) {
  const out = new Set();
  const t = text.toLowerCase();
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.add(`${m[1]}-${m[2]}-${m[3]}`);
  const mon = MONTHS.map((x) => `${x}|${x.slice(0, 3)}`).join('|');
  const add = (d, mo, y) => {
    const month = MONTHS.findIndex((x) => x.startsWith(mo.slice(0, 3))) + 1;
    let year = y ? Number(y) : now.getFullYear();
    if (!y && new Date(year, month - 1, Number(d)) > now) year--;
    out.add(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  };
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${mon})\\b(?:\\s+(\\d{4}))?`, 'g'))) add(m[1], m[2], m[3]);
  for (const m of t.matchAll(new RegExp(`\\b(${mon})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'g'))) add(m[2], m[1], m[3]);
  return [...out];
}

function episodeText(ep, projectId) {
  const sections = ep.sections.filter((s) => !projectId || !s.project || s.project === projectId || true);
  return sections.map((s) => `${s.name}:\n${s.lines.map((l) => `- ${l}`).join('\n')}`).join('\n');
}

const V4_RECALL = {
  name: 'memory_recall',
  description: 'Search your long-term memory. By default it searches facts about the person and the open project. Set "project" to search another project by name, "reach":"all" to search every project, or "date" (YYYY-MM-DD) to read what happened that day.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to look for.' },
      project: { type: 'string', description: 'Another project to search, by name (optional).' },
      reach: { type: 'string', enum: ['here', 'linked', 'all'], description: 'here (default): the person + the open project.' },
      date: { type: 'string', description: 'A day to read, YYYY-MM-DD (optional).' },
    },
    required: ['query'],
  },
};

async function v4Recall(a, ctx) {
  const mem = await v4Ready();
  const here = v4project[ctx];
  if (a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date)) {
    const ep = await mem.readDay(a.date);
    return ep.sections.length ? `${a.date}:\n${episodeText(ep)}` : `Nothing recorded for ${a.date}.`;
  }
  const also = [];
  if (a.project) {
    const all = await mem.projects.all();
    const want = String(a.project).toLowerCase().replace(/\s+/g, '');
    const hit = all.find((p) => p.name.toLowerCase().replace(/\s+/g, '') === want) ?? all.find((p) => p.name.toLowerCase().includes(String(a.project).toLowerCase()));
    if (hit) also.push(hit.id);
  }
  const hits = await mem.search(String(a.query ?? ''), { project: here?.id, alsoProjects: also, reach: a.reach, limit: 8 });
  if (!hits.length) return `No memories found for "${a.query}".`;
  const names = Object.fromEntries((await mem.projects.all()).map((p) => [p.id, p.name]));
  return hits.map((h) => {
    const where = h.fact.scope === 'everywhere' ? 'about him' : names[h.fact.scope.slice(8)] ?? 'a project';
    return `- (${where}, since ${h.fact.from}${h.fact.quote ? `, his words: "${h.fact.quote}"` : ''}) ${h.fact.text}`;
  }).join('\n');
}

async function askV4(q, mode) {
  const mem = await v4Ready();
  const proj = v4project[q.ctx];
  const real = spec.contexts[q.ctx];
  const trace = { brief: null, recalls: [] };
  const parts = [
    'You are Ava, a coding and life partner who works on the user\'s own computer. You have a persistent memory of the user and their projects; what it holds about him is below, and memory_recall searches the rest. Answer the user\'s question directly and briefly. If you do not know, say so plainly: never guess.',
    real ? `Open project: ${proj?.name ?? path.basename(real)}` : 'No project is open.',
  ];
  const core = await mem.readCore();
  if (core) parts.push(`<core-memory>\n${core}\n</core-memory>`);

  // "Where were we": the open project's most recent day and its open threads.
  if (proj) {
    const days = await mem.listDays();
    for (const d of [...days].reverse()) {
      const ep = await mem.readDay(d);
      const sec = ep.sections.find((s) => s.project === proj.id);
      if (sec) { parts.push(`Last time in ${proj.name} (${d}):\n${sec.lines.map((l) => `- ${l}`).join('\n')}`); break; }
    }
    const threads = await mem.listThreads({ project: proj.id });
    if (threads.length) parts.push(`Open threads:\n${threads.map((t) => `- ${t.text}`).join('\n')}`);
  }

  // The app's own lookup for this message (never left to the model).
  const hits = await mem.search(q.q, { project: proj?.id, limit: 6 });
  const brief = [];
  if (hits.length) brief.push('Memories relevant to this message:\n' + hits.map((h) => `- (${h.fact.scope === 'everywhere' ? 'about him' : 'this project'}, since ${h.fact.from}) ${h.fact.text}`).join('\n'));
  for (const d of datesIn(q.q)) {
    const ep = await mem.readDay(d);
    brief.push(ep.sections.length ? `What happened on ${d}:\n${episodeText(ep)}` : `Nothing is recorded for ${d}.`);
  }
  trace.brief = brief.join('\n\n') || null;

  const messages = [{ role: 'system', content: parts.join('\n\n') }];
  if (trace.brief) messages.push({ role: 'system', content: trace.brief });
  messages.push({ role: 'user', content: q.q });
  void mode; // v4 reaches every mode the same way; both modes are run to show it.

  const tools = [{ type: 'function', function: V4_RECALL }];
  for (let round = 0; round < 4; round++) {
    const res = await complete(ANSWER_MODEL, { messages, tools, temperature: 0.2, max_tokens: 700 });
    const msg = res.choices?.[0]?.message ?? {};
    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) return { answer: msg.content ?? '', trace };
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: calls });
    for (const call of calls) {
      let a = {};
      try { a = JSON.parse(call.function.arguments || '{}'); } catch { /* empty query */ }
      const out = await v4Recall(a, q.ctx);
      trace.recalls.push({ query: a.query, scope: a.project ?? a.reach ?? a.date ?? 'here', output: out.slice(0, 1500) });
      messages.push({ role: 'tool', tool_call_id: call.id, content: out.slice(0, 6000) });
    }
  }
  return { answer: '(no answer after 4 tool rounds)', trace };
}

// ── Run ────────────────────────────────────────────────────────────────────

// Register every project first so cross-project recall knows them.
if (system === 'v3') for (const ctx of Object.keys(spec.contexts)) await memoryFor(ctx);
await new Promise((r) => setTimeout(r, 300));

if (args.dry && system === 'v4') {
  for (const q of questions) {
    const mem = await v4Ready();
    const hits = await mem.search(q.q, { project: v4project[q.ctx]?.id, limit: 5 });
    console.log(`\n${q.id} [${q.ctx}] ${q.q}${datesIn(q.q).length ? `  (days: ${datesIn(q.q).join(', ')})` : ''}`);
    for (const h of hits) console.log(`   ${Math.round(h.score * 100)}% ${h.match} ${h.from}: ${h.fact.text.replace(/\s+/g, ' ').slice(0, 110)}`);
    if (!hits.length) console.log('   (no search hits)');
  }
  fs.rmSync(sandbox, { recursive: true, force: true });
  process.exit(0);
}

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
      const { answer, trace } = system === 'v4' ? await askV4(q, mode) : await ask(q, mode);
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
lines.push(`Answer model ${ANSWER_MODEL.id}${system === 'v3' ? `, curator ${CURATOR_MODEL.id}` : ''}, judge ${JUDGE_MODEL.id}. Store: copy of ${args.from}. Cost $${cost.toFixed(3)}.`, '');
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
