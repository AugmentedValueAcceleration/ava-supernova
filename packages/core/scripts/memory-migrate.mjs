#!/usr/bin/env node
/**
 * Memory migration, v3 → v4 (Part 2 of the Memory v4 plan).
 *
 * Reads a COPY of the old stores, proposes a clean memory, and writes a review
 * page. Nothing is applied until the person has reviewed it:
 *
 *   node scripts/memory-migrate.mjs propose --from=<backup of ~/.ava> --work=<private dir> --projects=<json>
 *   node scripts/memory-migrate.mjs refine  --work=<dir> --decisions=<files> --out=<file>
 *   node scripts/memory-migrate.mjs apply   --work=<dir> --decisions=<file saved from the review page> --to=<memory root>
 *
 * propose stages (each saved in <work>, so a re-run never pays twice):
 *   collect   every old memory, exact repeats folded, obvious noise flagged
 *   classify  each memory: keep / noise / guess, which project or everywhere,
 *             kind, a clean wording, and the person's own words if quoted
 *   merge     per project: near-repeats merged, changes over time resolved
 *             (newest is the fact, older versions become history)
 *   core      a draft core.md from the everywhere facts
 *   episodes  each journal day summarised, a few lines per project
 *   threads   things parked or still open, proposed as open threads
 *   review    review.html: keep / change / drop, saved as decisions.json
 *
 * Model calls go direct to Qwen with QWEN_API_KEY from packages/web/.env.local,
 * never a platform key. --dry stops after `collect` (free).
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import crypto from 'node:crypto';
import { writeReviewPage } from './memory-review-page.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(3).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const command = process.argv[2];

const ENDPOINT = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const MODEL = { id: 'qwen3.7-plus', inPerM: 0.40, outPerM: 1.60 };

// ── Helpers ────────────────────────────────────────────────────────────────

const norm = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2)); };
const day = (iso) => String(iso || '').slice(0, 10);

function qwenKey() {
  const p = path.join(here, '..', '..', 'web', '.env.local');
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*QWEN_API_KEY\s*=\s*(.*)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

let KEY = null;
const spend = { in: 0, out: 0 };

/** One model call, cached on disk by its exact input. */
async function ask(work, label, system, user, maxTokens = 8000) {
  const hash = crypto.createHash('sha256').update(MODEL.id + system + user).digest('hex').slice(0, 16);
  const cacheFile = path.join(work, 'cache', `${label}-${hash}.json`);
  if (fs.existsSync(cacheFile)) return readJson(cacheFile).text;
  if (!KEY) {
    KEY = qwenKey();
    if (!KEY || KEY.startsWith('sk-ava-')) throw new Error('No Qwen key in packages/web/.env.local (refusing a platform key).');
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL.id, enable_thinking: false, temperature: 0.1, max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (res.ok) {
      const json = await res.json();
      spend.in += json.usage?.prompt_tokens ?? 0;
      spend.out += json.usage?.completion_tokens ?? 0;
      const text = json.choices?.[0]?.message?.content ?? '';
      writeJson(cacheFile, { label, text });
      return text;
    }
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 3000 * (attempt + 1))); continue; }
    throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  throw new Error(`${label}: gave up after retries`);
}

/** Pull the first JSON value out of a model reply. */
function parseJson(text) {
  const t = text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '');
  const start = t.search(/[[{]/);
  if (start === -1) throw new Error(`no JSON in reply: ${text.slice(0, 120)}`);
  return JSON.parse(t.slice(start, Math.max(t.lastIndexOf(']'), t.lastIndexOf('}')) + 1));
}

async function inBatches(items, size, fn, concurrency = 3) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  const out = new Array(batches.length);
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < batches.length) {
      const i = next++;
      out[i] = await fn(batches[i], i, batches.length);
    }
  }));
  return out.flat();
}

// ── Stage: collect ─────────────────────────────────────────────────────────

/**
 * Lines that are plainly chat fragments or Ava narrating herself. Flagged, not
 * dropped: they appear on the review page under "probably noise", unticked.
 */
const NOISE = [
  /^the assistant\b/i,
  /^(discovery|decision|correction):\s/i,
  /^(recorded and|pushed —|yes —)/i,
];

