/**
 * The Connections page (plan 2026-11-17-mcp-servers, Phase 2; mockup
 * Decisions/mcp/connections-page-mockup.html, approved 17 Nov).
 *
 * One function for both apps: each app's page sends `mcpPage(op, args)` to its
 * host and shows the reply, so the extension and the IDE can't drift. Statuses
 * come from the running McpServers; changes go through ~/.ava/mcp.json and the
 * keychain, which both apps share.
 *
 *   state                        everything the page shows
 *   enable    { id, on }         switch one of his servers on or off
 *   restart   { scope, id }
 *   remove    { id }             take it out, and forget the keys only it used
 *   allow     { avaName, on, inner? }  "Always" for one tool (inner: one Unreal tool), or back to asking
 *   answer    { id, answer }     his yes / not now / never to a project's server
 *   set_key   { name, value }    keep a key in the keychain ('' forgets it)
 *   sign_in   { scope, id, words }  open his browser on an online server's sign-in
 *                                (resolves once it's open; the page then polls)
 *   cancel_signin { scope, id }
 *   sign_out  { scope, id }      forget the sign-in
 *   import_scan                  what Claude Desktop, Cursor and VS Code have (no secrets shown)
 *   import    { picks }          bring in the ones he ticked: [{ app, name }]
 *   check_suggested { id }       what a suggested server would be (address, warnings)
 *   add_suggested { id, view }   add it, with Ava's view in his language
 *   open_docs { url }            open a server's docs page (only one the page was given)
 *   check     { draft }          what a new server would run, and what to point out
 *   add       { draft }          add it (after he has seen the check)
 */

import { McpServers, type McpServerStatus } from './manager.js';
import {
  cleanServerId, describeEntry, readMcpFile, secretsUsed, updateMcpFile, type McpServerEntry,
} from './servers-config.js';
import { hasMcpKeychain, mcpSecretNames, setMcpSecret } from './secrets.js';
import { checkServerUrl } from './connection.js';
import { forgetSignIn, mcpAuthKey, openWebPage } from './oauth.js';
import { MCP_IMPORT_APP_NAMES, scanMcpImports, type McpImportApp } from './import.js';
import { addMcpServers, checkProposal, importMcpServers } from './setup.js';
import { MCP_SUGGESTIONS, suggestionFor, type McpSuggestionKind } from './suggested.js';
import { riskNotes, type McpRiskNote } from './risk.js';
import { installUnrealProgram, unrealProgramState } from './unreal-install.js';

/** More tools than this from his servers and the page says it's getting heavy. */
export const MCP_HEAVY_TOOLS = 40;

export interface McpDraft {
  name: string;
  kind: 'local' | 'online';
  /** The whole command line, as he'd type it. */
  commandLine?: string;
  /** Keys the program reads from its environment: NAME → value (kept in the keychain). */
  keys?: Array<{ name: string; value: string }>;
  url?: string;
  /** A fixed key for an online server, sent as this header. */
  headerName?: string;
  headerValue?: string;
}

export interface McpPageServer extends McpServerStatus {
  /** Each key it uses, and whether the keychain has it. */
  keys: Array<{ name: string; set: boolean }>;
  /** Where to read about it: a suggested server's docs, else the repository Ava noted. */
  docs?: string;
}

/** A server's docs page, if known (https only). */
function docsFor(s: McpServerStatus): string | undefined {
  const known = suggestionFor(s.online ? s.shows : undefined)?.docs ?? s.ava?.repository;
  return known && /^https:\/\//i.test(known) ? known : undefined;
}

export interface McpPageState {
  servers: McpPageServer[];
  projectFolder: string | null;
  problems: string[];
  /** Tools from servers that are running. */
  toolsOn: number;
  serversOn: number;
  waiting: number;
  heavy: boolean;
  /** False when the keychain can't be reached: keys can't be kept. */
  keychain: boolean;
  /** The suggested servers (suggested.ts), and whether he has each one already. */
  suggested: Array<{ id: string; name: string; publisher: string; registry?: string; kind: McpSuggestionKind; url: string; docs: string; added: boolean; what: string; view: string }>;
}

export type McpCheck =
  | { ok: true; id: string; entry: McpServerEntry; shows: string; notes: McpRiskNote[]; replaces: boolean }
  | { ok: false; problem: 'name' | 'command' | 'url' | 'exists'; detail?: string };

/** Split a command line the way a shell would: spaces, and "quoted parts" kept whole. */
export function splitCommandLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let any = false;
  for (const ch of line.trim()) {
    if (quote) {
      if (ch === quote) quote = null; else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch; any = true;
    } else if (/\s/.test(ch)) {
      if (cur || any) { out.push(cur); cur = ''; any = false; }
    } else {
      cur += ch;
    }
  }
  if (cur || any) out.push(cur);
  return out;
}

