/**
 * Bringing in his servers from Claude Desktop, Cursor and VS Code (plan
 * 2026-11-17-mcp-servers, decision 4: only when he asks, never by itself).
 *
 * Their files are read, never changed. What comes across:
 *  - the command or address exactly as it is;
 *  - keys and passwords written in plain text in their files (env values and
 *    headers that look like secrets) MOVE into his keychain, and the entry
 *    says `${secret:<server>.<NAME>}` instead;
 *  - VS Code's `${input:…}` (asked for each time there) becomes a key slot he
 *    fills on the Connections page: its value was never in the file.
 *
 * A scan never reveals a secret: what it shows has them swapped out already.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { cleanServerId, describeEntry, fingerprint, isWebEntry, readEntry, readMcpFile, type McpServerEntry } from './servers-config.js';
import { redactSecrets, riskNotes, type McpRiskNote } from './risk.js';

export type McpImportApp = 'claude-desktop' | 'cursor' | 'vscode';

export const MCP_IMPORT_APP_NAMES: Record<McpImportApp, string> = {
  'claude-desktop': 'Claude Desktop',
  cursor: 'Cursor',
  vscode: 'VS Code',
};

/** Where each app keeps its servers, on this computer. */
export function mcpImportPaths(platform = process.platform, home = homedir(), env = process.env): Record<McpImportApp, string> {
  const appData = env.APPDATA || join(home, 'AppData', 'Roaming');
  const support = platform === 'win32' ? appData : platform === 'darwin' ? join(home, 'Library', 'Application Support') : (env.XDG_CONFIG_HOME || join(home, '.config'));
  return {
    'claude-desktop': join(support, 'Claude', 'claude_desktop_config.json'),
    cursor: join(home, '.cursor', 'mcp.json'),
    vscode: join(support, 'Code', 'User', 'mcp.json'),
  };
}

export interface McpImportCandidate {
  app: McpImportApp;
  /** Its name there. */
  name: string;
  /** Its name here (letters, digits, _ and -). */
  id: string;
  entry: McpServerEntry;
  /** Keys that move into the keychain: name → value. Never shown. */
  secrets: Record<string, string>;
  /** Key slots he fills on the page (VS Code inputs). */
  slots: string[];
  shows: string;
  notes: McpRiskNote[];
  online: boolean;
  /** Already in his list here: 'same' (nothing to do) or 'different' (the name is taken). */
  here: 'no' | 'same' | 'different';
}

export interface McpImportSource {
  app: McpImportApp;
  path: string;
  found: boolean;
  problem?: string;
  servers: McpImportCandidate[];
}

const SECRET_NAME = /pass(word|wd)?|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credential|auth|pat$/i;
const SECRET_VALUE = /^(ghp_|github_pat_|sk-|xox[abpr]-|AKIA|AIza|glpat-|npm_)/;

/** Turn one of their entries into ours, moving secrets out. */
function convert(app: McpImportApp, name: string, raw: unknown): Omit<McpImportCandidate, 'here'> | null {
  const e = readEntry(raw);
  if (!e) return null;
  const id = cleanServerId(name);
  const secrets: Record<string, string> = {};
  const slots: string[] = [];
  // VS Code: ${input:x} was asked for each time; here it's a key he sets once.
  const inputs = (v: string) => v.replace(/\$\{input:([^}]+)\}/g, (_m, x: string) => {
    const slot = `${id}.${cleanServerId(x)}`;
    if (!slots.includes(slot)) slots.push(slot);
    return `\${secret:${slot}}`;
  });
  if (e.env) {
    for (const [k, v] of Object.entries(e.env)) {
      if (v.includes('${')) { e.env[k] = inputs(v); continue; }
      if (v && (SECRET_NAME.test(k) || SECRET_VALUE.test(v))) {
        const slot = `${id}.${k}`;
        secrets[slot] = v;
        e.env[k] = `\${secret:${slot}}`;
      }
    }
  }
  if (e.headers) {
    for (const [k, v] of Object.entries(e.headers)) {
      if (v.includes('${')) { e.headers[k] = inputs(v); continue; }
      const schemed = /^(Bearer|Token|Basic)\s+(.+)$/i.exec(v);
      if (schemed || /authorization|api[-_]?key|token|secret/i.test(k)) {
        const slot = `${id}.${cleanServerId(k)}`;
        secrets[slot] = schemed ? schemed[2] : v;
        e.headers[k] = schemed ? `${schemed[1]} \${secret:${slot}}` : `\${secret:${slot}}`;
      }
    }
  }
  if (e.args) e.args = e.args.map(inputs);
  if (e.url) e.url = inputs(e.url);
  // Their on/off and allow lists are theirs: he decides here afresh.
  delete e.enabled;
  delete e.allow;
  // What's shown has any key or password left in the command masked.
  const notes = riskNotes(e).map((n) => (n.code === 'plain-secret' && n.detail ? { ...n, detail: redactSecrets(n.detail) } : n));
  return { app, name, id, entry: e, secrets, slots, shows: redactSecrets(describeEntry(e)), notes, online: isWebEntry(e) };
}

/** What each app has, ready to bring in. Reads only. */
export async function scanMcpImports(paths: Record<McpImportApp, string> = mcpImportPaths()): Promise<McpImportSource[]> {
  const mine = (await readMcpFile()).file.mcpServers;
  const out: McpImportSource[] = [];
  for (const app of Object.keys(paths) as McpImportApp[]) {
    const path = paths[app];
    const src: McpImportSource = { app, path, found: existsSync(path), servers: [] };
    out.push(src);
    if (!src.found) continue;
    try {
      const text = await readFile(path, 'utf8');
      const json = text.trim() ? JSON.parse(stripJsonComments(text)) as Record<string, unknown> : {};
      const servers = (json.mcpServers ?? json.servers ?? {}) as Record<string, unknown>;
      for (const [name, raw] of Object.entries(servers)) {
        const c = convert(app, name, raw);
        if (!c) continue;
        const have = mine[c.id];
        src.servers.push({ ...c, here: !have ? 'no' : fingerprint(have) === fingerprint(c.entry) ? 'same' : 'different' });
      }
    } catch (err) {
      src.problem = err instanceof Error ? err.message : String(err);
    }
  }
  return out;
}

/** VS Code's files may carry comments and trailing commas. */
function stripJsonComments(text: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === '\\') { out += text[++i] ?? ''; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}
