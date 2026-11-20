// Ava sets up his MCP servers (plan 2026-11-17-mcp-servers, Phase 4): the
// registry look-up (a fake reply — nothing goes online), bringing servers in
// from Claude Desktop / Cursor / VS Code (fake files in a temp folder), her
// connection_* tools, and keeping every secret out of what reaches the AI.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  McpServers, setMcpKeychain, getMcpSecret, readMcpFile, searchMcpRegistry, clearMcpRegistryCache,
  scanMcpImports, importMcpServers, redactSecrets, mcpPage, type McpImportApp,
} from '../src/mcp/index.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import { toolPassesModeGate, MODE_ALLOWED_TOOLS } from '../src/agent/agent.js';
import { toolRequestInWords } from '../src/tools/tool-request-words.js';

const SERVER = join(__dirname, 'fixtures', 'mcp-test-server.mjs');
const node = process.execPath;

let dir: string;
let blob: string | null = null;
let paths: Record<McpImportApp, string>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ava-mcp-setup-'));
  process.env.AVA_MCP_CONFIG = join(dir, 'mcp.json');
  blob = null;
  setMcpKeychain({ read: async () => blob, write: async (v) => { blob = v; } });
  McpServers.reset();
  paths = { 'claude-desktop': join(dir, 'claude', 'cfg.json'), cursor: join(dir, 'cursor', 'mcp.json'), vscode: join(dir, 'code', 'mcp.json') };
  for (const p of Object.values(paths)) mkdirSync(join(p, '..'), { recursive: true });
});

afterEach(async () => {
  await McpServers.current().stopAll();
  McpServers.reset();
  delete process.env.AVA_MCP_CONFIG;
  rmSync(dir, { recursive: true, force: true });
});