function collect(from, projects) {
  const stores = [
    { origin: 'global', file: path.join(from, 'memory', 'graph.json') },
    { origin: 'global', file: path.join(from, 'memory.json') },
  ];
  for (const p of projects) {
    for (const dir of p.backupDirs ?? []) {
      for (const f of ['memory.json', path.join('memory', 'graph.json')]) {
        stores.push({ origin: p.name, file: path.join(from, 'projects', dir, '.ava', f) });
      }
    }
  }
  const byKey = new Map();
  for (const { origin, file } of stores) {
    if (!fs.existsSync(file)) continue;
    const data = readJson(file);
    for (const e of data.entries ?? data.nodes ?? []) {
      const content = String(e.content ?? '').trim();
      const key = norm(content);
      if (!key) continue;
      const created = day(e.createdAt ?? e.timestamp);
      const hit = byKey.get(key);
      if (hit) {
        hit.origins.add(origin);
        if (created && (!hit.from || created < hit.from)) hit.from = created;
        hit.copies++;
        continue;
      }
      byKey.set(key, { content, origins: new Set([origin]), from: created, category: e.category ?? 'general', copies: 1 });
    }
  }
  const items = [...byKey.values()].map((v, i) => ({
    id: `m${String(i + 1).padStart(4, '0')}`,
    content: v.content,
    origins: [...v.origins],
    from: v.from,
    category: v.category,
    copies: v.copies,
    flaggedNoise: NOISE.some((r) => r.test(v.content)) || v.content.length < 20,
  }));
  return items;
}

// ── Stage: classify ────────────────────────────────────────────────────────

const CLASSIFY_SYSTEM = (projects) => `You are cleaning up the long-term memory of Ava, an AI partner, about one person (Stewart) and his projects. He lives with memory loss, so this memory must be accurate: never add anything that is not in the original.

For EACH memory below decide:
- verdict: "keep" (a durable, useful fact: about him, how to work with him, his life, or a project's decisions, architecture, conventions, gotchas, current state), "noise" (chat fragments, Ava describing her own replies or moods, one-off debugging chatter, things that only made sense in that moment), or "guess" (speculation presented as fact, e.g. a name inferred from a folder path).
- scope: "everywhere" for anything about him, how he works, his health, his life, his values; otherwise the project it belongs to, one of: ${projects.map((p) => JSON.stringify(p.name)).join(', ')}; or "other: <name>" for a project not in that list. Judge by the content, not by where it was stored: a fact about him stored inside a project is "everywhere"; a fact about one game stored in the main memory belongs to that game.
- kind: "person" (who he is, life, health, background), "preference" (what he likes or how he wants things), "rule" (how Ava must work with him), "project" (a project fact), "event" (something that happened on a date).
- text: the fact in one or two plain sentences, keeping every specific (names, numbers, versions, paths, commands, colours). Write about him as "Stewart" or "he"; for projects, state the fact directly. Long notes: keep their key points as one compact paragraph; do not drop specifics that would cost time to rediscover.
- source: "said" if the memory says he stated/asked/said/told it or quotes him; otherwise "inferred".
- quote: his exact words if the memory contains them in quotes, else "".

Reply with a JSON array only, one object per memory, in the same order:
[{"id":"m0001","verdict":"keep","scope":"everywhere","kind":"preference","text":"…","source":"said","quote":"…"}]`;

async function classify(work, items, projects) {
  const system = CLASSIFY_SYSTEM(projects);
  return inBatches(items, 25, async (batch, i, n) => {
    const user = batch.map((m) => `[${m.id}] (stored in: ${m.origins.join(', ')}; ${m.from || 'undated'})\n${m.content.slice(0, 4000)}`).join('\n\n');
    process.stdout.write(`  classify ${i + 1}/${n}\r`);
    const reply = await ask(work, `classify-${i}`, system, user, 12000);
    const parsed = parseJson(reply);
    const byId = new Map(parsed.map((r) => [r.id, r]));
    return batch.map((m) => ({ ...m, ...(byId.get(m.id) ?? { verdict: 'keep', scope: 'everywhere', kind: 'project', text: m.content, source: 'inferred', quote: '', unclassified: true }) }));
  });
}

// ── Stage: merge ───────────────────────────────────────────────────────────

const MERGE_SYSTEM = (scope) => `These are cleaned memory facts for ${scope === 'everywhere' ? 'Stewart himself (true in every project)' : `the project "${scope}"`}. Many say the same thing in different words, and some were true once and later changed.

Produce the final list of facts:
- Merge facts that say the same thing into ONE, keeping every specific from all of them. List every merged id in "members".
- If facts CONFLICT and one is newer (compare dates), the newest is the current fact; put each older version in "replaced" with the date it stopped being true ("until" = the newer fact's date).
- Facts that merely add detail are merged, not "replaced".
- Never invent anything. Never drop a specific (number, name, version, path, command).
- Keep each fact focused on one thing; split a member that covers two unrelated things.
- "from" = the earliest date among the members of the current version.

Reply with a JSON array only:
[{"text":"…","kind":"…","source":"said|inferred","quote":"…","from":"YYYY-MM-DD","members":["m0001","m0042"],"replaced":[{"text":"…","from":"YYYY-MM-DD","until":"YYYY-MM-DD","members":["m0007"]}]}]`;

