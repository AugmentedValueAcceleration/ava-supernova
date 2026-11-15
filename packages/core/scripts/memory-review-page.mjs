/**
 * Builds review.html for the memory migration: one local page where the
 * person keeps, changes or drops every proposed memory before anything is
 * written. Self-contained (no network); the proposal is embedded in the page.
 * "Save my decisions" downloads memory-decisions.json, which `apply` reads.
 *
 * Progress is kept in the browser (localStorage) so the review can be done in
 * more than one sitting; the page works without it.
 */

import fs from 'node:fs';
import path from 'node:path';

export function writeReviewPage(work, variant = '') {
  const suffix = variant ? `-${variant}` : '';
  const proposal = JSON.parse(fs.readFileSync(path.join(work, `proposal${suffix}.json`), 'utf8'));
  const data = JSON.stringify(proposal).replace(/</g, '\\u003c');
  // Each page keeps its own saved progress and saves its own file name.
  const html = TEMPLATE
    .replace('__DATA__', () => data)
    .replace("'ava-memory-review-v1'", JSON.stringify(`ava-memory-review-v1${suffix}`))
    .replace("download: 'memory-decisions.json'", `download: ${JSON.stringify(`memory-decisions${suffix}.json`)}`)
    .replace('Saved memory-decisions.json (', () => `Saved memory-decisions${suffix}.json (`)
    .replace('<h1>Ava\'s memory: your review</h1>', variant === 'recovered'
      ? '<h1>Ava\'s memory: the ones the merge dropped</h1>'
      : '<h1>Ava\'s memory: your review</h1>');
  const out = path.join(work, `review${suffix}.html`);
  fs.writeFileSync(out, html);
  return out;
}

const TEMPLATE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Memory Review</title>
<style>
  :root {
    --bg: #f7f6f3; --panel: #ffffff; --ink: #1d1d1f; --muted: #6b6b70; --line: #e4e2dc;
    --accent: #3b6fd8; --accent-soft: #e8eefb; --warn: #a2560f; --warn-soft: #fbf0e4; --drop: #9a9aa0;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #141416; --panel: #1d1d20; --ink: #ececee; --muted: #9a9aa2; --line: #2e2e33;
      --accent: #7aa2ff; --accent-soft: #22293a; --warn: #f0a868; --warn-soft: #33281d; --drop: #66666c; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 400 15px/1.55 "Segoe UI", system-ui, sans-serif; }
  header { position: sticky; top: 0; z-index: 5; background: var(--panel); border-bottom: 1px solid var(--line); padding: 12px 16px; }
  header .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 18px; font-weight: 500; margin: 0 12px 0 0; }
  h2 { font-size: 16px; font-weight: 500; margin: 28px 0 8px; }
  h3 { font-size: 15px; font-weight: 500; margin: 18px 0 6px; color: var(--muted); }
  main { max-width: 1100px; margin: 0 auto; padding: 8px 16px 80px; }
  .intro { color: var(--muted); max-width: 760px; }
  nav.tabs { display: flex; gap: 6px; flex-wrap: wrap; }
  nav.tabs button, .btn { border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 8px; padding: 6px 12px; font: inherit; cursor: pointer; }
  nav.tabs button[aria-selected="true"] { background: var(--accent-soft); border-color: var(--accent); }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  input[type=search] { flex: 1; min-width: 160px; border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; background: var(--bg); color: var(--ink); font: inherit; }
  .stat { color: var(--muted); font-size: 13px; }
  .item { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin: 8px 0; display: grid; grid-template-columns: 28px 1fr; gap: 8px; }
  .item.dropped { opacity: .55; }
  .item.dropped textarea { text-decoration: line-through; color: var(--drop); }
  .item input[type=checkbox] { width: 18px; height: 18px; margin-top: 4px; accent-color: var(--accent); }
  textarea { width: 100%; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--ink); font: inherit; resize: vertical; padding: 4px 6px; min-height: 2.2em; }
  textarea:hover, textarea:focus { border-color: var(--line); background: var(--bg); outline: none; }
  .meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; color: var(--muted); margin-top: 4px; }
  select { border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); font: inherit; font-size: 13px; padding: 2px 6px; }
  .tag { border-radius: 999px; padding: 1px 8px; background: var(--accent-soft); }
  .tag.warn { background: var(--warn-soft); color: var(--warn); }
  details { margin-top: 4px; font-size: 13px; color: var(--muted); }
  details summary { cursor: pointer; }
  details .orig { white-space: pre-wrap; border-left: 3px solid var(--line); padding: 4px 8px; margin: 6px 0; }
  .history { margin-top: 6px; padding: 6px 8px; border-radius: 6px; background: var(--bg); font-size: 13px; }
  .history .h { display: grid; grid-template-columns: 22px 1fr; gap: 6px; margin: 4px 0; }
  #core { min-height: 420px; font-family: ui-monospace, Consolas, monospace; font-size: 13px; background: var(--panel); border-color: var(--line); }
  .budget.over { color: var(--warn); }
  .section-actions { display: flex; gap: 8px; margin: 6px 0; flex-wrap: wrap; }
  .hidden { display: none !important; }
  footer.saved { position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%); background: var(--ink); color: var(--bg); padding: 8px 14px; border-radius: 8px; font-size: 14px; opacity: 0; transition: opacity .3s; pointer-events: none; }
  footer.saved.show { opacity: 1; }
  @media (max-width: 600px) { .item { grid-template-columns: 24px 1fr; } }
