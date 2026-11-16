// The person's own MCP servers (plan 2026-11-17-mcp-servers, Phase 1), against
// a real MCP server program (fixtures/mcp-test-server.mjs) over stdio and http.

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  McpServers, syncMcpTools, setMcpKeychain, setMcpSecret, getMcpSecret, readMcpFile, updateMcpFile,
  checkServerUrl, fingerprint, isUserMcpTool, mcpToolInMode,
} from '../src/mcp/index.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import { toolPassesModeGate } from '../src/agent/agent.js';

const SERVER = join(__dirname, 'fixtures', 'mcp-test-server.mjs');
const node = process.execPath;

let dir: string;
let blob: string | null = null;

function writeConfig(o: unknown) {
  writeFileSync(join(dir, 'mcp.json'), JSON.stringify(o, null, 2));
}

async function settled(m = McpServers.current()) {
  for (let i = 0; i < 200; i++) {
    if (!m.status().some((s) => s.state === 'connecting')) return m.status();
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('servers never settled: ' + JSON.stringify(m.status()));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ava-mcp-'));
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

describe('his own servers', () => {
  it('starts a program server, names its tools mcp_<server>_<tool>, and its tools run', async () => {
    writeConfig({ mcpServers: { files: { command: node, args: [SERVER] } } });
    const m = McpServers.current();
    await m.start(null);
    const [s] = await settled();
    expect(s).toMatchObject({ id: 'files', scope: 'user', state: 'ready', online: false });
    expect(s.tools.map((t) => t.avaName).sort()).toEqual(['mcp_files_echo', 'mcp_files_fail', 'mcp_files_snapshot']);

    const reg = new ToolRegistry();
    expect(syncMcpTools(reg)).toBe(3);
    const echo = reg.getTool('mcp_files_echo')!;
    const r = await echo.execute({ text: 'hi' }, { workingDirectory: dir } as never);
    expect(r.output).toBe('echo: hi');
    expect(echo.outputTrust).toBe('untrusted');
  });

  it('reads ${secret:…} from the keychain, never from the file', async () => {
    await setMcpSecret('test', 's3cret');
    writeConfig({ mcpServers: { files: { command: node, args: [SERVER], env: { MCP_TEST_KEY: '${secret:test}' } } } });
    await McpServers.current().start(null);
    await settled();
    const reg = new ToolRegistry();
    syncMcpTools(reg);
    const r = await reg.getTool('mcp_files_echo')!.execute({ text: 'x' }, { workingDirectory: dir } as never);
    expect(r.output).toBe('echo: x key=s3cret');
    expect(readFileSync(join(dir, 'mcp.json'), 'utf8')).not.toContain('s3cret');
    expect(JSON.parse(blob!).secrets).toEqual({ test: 's3cret' });
  });

  it('a missing key is reported, and nothing is started without it', async () => {
    writeConfig({ mcpServers: { files: { command: node, args: [SERVER], env: { K: '${secret:nope}' } } } });
    await McpServers.current().start(null);
    const [s] = await settled();
    expect(s.state).toBe('needs-key');
    expect(s.message).toContain('nope');
    expect(s.secrets).toEqual(['nope']);
  });

  it('a switched-off server is not started', async () => {
    writeConfig({ mcpServers: { files: { command: node, args: [SERVER], enabled: false } } });
    await McpServers.current().start(null);
    const [s] = await settled();
    expect(s.state).toBe('off');
    expect(McpServers.current().tools()).toEqual([]);
  });

  it('a server that will not start says so in its own words', async () => {
    writeConfig({ mcpServers: { broken: { command: node, args: ['-e', 'console.error("no licence key"); process.exit(1)'] } } });
    await McpServers.current().start(null);
    const [s] = await settled();
    expect(s.state).toBe('error');
    expect(s.message).toContain('no licence key');
  });
});

describe('asking first', () => {
  it('every tool asks — even one the server calls read-only, even in autonomous mode — until "always"', async () => {
    writeConfig({ mcpServers: { files: { command: node, args: [SERVER] } } });
    const m = McpServers.current();
    await m.start(null);
    await settled();
    const reg = new ToolRegistry();
    reg.setPermissionMode('autonomous');
    syncMcpTools(reg);
    let asked = 0;
    reg.setConfirmationHandler(async () => { asked++; return true; });
    const ctx = { workingDirectory: dir } as never;

    await reg.execute('mcp_files_echo', { text: 'a' }, ctx);
    expect(asked).toBe(1);

    expect(await m.allowTool('mcp_files_echo')).toBe(true);
    await reg.execute('mcp_files_echo', { text: 'b' }, ctx);
    expect(asked).toBe(1);
    await reg.execute('mcp_files_snapshot', {}, ctx);
    expect(asked).toBe(2);

    // Remembered in his file, by the server's own tool name.
    expect((await readMcpFile()).file.mcpServers.files.allow).toEqual(['echo']);
    await m.allowTool('mcp_files_echo', false);
    expect(m.isAlwaysAllowed('mcp_files_echo')).toBe(false);
  });
});

describe("a project's own servers", () => {
  let project: string;
  beforeEach(() => { project = mkdtempSync(join(tmpdir(), 'ava-proj-')); });
  afterEach(() => rmSync(project, { recursive: true, force: true }));

  const projectServer = (args: string[]) =>
    writeFileSync(join(project, '.mcp.json'), JSON.stringify({ mcpServers: { db: { command: node, args, allow: ['echo'] } } }));

  it('wait for his yes; a changed command waits again; never means never', async () => {
    projectServer([SERVER]);
    const m = McpServers.current();
    await m.start(project);
    let [s] = await settled();
    expect(s).toMatchObject({ id: 'db', scope: 'project', state: 'waiting' });
    expect(m.tools()).toEqual([]);

    await m.answerProjectServer('db', 'yes');
    [s] = await settled();
    expect(s.state).toBe('ready');
    // Its own file cannot pre-approve its tools.
    expect(s.tools.every((t) => !t.allowed)).toBe(true);

    projectServer([SERVER, '--changed']);
    await m.reload();
    [s] = await settled();
    expect(s.state).toBe('waiting');
    expect(s.message).toContain('changed');

    await m.answerProjectServer('db', 'never');
    [s] = await settled();
    expect(s.state).toBe('off');
    const answers = (await readMcpFile()).file.projects![project];
    expect(answers.never).toEqual(['db']);
  });

  it('can never read his keychain', async () => {
    await setMcpSecret('github', 'ghp_x');
    writeFileSync(join(project, '.mcp.json'), JSON.stringify({ mcpServers: { db: { command: node, args: [SERVER], env: { T: '${secret:github}' } } } }));
    const m = McpServers.current();
    await m.start(project);
    await settled();
    await m.answerProjectServer('db', 'yes');
    const [s] = await settled();
    expect(s.state).toBe('needs-key');
    expect(s.message).toContain("can't read your keychain");
  });

  it('one of his servers with the same name wins', async () => {
    writeConfig({ mcpServers: { db: { command: node, args: [SERVER], enabled: false } } });
    projectServer([SERVER]);
    await McpServers.current().start(project);
    const all = await settled();
    expect(all.find((s) => s.scope === 'project')?.state).toBe('off');
  });
});

describe('online servers', () => {
  let child: ChildProcess;
  const port = 39000 + Math.floor(Math.random() * 500);
  beforeAll(async () => {
    child = spawn(node, [SERVER, '--http', String(port), '--token', 'tok123'], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise<void>((resolve, reject) => {
      child.stdout!.on('data', (d) => { if (String(d).includes('listening')) resolve(); });
      child.on('error', reject);
      setTimeout(() => reject(new Error('test server did not start')), 10_000);
    });
  });
  afterAll(() => { child.kill(); });

  it('connects with a key kept in the keychain', async () => {
    await setMcpSecret('tok', 'tok123');
    writeConfig({ mcpServers: { web: { type: 'http', url: `http://127.0.0.1:${port}/mcp`, headers: { Authorization: 'Bearer ${secret:tok}' } } } });
    await McpServers.current().start(null);
    const [s] = await settled();
    expect(s).toMatchObject({ state: 'ready', online: true });
    expect(s.tools.length).toBe(3);
  });

  it('a refused key reads as "needs a sign-in", not a crash', async () => {
    await setMcpSecret('tok', 'wrong');
    writeConfig({ mcpServers: { web: { type: 'http', url: `http://127.0.0.1:${port}/mcp`, headers: { Authorization: 'Bearer ${secret:tok}' } } } });
    await McpServers.current().start(null);
    const [s] = await settled();
    expect(s.state).toBe('needs-signin');
  });

  it('only https off this computer', () => {
    expect(checkServerUrl('https://api.githubcopilot.com/mcp/')).toBeNull();
    expect(checkServerUrl('http://127.0.0.1:9000/mcp')).toBeNull();
    expect(checkServerUrl('http://example.com/mcp')).toContain('plain http');
    expect(checkServerUrl('file:///etc/passwd')).not.toBeNull();
  });
});

describe('modes', () => {
  it('Code and Chat get them, Plan only read-only ones, no room', () => {
    const anySet = new Set<string>(['read']);
    expect(isUserMcpTool('mcp_files_echo')).toBe(true);
    expect(isUserMcpTool('blender_live_get_scene')).toBe(false);
    expect(toolPassesModeGate('mcp_files_echo', anySet, 'chat')).toBe(true);
    expect(toolPassesModeGate('mcp_files_echo', anySet, 'work')).toBe(true);
    expect(toolPassesModeGate('mcp_files_echo', anySet, 'design')).toBe(false);
    expect(toolPassesModeGate('mcp_files_echo', anySet, 'health')).toBe(false);
    expect(mcpToolInMode('mcp_unknown_tool', 'plan')).toBe(false);
  });

  it('Plan gets a tool the server calls read-only', async () => {
    writeConfig({ mcpServers: { files: { command: node, args: [SERVER] } } });
    await McpServers.current().start(null);
    await settled();
    expect(mcpToolInMode('mcp_files_echo', 'plan')).toBe(true);
    expect(mcpToolInMode('mcp_files_snapshot', 'plan')).toBe(false);
  });
});

describe('the file', () => {
  it('keeps what he wrote by hand, and VS Code\'s "servers" spelling works', async () => {
    writeFileSync(join(dir, 'mcp.json'), JSON.stringify({ servers: { a: { command: 'x', note: 'mine', type: 'stdio' } }, other: 1 }));
    await updateMcpFile((f) => { f.mcpServers.a.enabled = false; });
    const raw = JSON.parse(readFileSync(join(dir, 'mcp.json'), 'utf8'));
    expect(raw).toEqual({ servers: { a: { command: 'x', note: 'mine', type: 'stdio', enabled: false } }, other: 1 });
  });

  it('the fingerprint covers the command and its secrets\' names, not his allow list', () => {
    const a = { command: 'npx', args: ['x'], env: { K: '${secret:k}' } };
    expect(fingerprint(a)).toBe(fingerprint({ ...a, allow: ['t'], enabled: false }));
    expect(fingerprint(a)).not.toBe(fingerprint({ ...a, args: ['y'] }));
    expect(fingerprint(a)).not.toBe(fingerprint({ ...a, env: { K: '${secret:other}' } }));
  });

  it('keys are kept apart from the file and can be forgotten', async () => {
    await setMcpSecret('a', '1');
    await setMcpSecret('b', '2');
    await setMcpSecret('a', null);
    expect(await getMcpSecret('a')).toBeUndefined();
    expect(await getMcpSecret('b')).toBe('2');
    await setMcpSecret('b', null);
    expect(blob).toBeNull();
  });
});
