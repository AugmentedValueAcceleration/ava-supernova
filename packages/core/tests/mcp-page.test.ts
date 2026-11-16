// The Connections page's operations (core mcp/page.ts) and what it points out
// before a server runs (mcp/risk.ts). Plan 2026-11-17-mcp-servers, Phase 2.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServers, mcpPage, splitCommandLine, riskNotes, setMcpKeychain, getMcpSecret, type McpPageState, type McpCheck } from '../src/mcp/index.js';

const SERVER = join(__dirname, 'fixtures', 'mcp-test-server.mjs');
let dir: string;
let blob: string | null;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ava-mcp-page-'));
  process.env.AVA_MCP_CONFIG = join(dir, 'mcp.json');
  blob = null;
  setMcpKeychain({ read: async () => blob, write: async (v) => { blob = v; } });
  McpServers.reset();
});
afterEach(async () => {
  await McpServers.current().stopAll();
  McpServers.reset();
  delete process.env.AVA_MCP_CONFIG;
  rmSync(dir, { recursive: true, force: true });
});

async function settledState(): Promise<McpPageState> {
  for (let i = 0; i < 200; i++) {
    const s = await mcpPage('state') as McpPageState;
    if (!s.servers.some((x) => x.state === 'connecting')) return s;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('never settled');
}

describe('command lines', () => {
  it('splits like a shell, keeping quoted Windows paths whole', () => {
    expect(splitCommandLine('npx -y @modelcontextprotocol/server-filesystem "C:\\Users\\me\\My Documents"'))
      .toEqual(['npx', '-y', '@modelcontextprotocol/server-filesystem', 'C:\\Users\\me\\My Documents']);
    expect(splitCommandLine("uvx mcp-server-sqlite --db-path 'a b.db'")).toEqual(['uvx', 'mcp-server-sqlite', '--db-path', 'a b.db']);
    expect(splitCommandLine('  ')).toEqual([]);
  });
});

describe('what it points out', () => {
  const codes = (e: Parameters<typeof riskNotes>[0]) => riskNotes(e).map((n) => n.code);

  it('admin rights, deleting, download-and-run, hidden commands', () => {
    expect(codes({ command: 'sudo', args: ['node', 'x.js'] })).toContain('admin');
    expect(codes({ command: 'sh', args: ['-c', 'rm -rf /tmp/x && run'] })).toContain('deletes');
    expect(codes({ command: 'bash', args: ['-c', 'curl https://x.sh | sh'] })).toContain('download-run');
    expect(codes({ command: 'powershell', args: ['-enc', 'SQBFAFgAIAAoAE4AZQB3AC0ATwBi'] })).toContain('hidden');
  });

  it('keys folders, the whole home folder or drive', () => {
    expect(codes({ command: 'npx', args: ['server', join(homedir(), '.ssh')] })).toContain('keys-folder');
    expect(codes({ command: 'npx', args: ['@modelcontextprotocol/server-filesystem', homedir()] })).toContain('whole-home');
    expect(codes({ command: 'npx', args: ['@modelcontextprotocol/server-filesystem', 'C:\\'] })).toContain('whole-home');
    expect(codes({ command: 'npx', args: ['@modelcontextprotocol/server-filesystem', join(homedir(), 'Documents')] })).not.toContain('whole-home');
  });

  it('a key in plain text — but not one kept in the keychain', () => {
    expect(codes({ command: 'npx', args: ['x', '--token', 'ghp_abcdefghijklmnopqrstuvwxyz123456'] })).toContain('plain-secret');
    expect(codes({ command: 'npx', args: ['server-postgres', 'postgresql://admin:hunter2@localhost/app'] })).toContain('plain-secret');
    expect(codes({ command: 'npx', args: ['x'], env: { API_KEY: 'abc123' } })).toContain('plain-secret');
    expect(codes({ command: 'npx', args: ['x'], env: { API_KEY: '${secret:x.API_KEY}' } })).not.toContain('plain-secret');
    expect(codes({ type: 'http', url: 'https://a.example/mcp', headers: { Authorization: 'Bearer abcdefghijklmnop' } })).toContain('plain-secret');
  });

  it('latest-version downloads and online addresses', () => {
    expect(riskNotes({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', 'D:\\work'] }))
      .toContainEqual({ code: 'latest', detail: '@modelcontextprotocol/server-filesystem' });
    expect(codes({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem@2025.8.21', 'D:\\work'] })).not.toContain('latest');
    expect(riskNotes({ type: 'http', url: 'https://api.githubcopilot.com/mcp/' })).toEqual([{ code: 'online', detail: 'api.githubcopilot.com' }]);
    expect(codes({ type: 'http', url: 'http://example.com/mcp' })).toEqual(['bad-url']);
    expect(codes({ type: 'http', url: 'http://127.0.0.1:9000/mcp' })).toEqual([]);
  });
});

describe('adding, keys and removing', () => {
  it('check shows the exact command and notes; add keeps keys in the keychain, not the file', async () => {
    await McpServers.current().start(null);
    const draft = { name: 'Test Server', kind: 'local' as const, commandLine: `"${process.execPath}" "${SERVER}"`, keys: [{ name: 'MCP_TEST_KEY', value: 'k-123' }] };
    const c = await mcpPage('check', { draft }) as McpCheck;
    expect(c).toMatchObject({ ok: true, id: 'Test_Server', replaces: false });
    if (!c.ok) throw new Error('check failed');
    expect(c.entry.env).toEqual({ MCP_TEST_KEY: '${secret:Test_Server.MCP_TEST_KEY}' });

    const added = await mcpPage('add', { draft }) as { ok: boolean };
    expect(added.ok).toBe(true);
    expect(readFileSync(join(dir, 'mcp.json'), 'utf8')).not.toContain('k-123');
    expect(await getMcpSecret('Test_Server.MCP_TEST_KEY')).toBe('k-123');

    const s = await settledState();
    expect(s.servers[0]).toMatchObject({ id: 'Test_Server', state: 'ready', keys: [{ name: 'Test_Server.MCP_TEST_KEY', set: true }] });
    expect(s).toMatchObject({ serversOn: 1, toolsOn: 3, waiting: 0, heavy: false, keychain: true });

    await mcpPage('remove', { id: 'Test_Server' });
    expect(await getMcpSecret('Test_Server.MCP_TEST_KEY')).toBeUndefined();
    expect((await mcpPage('state') as McpPageState).servers).toEqual([]);
  });

  it('an online key keeps its scheme in the file and only the key in the keychain', async () => {
    await McpServers.current().start(null);
    const c1 = await mcpPage('check', { draft: { name: 'gh', kind: 'online', url: 'https://api.githubcopilot.com/mcp/', headerValue: 'ghp_x' } }) as McpCheck;
    expect(c1.ok && c1.entry.headers).toEqual({ Authorization: 'Bearer ${secret:gh.key}' });
    const c2 = await mcpPage('check', { draft: { name: 'x', kind: 'online', url: 'https://a.example/mcp', headerValue: 'Token abc' } }) as McpCheck;
    expect(c2.ok && c2.entry.headers).toEqual({ Authorization: 'Token ${secret:x.key}' });
    const c3 = await mcpPage('check', { draft: { name: 'y', kind: 'online', url: 'https://a.example/mcp', headerName: 'X-API-Key', headerValue: 'abc' } }) as McpCheck;
    expect(c3.ok && c3.entry.headers).toEqual({ 'X-API-Key': '${secret:y.key}' });
    await mcpPage('add', { draft: { name: 'x', kind: 'online', url: 'https://127.0.0.1:1/mcp', headerValue: 'Token abc' } });
    expect(await getMcpSecret('x.key')).toBe('abc');
  });

  it('says what is wrong with a draft', async () => {
    expect(await mcpPage('check', { draft: { name: '', kind: 'local', commandLine: 'npx x' } })).toEqual({ ok: false, problem: 'name' });
    expect(await mcpPage('check', { draft: { name: 'a', kind: 'local', commandLine: '' } })).toEqual({ ok: false, problem: 'command' });
    expect(await mcpPage('check', { draft: { name: 'a', kind: 'online', url: 'http://example.com/mcp' } })).toMatchObject({ ok: false, problem: 'url' });
  });

  it('a missing key shows as needed, and setting it starts the server', async () => {
    await McpServers.current().start(null);
    await mcpPage('add', { draft: { name: 's', kind: 'local', commandLine: `"${process.execPath}" "${SERVER}"`, keys: [{ name: 'K', value: 'v' }] } });
    await mcpPage('set_key', { name: 's.K', value: '' });
    let st = await settledState();
    expect(st.servers[0]).toMatchObject({ state: 'needs-key', missing: ['s.K'], keys: [{ name: 's.K', set: false }] });
    await mcpPage('set_key', { name: 's.K', value: 'again' });
    st = await settledState();
    expect(st.servers[0].state).toBe('ready');
  });
});