</style>
</head>
<body>
<header>
  <div class="row">
    <h1>Ava's memory: your review</h1>
    <nav class="tabs" role="tablist" id="tabs"></nav>
    <input type="search" id="q" placeholder="Search…" aria-label="Search">
    <button class="btn primary" id="save">Save my decisions</button>
  </div>
</header>
<main>
  <p class="intro">Everything below is a proposal. <b style="font-weight:500">Ticked</b> means keep. Click any text to change it. Untick anything wrong or not worth keeping. Nothing is written to Ava's memory until you press <b style="font-weight:500">Save my decisions</b> and I apply the file. Your progress is kept in this browser, so you can stop and come back.</p>
  <div id="view"></div>
</main>
<footer class="saved" id="toast"></footer>
<script>
const P = __DATA__;
const KEY = 'ava-memory-review-v1';
const KINDS = ['person', 'preference', 'rule', 'project', 'event'];
const SCOPES = ['everywhere', ...P.projects];
const byId = new Map(P.source.map((s) => [s.id, s]));

// ── State (seeded from the proposal; restored from this browser if saved) ──
function fresh() {
  return {
    core: P.core,
    facts: P.facts.map((f, i) => ({ key: 'f' + i, keep: true, text: f.text, kind: f.kind, scope: f.scope, source: f.source, quote: f.quote || '', from: f.from, members: f.members || [],
      replaced: (f.replaced || []).map((r) => ({ keep: true, text: r.text, from: r.from, until: r.until, members: r.members || [] })) })),
    noise: P.noise.map((n, i) => ({ key: 'n' + i, keep: false, text: n.text || n.content, kind: n.kind || 'project', scope: n.scope || 'everywhere', source: n.source || 'inferred', quote: n.quote || '', from: n.from, members: [n.id], verdict: n.verdict })),
    threads: P.threads.map((t, i) => ({ key: 't' + i, keep: true, text: t.text, project: t.project || '', evidence: t.evidence || '' })),
    episodes: P.episodes.map((e) => ({ date: e.date, keep: true, sections: e.sections.map((s) => ({ project: s.project, text: s.lines.join('\n') })) })),
  };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { S = fresh(); }
let saveTimer;
function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }, 300); }

// ── Tabs ──
const scopesInFacts = [...new Set(P.facts.map((f) => f.scope))];
const TABS = [
  ...(P.core ? [{ id: 'core', label: 'Core page' }] : []),
  ...['everywhere', ...scopesInFacts.filter((s) => s !== 'everywhere')].map((s) => ({ id: 'scope:' + s, label: s === 'everywhere' ? 'About you' : s })),
  ...(P.threads.length ? [{ id: 'threads', label: 'Open threads' }] : []),
  ...(P.episodes.length ? [{ id: 'episodes', label: 'Days' }] : []),
  ...(P.noise.length ? [{ id: 'noise', label: 'Probably not worth keeping' }] : []),
];
let tab = TABS[0].id;
const tabsEl = document.getElementById('tabs');
function drawTabs() {
  tabsEl.innerHTML = '';
  for (const t of TABS) {
    const b = document.createElement('button');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(t.id === tab));
    b.textContent = t.label + count(t.id);
    b.onclick = () => { tab = t.id; drawTabs(); draw(); };
    tabsEl.appendChild(b);
  }
}
function count(id) {
  if (id.startsWith('scope:')) { const s = id.slice(6); const a = S.facts.filter((f) => f.scope === s); return ' (' + a.filter((f) => f.keep).length + '/' + a.length + ')'; }
  if (id === 'noise') return ' (' + S.noise.filter((n) => n.keep).length + '/' + S.noise.length + ')';
  if (id === 'threads') return ' (' + S.threads.filter((t) => t.keep).length + ')';
  if (id === 'episodes') return ' (' + S.episodes.filter((e) => e.keep).length + ')';
  return '';
}