const KEY_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The entry a draft would add, and the secrets to keep for it. */
function entryFromDraft(d: McpDraft): { id: string; entry: McpServerEntry; secrets: Record<string, string> } | { problem: 'name' | 'command' | 'url'; detail?: string } {
  const id = cleanServerId(d.name ?? '');
  if (!d.name?.trim()) return { problem: 'name' };
  const secrets: Record<string, string> = {};
  if (d.kind === 'online') {
    const url = (d.url ?? '').trim();
    const bad = url ? checkServerUrl(url) : 'empty';
    if (bad) return { problem: 'url', detail: url };
    const entry: McpServerEntry = { type: 'http', url };
    const value = (d.headerValue ?? '').trim();
    if (value) {
      const header = (d.headerName ?? '').trim() || 'Authorization';
      const secretName = `${id}.key`;
      // Authorization: "Bearer abc" (or "Token abc") keeps the scheme in the
      // file and only the key in the keychain; a bare key gets Bearer.
      const isAuth = /^authorization$/i.test(header);
      const schemed = isAuth ? /^(\S+)\s+(.+)$/.exec(value) : null;
      secrets[secretName] = schemed ? schemed[2] : value;
      entry.headers = { [header]: isAuth ? `${schemed ? schemed[1] : 'Bearer'} \${secret:${secretName}}` : `\${secret:${secretName}}` };
    }
    return { id, entry, secrets };
  }
  const parts = splitCommandLine(d.commandLine ?? '');
  if (!parts.length || !parts[0]) return { problem: 'command' };
  const entry: McpServerEntry = { command: parts[0], ...(parts.length > 1 ? { args: parts.slice(1) } : {}) };
  const env: Record<string, string> = {};
  for (const k of d.keys ?? []) {
    const name = k.name.trim();
    if (!name && !k.value) continue;
    if (!KEY_NAME.test(name)) return { problem: 'command', detail: name };
    const secretName = `${id}.${name}`;
    secrets[secretName] = k.value;
    env[name] = `\${secret:${secretName}}`;
  }
  if (Object.keys(env).length) entry.env = env;
  return { id, entry, secrets };
}

async function check(d: McpDraft): Promise<McpCheck> {
  const made = entryFromDraft(d);
  if ('problem' in made) return { ok: false, ...made };
  const { file } = await readMcpFile();
  return { ok: true, id: made.id, entry: made.entry, shows: describeEntry(made.entry), notes: riskNotes(made.entry), replaces: !!file.mcpServers[made.id] };
}

async function state(): Promise<McpPageState> {
  const m = McpServers.current();
  const names = new Set(hasMcpKeychain() ? await mcpSecretNames().catch(() => []) : []);
  const servers = m.status().map((s) => ({ ...s, keys: s.secrets.map((name) => ({ name, set: names.has(name) })), docs: docsFor(s) }));
  const toolsOn = servers.filter((s) => s.state === 'ready').reduce((n, s) => n + s.tools.length, 0);
  return {
    servers,
    projectFolder: m.projectFolder,
    problems: m.fileProblems(),
    toolsOn,
    serversOn: servers.filter((s) => s.state === 'ready').length,
    waiting: servers.filter((s) => s.state === 'waiting').length,
    heavy: toolsOn > MCP_HEAVY_TOOLS,
    keychain: hasMcpKeychain(),
    suggested: MCP_SUGGESTIONS.map((g) => ({
      id: g.id, name: g.name, publisher: g.publisher, registry: g.registry, kind: g.kind, url: g.url, docs: g.docs, what: g.what, view: g.view,
      added: servers.some((s) => s.scope === 'user' && (s.id === g.id || s.shows === g.url)),
    })),
  };
}

/** A suggested server as a proposal (the same checks and card as any other). */
function suggestionProposal(id: string, view?: string) {
  const g = MCP_SUGGESTIONS.find((x) => x.id === id);
  if (!g) return null;
  return { name: g.id, url: g.url, keyHeader: g.keyHeader, view: view || g.view, registry: g.registry };
}

