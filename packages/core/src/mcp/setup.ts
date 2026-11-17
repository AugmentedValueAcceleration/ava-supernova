/**
 * Adding servers — shared by Ava's tools (tools/connection-tools.ts) and the
 * Connections page (plan 2026-11-17-mcp-servers, Phase 4).
 *
 * Ava never handles a key's VALUE: anything typed in the chat goes to his AI
 * provider. She names the keys a server needs; the entry gets
 * `${secret:<server>.<NAME>}` slots, the server shows "needs a key", and he
 * types the value on the Connections page (straight into the keychain).
 * Imported servers are the exception that proves it: their keys move from
 * the other app's file into the keychain without ever passing through her.
 */

import { McpServers, type McpServerStatus } from './manager.js';
import {
  cleanServerId, describeEntry, readMcpFile, updateMcpFile, type McpAvaNote, type McpServerEntry,
} from './servers-config.js';
import { setMcpSecret } from './secrets.js';
import { checkServerUrl } from './connection.js';
import { redactSecrets, riskNotes, type McpRiskNote } from './risk.js';
import { splitCommandLine } from './page.js';
import { MCP_IMPORT_APP_NAMES, mcpImportPaths, scanMcpImports, type McpImportApp } from './import.js';

export interface McpProposal {
  /** What to call it (becomes its id: letters, digits, _ and -). */
  name: string;
  /** The whole command line, for a server on this computer. */
  command?: string;
  /** Its address, for an online server. */
  url?: string;
  /** Environment variables it needs that are SECRET: names only, he sets the values. */
  keys?: string[];
  /** An online server's fixed-key header (e.g. Authorization), value set by him. */
  keyHeader?: string;
  /** Environment variables that are NOT secret (a folder, a region…). */
  settings?: Record<string, string>;
  /** Her view, shown on its card. */
  view?: string;
  registry?: string;
  repository?: string;
}

export type McpProposalCheck =
  | { ok: true; id: string; entry: McpServerEntry; shows: string; notes: McpRiskNote[]; slots: string[] }
  | { ok: false; problem: string };

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The entry a proposal would add, or what's wrong with it. Writes nothing. */
export async function checkProposal(p: McpProposal): Promise<McpProposalCheck> {
  if (!p.name?.trim()) return { ok: false, problem: 'It needs a name.' };
  const id = cleanServerId(p.name);
  const slots: string[] = [];
  let entry: McpServerEntry;
  if (p.url?.trim()) {
    const url = p.url.trim();
    const bad = checkServerUrl(url);
    if (bad) return { ok: false, problem: bad };
    entry = { type: 'http', url };
    if (p.keyHeader?.trim()) {
      const header = p.keyHeader.trim();
      const slot = `${id}.key`;
      slots.push(slot);
      entry.headers = { [header]: /^authorization$/i.test(header) ? `Bearer \${secret:${slot}}` : `\${secret:${slot}}` };
    }
  } else if (p.command?.trim()) {
    const parts = splitCommandLine(p.command);
    if (!parts[0]) return { ok: false, problem: 'The command is empty.' };
    entry = { command: parts[0], ...(parts.length > 1 ? { args: parts.slice(1) } : {}) };
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(p.settings ?? {})) {
      if (!ENV_NAME.test(k)) return { ok: false, problem: `"${k}" isn't a usable setting name.` };
      env[k] = String(v);
    }
    for (const k of p.keys ?? []) {
      if (!ENV_NAME.test(k)) return { ok: false, problem: `"${k}" isn't a usable key name.` };
      const slot = `${id}.${k}`;
      slots.push(slot);
      env[k] = `\${secret:${slot}}`;
    }
    if (Object.keys(env).length) entry.env = env;
  } else {
    return { ok: false, problem: 'It needs a command (a server on this computer) or an address (an online server).' };
  }
  const ava: McpAvaNote = {};
  if (p.view?.trim()) ava.view = p.view.trim().slice(0, 1200);
  if (p.registry?.trim()) ava.registry = p.registry.trim().slice(0, 200);
  if (p.repository?.trim()) ava.repository = p.repository.trim().slice(0, 300);
  if (Object.keys(ava).length) entry.ava = { ...ava, at: new Date().toISOString() };
  const { file } = await readMcpFile();
  if (file.mcpServers[id]) return { ok: false, problem: `He already has a server called "${id}". Use another name, or he can remove that one on the Connections page.` };
  return { ok: true, id, entry, shows: describeEntry(entry), notes: riskNotes(entry), slots };
}