// ── Building blocks ──
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else e.setAttribute(k, v); } for (const c of kids) if (c != null) e.append(c); return e; };
function autosize(t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }
function editable(obj, field, onchange) {
  const t = el('textarea', { rows: '1', 'aria-label': 'Text' });
  t.value = obj[field];
  t.oninput = () => { obj[field] = t.value; autosize(t); persist(); onchange && onchange(); };
  requestAnimationFrame(() => autosize(t));
  return t;
}
function select(obj, field, options, label) {
  const s = el('select', { 'aria-label': label });
  for (const o of options) { const op = el('option', { value: o }, o); if (o === obj[field]) op.selected = true; s.append(op); }
  if (!options.includes(obj[field])) s.append(el('option', { value: obj[field], selected: '' }, obj[field]));
  s.onchange = () => { obj[field] = s.value; persist(); drawTabs(); };
  return s;
}
function keepBox(obj, row) {
  const c = el('input', { type: 'checkbox', 'aria-label': 'Keep' });
  c.checked = obj.keep;
  row.classList.toggle('dropped', !obj.keep);
  c.onchange = () => { obj.keep = c.checked; row.classList.toggle('dropped', !obj.keep); persist(); drawTabs(); };
  return c;
}
function originals(members) {
  if (!members.length) return null;
  const d = el('details', {}, el('summary', {}, 'From ' + members.length + ' original ' + (members.length === 1 ? 'memory' : 'memories')));
  for (const id of members) { const s = byId.get(id); if (s) d.append(el('div', { class: 'orig' }, (s.from ? s.from + ' · ' : '') + 'stored in ' + s.origins.join(', ') + '\n' + s.content)); }
  return d;
}
const matches = (text) => { const q = document.getElementById('q').value.trim().toLowerCase(); return !q || text.toLowerCase().includes(q); };

function factRow(f, isNoise) {
  const row = el('div', { class: 'item' });
  const body = el('div', {}, editable(f, 'text'));
  const meta = el('div', { class: 'meta' },
    select(f, 'kind', KINDS, 'Kind'), select(f, 'scope', SCOPES, 'Project'),
    f.from ? el('span', {}, 'since ' + f.from) : null,
    el('span', { class: 'tag' }, f.source === 'said' ? 'you said it' : 'Ava noticed'),
    isNoise ? el('span', { class: 'tag warn' }, f.verdict === 'guess' ? 'looks like a guess' : 'looks like noise') : null);
  body.append(meta);
  if (f.quote) body.append(el('div', { class: 'meta' }, 'Your words: “' + f.quote + '”'));
  if (f.replaced && f.replaced.length) {
    const h = el('div', { class: 'history' }, el('div', {}, 'Earlier versions, kept as history (untick to drop):'));
    for (const r of f.replaced) {
      const c = el('input', { type: 'checkbox', 'aria-label': 'Keep history' }); c.checked = r.keep;
      c.onchange = () => { r.keep = c.checked; persist(); };
      h.append(el('div', { class: 'h' }, c, el('div', {}, editable(r, 'text'), el('div', { class: 'meta' }, (r.from || '?') + ' → until ' + (r.until || '?')))));
    }
    body.append(h);
  }
  body.append(originals(f.members));
  row.append(keepBox(f, row), body);
  return row;
}