describe('the MCP Registry look-up', () => {
  const reply = {
    servers: [{
      server: {
        name: 'io.github.github/github-mcp-server', description: 'GitHub', version: '0.17.0',
        repository: { url: 'https://github.com/github/github-mcp-server' },
        packages: [{ registryType: 'oci', identifier: 'ghcr.io/github/github-mcp-server', version: '0.17.0', transport: { type: 'stdio' },
          environmentVariables: [{ name: 'GITHUB_PERSONAL_ACCESS_TOKEN', isSecret: true, isRequired: true }] }],
      },
      _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active' } },
    }, {
      server: { name: 'com.example/notes', version: '1.2.0', packages: [{ registryType: 'npm', identifier: '@example/notes-mcp', version: '1.2.0', transport: { type: 'stdio' } }],
        remotes: [{ type: 'streamable-http', url: 'https://mcp.example.com/mcp', headers: [{ name: 'Authorization', isSecret: true }] }] },
    }],
  };

  it('says who published each server, and the pinned command that runs it', async () => {
    clearMcpRegistryCache();
    const asked: string[] = [];
    const fake = (async (u: string) => { asked.push(String(u)); return new Response(JSON.stringify(reply)); }) as unknown as typeof fetch;
    const [gh, notes] = await searchMcpRegistry('github', 8, fake);
    expect(asked[0]).toMatch(/^https:\/\/registry\.modelcontextprotocol\.io\/v0\.1\/servers\?search=github&version=latest/);
    expect(gh).toMatchObject({ publisher: 'the GitHub account "github"', verifiedBy: 'github-account', status: 'active', repository: 'https://github.com/github/github-mcp-server' });
    expect(gh.packages[0].command).toEqual(['docker', 'run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'ghcr.io/github/github-mcp-server:0.17.0']);
    expect(gh.packages[0].env[0]).toMatchObject({ secret: true, required: true });
    expect(notes).toMatchObject({ publisher: 'the domain example.com', verifiedBy: 'domain' });
    expect(notes.packages[0].command).toEqual(['npx', '-y', '@example/notes-mcp@1.2.0']);
    expect(notes.remotes[0].headers[0]).toMatchObject({ name: 'Authorization', secret: true });
    // Asked again soon: kept, not fetched again (the registry asks apps not to hammer it).
    await searchMcpRegistry('github', 8, fake);
    expect(asked).toHaveLength(1);
  });
});

describe('bringing servers in from his other apps', () => {
  beforeEach(() => {
    writeFileSync(paths['claude-desktop'], JSON.stringify({ mcpServers: {
      files: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:\\Docs'] },
      github: { command: 'docker', args: ['run', '-i', '--rm', 'ghcr.io/github/github-mcp-server'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_abcdefghijklmnopqrstuvwxyz0123' } },
      db: { command: 'npx', args: ['-y', 'pg-mcp', 'postgresql://me:hunter2pass@db.local/app'] },
    } }));
    writeFileSync(paths.cursor, JSON.stringify({ mcpServers: { linear: { url: 'https://mcp.linear.app/mcp', headers: { Authorization: 'Bearer lin_api_secretvalue123' } } } }));
    writeFileSync(paths.vscode, `{
      // VS Code allows comments
      "inputs": [{ "id": "notion-key", "type": "promptString", "password": true }],
      "servers": { "notion": { "command": "npx", "args": ["-y", "notion-mcp"], "env": { "NOTION_TOKEN": "\${input:notion-key}" } }, },
    }`);
  });

  it('scans without ever showing a key, and says what would move into the keychain', async () => {
    const sources = await scanMcpImports(paths);
    const all = JSON.stringify(sources.map((s) => ({ ...s, servers: s.servers.map(({ secrets: _s, entry: _e, ...shown }) => shown) })));
    expect(all).not.toMatch(/ghp_abcdef|hunter2pass|lin_api_secret/);
    const claude = sources.find((s) => s.app === 'claude-desktop')!;
    expect(claude.servers.map((s) => s.name)).toEqual(['files', 'github', 'db']);
    const gh = claude.servers.find((s) => s.name === 'github')!;
    expect(gh.entry.env).toEqual({ GITHUB_PERSONAL_ACCESS_TOKEN: '${secret:github.GITHUB_PERSONAL_ACCESS_TOKEN}' });
    expect(gh.secrets).toEqual({ 'github.GITHUB_PERSONAL_ACCESS_TOKEN': 'ghp_abcdefghijklmnopqrstuvwxyz0123' });
    expect(claude.servers.find((s) => s.name === 'db')!.shows).toContain('postgresql://me:•••@db.local/app');
    const linear = sources.find((s) => s.app === 'cursor')!.servers[0];
    expect(linear.entry.headers).toEqual({ Authorization: 'Bearer ${secret:linear.Authorization}' });
    const notion = sources.find((s) => s.app === 'vscode')!.servers[0];
    expect(notion.entry.env).toEqual({ NOTION_TOKEN: '${secret:notion.notion-key}' });
    expect(notion.slots).toEqual(['notion.notion-key']);
  });

  it('brings in what he picked: keys into the keychain, never the file; a taken name gets the app added', async () => {
    writeFileSync(process.env.AVA_MCP_CONFIG!, JSON.stringify({ mcpServers: { files: { command: node, args: [SERVER] } } }));
    const r = await importMcpServers([
      { app: 'claude-desktop', name: 'github' }, { app: 'claude-desktop', name: 'files' }, { app: 'cursor', name: 'linear' }, { app: 'vscode', name: 'gone' },
    ], paths);
    expect(r.added.map((a) => a.id)).toEqual(['github', 'files-claude-desktop', 'linear']);
    expect(r.skipped).toEqual([{ app: 'VS Code', name: 'gone', why: 'not found there' }]);
    const text = readFileSync(process.env.AVA_MCP_CONFIG!, 'utf8');
    expect(text).not.toMatch(/ghp_abcdef|lin_api_secret/);
    const { file } = await readMcpFile();
    expect(file.mcpServers.github.ava).toMatchObject({ from: 'Claude Desktop' });
    expect(await getMcpSecret('github.GITHUB_PERSONAL_ACCESS_TOKEN')).toBe('ghp_abcdefghijklmnopqrstuvwxyz0123');
    expect(await getMcpSecret('linear.Authorization')).toBe('lin_api_secretvalue123');
    // Already here: nothing to do.
    const again = await importMcpServers([{ app: 'claude-desktop', name: 'github' }], paths);
    expect(again.skipped[0].why).toBe('already in your list');
  });

  it('the page lists them with counts, never values', async () => {
    const r = await mcpPage('import_scan') as { sources: Array<{ servers: Array<Record<string, unknown>> }> };
    expect(JSON.stringify(r)).not.toMatch(/ghp_|hunter2|lin_api/);
  });
});

describe("Ava's connection tools", () => {
  const reg = () => { const r = new ToolRegistry(); r.registerBuiltins(); return r; };

  it('connection_add always shows him a card, in every permission mode', () => {
    const r = reg();
    r.setPermissionMode('autonomous' as never);
    expect(r.needsConfirmation(r.getTool('connection_add')!, { name: 'x' })).toBe(true);
    expect(r.needsConfirmation(r.getTool('connection_import')!, { action: 'bring_in' })).toBe(true);
    expect(r.needsConfirmation(r.getTool('connection_import')!, { action: 'scan' })).toBe(false);
    expect(r.needsConfirmation(r.getTool('connection_search')!, { query: 'x' })).toBe(false);
  });

  it('the card shows the exact command, the keys he will type on the page, the risks and her view', () => {
    const words = toolRequestInWords('connection_add', {
      name: 'github', command: 'npx -y @github/mcp', keys: ['GITHUB_TOKEN'], view: 'GitHub\'s own server; it can change your repos.',
    });
    expect(words).toContain('Runs: npx -y @github/mcp');
    expect(words).toContain("Keys you'll type on the Connections page (never in the chat): GITHUB_TOKEN");
    expect(words).toMatch(/⚠ It fetches the newest version of @github\/mcp/);
    expect(words).toContain("Ava's view: GitHub's own server");
  });

  it('precheck stops a call that cannot work before he sees a card', async () => {
    const t = reg().getTool('connection_add')!;
    const bad = await t.precheck!({ name: 'x', view: 'v', url: 'http://example.com/mcp' }, {} as never);
    expect(bad).toMatchObject({ ok: false });
    expect((bad as { output: string }).output).toMatch(/plain http/);
  });

  it('adds a server with her view and empty key slots, and it says it is waiting for his key', async () => {
    const t = reg().getTool('connection_add')!;
    const out = await t.execute({ name: 'files', command: `"${node}" "${SERVER}"`, keys: ['MCP_TEST_KEY'], view: 'A local test server.', registry_name: 'com.example/files' }, {} as never);
    expect(out.success).toBe(true);
    expect(out.output).toMatch(/waiting for a key he sets on the Connections page: files\.MCP_TEST_KEY/);
    expect(out.output).toMatch(/never ask for it here/);
    const { file } = await readMcpFile();
    expect(file.mcpServers.files.env).toEqual({ MCP_TEST_KEY: '${secret:files.MCP_TEST_KEY}' });
    expect(file.mcpServers.files.ava).toMatchObject({ view: 'A local test server.', registry: 'com.example/files' });
    const st = McpServers.current().status().find((s) => s.id === 'files')!;
    expect(st.ava?.view).toBe('A local test server.');
    // A second one by the same name is refused before any card.
    const again = await t.precheck!({ name: 'files', command: 'x', view: 'v' }, {} as never);
    expect(again).toMatchObject({ ok: false });
  });

  it('connection_list never hands the AI a password from a command line', async () => {
    writeFileSync(process.env.AVA_MCP_CONFIG!, JSON.stringify({ mcpServers: { db: { command: 'npx', args: ['-y', 'pg-mcp', 'postgresql://me:hunter2pass@db/app'], enabled: false } } }));
    const out = await reg().getTool('connection_list')!.execute({}, {} as never);
    expect(out.output).toContain('postgresql://me:•••@db/app');
    expect(out.output).not.toContain('hunter2pass');
  });

  it('Code and Chat may set servers up; Plan only looks', () => {
    for (const t of ['connection_search', 'connection_list', 'connection_add', 'connection_import']) {
      expect(toolPassesModeGate(t, MODE_ALLOWED_TOOLS.work, 'work'), t).toBe(true);
      expect(toolPassesModeGate(t, MODE_ALLOWED_TOOLS.chat, 'chat'), t).toBe(true);
    }
    expect(toolPassesModeGate('connection_search', MODE_ALLOWED_TOOLS.plan, 'plan')).toBe(true);
    expect(toolPassesModeGate('connection_add', MODE_ALLOWED_TOOLS.plan, 'plan')).toBe(false);
  });
});

describe('redacting secrets for the AI', () => {
  it('masks passwords in addresses, known token shapes and --token style flags', () => {
    expect(redactSecrets('postgresql://me:pw@h/db')).toBe('postgresql://me:•••@h/db');
    expect(redactSecrets('run ghp_abcdefghijklmnop')).toBe('run ghp_•••');
    expect(redactSecrets('srv --api-key=abc123 --token xyz')).toBe('srv --api-key=••• --token •••');
    expect(redactSecrets('npx -y @scope/pkg C:\\Docs')).toBe('npx -y @scope/pkg C:\\Docs');
  });
});

describe('suggested servers', () => {
  it('the page lists them, checks one like any other, and adds it with his-language view', async () => {
    const st = await mcpPage('state') as { suggested: Array<{ id: string; kind: string; added: boolean }> };
    // Unreal is offered since its 5.8 release (20 Nov 2026).
    expect(st.suggested.map((s) => s.id)).toEqual(['context7', 'deepwiki', 'microsoft-learn', 'cloudflare-docs', 'huggingface', 'notion', 'linear', 'atlassian', 'github', 'unreal']);
    for (const s of st.suggested) expect(s.added).toBe(false);
    // Unreal's server is on this computer: no "sent to" note.
    const u = await mcpPage('check_suggested', { id: 'unreal' }) as { ok: boolean; shows: string; notes: Array<{ code: string }> };
    expect(u).toMatchObject({ ok: true, shows: 'http://127.0.0.1:8000/mcp' });
    expect(u.notes).toEqual([]);
    const c = await mcpPage('check_suggested', { id: 'github' }) as { ok: boolean; shows: string; slots: string[]; notes: Array<{ code: string }> };
    expect(c).toMatchObject({ ok: true, shows: 'https://api.githubcopilot.com/mcp/', slots: ['github.key'] });
    expect(c.notes.map((n) => n.code)).toContain('online');
    // GitHub needs a key, so nothing connects in this test.
    const r = await mcpPage('add_suggested', { id: 'github', view: 'Mi opinión: el servidor de GitHub.' }) as { ok: boolean; state: { suggested: Array<{ id: string; added: boolean }> } };
    expect(r.ok).toBe(true);
    expect(r.state.suggested.find((s) => s.id === 'github')!.added).toBe(true);
    const { file } = await readMcpFile();
    expect(file.mcpServers.github).toMatchObject({ type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer ${secret:github.key}' } });
    expect(file.mcpServers.github.ava).toMatchObject({ view: 'Mi opinión: el servidor de GitHub.', registry: 'io.github.github/github-mcp-server' });
    // Ava's list offers the rest, not the one he has.
    const reg = new ToolRegistry(); reg.registerBuiltins();
    const out = (await reg.getTool('connection_list')!.execute({}, {} as never)).output;
    expect(out).toMatch(/Suggested servers/);
    expect(out).toContain('https://mcp.notion.com/mcp');
    expect(out).not.toMatch(/• github —/);
  });

  it('a suggested server that offers too many sign-in permissions asks only for the ones its tools need', async () => {
    const { fencedFetch } = await import('../src/mcp/oauth.js');
    const base = (async (u: string | URL) => {
      const s = String(u);
      if (s.includes('/.well-known/oauth-protected-resource')) {
        return new Response(JSON.stringify({ resource: 'https://mcp.example.com/mcp', scopes_supported: ['read', 'write', 'delete:everything'] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(null, { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="x", scope="read write delete:everything"' } });
    }) as never;
    const f = fencedFetch('https://mcp.example.com/mcp', base, { scopes: ['read', 'write'] });
    const prm = await (await f('https://mcp.example.com/.well-known/oauth-protected-resource/mcp')).json() as { scopes_supported: string[] };
    expect(prm.scopes_supported).toEqual(['read', 'write']);
    const denied = await f('https://mcp.example.com/mcp');
    expect(denied.headers.get('www-authenticate')).toBe('Bearer resource_metadata="x", scope="read write"');
  });
});

describe('docs buttons', () => {
  it('opens only a docs page the page was given, through the app opener', async () => {
    const { setMcpBrowserOpener } = await import('../src/mcp/oauth.js');
    const opened: string[] = [];
    setMcpBrowserOpener(async (u) => { opened.push(u); });
    const st = await mcpPage('state') as { suggested: Array<{ id: string; docs: string }> };
    const notion = st.suggested.find((g) => g.id === 'notion')!;
    expect(notion.docs).toBe('https://developers.notion.com/docs/mcp');
    expect(await mcpPage('open_docs', { url: notion.docs })).toEqual({ ok: true });
    expect(await mcpPage('open_docs', { url: 'https://evil.example.com/' })).toMatchObject({ ok: false });
    expect(opened).toEqual(['https://developers.notion.com/docs/mcp']);
    // A suggested server he added keeps its docs link on its card.
    await mcpPage('add_suggested', { id: 'github' });
    const after = await mcpPage('state') as { servers: Array<{ id: string; docs?: string }> };
    expect(after.servers.find((s) => s.id === 'github')!.docs).toBe('https://github.com/github/github-mcp-server');
    setMcpBrowserOpener(null);
  });
});