export async function mcpPage(op: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const m = McpServers.current();
  const str = (k: string) => String(args[k] ?? '');
  switch (op) {
    case 'state':
      return state();
    case 'enable':
      await m.setEnabled(str('id'), args.on === true);
      return state();
    case 'restart':
      await m.restart(args.scope === 'project' ? 'project' : 'user', str('id'));
      return state();
    case 'remove': {
      const id = str('id');
      const { file } = await readMcpFile();
      const gone = file.mcpServers[id];
      if (!gone) return state();
      // Keys only this server used go with it.
      const stillUsed = new Set(Object.entries(file.mcpServers).filter(([k]) => k !== id).flatMap(([, e]) => secretsUsed(e)));
      await updateMcpFile((f) => { delete f.mcpServers[id]; });
      for (const name of secretsUsed(gone)) if (!stillUsed.has(name)) await setMcpSecret(name, null).catch(() => {});
      await forgetSignIn(mcpAuthKey('user', id, null)).catch(() => {});
      await m.reload();
      return state();
    }
    case 'allow':
      // `inner`: one Unreal tool (Toolset.Tool) behind Unreal's call_tool.
      await m.allowTool(str('avaName'), args.on !== false, undefined, typeof args.inner === 'string' ? args.inner : undefined);
      return state();
    case 'answer': {
      const a = str('answer');
      await m.answerProjectServer(str('id'), a === 'yes' ? 'yes' : a === 'never' ? 'never' : 'not-now');
      return state();
    }
    case 'set_key': {
      const name = str('name');
      await setMcpSecret(name, str('value') || null);
      // A server already running has the old key: start each one that uses it again.
      const users = m.status().filter((s) => s.secrets.includes(name));
      for (const s of users) await m.restart(s.scope, s.id);
      if (!users.length) await m.reload();
      return state();
    }
    case 'sign_in': {
      const w = (args.words ?? {}) as { done?: unknown; failed?: unknown };
      try {
        await m.signIn(args.scope === 'project' ? 'project' : 'user', str('id'), {
          done: typeof w.done === 'string' ? w.done : undefined,
          failed: typeof w.failed === 'string' ? w.failed : undefined,
        });
        return { ok: true, state: await state() };
      } catch (err) {
        return { ok: true, problem: err instanceof Error ? err.message : String(err), state: await state() };
      }
    }
    case 'cancel_signin':
      m.cancelSignIn(args.scope === 'project' ? 'project' : 'user', str('id'));
      return state();
    case 'sign_out':
      await m.signOut(args.scope === 'project' ? 'project' : 'user', str('id'));
      return state();
    case 'import_scan': {
      const sources = await scanMcpImports();
      return {
        sources: sources.map((s) => ({
          app: s.app, appName: MCP_IMPORT_APP_NAMES[s.app], path: s.path, found: s.found, problem: s.problem,
          // Never the keys themselves: only how many would move into his keychain.
          servers: s.servers.map((c) => ({ name: c.name, id: c.id, shows: c.shows, notes: c.notes, online: c.online, here: c.here, keysMoved: Object.keys(c.secrets).length, slots: c.slots })),
        })),
      };
    }
    case 'import': {
      const picks = (Array.isArray(args.picks) ? args.picks : [])
        .map((p) => p as { app?: string; name?: string })
        .filter((p): p is { app: McpImportApp; name: string } => !!p.app && p.app in MCP_IMPORT_APP_NAMES && typeof p.name === 'string');
      const result = await importMcpServers(picks);
      return { ok: true, result, state: await state() };
    }
    case 'check_suggested': {
      const p = suggestionProposal(str('id'));
      if (!p) return { ok: false, problem: 'unknown' };
      const c = await checkProposal(p);
      return c.ok ? { ok: true, id: c.id, shows: c.shows, notes: c.notes, slots: c.slots } : { ok: false, problem: c.problem };
    }
    case 'add_suggested': {
      const p = suggestionProposal(str('id'), typeof args.view === 'string' ? args.view : undefined);
      if (!p) return { ok: false, problem: 'unknown' };
      const c = await checkProposal(p);
      if (!c.ok) return { ok: false, problem: c.problem };
      await addMcpServers([{ id: c.id, entry: c.entry }]);
      return { ok: true, id: c.id, state: await state() };
    }
    // Ava in Unreal's Assistant panel (plan 2026-11-18-unreal, Phase 2): is
    // Ava.exe set up, and set it up (or bring it up to date).
    case 'unreal_panel':
      return unrealProgramState();
    case 'unreal_panel_install':
      try {
        return { ok: true, panel: await installUnrealProgram() };
      } catch (e) {
        return { ok: false, problem: e instanceof Error ? e.message : String(e), panel: await unrealProgramState() };
      }
    case 'open_docs': {
      // Only a page this page was shown: a suggested server's docs, or one of his servers' own.
      const url = str('url');
      const known = MCP_SUGGESTIONS.some((g) => g.docs === url) || m.status().some((s) => docsFor(s) === url);
      if (!known) return { ok: false, problem: 'unknown' };
      try { await openWebPage(url); return { ok: true }; } catch (err) { return { ok: false, problem: err instanceof Error ? err.message : String(err) }; }
    }
    case 'check':
      return check(args.draft as McpDraft);
    case 'add': {
      const d = args.draft as McpDraft;
      const made = entryFromDraft(d);
      if ('problem' in made) return { ok: false, ...made };
      for (const [name, value] of Object.entries(made.secrets)) await setMcpSecret(name, value);
      await updateMcpFile((f) => { f.mcpServers[made.id] = made.entry; });
      await m.reload();
      return { ok: true, id: made.id, state: await state() };
    }
    default:
      throw new Error(`Unknown Connections page request: ${op}`);
  }
}