// ── Views ──
const view = document.getElementById('view');
function draw() {
  view.innerHTML = '';
  if (tab === 'core') return drawCore();
  if (tab === 'threads') return drawThreads();
  if (tab === 'episodes') return drawEpisodes();
  const list = tab === 'noise' ? S.noise : S.facts.filter((f) => f.scope === tab.slice(6));
  const isNoise = tab === 'noise';
  view.append(el('p', { class: 'intro' }, isNoise
    ? 'These looked like chat fragments, Ava talking about herself, or guesses. They are unticked. Tick any that are worth keeping, and set the right project.'
    : tab === 'scope:everywhere' ? 'Facts about you and how you work. These follow you into every project.' : 'Facts that belong only to ' + tab.slice(6) + '. Ava sees them only when that project is open (or when you ask about it).'));
  view.append(el('div', { class: 'section-actions' },
    el('button', { class: 'btn', onclick: () => { list.forEach((f) => f.keep = true); persist(); drawTabs(); draw(); } }, 'Tick all here'),
    el('button', { class: 'btn', onclick: () => { list.forEach((f) => f.keep = false); persist(); drawTabs(); draw(); } }, 'Untick all here')));
  const kinds = isNoise ? [null] : KINDS;
  for (const k of kinds) {
    const items = list.filter((f) => (k == null || f.kind === k) && matches(f.text));
    if (!items.length) continue;
    if (k) view.append(el('h3', {}, { person: 'Who you are', preference: 'What you like', rule: 'How Ava works with you', project: 'Project facts', event: 'Things that happened' }[k] + ' · ' + items.length));
    for (const f of items) view.append(factRow(f, isNoise));
  }
}
function drawCore() {
  view.append(el('p', { class: 'intro' }, 'The core page is what Ava reads before every conversation, in every mode and every room. Keep it to what matters most. Limit: about 1,500 tokens.'));
  const info = el('div', { class: 'stat budget' });
  const t = el('textarea', { id: 'core', 'aria-label': 'Core page' });
  t.value = S.core;
  const upd = () => { const tokens = Math.ceil(t.value.length / 4); info.textContent = '~' + tokens + ' of 1,500 tokens'; info.classList.toggle('over', tokens > 1500); };
  t.oninput = () => { S.core = t.value; persist(); upd(); };
  upd();
  view.append(info, t);
}
function drawThreads() {
  view.append(el('p', { class: 'intro' }, 'Things that looked parked or still open. Ava will carry the ticked ones until they are done.'));
  for (const th of S.threads.filter((x) => matches(x.text))) {
    const row = el('div', { class: 'item' });
    row.append(keepBox(th, row), el('div', {}, editable(th, 'text'), el('div', { class: 'meta' }, select(th, 'project', ['', ...P.projects], 'Project'), th.evidence ? el('span', {}, 'from: ' + th.evidence) : null)));
    view.append(row);
  }
}
function drawEpisodes() {
  view.append(el('p', { class: 'intro' }, 'A few lines per day, built from Ava\'s journal. They let her answer "what did we do on Tuesday?". Edit or untick any day.'));
  for (const e of [...S.episodes].reverse()) {
    if (!matches(e.sections.map((s) => s.text).join(' '))) continue;
    const row = el('div', { class: 'item' });
    const body = el('div', {}, el('div', { style: 'font-weight:500' }, e.date));
    for (const s of e.sections) body.append(el('div', { class: 'meta' }, s.project), editable(s, 'text'));
    row.append(keepBox(e, row), body);
    view.append(row);
  }
}
document.getElementById('q').oninput = () => draw();

// ── Save ──
document.getElementById('save').onclick = () => {
  const toFact = (f) => ({ text: f.text.trim(), kind: f.kind, scope: f.scope, source: f.source, quote: f.quote, from: f.from,
    replaced: (f.replaced || []).filter((r) => r.keep && r.text.trim()).map((r) => ({ text: r.text.trim(), from: r.from, until: r.until })) });
  const decisions = {
    savedAt: new Date().toISOString(),
    core: S.core,
    facts: [...S.facts, ...S.noise].filter((f) => f.keep && f.text.trim()).map(toFact),
    threads: S.threads.filter((t) => t.keep && t.text.trim()).map((t) => ({ text: t.text.trim(), project: t.project })),
    episodes: S.episodes.filter((e) => e.keep).map((e) => ({ date: e.date, sections: e.sections.map((s) => ({ project: s.project, lines: s.text.split('\n').map((l) => l.trim()).filter(Boolean) })).filter((s) => s.lines.length) })),
  };
  const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(decisions, null, 2)], { type: 'application/json' })), download: 'memory-decisions.json' });
  document.body.append(a); a.click(); a.remove();
  const toast = document.getElementById('toast');
  toast.textContent = 'Saved memory-decisions.json (' + decisions.facts.length + ' facts) to your Downloads';
  toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3500);
};

drawTabs();
draw();
</script>
</body>
</html>
`;