async function merge(work, classified) {
  const kept = classified.filter((m) => m.verdict === 'keep');
  const scopes = [...new Set(kept.map((m) => m.scope))];
  const out = [];
  for (const scope of scopes) {
    const items = kept.filter((m) => m.scope === scope).sort((a, b) => (a.from || '').localeCompare(b.from || ''));
    // Chunk large scopes by kind so each call stays well inside the model's output limit.
    const groups = items.length > 120 ? [...new Set(items.map((m) => m.kind))].map((k) => items.filter((m) => m.kind === k)) : [items];
    for (const [gi, group] of groups.entries()) {
      const chunks = [];
      for (let i = 0; i < group.length; i += 120) chunks.push(group.slice(i, i + 120));
      for (const [ci, chunk] of chunks.entries()) {
        process.stdout.write(`  merge ${scope} ${gi + 1}.${ci + 1}            \r`);
        const user = chunk.map((m) => `[${m.id}] (${m.from || 'undated'}, ${m.kind}, ${m.source}${m.quote ? `, quote: "${m.quote}"` : ''}) ${m.text}`).join('\n');
        const reply = await ask(work, `merge-${norm(scope).replace(/ /g, '-')}-${gi}-${ci}`, MERGE_SYSTEM(scope), user, 16000);
        for (const f of parseJson(reply)) out.push({ ...f, scope });
      }
    }
  }
  return out;
}

// ── Stage: tidy + second merge ─────────────────────────────────────────────

const KINDS = ['person', 'preference', 'rule', 'project', 'event'];

/**
 * Project names the model invented for projects we know. Anything about Ava
 * itself is the Ava Supernova project; health and general game-dev habits are
 * about him, so everywhere.
 */
const SCOPE_ALIASES = [
  [/^other:\s*(ava\b|\.ava$|ava companion)/i, 'Ava Supernova'],
  [/^other:\s*(health|ue5\/game dev)/i, 'everywhere'],
];

function tidy(facts) {
  return facts.map((f) => {
    let scope = f.scope;
    for (const [re, to] of SCOPE_ALIASES) if (re.test(scope)) scope = to;
    const kind = KINDS.includes(f.kind) ? f.kind : (scope === 'everywhere' ? 'preference' : 'project');
    return { ...f, scope, kind };
  });
}

/**
 * The first merge only saw facts in chunks, so repeats in different chunks
 * survived. Here similar facts are grouped first, on this machine, with the
 * v4 keyword search (each fact searched against its own scope); then only
 * each group is sent to the model to merge. Singletons pass through.
 */
