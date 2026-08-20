// The three surfaces, the prefix tags and the allowlists must agree about
// what a mode IS.
//
// A mode is four separate facts kept in four places:
//
//   1. whether a picker offers it            — three pickers, three files
//   2. the tag prepended to the user message — the IDE hardcodes these
//   3. core's detection of that tag          — detectModeFromMessages
//   4. the tools it is handed                — MODE_ALLOWED_TOOLS
//
// Nothing has ever checked that those agree, and every one of the mode faults
// this week lived in the gap between two of them:
//
//   - Teach stayed in the extension's chat picker for weeks after the dashboard
//     and IDE dropped it, so one surface offered a mode the other two had
//     retired (2026-08-20, fixed).
//   - The AutoCoordinator grew a second detector that searched the SYSTEM
//     prompt for 'Plan mode' when the tag is '[Plan Mode]' on the USER message.
//     It matched nothing and answered 'work' for every mode, every turn, for as
//     long as it existed.
//   - Mode allowlists named `file_read` for months after the tool became
//     `read`, so no filtering mode could open a file.
//
// None of those errored. A mode that is offered but undetectable just behaves
// like work; a tag that does not match just does nothing. This is the test that
// makes the silence audible.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectModeFromMessages } from '../src/agent/agent.js';
import type { Message } from '../src/core/types.js';

const ROOT = join(__dirname, '..', '..');
const EXT_CHAT = join(ROOT, 'extension', 'webview-ui', 'src', 'components', 'InputArea.tsx');
const EXT_DASH = join(ROOT, 'extension', 'dashboard-ui', 'src', 'chat', 'components', 'InputArea.tsx');
const IDE_CHAT = join(ROOT, 'ide', 'src', 'components', 'DashboardPages.tsx');

/** Surfaces are submodules — absent in a partial checkout, which is not a failure. */
const have = (p: string) => existsSync(p);

/** Source with `//` comments stripped — this file's own fixes quote the old values. */
function codeOnly(src: string): string {
  return src
    .split('\n')
    .map((l) => l.replace(/\r$/, '').replace(/^\s*\/\/.*$/, '').replace(/\s+\/\/.*$/, ''))
    .join('\n');
}

