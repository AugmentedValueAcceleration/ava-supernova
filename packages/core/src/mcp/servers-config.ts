/**
 * The person's MCP servers — `~/.ava/mcp.json`, shared by the extension and the
 * IDE (plan: Decisions/plans/2026-11-17-mcp-servers.md, Phase 1).
 *
 * The file uses the `mcpServers` shape Claude Desktop, Cursor and Claude Code
 * use, so a server copied from their docs pastes straight in:
 *
 *   { "mcpServers": {
 *       "files":  { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\Users\\me\\Documents"] },
 *       "github": { "type": "http", "url": "https://api.githubcopilot.com/mcp/",
 *                   "headers": { "Authorization": "Bearer ${secret:github}" } } } }
 *
 * Ava's own additions, all optional: `enabled` (default on), `allow` (the
 * server's tools that no longer ask), and `projects` (his yes or no to each
 * project's own servers, tied to the exact command he saw).
 *
 * Secrets are never in this file: `${secret:name}` is read from the keychain
 * (secrets.ts). `${env:NAME}`, `${NAME}`, `${NAME:-default}`, `${userHome}` and
 * `${workspaceFolder}` are expanded as the other apps do.
 *
 * A PROJECT's own `.mcp.json` is somebody else's file until he says yes: its
 * servers wait for him (decision 5), a change to the command takes the yes
 * away, and it can never read his keychain or send his environment to an
 * online address (Claude Code's rule — a cloned repo must not be able to
 * aim his keys at a server it names).
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { AVA_HOME } from '../core/constants.js';

export interface McpServerEntry {
  /** stdio when there's a command; http when there's a url. `sse` for the older web transport. */
  type?: 'stdio' | 'http' | 'sse' | 'streamable-http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  /** Ava: off servers aren't started. Default on. */
  enabled?: boolean;
  /** Ava: the server's tools (its own names) that no longer ask. */
  allow?: string[];
}

export interface McpProjectAnswers {
  /** server id → fingerprint of the exact config he said yes to. */
  approved?: Record<string, string>;
  /** server ids he said never to. */
  never?: string[];
  /** server id → its tools (own names) that no longer ask, in this project. */
  allow?: Record<string, string[]>;
}

export interface McpFile {
  mcpServers: Record<string, McpServerEntry>;
  /** project folder (as Ava saw it) → his answers about that project's servers. */
  projects?: Record<string, McpProjectAnswers>;
}

export const mcpConfigPath = (): string => process.env.AVA_MCP_CONFIG || join(AVA_HOME, 'mcp.json');
export const projectMcpPath = (root: string): string => join(root, '.mcp.json');

/** Server ids become part of tool names: letters, digits, _ and -. */
export function cleanServerId(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'server';
}

function asStringMap(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') out[k] = String(val);
  return out;
}

/** One entry, keeping only what we understand (a bad entry is skipped, not fatal). */
export function readEntry(v: unknown): McpServerEntry | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const e: McpServerEntry = {};
  if (typeof o.type === 'string' && ['stdio', 'http', 'sse', 'streamable-http'].includes(o.type)) e.type = o.type as McpServerEntry['type'];
  if (typeof o.command === 'string' && o.command.trim()) e.command = o.command;
  if (Array.isArray(o.args)) e.args = o.args.filter((a) => typeof a === 'string' || typeof a === 'number').map(String);
  const env = asStringMap(o.env); if (env) e.env = env;
  if (typeof o.cwd === 'string') e.cwd = o.cwd;
  if (typeof o.url === 'string' && o.url.trim()) e.url = o.url.trim();
  const headers = asStringMap(o.headers); if (headers) e.headers = headers;
  if (typeof o.enabled === 'boolean') e.enabled = o.enabled;
  if (o.disabled === true) e.enabled = false; // Cursor / Cline spelling
  if (Array.isArray(o.allow)) e.allow = o.allow.filter((a): a is string => typeof a === 'string');
  if (!e.command && !e.url) return null;
  return e;
}

function readServers(v: unknown): Record<string, McpServerEntry> {
  const out: Record<string, McpServerEntry> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [id, raw] of Object.entries(v as Record<string, unknown>)) {
    const e = readEntry(raw);
    if (e) out[id] = e;
  }
  return out;
}

async function readJson(path: string): Promise<unknown> {
  if (!existsSync(path)) return null;
  const text = await readFile(path, 'utf8');
  if (!text.trim()) return null;
  return JSON.parse(text);
}