async function clusterMerge(work, facts) {
  const { SearchIndex } = await import(url.pathToFileURL(path.join(here, '..', 'dist', 'memory-v4', 'search-index.js')).href);
  const out = [];
  const scopes = [...new Set(facts.map((f) => f.scope))];
  const groups = [];
  for (const scope of scopes) {
    const items = facts.filter((f) => f.scope === scope);
    const index = new SearchIndex();
    items.forEach((f, i) => index.add(String(i), f.text));
    const parent = items.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    items.forEach((f, i) => {
      for (const hit of index.search(f.text, 12)) {
        const j = Number(hit.id);
        if (j !== i && hit.score >= 0.33 && hit.coverage >= 0.3) parent[find(i)] = find(j);
      }
    });
    const byRoot = new Map();
    items.forEach((f, i) => { const r = find(i); if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r).push(f); });
    for (const g of byRoot.values()) {
      if (g.length === 1) out.push(g[0]);
      else groups.push({ scope, facts: g });
    }
  }
  console.log(`  ${groups.length} groups of similar facts (${groups.reduce((s, g) => s + g.facts.length, 0)} facts) to merge`);

  const SYSTEM = `Each GROUP below holds memory facts that may say the same thing. For each group, return the final facts:
- Facts that say the same thing become ONE fact keeping every specific from all of them (numbers, names, versions, paths, commands). Its "members" lists every merged id.
- If facts conflict and one is newer (compare "from" dates), the newest is the fact; older versions go in "replaced" with "until" = the newer fact's date.
- Facts in a group that are genuinely about different things stay separate.
- Never invent anything. Keep "kind", "source" and "quote" from the members (prefer "said" and a quote if any member has one). "from" = earliest member date of the current version.
Reply with JSON only: {"groups":[{"group":1,"facts":[{"text":"…","kind":"…","source":"said|inferred","quote":"…","from":"YYYY-MM-DD","members":["m0001"],"replaced":[{"text":"…","from":"…","until":"…","members":["…"]}]}]}]}`;

  const batches = [];
  let cur = [];
  let size = 0;
  for (const g of groups) {
    const len = g.facts.reduce((s, f) => s + f.text.length, 0);
    if (cur.length && size + len > 12000) { batches.push(cur); cur = []; size = 0; }
    cur.push(g); size += len;
  }
  if (cur.length) batches.push(cur);

  for (const [bi, batch] of batches.entries()) {
    process.stdout.write(`  merge-2 ${bi + 1}/${batches.length}     \r`);
    const user = batch.map((g, gi) => `GROUP ${gi + 1} (${g.scope}):\n` + g.facts.map((f) => {
      const members = (f.members ?? []).join(',');
      const prev = (f.replaced ?? []).map((r) => ` [earlier: "${r.text}" ${r.from}→${r.until}]`).join('');
      return `- (${f.from || 'undated'}, ${f.kind}, ${f.source}${f.quote ? `, quote: "${f.quote}"` : ''}, members: ${members}) ${f.text}${prev}`;
    }).join('\n')).join('\n\n');
    const parsed = parseJson(await ask(work, `merge2-${bi}`, SYSTEM, user, 16000));
    const answered = new Set();
    for (const g of parsed.groups ?? []) {
      const src = batch[g.group - 1];
      if (!src) continue;
      answered.add(g.group - 1);
      // Earlier versions the first merge found are kept, even if this pass didn't repeat them.
      const carried = src.facts.flatMap((f) => f.replaced ?? []);
      const merged = (g.facts ?? []).map((f) => ({ ...f, scope: src.scope }));
      if (merged.length && carried.length) {
        const have = new Set(merged.flatMap((f) => (f.replaced ?? []).map((r) => norm(r.text))));
        merged[0].replaced = [...(merged[0].replaced ?? []), ...carried.filter((r) => !have.has(norm(r.text)))];
      }
      out.push(...merged);
    }
    // A group the model skipped keeps its facts unmerged rather than losing them.
    batch.forEach((g, gi) => { if (!answered.has(gi)) out.push(...g.facts); });
  }
  return tidy(out);
}

// ── Coverage: nothing kept is lost ─────────────────────────────────────────

/**
 * Every memory the classifier kept must end up in some fact (as a member of
 * it, or of one of its earlier versions). A merge that drops one — it
 * happened: "Attunement instead of XP" vanished in the first run — gets it
 * back here as a fact of its own, for the person to keep or drop.
 */
function recoverLost(classified, facts) {
  const covered = new Set();
  for (const f of facts) {
    for (const id of f.members ?? []) covered.add(id);
    for (const r of f.replaced ?? []) for (const id of r.members ?? []) covered.add(id);
  }
  return classified
    .filter((m) => m.verdict === 'keep' && !covered.has(m.id))
    .map((m) => ({ text: m.text, kind: m.kind, scope: m.scope, source: m.source, quote: m.quote ?? '', from: m.from, members: [m.id], replaced: [], recovered: true }));
}

// ── Stage: core ────────────────────────────────────────────────────────────

const CORE_SYSTEM = `Write core.md: the short page an AI partner (Ava) reads before EVERY conversation with Stewart. STRICT: every line must come from the facts given. Never add an age, employer, surname, date, number or name that is not written in the facts. DawnSets, Project Dawn and Sacred Crossing are three DIFFERENT projects; never merge their names.

Three sections, plain Markdown, HARD LIMIT 500 words in total (it must fit a 1,500-token budget; count before answering):
## Who he is — background, health context that shapes how to talk with him, life facts that matter often.
## How to work with him — the rules and preferences that change how Ava behaves, most important first.
## Right now — what he is working on lately (from the most recent facts), in a few lines.

Short bullet points. Write about him as "he" (first name Stewart only). Keep only what changes how Ava behaves or what she must not forget; leave out tool trivia (installer options, which browser). No preamble, no closing line.`;

async function draftCore(work, facts) {
  const everywhere = facts.filter((f) => f.scope === 'everywhere');
  const recentProject = facts.filter((f) => f.scope !== 'everywhere').sort((a, b) => (b.from || '').localeCompare(a.from || '')).slice(0, 25);
  const user = ['Facts about him (everywhere):', ...everywhere.map((f) => `- (${f.kind}, ${f.from}) ${f.text}`),
    '', 'Most recent project facts (for "Right now"):', ...recentProject.map((f) => `- (${f.scope}, ${f.from}) ${f.text}`)].join('\n');
  return (await ask(work, 'core', CORE_SYSTEM, user, 3000)).trim();
}

// ── Stage: episodes ────────────────────────────────────────────────────────

