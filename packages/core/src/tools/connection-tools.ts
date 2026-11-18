/**
 * Ava sets up his MCP servers (plan 2026-11-17-mcp-servers, Phase 4).
 *
 *   connection_search  the official MCP Registry: who publishes a server (verified
 *                      namespace), its repository, the exact package and version,
 *                      which keys it needs — the core of her research
 *   connection_list    his servers and where each one is
 *   connection_add     add one, with her view — ALWAYS shows him the card first
 *   connection_import  what Claude Desktop, Cursor and VS Code have (scan), and
 *                      bringing in the ones he picks (always asks)
 *
 * Not named mcp_*: that prefix is the servers' OWN tools (permissions.ts).
 * Keys are never taken in the chat (mcp/setup.ts): she names them, he types
 * them on the Connections page.
 */

import type { FunctionSchema } from '../providers/types.js';
import type { Tool, ToolExecutionContext, ToolResult, ToolRiskLevel } from './types.js';
import { searchMcpRegistry } from '../mcp/registry.js';
import { McpServers } from '../mcp/manager.js';
import {
  addMcpServers, checkProposal, importMcpServers, settleMcpServers, statusInWords, type McpProposal,
} from '../mcp/setup.js';
import { MCP_IMPORT_APP_NAMES, scanMcpImports, type McpImportApp } from '../mcp/import.js';
import { describeEntry } from '../mcp/servers-config.js';
import { redactSecrets, type McpRiskNote } from '../mcp/risk.js';
import { MCP_SUGGESTIONS } from '../mcp/suggested.js';

/** The suggested servers he doesn't have yet, for Ava. */
function suggestionsInWords(have: Array<{ id: string; shows: string }>): string {
  const left = MCP_SUGGESTIONS.filter((g) => !have.some((s) => s.id === g.id || s.shows === g.url));
  if (!left.length) return '';
  const how = { open: 'free, no account', signin: 'free account; he signs in on the page', key: 'free account; he pastes a key on the page', local: 'free, no account; part of a program on his computer, which must be open' } as const;
  return '\nSuggested servers (checked, free, official; he can add any with connection_add using this exact address'
    + ' — or from the Suggested list on the Connections page):\n'
    + left.map((g) => `• ${g.id} — ${g.name} by ${g.publisher}: ${g.what} ${g.url} (${how[g.kind]}${g.keyHeader ? `; key_header "${g.keyHeader}"` : ''}). Your view: ${g.view}`).join('\n');
}

/** The risk notes in words (the page says them in his language; the card and Ava read these). */
export function riskNoteInWords(n: McpRiskNote): string {
  const d = n.detail ?? '';
  switch (n.code) {
    case 'admin': return 'It asks for administrator rights.';
    case 'deletes': return 'It deletes files or folders.';
    case 'download-run': return 'It downloads a script and runs it.';
    case 'hidden': return 'It runs a hidden (encoded) command.';
    case 'keys-folder': return `It can reach a folder with SSH or cloud keys: ${d}`;
    case 'whole-home': return `It can reach the whole home folder or drive (${d}).`;
    case 'plain-secret': return `A key or password is written in plain text${d ? ` (${redactSecrets(d)})` : ''}.`;
    case 'latest': return `It fetches the newest version of ${d} each time it starts.`;
    case 'online': return `What Ava gives it is sent to ${d}.`;
    case 'bad-url': return "The address won't be used: a server that isn't on this computer needs https.";
  }
}

