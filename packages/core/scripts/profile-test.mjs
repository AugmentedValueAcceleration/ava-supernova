#!/usr/bin/env node
/**
 * Profile test — does Ava look at what she knows about the person when it is
 * relevant, and leave it alone when it isn't?
 *
 * Part 0 of Decisions/plans/2026-11-27-profile-index.md. Asks each case the way
 * the extension would: Ava's real system prompt, the mode's prefix, the mode's
 * real tool list, and a memory session for a FICTIONAL person (Sam). Never
 * real data: the memory root is a scratch folder written fresh each run.
 *
 *   node scripts/profile-test.mjs --condition=before --fleets=supernova,maestro,aurora
 *   node scripts/profile-test.mjs --condition=after  --models=qwen:qwen3.8-flash,kimi:kimi-k3
 *
 *   --condition  before (today: no index, no lookup tool) | after (index + profile_lookup, Part 1)
 *   --fleets     fleet ids; each case goes to that fleet's seat for its mode
 *   --models     provider:model ids, every case on that one model
 *   --repeat     runs per case (default 3)
 *   --only       comma list of case ids
 *   --budget     hard stop in USD for the whole run (default 5)
 *   --dry        no model calls; print the prompt size per mode
 *
 * Keys come from Ava's own shared keychain (the same entries the extension and
 * the IDE read), and are never printed. Calls go through Ava's real providers,
 * so they are recorded in the Usage timeline like any other paid call. They are
 * real spend.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const dist = (p) => url.pathToFileURL(path.join(here, '..', 'dist', p)).href;
const core = await import(dist('index.js'));
const agentMod = await import(dist('agent/agent.js'));
const sp = await import(dist('agent/system-prompt.js'));
const { usdRateFor } = await import(dist('audit/cost.js'));

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
}));
const CONDITION = args.condition || 'before';
const REPEAT = Math.max(1, Number(args.repeat || 3));
const BUDGET = Number(args.budget || 5);
const DRY = args.dry === 'true';
const spec = JSON.parse(fs.readFileSync(path.join(repo, 'Decisions', 'profile-test', 'cases.json'), 'utf8'));
const only = args.only ? new Set(args.only.split(',')) : null;
const cases = spec.cases.filter((c) => !only || only.has(c.id));

// ── Who answers ───────────────────────────────────────────────────────────
// A fleet's seat for each mode (supernova-router / model-router / aurora-router,
// checked 27 Nov 2026). Simplification, stated: the real fleet goes through its
// coordinator; here the turn goes straight to the seat that would do the work.
const FLEET_SEATS = {
  supernova: { chat: 'deepseek:deepseek-flash', write: 'deepseek:deepseek-flash', code: 'deepseek:deepseek-flash', plan: 'deepseek:deepseek-flash' },
  maestro:   { chat: 'qwen:qwen3.8-flash', write: 'qwen:qwen3.8-flash', code: 'qwen:qwen3.7-plus', plan: 'qwen:qwen4-max' },
  aurora:    { chat: 'mistral:mistral-small-4', write: 'mistral:mistral-small-4', code: 'mistral:mistral-large-4', plan: 'mistral:mistral-large-4' },
};
const targets = [];
for (const f of (args.fleets ? args.fleets.split(',') : [])) {
  if (!FLEET_SEATS[f]) throw new Error(`Unknown fleet ${f}`);
  targets.push({ label: f, seatFor: (mode) => FLEET_SEATS[f][mode] });
}
for (const m of (args.models ? args.models.split(',') : [])) targets.push({ label: m, seatFor: () => m });
if (!targets.length) { console.error('Give --fleets or --models.'); process.exit(1); }

// ── Keys: Ava's shared keychain, never printed ─────────────────────────────
const KEY_FIELD = { deepseek: 'DeepSeek', qwen: 'Qwen', kimi: 'Moonshot', mistral: 'Mistral', minimax: 'MiniMax', zhipu: 'Zhipu', xiaomi: 'Xiaomi', tencent: 'Tencent', nvidia: 'NVIDIA' };
const requireExt = createRequire(path.join(repo, 'packages', 'extension', 'package.json'));
const { Entry } = requireExt('@napi-rs/keyring');
const registry = new core.ProviderRegistry();
function providerFor(qualified) {
  const [p] = qualified.split(':');
  if (!registry.get(p)) {
    const key = new Entry('com.augmentedvalueacceleration.ava', `byok.${KEY_FIELD[p]}`).getPassword();
    if (!key) throw new Error(`No ${KEY_FIELD[p]} key saved in Ava.`);
    registry.register(p, { apiKey: key.trim() });
  }
  const r = registry.resolveModel(qualified);
  if (!r) throw new Error(`Model not found: ${qualified}`);
  return r;
}

// ── The fictional person, in Ava's real file formats, in a scratch folder ──
// scripts/profile-fixture.mjs: the same "Sam" the unit tests read. Both
// conditions get the same memory (core, the projects' days); only "after"
// gets the profile index and profile_lookup.
const { writeProfileFixture } = await import(url.pathToFileURL(path.join(here, 'profile-fixture.mjs')).href);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ava-profile-test-'));
const home = path.join(scratch, 'home');
const memRoot = path.join(scratch, 'memory');
const today = core.todayLocal ? core.todayLocal() : new Date().toISOString().slice(0, 10);
await writeProfileFixture({ home, memoryRoot: memRoot, today, AvaMemory: core.AvaMemory });
// Neutral name: a folder called after one of the person's projects leaks it into every answer.
const projectDir = path.join(scratch, 'workspace');
fs.mkdirSync(projectDir, { recursive: true });
const after = CONDITION === 'after';
const session = await core.MemorySession.open({ root: memRoot, projectPath: projectDir, profileHome: after ? home : null });
const coreMemory = (await session.sessionBlock()) || undefined;
const lookupTool = new core.ProfileLookupTool({ home, memoryRoot: memRoot });

// ── Prompt per mode, as the extension builds it ────────────────────────────
const tools = new core.ToolRegistry();
tools.registerBuiltins({ exclude: [...core.DESKTOP_TOOL_NAMES], allowDesktopMode: false });
const allSchemas = tools.getSchemas();
const CORE_MODE = { chat: 'chat', code: 'work', plan: 'plan', write: 'write' };
function schemasFor(mode) {
  const m = CORE_MODE[mode];
  const allowed = agentMod.MODE_ALLOWED_TOOLS[m];
  // "before" is Ava as she was: no profile_lookup.
  return allSchemas.filter((t) => agentMod.toolPassesModeGate(t.function.name, allowed, m) && (after || t.function.name !== 'profile_lookup'));
}
function systemPrompt() {
  return sp.buildSystemPrompt({
    cwd: projectDir, platform: process.platform, shell: 'bash', permissionMode: 'balanced',
    autoMemory: true, language: 'en', userName: spec.person.name, isAdmin: false,
    decisionsFolderExists: false, decisionsOptInStatus: 'not-asked',
    coreMemory,
  });
}
function userText(mode, text) {
  if (mode === 'chat') return sp.getChatModePrefix(text);
  if (mode === 'code') return sp.getWorkModePrefix(text);
  if (mode === 'plan') return sp.getPlanModePrefix(text);
  if (mode === 'write') return sp.getWriteModePrefix(text);
  throw new Error(mode);
}

if (DRY) {
  for (const mode of ['chat', 'code', 'plan', 'write']) {
    const s = schemasFor(mode);
    console.log(`${mode}: system ≈${Math.round(systemPrompt().length / 4)} tok, ${s.length} tools ≈${Math.round(JSON.stringify(s).length / 4)} tok`);
  }
  process.exit(0);
}

// ── Run ────────────────────────────────────────────────────────────────────
let spent = 0;
// Some providers (Mistral with reasoning) return content as parts; keep only the text parts.
const textOf = (c) => typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p?.type === 'text').map((p) => p.text || '').join('') : '';
const lower = (s) => textOf(s).toLowerCase();
const hits = (text, markers) => markers.filter((m) => lower(text).includes(m));

async function runCase(target, c) {
  const seat = target.seatFor(c.mode);
  const { provider, model } = providerFor(seat);
  const messages = [
    { role: 'system', content: systemPrompt() },
  ];
  const brief = await session.messageBlock(c.text).catch(() => '');
  if (brief) messages.push({ role: 'system', content: `[Memory Brief]
${brief}` });
  messages.push({ role: 'user', content: userText(c.mode, c.text) });
  const toolsCalled = [];
  let answer = '', usd = 0, error = null;
  for (let round = 0; round < 4; round++) {
    let res;
    try {
      res = await provider.createCompletion({ model: model.id, messages, tools: schemasFor(c.mode), tool_choice: 'auto', max_tokens: 2000 });
    } catch (e) { error = String(e?.message || e).slice(0, 300); break; }
    const u = res.usage || {};
    const rate = usdRateFor(model.id, provider.name);
    if (rate) usd += (u.prompt_tokens || 0) / 1e6 * rate.inputPerMillion + (u.completion_tokens || 0) / 1e6 * rate.outputPerMillion;
    const msg = res.choices?.[0]?.message || {};
    const calls = msg.tool_calls || [];
    if (!calls.length) { answer = textOf(msg.content); break; }
    messages.push(msg);
    for (const call of calls) {
      const name = call.function?.name;
      let a = {};
      try { a = JSON.parse(call.function?.arguments || '{}'); } catch { /* bad args */ }
      toolsCalled.push(name === 'profile_lookup' ? `profile_lookup:${a.section}` : name);
      const content = name === 'profile_lookup' && after
        ? (await lookupTool.execute(a, { cwd: projectDir })).output
        : JSON.stringify({ note: 'Not available in this test. Answer from what you already have.' });
      messages.push({ role: 'tool', tool_call_id: call.id, content });
    }
    answer = textOf(msg.content);
  }
  spent += usd;
  const looked = toolsCalled.some((t) => t.startsWith('profile_lookup'));
  const lookedRight = toolsCalled.includes(`profile_lookup:${c.section}`);
  const used = c.kind === 'look' ? hits(answer, c.markers) : [];
  const intruded = c.kind === 'quiet' ? hits(answer, spec.intrusion_markers) : [];
  return { seat, toolsCalled, looked, lookedRight, used, intruded, usd, error, answer };
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join(repo, 'Decisions', 'profile-test', 'results');
fs.mkdirSync(outDir, { recursive: true });
const results = [];
outer:
for (const target of targets) {
  for (const c of cases) {
    for (let r = 1; r <= REPEAT; r++) {
      if (spent >= BUDGET) { console.log(`Budget $${BUDGET} reached; stopping.`); break outer; }
      const out = await runCase(target, c);
      results.push({ target: target.label, case: c.id, kind: c.kind, mode: c.mode, run: r, ...out });
      const flag = out.error ? `ERROR ${out.error.slice(0, 80)}`
        : c.kind === 'look' ? `used ${out.used.length ? out.used.join('/') : 'none'}${out.looked ? `, looked ${out.lookedRight ? 'right' : 'wrong'}` : ''}`
        : (out.intruded.length ? `INTRUDED ${out.intruded.join('/')}` : 'quiet');
      console.log(`${target.label.padEnd(26)} ${c.id.padEnd(10)} #${r}  ${flag}  [${out.toolsCalled.join(',')}]  $${out.usd.toFixed(4)}  total $${spent.toFixed(3)}`);
      fs.writeFileSync(path.join(outDir, `${stamp}-${CONDITION}.json`), JSON.stringify({ condition: CONDITION, stamp, spent, results }, null, 2));
    }
  }
}

// ── Summary ────────────────────────────────────────────────────────────────
const lines = [`# Profile test: ${CONDITION}, ${stamp}`, '', `Spent $${spent.toFixed(3)}. Repeat ${REPEAT}.`, '',
  '| Target | Look cases using the profile | Looked (right section) | Quiet cases that stayed quiet | Errors |', '|---|---|---|---|---|'];
for (const t of targets) {
  const rs = results.filter((r) => r.target === t.label && !r.error);
  const look = rs.filter((r) => r.kind === 'look'), quiet = rs.filter((r) => r.kind === 'quiet');
  const errs = results.filter((r) => r.target === t.label && r.error).length;
  lines.push(`| ${t.label} | ${look.filter((r) => r.used.length).length}/${look.length} | ${look.filter((r) => r.lookedRight).length}/${look.length} | ${quiet.filter((r) => !r.intruded.length).length}/${quiet.length} | ${errs} |`);
}
fs.writeFileSync(path.join(outDir, `${stamp}-${CONDITION}.md`), lines.join('\n') + '\n');
console.log('\n' + lines.join('\n'));
fs.rmSync(scratch, { recursive: true, force: true });