const EPISODE_SYSTEM = (projects) => `Below are Ava's own journal notes from ONE day of working with Stewart (many notes repeat each other; "He asked:" lines are the start of what he asked for, cut off mid-sentence). Summarise what actually happened that day, grouped by project.

Rules: only what the notes say; concrete (what was built, fixed, decided, committed, with names and commit hashes when given); at most 6 short lines per project; no feelings or self-commentary. Projects: ${projects.map((p) => JSON.stringify(p.name)).join(', ')}, or "Everywhere" for things not about one project (health plans, his life, Ava itself when not coding it).

Reply with JSON only: {"sections":[{"project":"DawnSets","lines":["…"]}]}`;

/**
 * Journal notes for one day, in either journal format:
 *   v1 (Mar–Apr 2026): one avaEntry text of "---"-separated session lines,
 *      "Worked with Stewart for 23 minutes on: <what he asked>. Used 5 tools…"
 *   v2: entries[] of Ava's observations.
 * Session-stat lines ("Had a 184-minute session…") are dropped: their timer is
 * broken and they say nothing about what happened. "Worked … on: X" keeps X,
 * which is what he asked for, unless X is a pasted mode prompt.
 */
function journalNotes(data) {
  const raw = [];
  if (Array.isArray(data.entries)) for (const e of data.entries) raw.push(String(e.content ?? ''));
  if (data.avaEntry?.content) raw.push(...String(data.avaEntry.content).split(/\n-{3,}\n/));
  if (data.userEntry?.content) raw.push(`Stewart wrote: ${data.userEntry.content}`);
  const out = [];
  for (let c of raw) {
    c = c.replace(/\s+/g, ' ').trim();
    if (!c || /^had a \d+-minute session/i.test(c)) continue;
    const worked = c.match(/^worked with stewart for \d+ minutes? on:\s*(.*?)(?:\.\s*used \d+ tools?.*)?$/i);
    if (worked) {
      const topic = worked[1].trim();
      if (!topic || topic.startsWith('[')) continue;
      c = `He asked: ${topic}`;
    }
    out.push(c);
  }
  return out;
}

function journalDays(from) {
  const dir = path.join(from, 'journal');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map((f) => {
    const seen = new Set();
    const notes = [];
    for (const c of journalNotes(readJson(path.join(dir, f)))) {
      const k = norm(c).slice(0, 120);
      if (seen.has(k)) continue;
      seen.add(k);
      notes.push(c.slice(0, 700));
    }
    return { date: f.slice(0, 10), notes };
  }).filter((d) => d.notes.length > 0);
}

async function episodes(work, from, projects) {
  const days = journalDays(from);
  return inBatches(days, 1, async ([d], i, n) => {
    process.stdout.write(`  episodes ${i + 1}/${n}       \r`);
    const user = `Date: ${d.date}\n\n` + d.notes.slice(0, 120).map((n) => `- ${n}`).join('\n');
    const parsed = parseJson(await ask(work, `episode-${d.date}`, EPISODE_SYSTEM(projects), user, 2000));
    return [{ date: d.date, sections: parsed.sections ?? [] }];
  }, 4);
}

// ── Stage: threads ─────────────────────────────────────────────────────────

const THREADS_SYSTEM = `From these memory facts and recent days, list things that are still OPEN: work explicitly parked or deferred to later, next steps that were agreed, blockers, promises to come back to something. Only things the text shows as open; skip anything shown as done. Each one short and concrete.

Reply with JSON only: [{"text":"…","project":"<project name or empty>","evidence":"<the fact or day it comes from>"}]`;

async function threads(work, facts, eps) {
  const openish = facts.filter((f) => /defer|parked|later|next|todo|blocker|not yet|planned|pending|until further/i.test(f.text));
  const recent = eps.slice(-10);
  const user = ['Facts:', ...openish.map((f) => `- (${f.scope}, ${f.from}) ${f.text}`), '', 'Recent days:',
    ...recent.flatMap((e) => e.sections.map((s) => `- ${e.date} ${s.project}: ${s.lines.join(' / ')}`))].join('\n');
  return parseJson(await ask(work, 'threads', THREADS_SYSTEM, user, 3000));
}

// ── propose ────────────────────────────────────────────────────────────────

