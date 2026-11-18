/**
 * What Ava is asking permission for, in plain words. A permission card is read by
 * people who have never seen a tool name or a line of JSON, and they are being
 * asked to decide something, so it has to say what will happen.
 */

import { cleanServerId, describeEntry, type McpServerEntry } from '../mcp/servers-config.js';
import { riskNotes } from '../mcp/risk.js';
import { splitCommandLine } from '../mcp/page.js';
import { MCP_IMPORT_APP_NAMES, type McpImportApp } from '../mcp/import.js';
import { riskNoteInWords } from './connection-tools.js';
import { isLocalUrl } from '../mcp/connection.js';

const short = (value: unknown, max = 100) => {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const WEIGHTS: Record<number, string> = {
  100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium',
  600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black',
};

const list = (items: string[]) =>
  (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** connection_add's card: the exact command or address, keys he'll set, risks, and her view. */
function connectionAddWords(args: Record<string, unknown>): string {
  const name = cleanServerId(String(args.name ?? ''));
  const url = typeof args.url === 'string' ? args.url.trim() : '';
  const parts = url ? [] : splitCommandLine(String(args.command ?? ''));
  const env = args.settings && typeof args.settings === 'object' ? Object.fromEntries(Object.entries(args.settings as Record<string, unknown>).map(([k, v]) => [k, String(v)])) : undefined;
  const entry: McpServerEntry = url ? { type: 'http', url } : { command: parts[0] ?? '', args: parts.slice(1), ...(env ? { env } : {}) };
  const keys = Array.isArray(args.keys) ? args.keys.map(String) : [];
  if (url && typeof args.key_header === 'string' && args.key_header.trim()) keys.push(`${args.key_header.trim()} (a key)`);
  const where = !url ? 'It runs on this computer, as you.' : isLocalUrl(url) ? 'It is on this computer.' : 'It is online.';
  const lines = [`Add the MCP server "${name}" to your Connections. ${where}`];
  lines.push(url ? `Address: ${url}` : `Runs: ${describeEntry(entry)}`);
  if (env && Object.keys(env).length) lines.push(`Settings: ${Object.entries(env).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  if (keys.length) lines.push(`Keys you'll type on the Connections page (never in the chat): ${keys.join(', ')}`);
  for (const n of riskNotes(entry)) lines.push(`⚠ ${riskNoteInWords(n)}`);
  if (typeof args.view === 'string' && args.view.trim()) lines.push(`Ava's view: ${short(args.view, 600)}`);
  return lines.join('\n');
}

/**
 * A call through a server's call_tool (Unreal Engine puts all its tools behind
 * one): name the tool it runs and with what, not "call tool".
 * "EditorToolset.ActorToolset" + "SpawnActor" → "In Unreal: Spawn Actor (ActorToolset), with …".
 */
function innerToolWords(toolName: string, args: Record<string, unknown>): string | undefined {
  const m = /^mcp_(.+)_call_tool$/.exec(toolName);
  if (!m || typeof args.tool_name !== 'string' || !args.tool_name.trim()) return undefined;
  const server = m[1] === 'unreal' ? 'Unreal' : m[1].replace(/[_-]+/g, ' ');
  const tool = args.tool_name.trim().replace(/[_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  const set = typeof args.toolset_name === 'string' ? args.toolset_name.split('.').pop() : '';
  const inner = args.arguments && typeof args.arguments === 'object' && Object.keys(args.arguments).length
    ? `, with ${short(JSON.stringify(args.arguments), 200)}` : '';
  return `In ${server}: ${tool}${set ? ` (${set})` : ''}${inner}`;
}

/** "design_build_image" → "design build image", for a tool with no words of its own. */
const toolWords = (name: string) => name.replace(/[_-]+/g, ' ').trim();

export function toolRequestInWords(toolName: string, args: Record<string, unknown>): string {
  const file = short(args.file_path ?? args.path, 80);
  switch (toolName) {
    case 'design_install_font': {
      const weights = Array.isArray(args.weights) ? args.weights.map((w) => WEIGHTS[Number(w)]).filter(Boolean) : [];
      return `Install the free ${short(args.family, 60)} font${weights.length ? ` (${list(weights)})` : ''} on your computer. It's openly licensed, and only your user account gets it.`;
    }
    case 'bash': return `Run this command: ${short(args.command)}`;
    case 'file_write': case 'write': return `Create or replace the file ${file}`;
    case 'file_edit': case 'edit': return `Change the file ${file}`;
    case 'list_directory': return `Look through the folder ${file}`;
    case 'web_search': return `Search the web for: ${short(args.query, 80)}`;
    case 'http_request': return `Contact ${short(args.url, 80)}`;
    case 'git_commit': return `Save your changes to Git${args.message ? `: ${short(args.message, 80)}` : ''}`;
    case 'git_create_pr': return `Open a pull request${args.title ? `: ${short(args.title, 80)}` : ''}`;
    case 'present_plan': return `Plan: ${short(args.title ?? 'Untitled')}`;
    case 'health_plan_create': return `${args.status === 'active' ? 'Start' : 'Save as a draft'} the plan "${short(args.title ?? 'Untitled', 80)}"`;
    case 'ask_user': return short(args.question ?? 'Question', 200);
    case 'connection_add': return connectionAddWords(args);
    case 'connection_import': {
      const picks = Array.isArray(args.picks) ? args.picks.map((p) => p as { app?: string; name?: string }) : [];
      const named = picks.map((p) => `${p.name} (from ${MCP_IMPORT_APP_NAMES[p.app as McpImportApp] ?? p.app})`);
      return `Bring ${named.length === 1 ? 'this MCP server' : 'these MCP servers'} into your Connections: ${list(named)}. Their files aren't changed; keys written in them move into your keychain. Each one starts as you, and its tools ask the first time.`;
    }
    case 'connection_search': return `Look up "${short(args.query, 60)}" in the official MCP Registry`;
    case 'brainstorm_session':
      return args.action === 'experience_to_kit'
        ? `Save this brainstorm's experience (what your users should feel) to ${args.kit_id ? 'the brand kit' : 'your project\'s brand kit, or a new kit you agree in the Design Studio'}${args.kit_name ? ` "${short(args.kit_name, 60)}"` : ''}. Every mode designs and writes from the kit.`
        : `Keep this brainstorm (${String(args.action ?? 'save')})`;
    default: return innerToolWords(toolName, args) ?? `Use its "${toolWords(toolName)}" tool`;
  }
}