/** Add servers (and keep any keys that came with them), then start them. */
export async function addMcpServers(items: Array<{ id: string; entry: McpServerEntry; secrets?: Record<string, string> }>): Promise<void> {
  for (const it of items) for (const [name, value] of Object.entries(it.secrets ?? {})) await setMcpSecret(name, value);
  await updateMcpFile((f) => { for (const it of items) f.mcpServers[it.id] = it.entry; });
  await McpServers.current().reload();
}

/** Wait (up to `ms`) for these servers to finish starting, and say where they got to. */
export async function settleMcpServers(ids: string[], ms = 30_000): Promise<McpServerStatus[]> {
  const m = McpServers.current();
  const mine = () => m.status().filter((s) => s.scope === 'user' && ids.includes(s.id));
  const end = Date.now() + ms;
  while (Date.now() < end && mine().some((s) => s.state === 'connecting')) await new Promise((r) => setTimeout(r, 200));
  return mine();
}

export interface McpImportResult {
  added: Array<{ id: string; from: string; keysMoved: number; keysToSet: string[] }>;
  skipped: Array<{ app: string; name: string; why: string }>;
}

/** Bring in the servers he picked from the other apps. */
export async function importMcpServers(picks: Array<{ app: McpImportApp; name: string }>, paths = mcpImportPaths()): Promise<McpImportResult> {
  const sources = await scanMcpImports(paths);
  const { file } = await readMcpFile();
  const taken = new Set(Object.keys(file.mcpServers));
  const result: McpImportResult = { added: [], skipped: [] };
  const items: Array<{ id: string; entry: McpServerEntry; secrets: Record<string, string> }> = [];
  for (const pick of picks) {
    const appName = MCP_IMPORT_APP_NAMES[pick.app] ?? pick.app;
    const c = sources.find((s) => s.app === pick.app)?.servers.find((x) => x.name === pick.name);
    if (!c) { result.skipped.push({ app: appName, name: pick.name, why: 'not found there' }); continue; }
    if (c.here === 'same') { result.skipped.push({ app: appName, name: pick.name, why: 'already in your list' }); continue; }
    let id = c.id;
    if (taken.has(id)) id = cleanServerId(`${c.id}-${pick.app}`);
    if (taken.has(id)) { result.skipped.push({ app: appName, name: pick.name, why: `the name "${c.id}" is taken` }); continue; }
    taken.add(id);
    // Renamed: its key slots follow the new name.
    const rename = (v: string) => (id === c.id ? v : v.split(`\${secret:${c.id}.`).join(`\${secret:${id}.`));
    const entry: McpServerEntry = JSON.parse(rename(JSON.stringify(c.entry)));
    const secrets = Object.fromEntries(Object.entries(c.secrets).map(([k, v]) => [id === c.id ? k : `${id}.${k.slice(c.id.length + 1)}`, v]));
    entry.ava = { from: appName, at: new Date().toISOString() };
    items.push({ id, entry, secrets });
    result.added.push({
      id, from: appName, keysMoved: Object.keys(secrets).length,
      keysToSet: c.slots.map((s) => (id === c.id ? s : `${id}.${s.slice(c.id.length + 1)}`)),
    });
  }
  if (items.length) await addMcpServers(items);
  return result;
}

/** A status in plain words, for Ava. */
export function statusInWords(s: McpServerStatus): string {
  const where = s.online ? 'online' : 'on this computer';
  switch (s.state) {
    case 'ready': return `running (${where}), ${s.tools.length} tool${s.tools.length === 1 ? '' : 's'}: ${s.tools.map((t) => t.name).join(', ')}`;
    case 'connecting': return 'still starting';
    case 'needs-key': return `waiting for ${s.missing?.length === 1 ? 'a key' : 'keys'} he sets on the Connections page: ${(s.missing ?? []).join(', ')}`;
    case 'needs-signin': return 'waiting for him to sign in (Sign in button on the Connections page)';
    case 'waiting': return "a project's server, waiting for his yes on the Connections page";
    case 'off': return 'switched off';
    default: return `couldn't start: ${redactSecrets(s.message ?? 'no reason given')}`;
  }
}