async function propose() {
  const work = args.work;
  const from = args.from;
  if (!work || !from || !args.projects) throw new Error('propose needs --from, --work and --projects');
  const projects = readJson(args.projects);
  fs.mkdirSync(work, { recursive: true });

  const items = collect(from, projects);
  writeJson(path.join(work, '1-collected.json'), items);
  const flagged = items.filter((m) => m.flaggedNoise).length;
  console.log(`collect: ${items.length} unique memories (${flagged} flagged as probable noise)`);
  const days = journalDays(from);
  const chars = items.reduce((s, m) => s + Math.min(m.content.length, 4000), 0);
  const journalChars = days.reduce((s, d) => s + d.notes.slice(0, 120).join(' ').length, 0);
  const estIn = (chars * 2.2 + journalChars) / 4 + 40 * 1500;
  const estOut = items.length * 90 + days.length * 250;
  console.log(`journal: ${days.length} days. Estimated cost: ~$${(estIn / 1e6 * MODEL.inPerM + estOut / 1e6 * MODEL.outPerM).toFixed(2)} on ${MODEL.id}`);
  if (args.dry) return;

  const classified = await classify(work, items, projects);
  writeJson(path.join(work, '2-classified.json'), classified);
  const tally = (k) => classified.filter((m) => m.verdict === k).length;
  console.log(`classify: keep ${tally('keep')}, noise ${tally('noise')}, guess ${tally('guess')}            `);

  const firstPass = tidy(await merge(work, classified));
  writeJson(path.join(work, '3a-facts-first-merge.json'), firstPass);
  const merged = await clusterMerge(work, firstPass);
  const lost = recoverLost(classified, merged);
  if (lost.length) console.log(`  ${lost.length} kept memories were dropped by the merge; added back as their own facts`);
  const facts = tidy([...merged, ...lost]);
  if (recoverLost(classified, facts).length) throw new Error('coverage check failed: a kept memory is still missing');
  writeJson(path.join(work, '3-facts.json'), facts);
  console.log(`merge: ${facts.length} facts, ${facts.reduce((s, f) => s + (f.replaced?.length ?? 0), 0)} older versions kept as history            `);

  const core = await draftCore(work, facts);
  fs.writeFileSync(path.join(work, '4-core.md'), core);
  // Every number and capitalised name in core must appear somewhere in the facts.
  const corpus = facts.map((f) => `${f.text} ${f.quote ?? ''}`).join(' ').toLowerCase();
  const unsupported = [...new Set(core.match(/\b(?:\d[\d.,:%–-]*\d|\d|[A-Z][a-zA-Z]{2,})\b/g) ?? [])]
    .filter((w) => !corpus.includes(w.toLowerCase()) && !['Who', 'How', 'Right', 'Stewart', 'Ava', 'He', 'His'].includes(w));
  if (unsupported.length) console.log(`core: CHECK — not found in any fact: ${unsupported.join(', ')}`);
  console.log(`core: ~${Math.ceil(core.length / 4)} tokens (budget 1500)`);

  const eps = await episodes(work, from, projects);
  writeJson(path.join(work, '5-episodes.json'), eps);
  console.log(`episodes: ${eps.length} days                    `);

  const ths = await threads(work, facts, eps);
  writeJson(path.join(work, '6-threads.json'), ths);
  console.log(`threads: ${ths.length} proposed`);

  const noise = classified.filter((m) => m.verdict !== 'keep');
  writeJson(path.join(work, 'proposal.json'), { core, facts, noise, episodes: eps, threads: ths, projects: projects.map((p) => p.name), source: classified.map(({ id, content, origins, from: f }) => ({ id, content, origins, from: f })) });
  console.log(`review page: ${writeReviewPage(work)}`);
  console.log(`\nSpent $${(spend.in / 1e6 * MODEL.inPerM + spend.out / 1e6 * MODEL.outPerM).toFixed(3)} (${spend.in} in, ${spend.out} out; cached calls cost nothing).`);
}

// ── apply ──────────────────────────────────────────────────────────────────

