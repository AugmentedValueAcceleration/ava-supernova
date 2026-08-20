// A message the dashboard sends and the provider handles must be allowed through.
//
// The extension's dashboard webview does not talk to AvaViewProvider directly.
// DashboardPanel.handleMessage forwards a message only if its type is in
// CHAT_MESSAGE_TYPES — a hand-written Set — and otherwise falls through to its
// own switch, where an unknown type does nothing at all. No error, no warning.
//
// 2026-08-20: the Plans tab shipped, the dashboard posted `list_plan_records`,
// AvaViewProvider handled it, and the tab still read "0 decisions recorded" on
// a project whose record was visible in the Explorer three inches to the left.
// The type was missing from the Set, so the message was dropped in silence.
//
// That is the fourth hand-maintained list to swallow something this week: the
// mode allowlists' dead tool names, the coordinator's duplicate mode detector,
// TasksPanel existing twice, and now this. The shape is always the same — one
// fact, two lists, and no complaint from the quiet one.
//
// Lives in core's suite because core is the only package here with a test
// runner, and because routing-modes.test.ts already reads across packages.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const EXT = join(__dirname, '..', '..', 'extension');
const DASHBOARD_PANEL = join(EXT, 'src', 'webview', 'DashboardPanel.ts');
const VIEW_PROVIDER = join(EXT, 'src', 'webview', 'AvaViewProvider.ts');
const DASHBOARD_UI = join(EXT, 'dashboard-ui', 'src');

/** Present unless the extension package was pruned from the checkout. */
const available = existsSync(DASHBOARD_PANEL) && existsSync(VIEW_PROVIDER) && existsSync(DASHBOARD_UI);

/** The forwarding allowlist, parsed from source — it is a module-private Set. */
function forwardedTypes(): Set<string> {
  const src = readFileSync(DASHBOARD_PANEL, 'utf8');
  const start = src.indexOf('const CHAT_MESSAGE_TYPES');
  const body = src.slice(start, src.indexOf(']);', start));
  return new Set([...body.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]));
}

/** Types AvaViewProvider.handleChatMessage knows how to remap. */
function providerHandledTypes(): Set<string> {
  const src = readFileSync(VIEW_PROVIDER, 'utf8');
  const start = src.indexOf('async handleChatMessage(');
  // The remap switch is the first one in the method; take a generous slice and
  // stop at the method's closing brace column.
  const end = src.indexOf('\n  }\n', start);
  const body = src.slice(start, end === -1 ? start + 20000 : end);
  return new Set(
    [...body.matchAll(/^\s*case '([a-z_0-9]+)':/gm)].map((m) => m[1]),
  );
}

/** Types the dashboard UI actually posts to the extension. */
function postedTypes(): Set<string> {
  const files: string[] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) files.push(p);
    }
  })(DASHBOARD_UI);

  const posted = new Set<string>();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    // post({ type: 'x' … }) and postMessage({ type: 'x' … })
    for (const m of src.matchAll(/post(?:Message)?\(\s*\{\s*type:\s*'([a-z_0-9]+)'/g)) {
      posted.add(m[1]);
    }
  }
  return posted;
}

describe.skipIf(!available)('the dashboard can reach the provider', () => {
  it('parses all three lists, so a silent pass means something', () => {
    expect(forwardedTypes().size).toBeGreaterThan(20);
    expect(providerHandledTypes().size).toBeGreaterThan(20);
    expect(postedTypes().size).toBeGreaterThan(10);
  });

  it('forwards every message it sends that the provider handles', () => {
    const forwarded = forwardedTypes();
    const handled = providerHandledTypes();
    const posted = postedTypes();

    // Only types that are BOTH sent by the dashboard and understood by the
    // provider need forwarding — AND that DashboardPanel does not answer
    // itself. `open_tasks_folder` is the example: the provider has a handler,
    // but the panel opens the folder locally and never forwards, which is
    // correct. Without this subtraction the guard cries wolf on it.
    const ownCases = new Set(
      [...readFileSync(DASHBOARD_PANEL, 'utf8').matchAll(/^\s*case '([a-z_0-9]+)':/gm)].map((m) => m[1]),
    );
    const dropped = [...posted]
      .filter((t) => handled.has(t) && !forwarded.has(t) && !ownCases.has(t))
      .sort();

    expect(
      dropped,
      'The dashboard sends these and AvaViewProvider handles them, but ' +
      'CHAT_MESSAGE_TYPES does not forward them — so they are dropped in ' +
      `silence and the feature just does nothing:\n  ${dropped.join('\n  ')}`,
    ).toEqual([]);
  });

  it('forwards the Plans tab specifically', () => {
    // The one that failed. Named so a future refactor that drops it fails
    // here rather than in a screenshot at one in the morning.
    const forwarded = forwardedTypes();
    for (const type of ['list_plan_records', 'open_plan_record']) {
      expect(forwarded.has(type), `${type} is not forwarded to the provider`).toBe(true);
    }
  });
});