function proposalFrom(args: Record<string, unknown>): McpProposal {
  const s = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : undefined);
  const settings = args.settings && typeof args.settings === 'object' && !Array.isArray(args.settings)
    ? Object.fromEntries(Object.entries(args.settings as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
    : undefined;
  return {
    name: s('name') ?? '',
    command: s('command'),
    url: s('url'),
    keys: Array.isArray(args.keys) ? args.keys.map(String) : undefined,
    keyHeader: s('key_header'),
    settings,
    view: s('view'),
    registry: s('registry_name'),
    repository: s('repository'),
  };
}

// ── connection_search ──────────────────────────────────────────────────────

export class ConnectionSearchTool implements Tool {
  readonly name = 'connection_search';
  readonly description = 'Look a server up in the official MCP Registry';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly outputTrust = 'untrusted' as const;
  readonly requiresConfirmation = false;
  readonly schema: FunctionSchema = {
    name: 'connection_search',
    description:
      'Search the official MCP Registry for an MCP server, before suggesting one. It matches server NAMES, not descriptions: search a product or company '
      + '("github", "notion", "postgres") or a publisher namespace ("io.github.github/"). Each result says who published it — the registry verified '
      + 'that namespace (io.github.<account>/ by that GitHub account, com.example/ by that domain) — plus its repository, the exact package and '
      + 'version with the command that runs it, any online address, and the keys it needs (and which are secret). A listing proves the publisher, '
      + 'not that the code is safe; not being listed is not proof of harm. Prefer the product\'s OWN publisher over a third party\'s wrapper.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A name or publisher namespace to look for.' },
      },
      required: ['query'],
    },
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const query = String(args.query ?? '').trim();
    if (!query) return { success: false, output: 'Say what to look for.' };
    try {
      const found = await searchMcpRegistry(query, 8);
      if (!found.length) return { success: true, output: `Nothing in the MCP Registry has "${query}" in its name. Try the product's or company's name, or search the web for its official MCP server.` };
      const lines = found.map((s) => {
        const out = [`• ${s.name} v${s.version} — published by ${s.publisher} (verified by the registry). ${s.description}`];
        if (s.repository) out.push(`  repository: ${s.repository}`);
        if (s.status !== 'active') out.push(`  registry status: ${s.status}`);
        for (const p of s.packages) {
          out.push(`  package: ${p.registryType} ${p.identifier}${p.version ? ` ${p.version}` : ''} (${p.transport})${p.command ? ` — runs as: ${p.command.join(' ')}` : ''}`);
          for (const e of p.env) out.push(`    env ${e.name}${e.secret ? ' [SECRET — a key he sets]' : ''}${e.required ? ' [required]' : ''}${e.description ? `: ${e.description}` : ''}`);
        }
        for (const r of s.remotes) {
          out.push(`  online: ${r.url} (${r.type})`);
          for (const h of r.headers) out.push(`    header ${h.name}${h.secret ? ' [SECRET — a key he sets]' : ''}${h.required ? ' [required]' : ''}${h.description ? `: ${h.description}` : ''}`);
        }
        return out.join('\n');
      });
      return { success: true, output: `MCP Registry results for "${query}":\n${lines.join('\n')}` };
    } catch (err) {
      return { success: false, output: `The MCP Registry couldn't be reached: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ── connection_list ────────────────────────────────────────────────────────

export class ConnectionListTool implements Tool {
  readonly name = 'connection_list';
  readonly description = 'List his MCP servers and how each is doing';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;
  readonly schema: FunctionSchema = {
    name: 'connection_list',
    description: 'List the MCP servers he has connected (his own, and this project\'s), with each one\'s state, tools and your earlier view of it — and the checked, free, official servers Ava suggests that he hasn\'t added yet. Look here first when he asks to connect something.',
    parameters: { type: 'object', properties: {} },
  };

  async execute(): Promise<ToolResult> {
    const m = McpServers.current();
    if (!m.isStarted) await m.start();
    const all = m.status();
    const mine = all.filter((s) => s.scope === 'user');
    if (!all.length) return { success: true, output: `He has no MCP servers yet. They live on the Connections page (and in ~/.ava/mcp.json).${suggestionsInWords([])}` };
    const lines = all.map((s) => {
      const parts = [`• ${s.id} (${s.scope === 'user' ? 'his' : "this project's"}) — ${statusInWords(s)}`, `  ${s.online ? 'address' : 'command'}: ${redactSecrets(s.shows)}`];
      if (s.ava?.view) parts.push(`  your view: ${s.ava.view}`);
      if (s.ava?.from) parts.push(`  brought in from ${s.ava.from}`);
      return parts.join('\n');
    });
    const problems = m.fileProblems();
    return { success: true, output: `${lines.join('\n')}${problems.length ? `\nProblems: ${problems.join('; ')}` : ''}${suggestionsInWords(mine)}` };
  }
}

// ── connection_add ─────────────────────────────────────────────────────────

export class ConnectionAddTool implements Tool {
  readonly name = 'connection_add';
  readonly description = 'Add an MCP server to his list (he sees it first)';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = true;
  readonly schema: FunctionSchema = {
    name: 'connection_add',
    description:
      'Add an MCP server to his Connections. He ALWAYS sees a card first with the exact command or address, the risks and your view, and says yes or no. '
      + 'Research it first (connection_search; web_search for its docs): who publishes it, what its tools can reach, what it costs him in risk. '
      + 'Give either `command` (a server on this computer — the whole command line, pinned to a version where you can, e.g. "npx -y @scope/pkg@1.2.3") '
      + 'or `url` (an online server, https). NEVER ask him for a key or password in the chat — anything typed here goes to his AI provider. Put secret '
      + 'environment variable NAMES in `keys` (or `key_header` for an online server\'s fixed key); he types the values on the Connections page. '
      + 'An online server that uses a sign-in needs no key: he clicks Sign in on the page.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short name (letters, digits, - and _), e.g. "github".' },
        command: { type: 'string', description: 'The whole command line, for a server on this computer.' },
        url: { type: 'string', description: 'The address, for an online server.' },
        keys: { type: 'array', items: { type: 'string' }, description: 'Names of SECRET environment variables it needs (values: he sets them on the page).' },
        key_header: { type: 'string', description: 'Online only: the header for a fixed key (e.g. "Authorization"); he sets the value on the page.' },
        settings: { type: 'object', description: 'Environment variables that are NOT secret (a folder, a region), name → value.' },
        view: { type: 'string', description: 'Your honest view in 1-3 sentences, shown on its card: who publishes it, what it can reach, and anything to watch.' },
        registry_name: { type: 'string', description: 'Its name in the MCP Registry, if it is listed.' },
        repository: { type: 'string', description: 'Its source repository, if known.' },
      },
      required: ['name', 'view'],
    },
  };

  async precheck(args: Record<string, unknown>): Promise<{ ok: true } | { ok: false; output: string }> {
    const c = await checkProposal(proposalFrom(args));
    return c.ok ? { ok: true } : { ok: false, output: `Not added: ${c.problem} (He hasn't seen a card.)` };
  }

  deniedMessage(reason: string | null): string {
    return `He said no to adding this server${reason ? `: "${reason}"` : ''}. Nothing was added.`;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const c = await checkProposal(proposalFrom(args));
    if (!c.ok) return { success: false, output: `Not added: ${c.problem}` };
    if (!McpServers.current().isStarted) await McpServers.current().start();
    await addMcpServers([{ id: c.id, entry: c.entry }]);
    const [s] = await settleMcpServers([c.id]);
    const keys = c.slots.length ? ` He sets ${c.slots.length === 1 ? 'its key' : 'its keys'} (${c.slots.join(', ')}) on the Connections page: never ask for ${c.slots.length === 1 ? 'it' : 'them'} here.` : '';
    return { success: true, output: `Added "${c.id}" (${describeEntry(c.entry)}). Now: ${s ? statusInWords(s) : 'starting'}.${keys} Every one of its tools asks him the first time.` };
  }
}

// ── connection_import ──────────────────────────────────────────────────────

const APPS = Object.keys(MCP_IMPORT_APP_NAMES) as McpImportApp[];

export class ConnectionImportTool implements Tool {
  readonly name = 'connection_import';
  readonly description = 'Bring in his servers from Claude Desktop, Cursor or VS Code';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false; // `bring_in` always asks (ToolRegistry.needsConfirmation)
  readonly schema: FunctionSchema = {
    name: 'connection_import',
    description:
      'ONLY when he asks: bring in MCP servers he set up in Claude Desktop, Cursor or VS Code. action "scan" lists what each app has (their files are only read; '
      + 'keys in them are never shown). action "bring_in" with `picks` adds the ones he chose — he sees a card first; keys written in their files move into '
      + 'his keychain, never through the chat.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['scan', 'bring_in'] },
        picks: {
          type: 'array',
          description: 'For bring_in: the servers to bring in, by app and their name there (from scan).',
          items: { type: 'object', properties: { app: { type: 'string', enum: APPS }, name: { type: 'string' } }, required: ['app', 'name'] },
        },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    if (args.action === 'bring_in') {
      const picks = (Array.isArray(args.picks) ? args.picks : [])
        .map((p) => p as { app?: string; name?: string })
        .filter((p): p is { app: McpImportApp; name: string } => APPS.includes(p.app as McpImportApp) && typeof p.name === 'string');
      if (!picks.length) return { success: false, output: 'Say which servers to bring in (scan first).' };
      if (!McpServers.current().isStarted) await McpServers.current().start();
      const r = await importMcpServers(picks);
      const states = await settleMcpServers(r.added.map((a) => a.id), 20_000);
      const lines = r.added.map((a) => {
        const s = states.find((x) => x.id === a.id);
        return `• ${a.id} from ${a.from}${a.keysMoved ? ` (${a.keysMoved} key${a.keysMoved === 1 ? '' : 's'} moved into his keychain)` : ''} — ${s ? statusInWords(s) : 'starting'}${a.keysToSet.length ? `; he sets ${a.keysToSet.join(', ')} on the Connections page` : ''}`;
      });
      for (const k of r.skipped) lines.push(`• skipped ${k.name} from ${k.app}: ${k.why}`);
      return { success: true, output: lines.join('\n') || 'Nothing was brought in.' };
    }
    const sources = await scanMcpImports();
    const lines: string[] = [];
    for (const src of sources) {
      const app = MCP_IMPORT_APP_NAMES[src.app];
      if (!src.found) { lines.push(`${app}: not set up on this computer.`); continue; }
      if (src.problem) { lines.push(`${app}: its file couldn't be read (${src.problem}).`); continue; }
      if (!src.servers.length) { lines.push(`${app}: no servers.`); continue; }
      lines.push(`${app}:`);
      for (const c of src.servers) {
        const here = c.here === 'same' ? ' — already in his list' : c.here === 'different' ? ` — he already has a different "${c.id}" (it would come in as "${c.id}-${c.app}")` : '';
        const risks = c.notes.filter((n) => n.code !== 'online').map(riskNoteInWords);
        lines.push(`• ${c.name}: ${c.shows}${here}${Object.keys(c.secrets).length ? ` (${Object.keys(c.secrets).length} key(s) would move into his keychain)` : ''}${risks.length ? `\n  ⚠ ${risks.join(' ')}` : ''}`);
      }
    }
    return { success: true, output: lines.join('\n') };
  }
}