async function apply() {
  const { work, decisions: decisionsFile, to } = args;
  if (!work || !decisionsFile || !to) throw new Error('apply needs --work, --decisions and --to');
  const { AvaMemory } = await import(url.pathToFileURL(path.join(here, '..', 'dist', 'memory-v4', 'index.js')).href);
  // Several decision files (the main review plus any recovered page) apply as one.
  const decisions = { facts: [], episodes: [], threads: [], core: '' };
  for (const file of String(decisionsFile).split(',')) {
    const d = readJson(file.trim());
    decisions.facts.push(...(d.facts ?? []));
    decisions.episodes.push(...(d.episodes ?? []));
    decisions.threads.push(...(d.threads ?? []));
    if (d.core) decisions.core = d.core;
  }
  const projects = readJson(path.join(work, 'projects.json'));
  const mem = new AvaMemory({ root: to });

  // Projects: register every path each project has lived at.
  const idByName = {};
  for (const p of projects) {
    const rec = await mem.projectFor(p.paths[0], p.name);
    for (const extra of p.paths.slice(1)) await mem.projects.addPath(rec.id, extra);
    idByName[p.name] = rec.id;
  }
  // A project not in the list ("other: Foo") gets its own record by name, so its
  // facts stay with it instead of leaking into everywhere.
  for (const f of decisions.facts) {
    if (f.scope === 'everywhere' || idByName[f.scope]) continue;
    const name = String(f.scope).replace(/^other:\s*/i, '').trim() || 'Unnamed project';
    idByName[f.scope] = (await mem.projectNamed(name)).id;
  }
  const scopeFor = (s) => (s === 'everywhere' ? 'everywhere' : `project:${idByName[s]}`);

  const today = new Date().toISOString().slice(0, 10);
  let facts = 0, history = 0;
  for (const f of decisions.facts) {
    // Oldest version first, so each replacement chains onto the one before.
    const versions = [...(f.replaced ?? [])].sort((a, b) => (a.from || '').localeCompare(b.from || ''));
    let prev = null;
    for (const v of versions) {
      const added = prev
        ? (await mem.replaceFact(prev, { text: v.text, kind: f.kind, scope: scopeFor(f.scope), source: f.source === 'said' ? 'said' : 'inferred', confirmed: today, from: v.from || f.from }))?.fact
        : (await mem.addFact({ text: v.text, kind: f.kind, scope: scopeFor(f.scope), source: f.source === 'said' ? 'said' : 'inferred', confirmed: today, from: v.from || f.from })).fact;
      prev = added?.id ?? prev;
    }
    // His review is his confirmation: approved facts are facts, never pending.
    const input = { text: f.text, kind: f.kind, scope: scopeFor(f.scope), source: f.source === 'said' ? 'said' : 'inferred', confirmed: today, quote: f.quote || undefined, from: f.from || today };
    if (prev) { await mem.replaceFact(prev, input); history += versions.length; } else await mem.addFact(input);
    facts++;
  }
  if (decisions.core) {
    const res = await mem.writeCore(decisions.core);
    if (!res.ok) throw new Error(`core is ${res.tokens} tokens, over the ${res.budget} budget — shorten it on the review page`);
  }
  for (const e of decisions.episodes ?? []) {
    for (const s of e.sections) {
      const pid = idByName[s.project];
      await mem.addToDay(e.date, pid ? { project: pid, name: s.project } : { name: 'Everywhere' }, s.lines);
    }
  }
  for (const t of decisions.threads ?? []) await mem.addThread({ text: t.text, project: idByName[t.project] || undefined });
  console.log(`applied: ${facts} facts (+${history} history), core, ${decisions.episodes?.length ?? 0} days, ${decisions.threads?.length ?? 0} threads → ${to}`);
}

// ── refine: structure only, after the review ───────────────────────────────

/**
 * Two fixes to approved decisions that change structure, never meaning:
 *
 *  Split. The merge sometimes welded a dozen facts into one (the DawnSets stat
 *  sheet, panels and widgets became one 3,000-character fact), and search
 *  can't find one detail buried in a blob. Long facts are split into focused
 *  ones. Every identifier and number in the original must survive in the
 *  pieces, or the original is kept as it was.
 *
 *  Quotes. A quote is shown to Ava as "their words", so it must be: short,
 *  the person's own words, and actually saying that fact. The classifier
 *  sometimes copied the memory's own text, or an unrelated remark, into it.
 */
const SPLIT_OVER = 600;

/** Tokens that must survive a split: identifiers, numbers, names. */
function specifics(text) {
  // Identifiers with a digit or underscore, CamelCase names (two capitals),
  // and numbers of two or more characters. Not list markers ("1)"), not
  // ordinary capitalised words, and not trailing punctuation ("5.8,").
  const tokens = text.match(/[A-Za-z_][A-Za-z0-9_]*[\d_][A-Za-z0-9_]*|\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\b|\b\d[\d.,:%×/-]*\d%?|\b\d{2,}\b/g) ?? [];
  return [...new Set(tokens.map((t) => t.replace(/[.,:]+$/, '').toLowerCase()).filter((t) => t.length > 1))];
}

const SPLIT_SYSTEM = `Each numbered FACT below is too long: several facts were joined into one. Split each into focused facts, one subject each.
Rules: keep every detail (names, numbers, identifiers, file names, commands); each fact must stand alone (repeat the subject where needed); do not reword beyond that; drop sentences that exactly repeat another; never add anything.
Reply with JSON only: {"facts":[{"n":1,"parts":["…","…"]}]}`;

const QUOTE_SYSTEM = `Each item has a memory FACT and a QUOTE said to be the person's own words. Keep the quote only if it is plainly the person speaking (first person, informal) AND it says or directly supports that fact. Drop it if it is a description written by someone else, a copy of the fact, or a remark about something else.
Reply with JSON only: {"verdicts":[{"n":1,"keep":true}]}`;