/** His servers. A missing file is an empty list; a broken one says so. */
export async function readMcpFile(): Promise<{ file: McpFile; problem?: string }> {
  try {
    const raw = await readJson(mcpConfigPath()) as Record<string, unknown> | null;
    if (!raw) return { file: { mcpServers: {} } };
    // VS Code's own file uses `servers`; accept it too.
    const servers = readServers(raw.mcpServers ?? raw.servers);
    const projects = raw.projects && typeof raw.projects === 'object' ? raw.projects as McpFile['projects'] : undefined;
    return { file: { mcpServers: servers, ...(projects ? { projects } : {}) } };
  } catch (err) {
    return { file: { mcpServers: {} }, problem: `~/.ava/mcp.json couldn't be read: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Change his file. Re-reads it first and writes through a temp file, so the
 * other app's change a moment ago isn't lost and a crash can't leave half a
 * file. Unknown keys he wrote by hand are kept.
 */
export async function updateMcpFile(change: (file: McpFile) => void): Promise<McpFile> {
  const path = mcpConfigPath();
  let raw: Record<string, unknown> = {};
  try { raw = (await readJson(path) as Record<string, unknown> | null) ?? {}; } catch (err) {
    throw new Error(`~/.ava/mcp.json isn't valid JSON, so it wasn't changed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const key = raw.mcpServers ? 'mcpServers' : raw.servers ? 'servers' : 'mcpServers';
  const rawServers = (raw[key] && typeof raw[key] === 'object' ? raw[key] : {}) as Record<string, unknown>;
  const file: McpFile = { mcpServers: readServers(rawServers), projects: (raw.projects as McpFile['projects']) ?? {} };
  change(file);
  // Keep fields we don't understand on entries that still exist.
  const merged: Record<string, unknown> = {};
  for (const [id, e] of Object.entries(file.mcpServers)) {
    const before = rawServers[id] && typeof rawServers[id] === 'object' ? rawServers[id] as Record<string, unknown> : {};
    merged[id] = { ...before, ...e };
    for (const k of ['allow', 'enabled'] as const) if (e[k] === undefined) delete (merged[id] as Record<string, unknown>)[k];
  }
  raw[key] = merged;
  if (file.projects && Object.keys(file.projects).length) raw.projects = file.projects; else delete raw.projects;
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(raw, null, 2) + '\n', 'utf8');
  await rename(tmp, path);
  return file;
}

/** A project's own servers (its `.mcp.json`), or none. */
export async function readProjectServers(root: string): Promise<{ servers: Record<string, McpServerEntry>; problem?: string }> {
  try {
    const raw = await readJson(projectMcpPath(root)) as Record<string, unknown> | null;
    const servers = raw ? readServers(raw.mcpServers ?? raw.servers) : {};
    // A project can't pre-approve its own tools.
    for (const e of Object.values(servers)) { delete e.allow; delete e.enabled; }
    return { servers };
  } catch (err) {
    return { servers: {}, problem: `This project's .mcp.json couldn't be read: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Is this entry an online (web) server rather than a program? */
export const isWebEntry = (e: McpServerEntry): boolean => !!e.url && e.type !== 'stdio';

/** The exact thing he approves — any change to it needs his yes again. */
export function fingerprint(e: McpServerEntry): string {
  const what = { type: e.type ?? null, command: e.command ?? null, args: e.args ?? [], env: e.env ?? {}, cwd: e.cwd ?? null, url: e.url ?? null, headers: e.headers ?? {} };
  return createHash('sha256').update(JSON.stringify(what)).digest('hex').slice(0, 16);
}

/** How the server reads to him: the command line, or the address. Secrets stay as ${secret:…}. */
export function describeEntry(e: McpServerEntry): string {
  if (isWebEntry(e)) return e.url!;
  const quote = (a: string) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  return [e.command ?? '', ...(e.args ?? [])].map(quote).join(' ').trim();
}

const VAR_RE = /\$\{([^}]+)\}/g;

export interface ExpandContext {
  projectRoot?: string | null;
  /** Reads ${secret:name}; undefined when it isn't in the keychain. */
  secret: (name: string) => Promise<string | undefined>;
  /** A project's file: no keychain at all, and nothing from his environment into a web address or header. */
  fromProject: boolean;
}

/** Expand one string. Unknown variables become empty, as in the other apps; missing secrets are reported. */
export async function expandValue(value: string, ctx: ExpandContext, where: 'command' | 'web', missing: string[]): Promise<string> {
  const parts: string[] = [];
  let last = 0;
  for (const m of value.matchAll(VAR_RE)) {
    parts.push(value.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    const name = m[1].trim();
    if (name === 'userHome') { parts.push(homedir()); continue; }
    if (name === 'workspaceFolder') { parts.push(ctx.projectRoot ?? ''); continue; }
    if (name.startsWith('secret:')) {
      const key = name.slice(7).trim();
      if (ctx.fromProject) { missing.push(`${key} (a project's own server can't read your keychain)`); parts.push(''); continue; }
      const v = await ctx.secret(key);
      if (v === undefined) missing.push(key);
      parts.push(v ?? '');
      continue;
    }
    if (ctx.fromProject && where === 'web') { parts.push(''); continue; }
    const envName = name.startsWith('env:') ? name.slice(4) : name;
    const [k, def] = envName.split(':-');
    parts.push(process.env[k.trim()] ?? def ?? '');
  }
  parts.push(value.slice(last));
  return parts.join('');
}

/** The secret names an entry uses. */
export function secretsUsed(e: McpServerEntry): string[] {
  const all = [e.command, ...(e.args ?? []), ...Object.values(e.env ?? {}), e.url, ...Object.values(e.headers ?? {})].filter((s): s is string => !!s);
  const out = new Set<string>();
  for (const s of all) for (const m of s.matchAll(VAR_RE)) if (m[1].trim().startsWith('secret:')) out.add(m[1].trim().slice(7).trim());
  return [...out];
}
