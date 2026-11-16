// The MCP client against REAL servers (no mocks): one started as a local
// program, one on a local web address. Plan: Decisions/plans/2026-11-16-blender-mcp.md.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { McpConnection, isLocalUrl, mcpToolsForAva, avaToolName } from '../src/mcp/index.js';

const SERVER = join(__dirname, 'fixtures', 'mcp-test-server.mjs');
const program = { id: 'blender_live', name: 'Blender', transport: { kind: 'program' as const, command: process.execPath, args: [SERVER] } };

describe('local only', () => {
  it('accepts this computer and nothing else', () => {
    expect(isLocalUrl('http://127.0.0.1:8000/mcp')).toBe(true);
    expect(isLocalUrl('http://localhost:9876')).toBe(true);
    expect(isLocalUrl('http://[::1]:8000/mcp')).toBe(true);
    expect(isLocalUrl('http://192.168.1.5:8000/mcp')).toBe(false);
    expect(isLocalUrl('https://example.com/mcp')).toBe(false);
    expect(isLocalUrl('file:///etc/passwd')).toBe(false);
  });

  it('refuses a server that is not on this computer', async () => {
    await expect(McpConnection.open({ id: 'x', name: 'Remote', transport: { kind: 'local-url', url: 'https://example.com/mcp' } }))
      .rejects.toThrow(/Only a server on this computer/);
  });
});

describe('a server started as a local program', () => {
  let conn: McpConnection;
  beforeAll(async () => { conn = await McpConnection.open(program); }, 20_000);
  afterAll(async () => { await conn?.close(); });

  it('connects and reads the tools', () => {
    expect(conn.server?.name).toBe('test-blender');
    expect(conn.tools().map((t) => t.name)).toEqual(['echo', 'snapshot', 'fail']);
  });

  it('calls a tool and gets its text', async () => {
    expect((await conn.call('echo', { text: 'hi' })).text).toBe('echo: hi');
  });

  it('offers them to Ava, named, through her approval, untrusted', async () => {
    const tools = mcpToolsForAva(conn);
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(Object.keys(byName)).toEqual(['blender_live_echo', 'blender_live_snapshot', 'blender_live_fail']);
    expect(byName.blender_live_echo.riskLevel).toBe('safe');
    expect(byName.blender_live_echo.requiresConfirmation).toBe(false);
    expect(byName.blender_live_snapshot.riskLevel).toBe('write');
    expect(byName.blender_live_snapshot.requiresConfirmation).toBe(true);
    expect(byName.blender_live_fail.riskLevel).toBe('dangerous');
    expect(byName.blender_live_echo.outputTrust).toBe('untrusted');
    expect(byName.blender_live_echo.schema.parameters.required).toEqual(['text']);
  });

  it('hands images back the way Ava sees a Blender preview', async () => {
    const snap = mcpToolsForAva(conn, { only: ['snapshot'] })[0];
    const r = await snap.execute({}, { cwd: '.' });
    expect(r.success).toBe(true);
    expect(r.output).toBe('viewport');
    expect(r.metadata?.mime_type).toBe('image/png');
    expect(typeof r.metadata?.base64_image).toBe('string');
    expect((r.metadata?.more_images as string[]).length).toBe(1);
  });

  it('a tool error is a failed result, not a crash', async () => {
    const fail = mcpToolsForAva(conn, { only: ['fail'] })[0];
    const r = await fail.execute({}, { cwd: '.' });
    expect(r.success).toBe(false);
    expect(r.output).toContain('Blender said no');
  });

  it('a check can refuse a call before it reaches the server', async () => {
    const echo = mcpToolsForAva(conn, { only: ['echo'], check: (_t, a) => (String(a.text).includes('rm') ? 'Refused: that script deletes files.' : undefined) })[0];
    expect((await echo.execute({ text: 'rm -rf' }, { cwd: '.' })).output).toBe('Refused: that script deletes files.');
    expect((await echo.execute({ text: 'ok' }, { cwd: '.' })).output).toBe('echo: ok');
  });

  it('says plainly when the server has gone', async () => {
    const c = await McpConnection.open(program);
    const echo = mcpToolsForAva(c, { only: ['echo'] })[0];
    let closed = false;
    c.onClose(() => { closed = true; });
    await c.close();
    expect(closed).toBe(true);
    expect((await echo.execute({ text: 'x' }, { cwd: '.' })).output).toMatch(/isn't connected/);
  }, 20_000);
});

describe('a program that is not an MCP server', () => {
  it('fails with a clear message', async () => {
    await expect(McpConnection.open(
      { id: 'bad', name: 'Broken', transport: { kind: 'program', command: process.execPath, args: ['-e', 'process.stderr.write("boom: no add-on\\n"); process.exit(1)'] } },
      { timeoutMs: 5000 },
    )).rejects.toThrow(/Could not connect to Broken/);
  }, 20_000);
});

describe('a server on a local web address', () => {
  let child: ChildProcess;
  let conn: McpConnection;
  const port = 18_000 + Math.floor(Math.random() * 1000);
  beforeAll(async () => {
    child = spawn(process.execPath, [SERVER, '--http', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('server did not start')), 15_000);
      child.stdout!.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); resolve(); } });
    });
    conn = await McpConnection.open({ id: 'unreal', name: 'Unreal', transport: { kind: 'local-url', url: `http://127.0.0.1:${port}/mcp` } });
  }, 30_000);
  afterAll(async () => { await conn?.close(); child?.kill(); });

  it('connects, reads the tools and calls one', async () => {
    expect(conn.tools().length).toBe(3);
    expect((await conn.call('echo', { text: 'over http' })).text).toBe('echo: over http');
    expect(mcpToolsForAva(conn)[0].name).toBe('unreal_echo');
  });
});

describe('tool names', () => {
  it('are safe for every model', () => {
    expect(avaToolName('blender live', 'get.scene/info')).toBe('blender_live_get_scene_info');
    expect(avaToolName('x', 'a'.repeat(100)).length).toBe(64);
  });
});