async function refine() {
  const { work, decisions: files, out } = args;
  if (!work || !files || !out) throw new Error('refine needs --work, --decisions and --out');
  const facts = [];
  for (const file of String(files).split(',')) facts.push(...(readJson(file.trim()).facts ?? []));
  const base = readJson(String(files).split(',')[0].trim());

  // Quotes: length and copy checks for free, then the model for the rest.
  let quotesDropped = 0;
  const toCheck = [];
  for (const f of facts) {
    if (!f.quote) continue;
    const q = String(f.quote).trim();
    const copy = norm(f.text).includes(norm(q)) && norm(q).length > 40;
    if (f.source !== 'said' || q.length > 200 || copy) { f.quote = ''; quotesDropped++; } else toCheck.push(f);
  }
  for (let i = 0; i < toCheck.length; i += 30) {
    const batch = toCheck.slice(i, i + 30);
    const user = batch.map((f, j) => `${j + 1}. FACT: ${f.text.slice(0, 400)}\n   QUOTE: "${f.quote}"`).join('\n');
    const reply = parseJson(await ask(work, `quotes-${i}`, QUOTE_SYSTEM, user, 3000));
    for (const v of reply.verdicts ?? []) {
      const f = batch[v.n - 1];
      if (f && v.keep === false) { f.quote = ''; quotesDropped++; }
    }
  }

  // Splits.
  const long = facts.filter((f) => f.text.length > SPLIT_OVER);
  const result = [];
  let split = 0, keptWhole = 0;
  const replacement = new Map();
  for (let i = 0; i < long.length; i += 5) {
    const batch = long.slice(i, i + 5);
    const user = batch.map((f, j) => `FACT ${j + 1}:\n${f.text}`).join('\n\n');
    const reply = parseJson(await ask(work, `split-${i}`, SPLIT_SYSTEM, user, 12000));
    for (const r of reply.facts ?? []) {
      const f = batch[r.n - 1];
      const parts = (r.parts ?? []).map((x) => String(x).trim()).filter(Boolean);
      if (!f || parts.length < 2) continue;
      const joined = parts.join(' ').toLowerCase();
      const missing = specifics(f.text).filter((t) => !joined.includes(t));
      if (missing.length) { keptWhole++; console.log(`  kept whole (would lose ${missing.slice(0, 4).join(', ')}): ${f.text.slice(0, 60)}…`); continue; }
      replacement.set(f, parts);
      split++;
    }
  }
  for (const f of facts) {
    const parts = replacement.get(f);
    if (!parts) { result.push(f); continue; }
    // The first piece carries the history and the quote; the rest are plain facts.
    parts.forEach((text, k) => result.push(k === 0 ? { ...f, text } : { ...f, text, quote: '', replaced: [] }));
  }
  writeJson(out, { ...base, facts: result, refinedAt: new Date().toISOString() });
  console.log(`refine: ${quotesDropped} quotes dropped (${facts.filter((f) => f.quote).length} kept); ${split} long facts split, ${keptWhole} kept whole; ${facts.length} → ${result.length} facts → ${out}`);
  console.log(`Spent $${(spend.in / 1e6 * MODEL.inPerM + spend.out / 1e6 * MODEL.outPerM).toFixed(3)}.`);
}

// ── recover: a separate page for memories an earlier run dropped ───────────

/**
 * For a review already in progress: rebuilding review.html would orphan the
 * choices saved in the person's browser, so dropped memories get their own
 * small page (review-recovered.html, its own saved state). Apply both files.
 */
async function recoverPage() {
  const work = args.work;
  const classified = readJson(path.join(work, '2-classified.json'));
  const facts = readJson(path.join(work, '3-facts.json'));
  const lost = tidy(recoverLost(classified, facts));
  const proposal = readJson(path.join(work, 'proposal.json'));
  const page = { core: '', facts: lost, noise: [], episodes: [], threads: [], projects: proposal.projects, source: proposal.source };
  writeJson(path.join(work, 'proposal-recovered.json'), page);
  console.log(`${lost.length} recovered → ${writeReviewPage(work, 'recovered')}`);
}

// ── main ───────────────────────────────────────────────────────────────────

try {
  if (command === 'propose') await propose();
  else if (command === 'apply') await apply();
  else if (command === 'review') console.log(writeReviewPage(args.work));
  else if (command === 'recover') await recoverPage();
  else if (command === 'refine') await refine();
  else {
    console.error('Usage: memory-migrate.mjs propose|apply …  (see the header of this file)');
    process.exit(1);
  }
} catch (err) {
  console.error(`\n${err.message}`);
  process.exit(1);
}