/** The `MODES` array in a picker file, as `{ id: 'x' }` entries. */
function pickerModes(file: string): string[] {
  const src = codeOnly(readFileSync(file, 'utf8'));
  // Anchor on the DECLARATION. A bare 'MODES' also matches the IDE's
  // `ALL_AVA_MODES` import forty lines earlier, which parsed to nothing and
  // made this guard report an empty picker instead of a real disagreement.
  const start = src.indexOf('const MODES');
  if (start === -1) return [];
  const body = src.slice(start, src.indexOf('];', start));
  return [...body.matchAll(/\{\s*id:\s*'([a-z_]+)'/g)].map((m) => m[1]);
}

/** The IDE hardcodes the tag next to each mode — a fourth copy of the fact. */
function idePrefixes(): Record<string, string> {
  const src = codeOnly(readFileSync(IDE_CHAT, 'utf8'));
  const start = src.indexOf('const MODES');
  const body = start === -1 ? '' : src.slice(start, src.indexOf('];', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/\{\s*id:\s*'([a-z_]+)'[^}]*?prefix:\s*'([^']*)'/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

/** What a mode id is called in core. The IDE says `work`; the others say `code`. */
const CANON: Record<string, string> = { code: 'work' };
const canon = (id: string) => CANON[id] ?? id;

/** Ask core what it makes of a turn tagged with this prefix. */
function detect(prefix: string): string | null {
  const messages: Message[] = [{ role: 'user', content: `${prefix}do the thing` }];
  return detectModeFromMessages(messages);
}

describe('every mode a surface offers, core understands', () => {
  it('finds the pickers, so a silent pass means something', () => {
    for (const [name, file] of [['extension chat', EXT_CHAT], ['extension dashboard', EXT_DASH], ['IDE', IDE_CHAT]] as const) {
      if (!have(file)) continue;
      expect(pickerModes(file).length, `${name} picker has no modes`).toBeGreaterThan(3);
    }
  });

  it.runIf(have(IDE_CHAT))('the IDE tags match what core detects', () => {
    // The IDE writes the tag itself rather than asking core for it, so these
    // two lists are a copy of one fact. A typo here does not error — the tag
    // simply fails to match and the turn silently behaves like work mode.
    const wrong: string[] = [];
    for (const [id, prefix] of Object.entries(idePrefixes())) {
      if (prefix === '') continue; // work carries no tag, by design
      const got = detect(prefix);
      if (got !== canon(id)) wrong.push(`${id}: sends "${prefix}" → core reads ${got ?? 'nothing'}`);
    }
    expect(
      wrong,
      `The IDE sends tags core does not recognise, so these modes silently run as work:\n  ${wrong.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the user-facing pickers agree with each other', () => {
    // Teach lived in the extension's chat picker for weeks after the other two
    // dropped it. Nothing complained, because a picker is just a list.
    const lists: Array<[string, string[]]> = [];
    for (const [name, file] of [['extension chat', EXT_CHAT], ['extension dashboard', EXT_DASH]] as const) {
      if (have(file)) lists.push([name, pickerModes(file).map(canon).sort()]);
    }
    if (have(IDE_CHAT)) {
      // The IDE keeps hidden entries in MODES and filters them for display, so
      // compare against what it actually shows.
      const src = codeOnly(readFileSync(IDE_CHAT, 'utf8'));
      const hidden = [...src.matchAll(/MODES\.filter\(\(m\) => m\.id !== '([a-z_]+)'\)/g)].map((m) => m[1]);
      lists.push(['IDE', pickerModes(IDE_CHAT).filter((m) => !hidden.includes(m)).map(canon).sort()]);
    }
    if (lists.length < 2) return; // nothing to compare in a partial checkout

    // Desktop is IDE-ONLY on purpose and must stay that way. Screen control,
    // mouse and keyboard cannot ship in the VS Code marketplace build — the
    // desktop tools are stripped from both extension surfaces at registration
    // to meet Microsoft's rules, not filtered in the UI. If this exception ever
    // looks like an oversight, it is not: adding desktop to the extension's
    // picker would offer a mode whose tools that build does not contain.
    const SURFACE_ONLY = new Set(['desktop']);

    const [firstName, first] = lists[0];
    for (const [name, ids] of lists.slice(1)) {
      const onlyHere = ids.filter((m) => !first.includes(m) && !SURFACE_ONLY.has(m));
      const onlyThere = first.filter((m) => !ids.includes(m) && !SURFACE_ONLY.has(m));
      expect(
        [...onlyHere.map((m) => `${name} only: ${m}`), ...onlyThere.map((m) => `${firstName} only: ${m}`)],
        `${firstName} and ${name} offer different modes`,
      ).toEqual([]);
    }
  });

  it('every offered mode is one core can detect', () => {
    // An offered-but-undetectable mode does not error. It just behaves like
    // work, and the user never finds out why the tool list looks wrong.
    const tags: Record<string, string> = {
      plan: '[Plan Mode] ',
      chat: '[Chat Mode] ',
      brainstorm: '[Brainstorm Mode] ',
      write: '[Write Mode] ',
      teach: '[Teach Mode] ',
      security: '[Security Audit Mode] ',
      desktop: '[Desktop Automation Mode] ',
    };
    const offered = new Set<string>();
    for (const file of [EXT_CHAT, EXT_DASH, IDE_CHAT]) {
      if (have(file)) for (const id of pickerModes(file)) offered.add(canon(id));
    }
    const undetectable = [...offered]
      .filter((m) => m !== 'work')
      .filter((m) => !tags[m] || detect(tags[m]) !== m);

    expect(
      undetectable,
      `These are offered in a picker but core cannot detect them, so they run as work: ${undetectable.join(', ')}`,
    ).toEqual([]);
  });
});
